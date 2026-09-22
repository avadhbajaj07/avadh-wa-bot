'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  BATCH_SEND_ATTEMPTS,
  batchRetryDelayMs,
} from '@/lib/broadcast-retry';
import { normalizeKey } from '@/lib/contacts/dedupe';
import { formatPhoneNumber } from '@/lib/contacts/parse-pasted-numbers';
import { resolveImportTagIds } from '@/lib/contacts/resolve-import-tags';
import { BroadcastCsvContact } from '@/lib/broadcast-csv';
import { Contact, MessageTemplate } from '@/types';
import { toast } from 'sonner';
import { recordOutboundBroadcastMessage } from '@/lib/whatsapp/broadcast-conversation-sync';

/**
 * Extract all unique placeholder names (numeric or named, e.g. "1", "business_name")
 * in order of appearance in the text.
 */
export function extractTemplatePlaceholders(text: string): string[] {
  if (!text) return [];
  const matches = text.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  const seen = new Set<string>();
  const list: string[] = [];
  for (const m of matches) {
    const name = m[1];
    if (!seen.has(name)) {
      seen.add(name);
      list.push(name);
    }
  }
  return list;
}

export type CustomFieldOperator = 'is' | 'is_not' | 'contains';

export interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

export interface AudienceConfig {
  type: 'all' | 'tags' | 'custom_field' | 'csv' | 'paste';
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: BroadcastCsvContact[];
  csvColumns?: string[];
  /** Tags to automatically assign to all imported/pasted contacts in this audience. */
  applyTagIds?: string[];
  /** Contacts carrying any of these tags are subtracted from the result. */
  excludeTagIds?: string[];
}

/**
 * Variable mapping — each template placeholder (by key, usually "1",
 * "2", … or named like "business_name") is resolved at send time.
 * `field` maps to a built-in contact field (name/phone/email/company);
 * `custom_field` maps to contact_custom_values; `csv_column` maps
 * to the uploaded CSV row's column value.
 */
export type VariableMapping =
  | { type: 'static'; value: string }
  | { type: 'field'; value: string }
  | { type: 'custom_field'; value: string }
  | { type: 'csv_column'; value: string };

interface BroadcastPayload {
  name: string;
  template: MessageTemplate;
  audience: AudienceConfig;
  variables: Record<string, VariableMapping>;
  /**
   * Media URL for an IMAGE/VIDEO/DOCUMENT header. Required at send
   * time for media-header templates — Meta rejects the send without
   * it. Passed through as `messageParams.headerMediaUrl`; the builder
   * falls back to the template's stored URL only when this is empty.
   */
  headerMediaUrl?: string;
  /** ISO datetime string when the broadcast is scheduled to be sent. */
  scheduledAt?: string;
}

interface UseBroadcastSendingReturn {
  createAndSendBroadcast: (payload: BroadcastPayload) => Promise<string>;
  isProcessing: boolean;
  progress: number;
}

/**
 * Meta rate-limit buffer. 10 per batch + 1 s pause matches the spec
 * and keeps us comfortably under Meta's per-phone-number messaging
 * rate so a large broadcast never trips the upstream limiter.
 *
 * Note this shape when touching `RATE_LIMITS.broadcast`: a campaign is
 * many calls to `/api/whatsapp/broadcast`, not one. A 1 000-recipient
 * send is ~100 calls over several minutes, and a bucket sized for
 * "one call per campaign" throttles most of it away (issue #472).
 */
const SEND_BATCH_SIZE = 10;
const SEND_BATCH_DELAY_MS = 1000;

/** `broadcast_recipients` inserts are independent of the send rate. */
const INSERT_BATCH_SIZE = 50;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BroadcastApiResult {
  phone: string;
  status: 'sent' | 'failed';
  whatsapp_message_id?: string;
  error?: string;
}

/** contactId → (customFieldId → value). */
type CustomValueIndex = Map<string, Map<string, string>>;

/**
 * Per-contact resolution of placeholders. Static, built-in field,
 * CSV column, and custom-field mappings are resolved per recipient.
 * When `orderedKeys` is passed, the returned values array strictly
 * follows the template's placeholder appearance order.
 */
export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: Contact,
  customValues?: Map<string, string>,
  csvRow?: Record<string, string>,
  orderedKeys?: string[],
): string[] {
  const keys =
    orderedKeys ??
    Object.keys(variables).sort((a, b) => {
      const an = Number(a);
      const bn = Number(b);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return a.localeCompare(b);
    });

  return keys.map((key) => {
    const v = variables[key];
    if (!v) {
      const lowerKey = key.toLowerCase();
      if (
        [
          'business_name',
          'business',
          'company',
          'company_name',
          'nom_entreprise',
          'entreprise',
        ].includes(lowerKey)
      ) {
        return contact.company || contact.name || '';
      }
      if (
        [
          'name',
          'full_name',
          'contact_name',
          'client_name',
          'customer_name',
          'nom',
          'prenom',
        ].includes(lowerKey)
      ) {
        return contact.name || contact.company || '';
      }
      return '';
    }
    if (v.type === 'static') return v.value;

    if (v.type === 'field') {
      const fieldMap: Record<string, string | undefined> = {
        name: contact.name || contact.company || '',
        phone: contact.phone || '',
        email: contact.email || '',
        company: contact.company || contact.name || '',
      };
      return fieldMap[v.value] ?? '';
    }

    if (v.type === 'custom_field') {
      return customValues?.get(v.value) ?? '';
    }

    if (v.type === 'csv_column') {
      return csvRow?.[v.value] ?? '';
    }

    return '';
  });
}

/**
 * Bulk-fetch contact_custom_values for a set of contacts. Returns an
 * index keyed by contact_id → field_id → value.
 */
async function fetchCustomValueIndex(
  supabase: ReturnType<typeof createClient>,
  contactIds: string[],
): Promise<CustomValueIndex> {
  const index: CustomValueIndex = new Map();
  if (contactIds.length === 0) return index;

  // Keep chunk small (50 UUIDs is ~1.8KB) to stay well under Cloudflare's 16KB URL limit.
  const PAGE = 50;
  for (let i = 0; i < contactIds.length; i += PAGE) {
    const slice = contactIds.slice(i, i + PAGE);
    const { data, error } = await supabase
      .from('contact_custom_values')
      .select('contact_id, custom_field_id, value')
      .in('contact_id', slice);

    if (error) {
      console.error('[fetchCustomValueIndex] error fetching custom values:', error);
      continue;
    }

    for (const row of data ?? []) {
      const bucket = index.get(row.contact_id) ?? new Map<string, string>();
      bucket.set(row.custom_field_id, row.value ?? '');
      index.set(row.contact_id, bucket);
    }
  }
  return index;
}

export function useBroadcastSending(): UseBroadcastSendingReturn {
  const { accountId } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function resolveAudience(audience: AudienceConfig): Promise<Contact[]> {
    const supabase = createClient();

    let contacts: Contact[] = [];

    if (audience.type === 'all') {
      const { data, error } = await supabase.from('contacts').select('*');
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      contacts = data ?? [];
    } else if (
      audience.type === 'tags' &&
      audience.tagIds &&
      audience.tagIds.length > 0
    ) {
      const { data: contactTags, error: tagError } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.tagIds);

      if (tagError)
        throw new Error(`Failed to fetch contact tags: ${tagError.message}`);

      if (contactTags && contactTags.length > 0) {
        const uniqueContactIds = [
          ...new Set(contactTags.map((ct) => ct.contact_id)),
        ];
        const CHUNK_SIZE = 100;
        const allContacts: Contact[] = [];
        for (let i = 0; i < uniqueContactIds.length; i += CHUNK_SIZE) {
          const slice = uniqueContactIds.slice(i, i + CHUNK_SIZE);
          const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .in('id', slice);
          if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
          if (data) allContacts.push(...data);
        }
        contacts = allContacts;
      }
    } else if (audience.type === 'custom_field' && audience.customField) {
      contacts = await resolveCustomFieldAudience(supabase, audience.customField);
    } else if ((audience.type === 'csv' || audience.type === 'paste') && audience.csvContacts) {
      contacts = await upsertCsvContacts(
        supabase,
        audience.csvContacts,
        audience.applyTagIds
      );
    }

    // Apply exclude tags (works across all contact-derived audience
    // types). CSV contacts are synthetic so exclusion doesn't apply.
    if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
      const { data: excludeRows } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.excludeTagIds);
      const excludedIds = new Set((excludeRows ?? []).map((r) => r.contact_id));
      contacts = contacts.filter((c) => !excludedIds.has(c.id));
    }

    return contacts;
  }

  /**
   * CSV uploads and pasted numbers arrive as raw phone/name pairs, not DB rows.
   * Look up each phone in the caller's contacts table; insert any that don't exist;
   * auto-assign any tags from the CSV or user selection; return the resolved set.
   */
  async function upsertCsvContacts(
    supabase: ReturnType<typeof createClient>,
    csvRows: BroadcastCsvContact[],
    applyTagIds?: string[],
  ): Promise<Contact[]> {
    if (csvRows.length === 0) return [];

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) {
      throw new Error('You are not signed in.');
    }
    if (!accountId) {
      throw new Error('Your profile is not linked to an account.');
    }

    // De-duplicate within the input on the NORMALIZED number
    const uniqueByKey = new Map<string, { phone: string; name?: string; tags?: string[] }>();
    for (const row of csvRows) {
      const formatted = formatPhoneNumber(row.phone) || row.phone;
      const key = normalizeKey(formatted);
      if (key && !uniqueByKey.has(key)) uniqueByKey.set(key, { ...row, phone: formatted });
    }
    const keys = [...uniqueByKey.keys()];

    // Chunked lookup of contacts already in this ACCOUNT to avoid URL length limits
    const existing: Contact[] = [];
    const LOOKUP_CHUNK = 100;
    for (let i = 0; i < keys.length; i += LOOKUP_CHUNK) {
      const slice = keys.slice(i, i + LOOKUP_CHUNK);
      const { data, error: lookupErr } = await supabase
        .from('contacts')
        .select('*')
        .eq('account_id', accountId)
        .in('phone_normalized', slice);
      if (lookupErr) {
        throw new Error(`Failed to look up contacts: ${lookupErr.message}`);
      }
      if (data) existing.push(...(data as Contact[]));
    }

    const byKey = new Map<string, Contact>();
    for (const c of (existing ?? []) as Contact[]) {
      const key = normalizeKey(c.phone ?? '');
      if (key) byKey.set(key, c);
    }

    // Insert only missing contacts
    const missing = keys
      .filter((k) => !byKey.has(k))
      .map((k) => uniqueByKey.get(k)!)
      .map((row) => ({
        user_id: user.id,
        account_id: accountId,
        phone: row.phone,
        name: row.name ?? null,
      }));

    const INSERT_CHUNK = 200;
    for (let i = 0; i < missing.length; i += INSERT_CHUNK) {
      const chunk = missing.slice(i, i + INSERT_CHUNK);
      const { data: inserted, error: insertErr } = await supabase
        .from('contacts')
        .insert(chunk)
        .select();
      if (insertErr) {
        throw new Error(`Failed to create contacts: ${insertErr.message}`);
      }
      for (const c of (inserted ?? []) as Contact[]) {
        const key = normalizeKey(c.phone ?? '');
        if (key) byKey.set(key, c);
      }
    }

    // Preserve input order
    const resolvedContacts = keys
      .map((k) => byKey.get(k))
      .filter((c): c is Contact => Boolean(c));

    // Auto-accept and assign tags: user-selected applyTagIds + row-level tags from CSV
    try {
      const allRowTagNames = new Set<string>();
      for (const row of csvRows) {
        if (row.tags) {
          for (const t of row.tags) {
            if (t.trim()) allRowTagNames.add(t.trim());
          }
        }
      }

      let tagIdByKey = new Map<string, string>();
      if (allRowTagNames.size > 0) {
        const { tagIdByKey: resolved } = await resolveImportTagIds(supabase, {
          accountId,
          userId: user.id,
          tagNames: [...allRowTagNames],
          canCreateTags: true,
        });
        tagIdByKey = resolved;
      }

      const tagRows: { contact_id: string; tag_id: string }[] = [];
      for (const contact of resolvedContacts) {
        const key = normalizeKey(contact.phone ?? '');
        const row = uniqueByKey.get(key);
        const contactTagIds = new Set<string>(applyTagIds ?? []);

        if (row?.tags) {
          for (const t of row.tags) {
            const id = tagIdByKey.get(t.trim().toLowerCase());
            if (id) contactTagIds.add(id);
          }
        }

        for (const tagId of contactTagIds) {
          tagRows.push({ contact_id: contact.id, tag_id: tagId });
        }
      }

      if (tagRows.length > 0) {
        const TAG_CHUNK = 100;
        for (let i = 0; i < tagRows.length; i += TAG_CHUNK) {
          const chunk = tagRows.slice(i, i + TAG_CHUNK);
          await supabase.from('contact_tags').upsert(chunk, {
            onConflict: 'contact_id,tag_id',
            ignoreDuplicates: true,
          });
        }
      }
    } catch (tagErr) {
      console.error('[upsertCsvContacts] Failed to auto-assign tags:', tagErr);
    }

    return resolvedContacts;
  }

  async function resolveCustomFieldAudience(
    supabase: ReturnType<typeof createClient>,
    filter: CustomFieldFilter,
  ): Promise<Contact[]> {
    const { fieldId, operator, value } = filter;

    // Build the WHERE clause for the operator. PostgREST supports
    // eq/neq/ilike via the query builder — use ilike with wildcards
    // for "contains" so the match is case-insensitive.
    let query = supabase
      .from('contact_custom_values')
      .select('contact_id')
      .eq('custom_field_id', fieldId);

    if (operator === 'is') query = query.eq('value', value);
    else if (operator === 'is_not') query = query.neq('value', value);
    else if (operator === 'contains') query = query.ilike('value', `%${value}%`);

    const { data: matches, error: matchErr } = await query;
    if (matchErr)
      throw new Error(`Custom-field filter failed: ${matchErr.message}`);

    const contactIds = [...new Set((matches ?? []).map((m) => m.contact_id))];
    if (contactIds.length === 0) return [];

    const CHUNK_SIZE = 100;
    const allContacts: Contact[] = [];
    for (let i = 0; i < contactIds.length; i += CHUNK_SIZE) {
      const slice = contactIds.slice(i, i + CHUNK_SIZE);
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .in('id', slice);
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      if (data) allContacts.push(...data);
    }
    return allContacts;
  }

  async function createAndSendBroadcast(payload: BroadcastPayload): Promise<string> {
    setIsProcessing(true);
    setProgress(0);

    const supabase = createClient();

    try {
      // ── Step 0: Resolve current user ──────────────────────────────
      // broadcasts.user_id is NOT NULL + guarded by RLS
      // (auth.uid() = user_id). Without this, the INSERT below was
      // silently failing with 23502 / 42501 — the wizard would
      // no-op with no feedback.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        throw new Error('You are not signed in.');
      }
      if (!accountId) {
        throw new Error('Your profile is not linked to an account.');
      }

      // ── Step 1: Resolve audience contacts ─────────────────────────
      setProgress(5);
      const contacts = await resolveAudience(payload.audience);

      if (contacts.length === 0) {
        throw new Error('No contacts found for this audience.');
      }

      // ── Step 2: Create broadcast row ──────────────────────────────
      setProgress(10);
      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .insert({
          user_id: user.id,
          account_id: accountId,
          name: payload.name,
          template_name: payload.template.name,
          template_language: payload.template.language ?? 'en_US',
          template_variables: payload.variables,
          audience_filter: {
            type: payload.audience.type,
            tagIds: payload.audience.tagIds,
            customField: payload.audience.customField,
            excludeTagIds: payload.audience.excludeTagIds,
          },
          status: payload.scheduledAt ? 'scheduled' : 'sending',
          scheduled_at: payload.scheduledAt ?? null,
          total_recipients: contacts.length,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          failed_count: 0,
        })
        .select()
        .single();

      if (broadcastError || !broadcast) {
        throw new Error(
          `Failed to create broadcast: ${broadcastError?.message ?? 'unknown error'}`,
        );
      }

      // ── Step 3: Insert recipient rows ─────────────────────────────
      // Custom values are fetched BEFORE the insert so each row can
      // carry its resolved template params. Those params are what makes
      // the campaign resumable server-side (issue #472): the send loop
      // below runs in this browser tab, and if the tab goes away the
      // only record of what {{1}} should be for each contact is this
      // column. Resolving once here also means the resume sends exactly
      // what this pass would have.
      setProgress(20);
      const hasCustomFieldVars = Object.values(payload.variables ?? {}).some(
        (v) => v?.type === 'custom_field',
      );
      const customValueIndex = hasCustomFieldVars
        ? await fetchCustomValueIndex(
            supabase,
            contacts.map((c) => c.id),
          )
        : new Map();

      // Build index of CSV row data by normalized phone
      const csvDataByPhone = new Map<string, Record<string, string>>();
      if (payload.audience.csvContacts) {
        for (const row of payload.audience.csvContacts) {
          if (row.columns) {
            const key = normalizeKey(row.phone);
            if (key) {
              csvDataByPhone.set(key, row.columns);
            }
          }
        }
      }

      const templateOrderedKeys = extractTemplatePlaceholders(
        payload.template.body_text
      );

      const paramsByContact = new Map(
        contacts.map((contact) => {
          const key = normalizeKey(contact.phone ?? '');
          const csvRow = key ? csvDataByPhone.get(key) : undefined;
          return [
            contact.id,
            resolveVariables(
              payload.variables,
              contact,
              customValueIndex.get(contact.id),
              csvRow,
              templateOrderedKeys.length > 0 ? templateOrderedKeys : undefined,
            ),
          ];
        }),
      );
      const recipientRows = contacts.map((contact) => ({
        broadcast_id: broadcast.id,
        contact_id: contact.id,
        status: 'pending' as const,
        template_params: paramsByContact.get(contact.id) ?? [],
      }));

      for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
        const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE);
        const { error: recipientError } = await supabase
          .from('broadcast_recipients')
          .insert(batch);
        if (recipientError) {
          // Previous impl logged and marched on — the broadcast then ran
          // with an incomplete recipient set, so webhook status updates
          // couldn't find some rows and the aggregate counts drifted.
          // Flip the broadcast to failed so the user sees the problem
          // immediately, then throw to abort the send loop.
          await supabase
            .from('broadcasts')
            .update({
              status: 'failed',
              failed_count: contacts.length,
            })
            .eq('id', broadcast.id);
          throw new Error(
            `Failed to insert recipient batch ${i / INSERT_BATCH_SIZE + 1}: ${recipientError.message}`,
          );
        }
      }

      // If scheduled, all recipients are safely staged in DB; return now
      if (payload.scheduledAt) {
        setProgress(100);
        toast.success(
          `Broadcast "${payload.name}" scheduled for ${new Date(payload.scheduledAt).toLocaleString()}!`
        );
        return broadcast.id;
      }

      // ── Step 4: Fetch recipients back (joined contact) ────────────
      setProgress(30);
      const { data: recipients, error: recipientsFetchError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .eq('broadcast_id', broadcast.id)
        .limit(10000);

      if (recipientsFetchError || !recipients) {
        throw new Error('Failed to fetch broadcast recipients');
      }

      let failedCount = 0;
      const totalRecipients = recipients.length;

      // Media-header templates (image/video/document) require a media
      // URL on every send. Collected in the personalize step and applied
      // to all recipients; falls back to the template's stored URL on the
      // server when omitted.
      const headerType = payload.template.header_type;
      const isMediaHeader =
        headerType === 'image' ||
        headerType === 'video' ||
        headerType === 'document';
      const headerMediaUrl = payload.headerMediaUrl?.trim();
      const messageParams =
        isMediaHeader && headerMediaUrl ? { headerMediaUrl } : undefined;

      for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
        const batch = recipients.slice(i, i + SEND_BATCH_SIZE);

        const apiRecipients = batch
          .filter((r) => r.contact?.phone)
          .map((r) => {
            const rawPhone = r.contact!.phone as string;
            const phone = formatPhoneNumber(rawPhone) || rawPhone;
            return {
              phone,
              contact_id: r.contact_id,
              // Read back off the row rather than re-resolved, so this
              // pass and any later resume send identical params.
              params: Array.isArray(r.template_params) ? r.template_params : [],
              ...(messageParams ? { messageParams } : {}),
            };
          });

        if (apiRecipients.length === 0) continue;

        try {
          // Send the batch, waiting out a 429 rather than writing the
          // whole batch off as failed. Only 429 is replayed — see
          // batchRetryDelayMs for why nothing else can be.
          let data: { error?: string; results?: BroadcastApiResult[] } = {};
          for (let attempt = 1; ; attempt++) {
            const res = await fetch('/api/whatsapp/broadcast', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                recipients: apiRecipients,
                template_name: payload.template.name,
                template_language: payload.template.language ?? 'en_US',
              }),
            });

            try {
              data = await res.json();
            } catch {
              data = { error: `Server error (${res.status})` };
            }
            if (res.ok) break;

            const retryIn =
              attempt < BATCH_SEND_ATTEMPTS
                ? batchRetryDelayMs(res.status, res.headers.get('Retry-After'))
                : null;
            if (retryIn === null) {
              throw new Error(data.error || 'Broadcast API request failed');
            }
            await sleep(retryIn);
          }

          const resultsByPhone = new Map<string, BroadcastApiResult>();
          for (const r of (data.results ?? []) as BroadcastApiResult[]) {
            resultsByPhone.set(r.phone, r);
          }

          for (const recipient of batch) {
            const phone = recipient.contact?.phone;
            const result = phone ? resultsByPhone.get(phone) : undefined;

            if (!result) {
              failedCount++;
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'failed',
                  error_message: 'No phone number on contact',
                })
                .eq('id', recipient.id);
              continue;
            }

            if (result.status === 'sent') {
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'sent',
                  sent_at: new Date().toISOString(),
                  whatsapp_message_id: result.whatsapp_message_id ?? null,
                  error_message: null,
                })
                .eq('id', recipient.id);

              // Client-side mirror: ensure conversation & message appear in Chats tab immediately
              if (accountId && recipient.contact_id) {
                try {
                  await recordOutboundBroadcastMessage({
                    db: supabase,
                    accountId,
                    contactId: recipient.contact_id,
                    templateName: payload.template.name,
                    templateRow: payload.template,
                    params: Array.isArray(recipient.template_params) ? recipient.template_params : [],
                    whatsappMessageId: result.whatsapp_message_id ?? null,
                    status: 'sent',
                  });
                } catch (chatMirrorErr) {
                  console.error(
                    '[useBroadcastSending] failed to mirror message to Chats:',
                    chatMirrorErr
                  );
                }
              }
            } else {
              failedCount++;
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'failed',
                  error_message: result.error ?? 'Unknown error',
                })
                .eq('id', recipient.id);
            }
          }
        } catch (err) {
          for (const recipient of batch) {
            failedCount++;
            await supabase
              .from('broadcast_recipients')
              .update({
                status: 'failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
              })
              .eq('id', recipient.id);
          }
        }

        const progressPct =
          30 + Math.round(((i + batch.length) / totalRecipients) * 60);
        setProgress(progressPct);

        if (i + SEND_BATCH_SIZE < recipients.length) {
          await sleep(SEND_BATCH_DELAY_MS);
        }
      }

      // ── Step 5: Finalize status ───────────────────────────────────
      // Aggregate counts are maintained by the DB trigger (migration
      // 003); we only flip the final status here.
      setProgress(95);
      const finalStatus = failedCount === totalRecipients ? 'failed' : 'sent';
      await supabase
        .from('broadcasts')
        .update({ status: finalStatus })
        .eq('id', broadcast.id);

      setProgress(100);
      return broadcast.id;
    } finally {
      setIsProcessing(false);
    }
  }

  return { createAndSendBroadcast, isProcessing, progress };
}

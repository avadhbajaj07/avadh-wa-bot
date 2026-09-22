// ============================================================
// Broadcast Conversation & Message Sync
//
// Ensures every broadcast message sent to a recipient is mirrored
// into `conversations` and `messages` tables, so:
//   1. Sent / delivered / read broadcast messages appear in the Chats
//      tab (Inbox) immediately.
//   2. Status updates (sent -> delivered -> read) reflect accurately
//      with single/double checkmarks in the conversation thread.
//   3. Past sent/delivered broadcast recipients can be backfilled
//      idempotently into active conversations.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MessageTemplate } from '@/types';
import { findOrCreateConversationRow } from '@/lib/whatsapp/resolve-conversation';
import { resolveAuditUserId } from '@/lib/api/v1/contacts';
import {
  resolveTemplateRow,
  templateContentText,
} from '@/lib/whatsapp/template-body';

export interface RecordBroadcastMessageParams {
  db: SupabaseClient;
  accountId: string;
  contactId: string;
  userId?: string;
  templateName: string;
  templateRow?: MessageTemplate | null;
  params?: string[];
  whatsappMessageId?: string | null;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  sentAt?: string;
  contentText?: string | null;
}

export interface RecordBroadcastMessageResult {
  conversationId: string;
  messageId?: string;
}

/**
 * Record an outbound broadcast template message into `conversations` and `messages`.
 * Idempotent: if a message with `whatsappMessageId` already exists, it updates its
 * status (e.g. from sent -> delivered -> read) and refreshes conversation summary.
 */
export async function recordOutboundBroadcastMessage(
  params: RecordBroadcastMessageParams
): Promise<RecordBroadcastMessageResult | null> {
  const {
    db,
    accountId,
    contactId,
    userId,
    templateName,
    templateRow,
    params: templateParams,
    whatsappMessageId,
    status = 'sent',
    sentAt,
    contentText,
  } = params;

  if (!accountId || !contactId) {
    return null;
  }

  // 1. Resolve audit user ID if not provided
  let ownerUserId = userId;
  if (!ownerUserId) {
    try {
      ownerUserId = await resolveAuditUserId(db, accountId);
    } catch {
      ownerUserId = '';
    }
  }

  // 2. Fetch contact data for fallback (company, name, phone, email)
  let contactData: { name: string | null; company: string | null; phone: string | null; email: string | null } | null = null;
  try {
    const { data: cRow } = await db
      .from('contacts')
      .select('name, company, phone, email')
      .eq('id', contactId)
      .maybeSingle();
    if (cRow) {
      contactData = cRow;
    }
  } catch (cErr) {
    console.warn('[broadcast-conversation-sync] failed to fetch contact for fallback:', cErr);
  }

  // 3. Resolve template row if not provided
  let activeTemplateRow = templateRow ?? null;
  if (!activeTemplateRow && templateName) {
    try {
      const resolved = await resolveTemplateRow(db, accountId, templateName);
      activeTemplateRow = resolved.row;
    } catch {
      // ignore
    }
  }

  // 4. Resolve or create conversation
  let conversationId: string;
  try {
    conversationId = await findOrCreateConversationRow(
      db,
      accountId,
      contactId,
      ownerUserId || ''
    );
  } catch (convErr) {
    console.error('[broadcast-conversation-sync] failed to resolve conversation:', convErr);
    return null;
  }

  // 5. Render template text with params and contact fallback
  const renderedText =
    templateContentText(
      activeTemplateRow,
      templateParams ?? [],
      contentText,
      contactData
    ) || `[Template: ${templateName}]`;

  const msgTimestamp = sentAt || new Date().toISOString();

  // 6. Check if a message with whatsappMessageId already exists
  if (whatsappMessageId) {
    const { data: existingMsg } = await db
      .from('messages')
      .select('id, status, conversation_id, content_text')
      .eq('message_id', whatsappMessageId)
      .maybeSingle();

    if (existingMsg) {
      const updates: Record<string, unknown> = {};
      if (existingMsg.status !== status) {
        updates.status = status;
      }
      // If existing message has unrendered placeholder or renderedText is cleaner, heal content_text
      if (
        renderedText &&
        renderedText !== `[Template: ${templateName}]` &&
        (existingMsg.content_text?.includes('{{') ||
          !existingMsg.content_text ||
          existingMsg.content_text !== renderedText)
      ) {
        updates.content_text = renderedText;
      }

      if (Object.keys(updates).length > 0) {
        await db
          .from('messages')
          .update(updates)
          .eq('id', existingMsg.id);
      }

      // Update conversation last_message preview & ensure open status
      await db
        .from('conversations')
        .update({
          last_message_text: renderedText,
          last_message_at: msgTimestamp,
          updated_at: new Date().toISOString(),
          status: 'open',
        })
        .eq('id', existingMsg.conversation_id);

      return { conversationId: existingMsg.conversation_id, messageId: existingMsg.id };
    }
  }

  // 5. Insert new message record
  const { data: insertedMsg, error: insertErr } = await db
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_type: 'agent',
      content_type: 'template',
      content_text: renderedText,
      template_name: templateName,
      message_id: whatsappMessageId || null,
      status,
      created_at: msgTimestamp,
    })
    .select('id')
    .single();

  if (insertErr) {
    console.error('[broadcast-conversation-sync] insert message error:', insertErr);
  }

  // 6. Update conversation row so it surfaces at top of Inbox
  await db
    .from('conversations')
    .update({
      last_message_text: renderedText,
      last_message_at: msgTimestamp,
      updated_at: new Date().toISOString(),
      status: 'open',
    })
    .eq('id', conversationId);

  return { conversationId, messageId: insertedMsg?.id };
}

/**
 * Scan all sent/delivered/read broadcast recipients for an account,
 * creating missing conversation and message records so they appear in Chats.
 */
export async function syncBroadcastRecipientsToConversations(
  db: SupabaseClient,
  accountId: string,
  broadcastId?: string
): Promise<{ total: number; synced: number }> {
  let query = db
    .from('broadcast_recipients')
    .select(`
      id,
      broadcast_id,
      contact_id,
      status,
      whatsapp_message_id,
      template_params,
      sent_at,
      created_at,
      broadcast:broadcasts!inner(id, account_id, template_name, template_language)
    `)
    .eq('broadcast.account_id', accountId)
    .in('status', ['sent', 'delivered', 'read'])
    .not('contact_id', 'is', null)
    .order('created_at', { ascending: true });

  if (broadcastId) {
    query = query.eq('broadcast_id', broadcastId);
  }

  const { data: recipients, error } = await query;
  if (error || !recipients || recipients.length === 0) {
    return { total: 0, synced: 0 };
  }

  // Cache template rows to avoid repetitive queries
  const templateCache = new Map<string, MessageTemplate | null>();
  const getTemplate = async (name: string, lang?: string | null) => {
    const key = `${name}:${lang || 'en_US'}`;
    if (templateCache.has(key)) return templateCache.get(key) ?? null;
    const resolved = await resolveTemplateRow(db, accountId, name, lang);
    templateCache.set(key, resolved.row);
    return resolved.row;
  };

  let auditUserId: string;
  try {
    auditUserId = await resolveAuditUserId(db, accountId);
  } catch {
    auditUserId = '';
  }

  let synced = 0;

  for (const rec of recipients) {
    try {
      const broadcastInfo = Array.isArray(rec.broadcast)
        ? rec.broadcast[0]
        : rec.broadcast;
      if (!broadcastInfo) continue;

      const templateRow = await getTemplate(
        broadcastInfo.template_name,
        broadcastInfo.template_language
      );

      const params = Array.isArray(rec.template_params)
        ? rec.template_params.filter((p: unknown): p is string => typeof p === 'string')
        : [];

      const res = await recordOutboundBroadcastMessage({
        db,
        accountId,
        contactId: rec.contact_id,
        userId: auditUserId,
        templateName: broadcastInfo.template_name,
        templateRow,
        params,
        whatsappMessageId: rec.whatsapp_message_id,
        status: rec.status as 'sent' | 'delivered' | 'read',
        sentAt: rec.sent_at || rec.created_at,
      });

      if (res) synced++;
    } catch (err) {
      console.error(
        '[syncBroadcastRecipientsToConversations] Error processing recipient:',
        rec.id,
        err
      );
    }
  }

  return { total: recipients.length, synced };
}

import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const dynamic = 'force-dynamic';

export interface LeadContact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  action: 'register' | 'session';
  actionLabel: string;
  snippet: string;
  lastInteractionAt: string;
  conversationId: string | null;
  tags?: { id: string; name: string; color: string }[];
}

export function classifyLeadAction(
  text: string,
  interactiveId?: string | null
): {
  action: 'register' | 'session';
  actionLabel: string;
} {
  const combined = `${text || ''} ${interactiveId || ''}`.toLowerCase();

  // Register intent keywords
  const registerKeywords = [
    'register',
    'registration',
    'reg',
    'enroll',
    'enrol',
    'book',
    'booking',
    'pay',
    'payment',
    'fee',
    'fees',
    'join',
    'buy',
    'rzp',
    'price',
    'cost',
    'admission',
  ];

  if (registerKeywords.some((kw) => combined.includes(kw))) {
    return {
      action: 'register',
      actionLabel: 'Clicked Register Now',
    };
  }

  // Session intent keywords
  const sessionKeywords = [
    'session',
    'detail',
    'details',
    'faceyoga',
    'face yoga',
    'yoga',
    '22month',
    'class',
    'classes',
    'timing',
    'time',
    'zoom',
    'batch',
    'schedule',
    'link',
    'info',
  ];

  if (sessionKeywords.some((kw) => combined.includes(kw))) {
    return {
      action: 'session',
      actionLabel: 'Clicked Session Details',
    };
  }

  // Any other customer reply or interactive tap
  const cleanSnippet = text?.trim() || interactiveId?.trim() || '';
  return {
    action: 'session',
    actionLabel: cleanSnippet
      ? `Replied: "${cleanSnippet.slice(0, 30)}"`
      : 'Responded to Campaign',
  };
}

export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('agent');
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days') || 'all';
    const filterParam = searchParams.get('filter') || 'all'; // 'all' | 'register' | 'session'
    const search = searchParams.get('search')?.trim().toLowerCase() || '';

    const admin = supabaseAdmin();

    // 1. Calculate time filter
    let sinceIso: string | null = null;
    if (daysParam !== 'all') {
      const days = parseInt(daysParam, 10) || 2;
      const d = new Date();
      d.setDate(d.getDate() - days);
      sinceIso = d.toISOString();
    }

    // 2. Fetch conversations for this account, ordered by most recent activity
    let convQuery = admin
      .from('conversations')
      .select('id, contact_id, last_message_at, updated_at')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false })
      .limit(5000);

    if (sinceIso) {
      convQuery = convQuery.or(
        `updated_at.gte.${sinceIso},last_message_at.gte.${sinceIso}`
      );
    }

    const { data: convData, error: convErr } = await convQuery;
    if (convErr) {
      console.error('[leads] error fetching conversations:', convErr);
    }

    const convMap = new Map<string, string>(); // convId -> contactId
    const contactToConvMap = new Map<string, string>(); // contactId -> convId
    (convData || []).forEach((c: { id: string; contact_id: string | null }) => {
      if (c.contact_id) {
        convMap.set(c.id, c.contact_id);
        if (!contactToConvMap.has(c.contact_id)) {
          contactToConvMap.set(c.contact_id, c.id);
        }
      }
    });

    const convIds = Array.from(convMap.keys());

    // 3. Query customer messages
    const allMatchingMessages: Array<{
      conversation_id: string;
      content_text: string | null;
      interactive_reply_id: string | null;
      created_at: string;
    }> = [];

    const CHUNK_SIZE = 200;
    for (let i = 0; i < convIds.length; i += CHUNK_SIZE) {
      const chunk = convIds.slice(i, i + CHUNK_SIZE);
      let query = admin
        .from('messages')
        .select('conversation_id, content_text, interactive_reply_id, created_at')
        .in('conversation_id', chunk)
        .eq('sender_type', 'customer')
        .order('created_at', { ascending: false });

      if (sinceIso) {
        query = query.gte('created_at', sinceIso);
      } else {
        query = query.limit(2000);
      }

      const { data: msgs, error: msgsErr } = await query;
      if (!msgsErr && msgs) {
        allMatchingMessages.push(...msgs);
      }
    }

    // 4. Also fetch broadcast campaign recipients who replied
    let broadcastRepliesQuery = admin
      .from('broadcast_recipients')
      .select(`
        contact_id,
        replied_at,
        whatsapp_message_id,
        broadcast:broadcasts!inner(account_id)
      `)
      .eq('broadcast.account_id', accountId)
      .eq('status', 'replied')
      .order('replied_at', { ascending: false })
      .limit(1000);

    if (sinceIso) {
      broadcastRepliesQuery = broadcastRepliesQuery.gte('replied_at', sinceIso);
    }

    const { data: brData } = await broadcastRepliesQuery;

    // 5. Group by contact_id, keep latest interaction & classify action
    const contactInteractions = new Map<
      string,
      {
        conversationId: string | null;
        action: 'register' | 'session';
        actionLabel: string;
        snippet: string;
        lastInteractionAt: string;
      }
    >();

    let totalRegister = 0;
    let totalSession = 0;

    for (const msg of allMatchingMessages) {
      const contactId = convMap.get(msg.conversation_id);
      if (!contactId) continue;

      const rawText = msg.content_text || msg.interactive_reply_id || '';
      const classification = classifyLeadAction(rawText, msg.interactive_reply_id);
      const snippet = rawText.trim();

      if (!contactInteractions.has(contactId)) {
        contactInteractions.set(contactId, {
          conversationId: msg.conversation_id,
          action: classification.action,
          actionLabel: classification.actionLabel,
          snippet,
          lastInteractionAt: msg.created_at,
        });

        if (classification.action === 'register') totalRegister++;
        else totalSession++;
      }
    }

    // Merge replied broadcast recipients
    if (brData) {
      for (const br of brData) {
        if (!br.contact_id) continue;
        if (!contactInteractions.has(br.contact_id)) {
          contactInteractions.set(br.contact_id, {
            conversationId: contactToConvMap.get(br.contact_id) || null,
            action: 'session',
            actionLabel: 'Replied to Campaign',
            snippet: 'Replied to broadcast campaign',
            lastInteractionAt: br.replied_at || new Date().toISOString(),
          });
          totalSession++;
        }
      }
    }

    const matchedContactIds = Array.from(contactInteractions.keys());
    if (matchedContactIds.length === 0) {
      return NextResponse.json({
        leads: [],
        counts: { total: 0, register: 0, session: 0 },
        timeframeDays: daysParam,
      });
    }

    // 6. Fetch contacts details (in chunks if large)
    const contactsData: Array<{
      id: string;
      name: string | null;
      phone: string;
      email: string | null;
    }> = [];

    const CONTACT_CHUNK = 200;
    for (let i = 0; i < matchedContactIds.length; i += CONTACT_CHUNK) {
      const chunk = matchedContactIds.slice(i, i + CONTACT_CHUNK);
      const { data: cData, error: cErr } = await admin
        .from('contacts')
        .select('id, name, phone, email')
        .in('id', chunk);

      if (!cErr && cData) {
        contactsData.push(...cData);
      }
    }

    // 7. Fetch tags for these contacts
    const tagsByContact = new Map<
      string,
      Array<{ id: string; name: string; color: string }>
    >();

    for (let i = 0; i < matchedContactIds.length; i += CONTACT_CHUNK) {
      const chunk = matchedContactIds.slice(i, i + CONTACT_CHUNK);
      const { data: contactTagsData } = await admin
        .from('contact_tags')
        .select('contact_id, tags(id, name, color)')
        .in('contact_id', chunk);

      (contactTagsData ?? []).forEach((ct: any) => {
        if (ct.contact_id && ct.tags) {
          const existing = tagsByContact.get(ct.contact_id) || [];
          existing.push(ct.tags);
          tagsByContact.set(ct.contact_id, existing);
        }
      });
    }

    // 8. Assemble leads list
    let leads: LeadContact[] = contactsData
      .map((c) => {
        const interaction = contactInteractions.get(c.id)!;
        return {
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          action: interaction.action,
          actionLabel: interaction.actionLabel,
          snippet: interaction.snippet,
          lastInteractionAt: interaction.lastInteractionAt,
          conversationId: interaction.conversationId,
          tags: tagsByContact.get(c.id) || [],
        };
      })
      .sort(
        (a, b) =>
          new Date(b.lastInteractionAt).getTime() -
          new Date(a.lastInteractionAt).getTime()
      );

    // Apply action filter if requested
    if (filterParam === 'register') {
      leads = leads.filter((l) => l.action === 'register');
    } else if (filterParam === 'session') {
      leads = leads.filter((l) => l.action === 'session');
    }

    // Apply search if requested
    if (search) {
      leads = leads.filter(
        (l) =>
          l.phone.toLowerCase().includes(search) ||
          (l.name && l.name.toLowerCase().includes(search)) ||
          l.snippet.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({
      leads,
      counts: {
        total: matchedContactIds.length,
        register: totalRegister,
        session: totalSession,
      },
      timeframeDays: daysParam,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

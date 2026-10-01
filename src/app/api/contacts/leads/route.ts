import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';

export const dynamic = 'force-dynamic';

export interface LeadContact {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  action: string;
  actionLabel: string;
  actionType: 'button' | 'reply';
  buttonText: string | null;
  snippet: string;
  lastInteractionAt: string;
  conversationId: string | null;
  tags?: { id: string; name: string; color: string }[];
}

export interface ActionBreakdownItem {
  key: string;
  label: string;
  count: number;
  type: 'button' | 'reply';
  buttonText: string | null;
}

export function classifyLeadAction(
  text: string,
  interactiveId?: string | null,
  options?: {
    isInteractive?: boolean;
    knownButtons?: Set<string>;
  }
): {
  action: 'register' | 'session' | string;
  actionLabel: string;
  actionType: 'button' | 'reply';
  buttonText: string | null;
} {
  const cleanSnippet = text?.trim() || interactiveId?.trim() || '';
  const combined = `${text || ''} ${interactiveId || ''}`.toLowerCase();

  // 1. If explicitly interactive or matches account button
  if (options?.isInteractive || (interactiveId && interactiveId !== 'null' && interactiveId.trim() !== '')) {
    if (interactiveId === 'btn_register_now') {
      return {
        action: 'register',
        actionLabel: 'Clicked Register Now',
        actionType: 'button',
        buttonText: 'Register Now',
      };
    }
    if (interactiveId === 'btn_session_details' || interactiveId === '22monthsfaceyoga') {
      return {
        action: 'session',
        actionLabel: 'Clicked Session Details',
        actionType: 'button',
        buttonText: 'Session Details',
      };
    }

    const btnText = interactiveId || text || 'Button Clicked';
    return {
      action: btnText,
      actionLabel: btnText,
      actionType: 'button',
      buttonText: btnText,
    };
  }

  // 2. If text matches known account buttons
  if (options?.knownButtons?.has(cleanSnippet)) {
    return {
      action: cleanSnippet,
      actionLabel: cleanSnippet,
      actionType: 'button',
      buttonText: cleanSnippet,
    };
  }

  // 3. Register intent keywords
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
      actionType: 'button',
      buttonText: 'Register Now',
    };
  }

  // 4. Session intent keywords
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
      actionType: 'button',
      buttonText: 'Session Details',
    };
  }

  // 5. General customer text reply
  return {
    action: 'session',
    actionLabel: cleanSnippet
      ? `Replied: "${cleanSnippet.slice(0, 30)}"`
      : 'Responded to Campaign',
    actionType: 'reply',
    buttonText: null,
  };
}

export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('agent');
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days') || 'all';
    const filterParam = searchParams.get('filter') || 'all';
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

    // 2. Fetch all message templates for this specific account to discover its buttons
    const { data: templates } = await admin
      .from('message_templates')
      .select('name, buttons')
      .eq('account_id', accountId);

    const accountButtons = new Set<string>();
    (templates || []).forEach((t: { buttons?: Array<{ text?: string }> }) => {
      (t.buttons || []).forEach((b) => {
        if (b.text?.trim()) accountButtons.add(b.text.trim());
      });
    });

    // 3. Fetch conversations for this account, ordered by most recent activity
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

    // 4. Query customer messages for these conversations
    const allMatchingMessages: Array<{
      conversation_id: string;
      content_type: string;
      content_text: string | null;
      interactive_reply_id: string | null;
      created_at: string;
    }> = [];

    const CHUNK_SIZE = 200;
    for (let i = 0; i < convIds.length; i += CHUNK_SIZE) {
      const chunk = convIds.slice(i, i + CHUNK_SIZE);
      let query = admin
        .from('messages')
        .select('conversation_id, content_type, content_text, interactive_reply_id, created_at')
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

    // 5. Also fetch broadcast campaign recipients who replied in this account
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

    // 6. Group messages by contact_id to find their highest-intent action & button clicks
    const msgsByContact = new Map<
      string,
      Array<{
        conversation_id: string;
        content_type: string;
        content_text: string | null;
        interactive_reply_id: string | null;
        created_at: string;
      }>
    >();

    for (const msg of allMatchingMessages) {
      const contactId = convMap.get(msg.conversation_id);
      if (!contactId) continue;
      if (!msgsByContact.has(contactId)) {
        msgsByContact.set(contactId, []);
      }
      msgsByContact.get(contactId)!.push(msg);
    }

    const contactInteractions = new Map<
      string,
      {
        conversationId: string | null;
        action: string;
        actionLabel: string;
        actionType: 'button' | 'reply';
        buttonText: string | null;
        snippet: string;
        lastInteractionAt: string;
      }
    >();

    for (const [contactId, msgs] of msgsByContact.entries()) {
      // Find if this contact clicked any button
      const buttonMsg = msgs.find(
        (m) =>
          m.content_type === 'interactive' ||
          (m.interactive_reply_id &&
            m.interactive_reply_id !== 'null' &&
            m.interactive_reply_id.trim() !== '') ||
          (m.content_text && accountButtons.has(m.content_text.trim()))
      );

      if (buttonMsg) {
        const btnText =
          buttonMsg.content_text?.trim() ||
          buttonMsg.interactive_reply_id?.trim() ||
          'Button Clicked';

        contactInteractions.set(contactId, {
          conversationId: buttonMsg.conversation_id,
          action: btnText,
          actionLabel: btnText,
          actionType: 'button',
          buttonText: btnText,
          snippet: buttonMsg.content_text?.trim() || btnText,
          lastInteractionAt: buttonMsg.created_at,
        });
      } else {
        const latest = msgs[0];
        contactInteractions.set(contactId, {
          conversationId: latest.conversation_id,
          action: 'reply',
          actionLabel: 'Direct Reply',
          actionType: 'reply',
          buttonText: null,
          snippet: latest.content_text?.trim() || 'Replied to campaign',
          lastInteractionAt: latest.created_at,
        });
      }
    }

    // Merge replied broadcast recipients if not already captured
    if (brData) {
      for (const br of brData) {
        if (!br.contact_id) continue;
        if (!contactInteractions.has(br.contact_id)) {
          contactInteractions.set(br.contact_id, {
            conversationId: contactToConvMap.get(br.contact_id) || null,
            action: 'reply',
            actionLabel: 'Replied to Campaign',
            actionType: 'reply',
            buttonText: null,
            snippet: 'Replied to broadcast campaign',
            lastInteractionAt: br.replied_at || new Date().toISOString(),
          });
        }
      }
    }

    const matchedContactIds = Array.from(contactInteractions.keys());
    if (matchedContactIds.length === 0) {
      return NextResponse.json({
        leads: [],
        counts: {
          total: 0,
          buttons: 0,
          replies: 0,
          register: 0,
          session: 0,
          byAction: {},
        },
        actionBreakdown: [],
        timeframeDays: daysParam,
      });
    }

    // 7. Aggregate dynamic action breakdown
    const actionCounts = new Map<
      string,
      {
        key: string;
        label: string;
        count: number;
        type: 'button' | 'reply';
        buttonText: string | null;
      }
    >();

    let totalButtons = 0;
    let totalReplies = 0;
    let totalRegister = 0;
    let totalSession = 0;

    for (const inter of contactInteractions.values()) {
      const isBtn = inter.actionType === 'button';
      if (isBtn) totalButtons++;
      else totalReplies++;

      const lower = (inter.actionLabel || '').toLowerCase();
      if (lower.includes('register')) totalRegister++;
      if (lower.includes('session') || lower.includes('faceyoga')) totalSession++;

      const key = isBtn ? inter.buttonText || inter.actionLabel : 'reply';
      const label = isBtn ? inter.buttonText || inter.actionLabel : 'Direct Replies';

      if (!actionCounts.has(key)) {
        actionCounts.set(key, {
          key,
          label,
          count: 0,
          type: inter.actionType,
          buttonText: inter.buttonText,
        });
      }
      actionCounts.get(key)!.count++;
    }

    // Buttons first ordered by count desc, then replies
    const actionBreakdown = Array.from(actionCounts.values()).sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'button' ? -1 : 1;
      }
      return b.count - a.count;
    });

    // 8. Fetch contacts details (in chunks if large)
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

    // 9. Fetch tags for these contacts
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

    // 10. Assemble leads list
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
          actionType: interaction.actionType,
          buttonText: interaction.buttonText,
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
    if (filterParam !== 'all') {
      const fp = filterParam.toLowerCase();
      if (fp === 'buttons' || fp === 'button') {
        leads = leads.filter((l) => l.actionType === 'button');
      } else if (fp === 'reply' || fp === 'replies') {
        leads = leads.filter((l) => l.actionType === 'reply');
      } else if (fp === 'register') {
        leads = leads.filter(
          (l) =>
            l.actionLabel.toLowerCase().includes('register') ||
            l.action.toLowerCase() === 'register'
        );
      } else if (fp === 'session') {
        leads = leads.filter(
          (l) =>
            l.actionLabel.toLowerCase().includes('session') ||
            l.action.toLowerCase() === 'session'
        );
      } else {
        leads = leads.filter(
          (l) =>
            l.buttonText?.toLowerCase() === fp ||
            l.actionLabel.toLowerCase() === fp ||
            l.action.toLowerCase() === fp
        );
      }
    }

    // Apply search if requested
    if (search) {
      leads = leads.filter(
        (l) =>
          l.phone.toLowerCase().includes(search) ||
          (l.name && l.name.toLowerCase().includes(search)) ||
          l.actionLabel.toLowerCase().includes(search) ||
          l.snippet.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({
      leads,
      counts: {
        total: matchedContactIds.length,
        buttons: totalButtons,
        replies: totalReplies,
        register: totalRegister,
        session: totalSession,
        byAction: Object.fromEntries(
          Array.from(actionCounts.entries()).map(([k, v]) => [k, v.count])
        ),
      },
      actionBreakdown,
      timeframeDays: daysParam,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}

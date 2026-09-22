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

export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('agent');
    const { searchParams } = new URL(request.url);
    const daysParam = searchParams.get('days') || '2';
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

    // 2. Fetch conversations for this account
    const { data: convData, error: convErr } = await admin
      .from('conversations')
      .select('id, contact_id')
      .eq('account_id', accountId);

    if (convErr || !convData || convData.length === 0) {
      return NextResponse.json({
        leads: [],
        counts: { total: 0, register: 0, session: 0 },
        timeframeDays: daysParam,
      });
    }

    const convMap = new Map<string, string>(); // convId -> contactId
    convData.forEach((c: { id: string; contact_id: string | null }) => {
      if (c.contact_id) convMap.set(c.id, c.contact_id);
    });

    const convIds = Array.from(convMap.keys());
    if (convIds.length === 0) {
      return NextResponse.json({
        leads: [],
        counts: { total: 0, register: 0, session: 0 },
        timeframeDays: daysParam,
      });
    }

    // 3. Query customer messages matching register or session
    // Batch in chunks if large to prevent statement size limits
    const CHUNK_SIZE = 200;
    let allMatchingMessages: Array<{
      conversation_id: string;
      content_text: string | null;
      interactive_reply_id: string | null;
      created_at: string;
    }> = [];

    for (let i = 0; i < convIds.length; i += CHUNK_SIZE) {
      const chunk = convIds.slice(i, i + CHUNK_SIZE);
      let query = admin
        .from('messages')
        .select('conversation_id, content_text, interactive_reply_id, created_at')
        .in('conversation_id', chunk)
        .eq('sender_type', 'customer')
        .or(
          'content_text.ilike.%register%,content_text.ilike.%session%,interactive_reply_id.ilike.%register%,interactive_reply_id.ilike.%session%'
        )
        .order('created_at', { ascending: false });

      if (sinceIso) {
        query = query.gte('created_at', sinceIso);
      }

      const { data: msgs, error: msgsErr } = await query;
      if (!msgsErr && msgs) {
        allMatchingMessages.push(...msgs);
      }
    }

    // 4. Group by contact_id, keep latest interaction & classify action
    const contactInteractions = new Map<
      string,
      {
        conversationId: string;
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

      const text = `${msg.content_text || ''} ${msg.interactive_reply_id || ''}`.toLowerCase();
      const isRegister = text.includes('register');
      const isSession = text.includes('session');

      const action: 'register' | 'session' = isRegister ? 'register' : 'session';
      const actionLabel = isRegister ? 'Clicked Register Now' : 'Clicked Session Details';
      const snippet = (msg.content_text || msg.interactive_reply_id || '').trim();

      if (!contactInteractions.has(contactId)) {
        contactInteractions.set(contactId, {
          conversationId: msg.conversation_id,
          action,
          actionLabel,
          snippet,
          lastInteractionAt: msg.created_at,
        });

        if (isRegister) totalRegister++;
        else totalSession++;
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

    // 5. Fetch contacts details
    const { data: contactsData, error: contactsErr } = await admin
      .from('contacts')
      .select('id, name, phone, email')
      .in('id', matchedContactIds);

    if (contactsErr || !contactsData) {
      return NextResponse.json({
        leads: [],
        counts: { total: 0, register: 0, session: 0 },
        timeframeDays: daysParam,
      });
    }

    // 6. Fetch tags for these contacts
    const { data: contactTagsData } = await admin
      .from('contact_tags')
      .select('contact_id, tags(id, name, color)')
      .in('contact_id', matchedContactIds);

    const tagsByContact = new Map<string, Array<{ id: string; name: string; color: string }>>();
    (contactTagsData ?? []).forEach((ct: any) => {
      if (ct.contact_id && ct.tags) {
        const existing = tagsByContact.get(ct.contact_id) || [];
        existing.push(ct.tags);
        tagsByContact.set(ct.contact_id, existing);
      }
    });

    // 7. Assemble leads list
    let leads: LeadContact[] = contactsData
      .map((c: { id: string; name: string | null; phone: string; email: string | null }) => {
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
      .sort((a, b) => new Date(b.lastInteractionAt).getTime() - new Date(a.lastInteractionAt).getTime());

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

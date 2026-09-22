import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  return setupSessionFlow(request);
}

export async function POST(request: Request) {
  return setupSessionFlow(request);
}

async function setupSessionFlow(request: Request) {
  try {
    const admin = supabaseAdmin();

    // 1. Resolve user and account
    let userId: string | null = null;
    let accountId: string | null = null;

    try {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        const { data: member } = await admin
          .from('account_memberships')
          .select('account_id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (member) accountId = member.account_id;
      }
    } catch {
      // Bypassed if called from internal script
    }

    if (!accountId) {
      // Fallback: pick active account from whatsapp_config or accounts
      const { data: waConfig } = await admin
        .from('whatsapp_config')
        .select('account_id, user_id')
        .limit(1)
        .maybeSingle();
      if (waConfig) {
        accountId = waConfig.account_id;
        userId = userId || waConfig.user_id;
      }
    }

    if (!accountId) {
      const { data: acc } = await admin.from('accounts').select('id, owner_user_id').limit(1).maybeSingle();
      if (acc) {
        accountId = acc.id;
        userId = userId || acc.owner_user_id;
      }
    }

    if (!accountId || !userId) {
      return NextResponse.json({ error: 'No account found' }, { status: 400 });
    }

    // 2. Check if a session details flow already exists for this account
    const { data: existingFlows } = await admin
      .from('flows')
      .select('id, name, status, trigger_type, trigger_config')
      .eq('account_id', accountId);

    const match = (existingFlows ?? []).find(
      (f: { name?: string; trigger_config?: { keywords?: string[] } }) =>
        f.name?.toLowerCase().includes('session details') ||
        f.trigger_config?.keywords?.some((k: string) => k.toLowerCase().includes('session details'))
    );

    if (match) {
      // Ensure it is active
      if (match.status !== 'active') {
        await admin.from('flows').update({ status: 'active' }).eq('id', match.id);
      }
      return NextResponse.json({
        success: true,
        message: 'Flow already exists and is active',
        flowId: match.id,
      });
    }

    // 3. Create the Flow
    const audioUrl = 'https://www.shikhabajaj.online/media/session-details.ogg';

    const { data: newFlow, error: flowErr } = await admin
      .from('flows')
      .insert({
        account_id: accountId,
        user_id: userId,
        name: 'Session Details - Voice Note',
        description: 'Auto-replies with voice note and session details when customer sends or taps Session Details',
        status: 'active',
        trigger_type: 'keyword',
        trigger_config: {
          keywords: ['session details', 'session details (optional)', 'session detail', 'session', 'details'],
          match_type: 'contains',
          case_sensitive: false,
        },
        entry_node_id: 'start_1',
      })
      .select()
      .single();

    if (flowErr || !newFlow) {
      console.error('[setup-session-flow] Flow insert error:', flowErr);
      return NextResponse.json({ error: flowErr?.message || 'Failed to create flow' }, { status: 500 });
    }

    // 4. Create the nodes
    const nodes = [
      {
        flow_id: newFlow.id,
        node_key: 'start_1',
        node_type: 'start',
        config: { next_node_key: 'audio_1' },
        position_x: 100,
        position_y: 150,
      },
      {
        flow_id: newFlow.id,
        node_key: 'audio_1',
        node_type: 'send_media',
        config: {
          media_type: 'audio',
          media_url: audioUrl,
          next_node_key: 'text_1',
        },
        position_x: 350,
        position_y: 150,
      },
      {
        flow_id: newFlow.id,
        node_key: 'text_1',
        node_type: 'send_message',
        config: {
          text: `🌸 *5-Day Face Yoga & Anti-Aging Workshop* 🌸\n\n✨ *तारीख:* कल से शुरू (5 दिन का लाइव सेशन)\n⏰ *समय:* सुबह एवं शाम के बैच उपलब्ध\n💰 *फीस:* केवल ₹99/-\n\n👉 रजिस्टर करने के लिए नीचे दिए गए लिंक पर क्लिक करें:\nhttps://www.shikhabajaj.online\n(या 'Register Now' लिखें)`,
          next_node_key: 'end_1',
        },
        position_x: 650,
        position_y: 150,
      },
      {
        flow_id: newFlow.id,
        node_key: 'end_1',
        node_type: 'end',
        config: {},
        position_x: 950,
        position_y: 150,
      },
    ];

    const { error: nodesErr } = await admin.from('flow_nodes').insert(nodes);
    if (nodesErr) {
      console.error('[setup-session-flow] Nodes insert error:', nodesErr);
      return NextResponse.json({ error: nodesErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Created and activated Session Details Voice Note flow',
      flowId: newFlow.id,
    });
  } catch (err) {
    console.error('[setup-session-flow] Unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

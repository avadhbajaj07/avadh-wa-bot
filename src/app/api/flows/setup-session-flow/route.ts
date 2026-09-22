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

    // 1. Deactivate all flows matching "session" or "detail"
    const { data: existingFlows } = await admin
      .from('flows')
      .select('id, name, status')
      .eq('account_id', accountId);

    const deactivated: string[] = [];
    for (const f of existingFlows ?? []) {
      const lower = (f.name ?? '').toLowerCase();
      if (lower.includes('session') || lower.includes('detail')) {
        await admin.from('flows').update({ status: 'draft' }).eq('id', f.id);
        deactivated.push(f.id);
      }
    }

    // 2. Cancel all active flow runs
    await admin
      .from('flow_runs')
      .update({ status: 'cancelled' })
      .eq('account_id', accountId)
      .eq('status', 'active');

    // 3. Find and update any flow_nodes with "clicked" or "Session Details" text
    const { data: nodes } = await admin
      .from('flow_nodes')
      .select('id, flow_id, node_type, config');

    let updatedNodesCount = 0;
    for (const n of nodes ?? []) {
      const cfgStr = JSON.stringify(n.config ?? {});
      if (cfgStr.toLowerCase().includes('clicked') || cfgStr.toLowerCase().includes('here are the details')) {
        await admin
          .from('flow_nodes')
          .update({
            node_type: 'send_media',
            config: {
              media_type: 'audio',
              media_url: 'https://www.shikhabajaj.online/media/session-details.ogg',
            },
          })
          .eq('id', n.id);
        updatedNodesCount++;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Deactivated text flows, cancelled active runs, and updated nodes to voice media.',
      deactivatedFlowIds: deactivated,
      updatedNodesCount,
    });
  } catch (err) {
    console.error('[setup-session-flow] Unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

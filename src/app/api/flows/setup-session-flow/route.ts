import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { createClient } from '@/lib/supabase/server';
import { loadAccountMetaCredentials } from '@/lib/flows/meta-send';
import { sendMediaMessage, sendTextMessage, sendTemplateMessage } from '@/lib/whatsapp/meta-api';
import { decrypt } from '@/lib/whatsapp/encryption';
import { SHIKHA_ACCOUNT_IDS } from '@/lib/whatsapp/shikha';

export const dynamic = 'force-dynamic';

const FACE_YOGA_MESSAGE_TEXT = `Face Yoga – 1 month With Shikha Bajaj
Namaste 🙏

Join me for a fun & simple 1 Month Face Yoga journey — ghar baithe, LIVE on Zoom! 🧘‍♀️

✨ 22 Live Classes
- Natural Glow
- Firmer-looking Skin
- Healthy & Fresh Look
- Fine Lines ki appearance ko reduce karne mein help
- Relaxed face + happy mood 

🗓️ Starting 1st October
⏰ 9:00 – 9:30 PM
💻 Online on Zoom
💰 Only ₹799/-

No pressure, no complicated routine — bas 30 minutes for YOU! 
Aaiye, saath mein Glow, Smile & Feel Beautiful karein! 🌷✨
With Love,
Shikha Bajaj

with Registration link - https://rzp.io/rzp/facebs`;

const AUDIO_URL = 'https://www.shikhabajaj.online/media/faceyoga-1month.ogg';
const TEMPLATE_NAME = '22monthsfaceyoga';
const TEMPLATE_META_ID = '1444247454275273';

export async function GET(request: Request) {
  return handleSessionFlowSetup(request);
}

export async function POST(request: Request) {
  return handleSessionFlowSetup(request);
}

async function handleSessionFlowSetup(request: Request) {
  try {
    const admin = supabaseAdmin();
    const url = new URL(request.url);
    const testTo = url.searchParams.get('to');
    const targetEmail = url.searchParams.get('email') || 'bajajshikha07@gmail.com';

    // 1. Resolve Shikha Bajaj user and account
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
      // Ignored for unauthenticated admin / cron invocations
    }

    // Try finding Shikha Bajaj by auth email
    if (!accountId) {
      try {
        const { data: usersData } = await admin.auth.admin.listUsers();
        const shikha = usersData?.users?.find(
          (u) => u.email?.toLowerCase() === targetEmail.toLowerCase()
        );
        if (shikha) {
          userId = shikha.id;
          const { data: member } = await admin
            .from('account_memberships')
            .select('account_id')
            .eq('user_id', shikha.id)
            .maybeSingle();
          if (member) accountId = member.account_id;

          if (!accountId) {
            const { data: acc } = await admin
              .from('accounts')
              .select('id')
              .eq('owner_user_id', shikha.id)
              .maybeSingle();
            if (acc) accountId = acc.id;
          }

          if (!accountId) {
            const { data: waCfg } = await admin
              .from('whatsapp_config')
              .select('account_id')
              .eq('user_id', shikha.id)
              .maybeSingle();
            if (waCfg) accountId = waCfg.account_id;
          }
        }
      } catch (authErr) {
        console.warn('[setup-session-flow] auth user list check:', authErr);
      }
    }

    // Try finding by profile or whatsapp_config
    if (!accountId) {
      const { data: waConfig } = await admin
        .from('whatsapp_config')
        .select('account_id, user_id, verified_name')
        .or(`verified_name.ilike.%shikha%,verified_name.ilike.%bajaj%`)
        .limit(1)
        .maybeSingle();
      if (waConfig) {
        accountId = waConfig.account_id;
        userId = userId || waConfig.user_id;
      }
    }

    // Fallback: strictly Shikha Bajaj account IDs only (never non-Shikha accounts)
    if (!accountId) {
      const { data: acc } = await admin
        .from('accounts')
        .select('id, owner_user_id')
        .in('id', Array.from(SHIKHA_ACCOUNT_IDS))
        .limit(1)
        .maybeSingle();
      if (acc) {
        accountId = acc.id;
        userId = userId || acc.owner_user_id;
      }
    }

    if (!accountId || !userId) {
      return NextResponse.json({ error: 'No account found for Shikha Bajaj' }, { status: 400 });
    }

    // 2. Fetch WhatsApp config details for this account
    const { data: waConfigRow } = await admin
      .from('whatsapp_config')
      .select('phone_number_id, waba_id, verified_name, display_phone_number, access_token')
      .eq('account_id', accountId)
      .maybeSingle();

    // 3. Sync or check template 22monthsfaceyoga
    let syncedTemplate: Record<string, unknown> | null = null;
    if (waConfigRow?.waba_id && waConfigRow?.access_token) {
      try {
        const rawToken = decrypt(waConfigRow.access_token);
        const metaRes = await fetch(
          `https://graph.facebook.com/v21.0/${waConfigRow.waba_id}/message_templates?limit=100&fields=id,name,language,status,category,components,quality_score`,
          {
            headers: { Authorization: `Bearer ${rawToken}` },
          }
        );
        if (metaRes.ok) {
          const metaJson = (await metaRes.json()) as { data?: Array<{ id: string; name: string; language: string; status: string; category: string; components?: unknown[] }> };
          const matched = metaJson.data?.find(
            (t) => t.name.toLowerCase() === TEMPLATE_NAME.toLowerCase() || t.id === TEMPLATE_META_ID
          );
          if (matched) {
            syncedTemplate = matched;
            // Upsert into message_templates
            const bodyComp = (matched.components as Array<{ type: string; text?: string }> | undefined)?.find(c => c.type === 'BODY');
            await admin.from('message_templates').upsert({
              account_id: accountId,
              user_id: userId,
              name: matched.name,
              category: 'Marketing',
              language: matched.language,
              body_text: bodyComp?.text ?? FACE_YOGA_MESSAGE_TEXT,
              status: matched.status,
              meta_template_id: matched.id,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'account_id,name,language' });
          }
        }
      } catch (syncErr) {
        console.warn('[setup-session-flow] template check error:', syncErr);
      }
    }

    // Always guarantee 22monthsfaceyoga exists in message_templates table
    await admin.from('message_templates').upsert({
      account_id: accountId,
      user_id: userId,
      name: TEMPLATE_NAME,
      category: 'Marketing',
      language: 'en',
      body_text: FACE_YOGA_MESSAGE_TEXT,
      status: 'APPROVED',
      meta_template_id: TEMPLATE_META_ID,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,name,language' });

    // Also check local message_templates table
    const { data: dbTemplate } = await admin
      .from('message_templates')
      .select('*')
      .eq('account_id', accountId)
      .or(`name.ilike.%${TEMPLATE_NAME}%,meta_template_id.eq.${TEMPLATE_META_ID}`)
      .maybeSingle();

    // 4. Archive/deactivate older session flows to avoid duplicate triggers
    const { data: existingFlows } = await admin
      .from('flows')
      .select('id, name, status')
      .eq('account_id', accountId);

    const deactivated: string[] = [];
    let targetFlowId: string | null = null;

    for (const f of existingFlows ?? []) {
      const lower = (f.name ?? '').toLowerCase();
      if (lower.includes('session') || lower.includes('face yoga') || lower.includes('faceyoga')) {
        if (!targetFlowId) {
          targetFlowId = f.id;
        } else {
          await admin.from('flows').update({ status: 'draft' }).eq('id', f.id);
          deactivated.push(f.id);
        }
      }
    }

    // 5. Cancel active flow runs
    await admin
      .from('flow_runs')
      .update({ status: 'cancelled' })
      .eq('account_id', accountId)
      .eq('status', 'active');

    // 6. Create or update target Flow
    const flowKeywords = [
      'session details',
      'sessions details',
      'session detail',
      'session details (optional)',
    ];

    if (!targetFlowId) {
      const { data: newFlow, error: flowErr } = await admin
        .from('flows')
        .insert({
          account_id: accountId,
          user_id: userId,
          name: 'Session Details - Face Yoga 1 Month',
          description: 'Auto-replies with 1-month face yoga audio voice note and details template when requested',
          status: 'active',
          trigger_type: 'keyword',
          trigger_config: {
            keywords: flowKeywords,
            match_type: 'exact',
            case_sensitive: false,
          },
          entry_node_id: 'start_1',
        })
        .select('id')
        .single();

      if (flowErr || !newFlow) {
        throw new Error(flowErr?.message || 'Failed to create flow');
      }
      targetFlowId = newFlow.id;
    } else {
      await admin
        .from('flows')
        .update({
          name: 'Session Details - Face Yoga 1 Month',
          description: 'Auto-replies with 1-month face yoga audio voice note and details template when requested',
          status: 'active',
          trigger_type: 'keyword',
          trigger_config: {
            keywords: flowKeywords,
            match_type: 'exact',
            case_sensitive: false,
          },
          entry_node_id: 'start_1',
        })
        .eq('id', targetFlowId);
    }

    // 7. Delete existing nodes for this flow and recreate with audio + message
    // Note: The 22monthsfaceyoga template is sent by the webhook fail-safe
    // handler, not by the flow engine, because the DB's flow_nodes_node_type_check
    // constraint doesn't include 'send_template' as a valid node type.
    await admin.from('flow_nodes').delete().eq('flow_id', targetFlowId);

    const nodes = [
      {
        flow_id: targetFlowId,
        node_key: 'start_1',
        node_type: 'start',
        config: { next_node_key: 'audio_1' },
        position_x: 100,
        position_y: 150,
      },
      {
        flow_id: targetFlowId,
        node_key: 'audio_1',
        node_type: 'send_media',
        config: {
          media_type: 'audio',
          media_url: AUDIO_URL,
          filename: 'faceyoga-1month.ogg',
          next_node_key: 'msg_1',
        },
        position_x: 350,
        position_y: 150,
      },
      {
        flow_id: targetFlowId,
        node_key: 'msg_1',
        node_type: 'send_message',
        config: {
          text: FACE_YOGA_MESSAGE_TEXT,
          next_node_key: 'end_1',
        },
        position_x: 650,
        position_y: 150,
      },
      {
        flow_id: targetFlowId,
        node_key: 'end_1',
        node_type: 'end',
        config: {},
        position_x: 950,
        position_y: 150,
      },
    ];

    await admin.from('flow_nodes').insert(nodes);

    // 8. Update any other nodes in account that pointed to old session-details.ogg
    await admin
      .from('flow_nodes')
      .update({
        config: {
          media_type: 'audio',
          media_url: AUDIO_URL,
          filename: 'faceyoga-1month.ogg',
        },
      })
      .filter('config->>media_url', 'ilike', '%session-details.ogg%');

    // 9. Optional direct test send if ?to=91... is provided
    let testSendResult: Record<string, unknown> | null = null;
    if (testTo) {
      try {
        const { phoneNumberId, accessToken } = await loadAccountMetaCredentials(admin, accountId);
        const audioSend = await sendMediaMessage({
          phoneNumberId,
          accessToken,
          to: testTo,
          kind: 'audio',
          link: AUDIO_URL,
        });

        let tplSend: unknown = null;
        if (dbTemplate) {
          try {
            tplSend = await sendTemplateMessage({
              phoneNumberId,
              accessToken,
              to: testTo,
              templateName: dbTemplate.name,
              language: dbTemplate.language || 'en',
              template: dbTemplate,
            });
          } catch (te) {
            console.warn('[setup-session-flow] test template send failed:', te);
          }
        }

        const msgSend = await sendTextMessage({
          phoneNumberId,
          accessToken,
          to: testTo,
          text: FACE_YOGA_MESSAGE_TEXT,
        });

        testSendResult = {
          audioSend,
          tplSend,
          msgSend,
        };
      } catch (testErr) {
        testSendResult = {
          error: testErr instanceof Error ? testErr.message : String(testErr),
        };
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully updated Session Details Flow with new Face Yoga audio and details message/template!',
      account: {
        accountId,
        userId,
        verifiedName: waConfigRow?.verified_name,
        displayPhone: waConfigRow?.display_phone_number,
      },
      flow: {
        flowId: targetFlowId,
        audioUrl: AUDIO_URL,
        messageText: FACE_YOGA_MESSAGE_TEXT,
        keywords: flowKeywords,
      },
      template: {
        synced: syncedTemplate,
        dbTemplate,
      },
      deactivatedFlowIds: deactivated,
      testSendResult,
    });
  } catch (err) {
    console.error('[setup-session-flow] Unexpected error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

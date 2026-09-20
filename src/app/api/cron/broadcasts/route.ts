import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import {
  deliverBroadcast,
  finalizeBroadcastStatus,
} from '@/lib/whatsapp/broadcast-core';
import {
  claimBroadcastDelivery,
  planBroadcastResume,
  markBroadcastSending,
  releaseBroadcastDelivery,
} from '@/lib/whatsapp/broadcast-resume';

/**
 * GET /api/cron/broadcasts
 * POST /api/cron/broadcasts
 *
 * Periodic cron job to trigger scheduled broadcasts when their
 * scheduled_at time has arrived.
 */
export async function GET() {
  return handleScheduledBroadcasts();
}

export async function POST() {
  return handleScheduledBroadcasts();
}

async function handleScheduledBroadcasts() {
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  try {
    // Find broadcasts that are scheduled and due
    const { data: scheduledBroadcasts, error } = await admin
      .from('broadcasts')
      .select('id, account_id, name, scheduled_at')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now);

    if (error) {
      console.error('[cron/broadcasts] fetch error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!scheduledBroadcasts || scheduledBroadcasts.length === 0) {
      return NextResponse.json({ message: 'No scheduled broadcasts due', count: 0 });
    }

    console.log(
      `[cron/broadcasts] Found ${scheduledBroadcasts.length} scheduled broadcast(s) to send.`
    );

    const results = [];

    for (const b of scheduledBroadcasts) {
      try {
        const claimed = await claimBroadcastDelivery(
          admin,
          b.account_id,
          b.id,
          new Date(),
          true
        );

        if (!claimed) {
          console.warn(`[cron/broadcasts] Could not claim broadcast ${b.id}`);
          continue;
        }

        const { plan } = await planBroadcastResume(
          admin,
          b.account_id,
          b.id,
          'pending'
        );

        await markBroadcastSending(admin, b.id);

        try {
          await deliverBroadcast(admin, plan);
          results.push({ id: b.id, name: b.name, status: 'delivered' });
        } catch (deliveryErr) {
          console.error(
            `[cron/broadcasts] Delivery error for ${b.id}:`,
            deliveryErr instanceof Error ? deliveryErr.message : deliveryErr
          );
          await finalizeBroadcastStatus(admin, b.id).catch(() => {});
          results.push({
            id: b.id,
            name: b.name,
            status: 'error',
            error: deliveryErr instanceof Error ? deliveryErr.message : 'Delivery failed',
          });
        } finally {
          await releaseBroadcastDelivery(admin, b.id);
        }
      } catch (itemErr) {
        console.error(
          `[cron/broadcasts] Error processing scheduled broadcast ${b.id}:`,
          itemErr instanceof Error ? itemErr.message : itemErr
        );
        results.push({
          id: b.id,
          name: b.name,
          status: 'error',
          error: itemErr instanceof Error ? itemErr.message : 'Processing failed',
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error('[cron/broadcasts] unhandled error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal error' },
      { status: 500 }
    );
  }
}

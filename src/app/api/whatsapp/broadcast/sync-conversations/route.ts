import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/flows/admin-client';
import { syncBroadcastRecipientsToConversations } from '@/lib/whatsapp/broadcast-conversation-sync';

export async function POST(request: Request) {
  try {
    const { accountId } = await requireRole('agent');

    const body = await request.json().catch(() => ({}));
    const broadcastId = body?.broadcast_id;

    const result = await syncBroadcastRecipientsToConversations(
      supabaseAdmin(),
      accountId,
      broadcastId
    );

    return NextResponse.json({
      success: true,
      total: result.total,
      synced: result.synced,
    });
  } catch (error) {
    console.error('Error in sync-conversations POST:', error);
    return toErrorResponse(error);
  }
}

export async function GET() {
  try {
    const { accountId } = await requireRole('agent');

    const result = await syncBroadcastRecipientsToConversations(
      supabaseAdmin(),
      accountId
    );

    return NextResponse.json({
      success: true,
      total: result.total,
      synced: result.synced,
    });
  } catch (error) {
    console.error('Error in sync-conversations GET:', error);
    return toErrorResponse(error);
  }
}

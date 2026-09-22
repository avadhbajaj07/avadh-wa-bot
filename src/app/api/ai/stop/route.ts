import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/ai/admin-client'

export const dynamic = 'force-dynamic'

export async function GET() {
  return stopAi()
}

export async function POST() {
  return stopAi()
}

async function stopAi() {
  try {
    const admin = supabaseAdmin()

    // 1. Deactivate AI config
    const { error: aiErr } = await admin
      .from('ai_configs')
      .update({
        is_active: false,
        auto_reply_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .neq('id', '00000000-0000-0000-0000-000000000000')

    // 2. Disable auto-reply on all conversations
    const { error: convErr } = await admin
      .from('conversations')
      .update({
        ai_autoreply_disabled: true,
      })
      .neq('id', '00000000-0000-0000-0000-000000000000')

    return NextResponse.json({
      success: true,
      message: 'AI automation has been completely stopped and disabled.',
      aiConfigError: aiErr ? aiErr.message : null,
      conversationsError: convErr ? convErr.message : null,
    })
  } catch (err) {
    console.error('[stop-ai] Unexpected error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { adminDb, decryptGoogleSecret, encryptGoogleSecret, randomSecret } from '@/lib/google/sheets'

export async function GET(request: Request) {
  try {
    const { accountId } = await requireRole('admin')
    const db = adminDb()
    const { data: connection } = await db.from('google_connections').select('order_webhook_secret_encrypted').eq('account_id', accountId).maybeSingle()
    if (!connection) return NextResponse.json({ error: 'Connect Google first' }, { status: 400 })
    let encrypted = connection.order_webhook_secret_encrypted as string | null
    if (!encrypted) {
      encrypted = encryptGoogleSecret(randomSecret())
      const { error } = await db.from('google_connections').update({ order_webhook_secret_encrypted: encrypted }).eq('account_id', accountId).is('order_webhook_secret_encrypted', null)
      if (error) throw new Error('Could not set up store webhook')
      const { data: fresh } = await db.from('google_connections').select('order_webhook_secret_encrypted').eq('account_id', accountId).single()
      encrypted = fresh?.order_webhook_secret_encrypted
    }
    if (!encrypted) throw new Error('Could not set up store webhook')
    return NextResponse.json({ url: `${new URL(request.url).origin}/api/webhooks/orders/${accountId}`, secret: decryptGoogleSecret(encrypted) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return toErrorResponse(error) }
}

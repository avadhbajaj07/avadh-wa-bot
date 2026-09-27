import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { adminDb, encryptGoogleSecret, exchangeCode, provisionSheets, verifyState } from '@/lib/google/sheets'

export async function GET(request: NextRequest) {
  const destination = new URL('/settings?tab=google', request.url)
  const state = verifyState(request.nextUrl.searchParams.get('state') || '')
  const code = request.nextUrl.searchParams.get('code')
  const nonce = request.cookies.get('google_oauth_nonce')?.value
  const response = () => {
    const res = NextResponse.redirect(destination)
    res.cookies.delete({ name: 'google_oauth_nonce', path: '/' })
    return res
  }
  if (!state || !code || !nonce || state.nonce !== nonce) {
    destination.searchParams.set('google_error', 'Invalid security state or expired session. Please click Connect Google again.')
    return response()
  }
  try {
    const ctx = await requireRole('admin')
    if (ctx.accountId !== state.accountId || ctx.userId !== state.userId) throw new Error('Account mismatch')
    const token = await exchangeCode(code)
    const db = adminDb(ctx.supabase)
    const { error } = await db.from('google_connections').upsert({ account_id: ctx.accountId, refresh_token_encrypted: encryptGoogleSecret(token), connected_at: new Date().toISOString() }, { onConflict: 'account_id' })
    if (error) {
      console.error('Failed to save google_connections:', error)
      throw new Error(`Could not save Google connection: ${error.message}`)
    }
    await provisionSheets(db, ctx.accountId, ctx.account.name)
    destination.searchParams.set('google_connected', '1')
  } catch (error) {
    console.error('Google OAuth callback setup error:', error)
    const message = error instanceof Error ? error.message : 'setup_failed'
    destination.searchParams.set('google_error', message)
  }
  return response()
}

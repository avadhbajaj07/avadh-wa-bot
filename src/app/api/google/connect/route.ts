import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { googleSettings, GOOGLE_SCOPES, randomSecret, signState } from '@/lib/google/sheets'

export async function GET() {
  try {
    const { accountId, userId } = await requireRole('admin')
    const cfg = googleSettings()
    const nonce = randomSecret()
    const payload = Buffer.from(JSON.stringify({ accountId, userId, nonce, expires: Date.now() + 10 * 60_000 })).toString('base64url')
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    url.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: GOOGLE_SCOPES, access_type: 'offline', prompt: 'consent', state: signState(payload) }).toString()
    const response = NextResponse.redirect(url)
    response.cookies.set('google_oauth_nonce', nonce, { httpOnly: true, secure: cfg.redirectUri.startsWith('https:'), sameSite: 'lax', maxAge: 600, path: '/' })
    return response
  } catch (error) { return toErrorResponse(error) }
}

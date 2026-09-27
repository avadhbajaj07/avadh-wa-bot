import crypto from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'

export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file'
export const HEADERS = {
  leads: ['Name', 'Phone', 'Source', 'Status', 'Created At', 'Last Contacted', 'Template Sent', 'Sent At', 'Reply Status', 'Reply Text', 'Replied At'],
  bulk: ['Name', 'Phone', 'Details', 'Template Sent', 'Sent At', 'Reply Status', 'Reply Text', 'Replied At'],
  failed: ['Name', 'Phone', 'Template', 'Error Code', 'Error Reason', 'Attempted At', 'Retry Count'],
} as const
export type SheetType = keyof typeof HEADERS | 'custom'

export function googleSettings() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  const key = process.env.ENCRYPTION_KEY
  if (!clientId || !clientSecret || !appUrl || !key || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('Google integration requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_APP_URL and a 64-character ENCRYPTION_KEY')
  }
  return { clientId, clientSecret, redirectUri: `${appUrl.replace(/\/$/, '')}/api/google/callback`, key }
}

export function adminDb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export function encryptGoogleSecret(value: string): string {
  googleSettings() // Disallow the legacy deterministic fallback key.
  return encrypt(value)
}

export function decryptGoogleSecret(value: string): string {
  googleSettings()
  return decrypt(value)
}

export function randomSecret(): string { return crypto.randomBytes(32).toString('hex') }

export function signState(payload: string): string {
  const mac = crypto.createHmac('sha256', googleSettings().key).update(payload).digest('base64url')
  return `${payload}.${mac}`
}

export function verifyState(state: string): { accountId: string; userId: string; nonce: string; expires: number } | null {
  const dot = state.lastIndexOf('.')
  if (dot < 0) return null
  const payload = state.slice(0, dot)
  const expected = signState(payload)
  if (expected.length !== state.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(state))) return null
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString())
    if (Date.now() > value.expires || typeof value.accountId !== 'string' || typeof value.userId !== 'string' || typeof value.nonce !== 'string') return null
    return value
  } catch { return null }
}

export async function exchangeCode(code: string): Promise<string> {
  const cfg = googleSettings()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: 'authorization_code' }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Google token exchange failed')
  const data = await response.json() as { refresh_token?: string }
  if (!data.refresh_token) throw new Error('Google did not return a refresh token; reconnect with consent')
  return data.refresh_token
}

export async function accessToken(db: SupabaseClient, accountId: string): Promise<string> {
  const { data, error } = await db.from('google_connections').select('refresh_token_encrypted').eq('account_id', accountId).single()
  if (error || !data) throw new Error('Google is not connected')
  const cfg = googleSettings()
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: decryptGoogleSecret(data.refresh_token_encrypted), client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'refresh_token' }),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Google connection expired; reconnect Google')
  const json = await response.json() as { access_token?: string }
  if (!json.access_token) throw new Error('Google access token unavailable')
  return json.access_token
}

export async function googleApi<T>(token: string, url: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Google API request failed (${response.status})`)
  return response.status === 204 ? undefined as T : await response.json() as T
}

export function a1(tab: string, range: string): string {
  return `'${tab.replace(/'/g, "''")}'!${range}`
}

export async function readHeaders(token: string, sheetId: string, tab: string): Promise<string[]> {
  const range = encodeURIComponent(a1(tab, '1:1'))
  const data = await googleApi<{ values?: string[][] }>(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}`)
  return (data.values?.[0] || []).map(x => String(x).trim())
}

export async function writeCells(token: string, sheetId: string, tab: string, row: number, values: Record<string, string>): Promise<void> {
  return writeRows(token, sheetId, tab, [{ row, values }])
}

export async function writeRows(token: string, sheetId: string, tab: string, rows: { row: number; values: Record<string, string> }[]): Promise<void> {
  const headers = await readHeaders(token, sheetId, tab)
  const data = rows.flatMap(({ row, values }) => Object.entries(values).flatMap(([header, value]) => {
    const idx = headers.indexOf(header)
    if (idx < 0) return []
    let col = idx + 1, letters = ''
    while (col) { col--; letters = String.fromCharCode(65 + col % 26) + letters; col = Math.floor(col / 26) }
    return [{ range: a1(tab, `${letters}${row}`), values: [[value]] }]
  }))
  if (data.length) await googleApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values:batchUpdate`, 'POST', { valueInputOption: 'RAW', data })
}

export async function appendFailure(token: string, sheetId: string, tab: string, values: string[]): Promise<void> {
  const range = encodeURIComponent(a1(tab, 'A:G'))
  await googleApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, 'POST', { values: [values] })
}

export async function appendBulkLog(token: string, sheetId: string, tab: string, values: string[]): Promise<number> {
  const range = encodeURIComponent(a1(tab, 'A:H'))
  const result = await googleApi<{ updates?: { updatedRange?: string } }>(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, 'POST', { values: [values] })
  const row = Number(result.updates?.updatedRange?.match(/![A-Z]+(\d+)/)?.[1])
  if (!Number.isInteger(row) || row < 2) throw new Error('Google did not return an appended row')
  return row
}

export async function provisionSheets(db: SupabaseClient, accountId: string, accountName: string): Promise<void> {
  const token = await accessToken(db, accountId)
  const { data: connection } = await db.from('google_connections').select('folder_id').eq('account_id', accountId).single()
  let folderId: string | undefined = connection?.folder_id || undefined
  if (!folderId) {
    const folder = await googleApi<{ id: string }>(token, 'https://www.googleapis.com/drive/v3/files?fields=id', 'POST', { name: accountName, mimeType: 'application/vnd.google-apps.folder' })
    folderId = folder.id
    await db.from('google_connections').update({ folder_id: folderId }).eq('account_id', accountId)
  }
  for (const [type, headers] of Object.entries(HEADERS) as [keyof typeof HEADERS, readonly string[]][]) {
    const { data: existing } = await db.from('sheet_configs').select('id').eq('account_id', accountId).eq('sheet_type', type).maybeSingle()
    if (existing) continue
    const title = type === 'bulk' ? 'Bulk WhatsApp Campaign' : type === 'failed' ? 'Failed Messages' : 'Leads'
    const sheet = await googleApi<{ spreadsheetId: string }>(token, 'https://sheets.googleapis.com/v4/spreadsheets', 'POST', { properties: { title: `${accountName} — ${title}` }, sheets: [{ properties: { title } }] })
    const id = sheet.spreadsheetId
    const file = await googleApi<{ parents?: string[] }>(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=parents`)
    const query = new URLSearchParams({ addParents: folderId, fields: 'id' })
    if (file.parents?.length) query.set('removeParents', file.parents.join(','))
    await googleApi(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?${query}`, 'PATCH')
    await googleApi(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(a1(title, 'A1'))}?valueInputOption=RAW`, 'PUT', { values: [headers] })
    const { error } = await db.from('sheet_configs').insert({ account_id: accountId, sheet_type: type, google_sheet_id: id, tab_name: title, active: true, webhook_secret_encrypted: encryptGoogleSecret(randomSecret()) })
    if (error) throw new Error('Could not save sheet configuration')
  }
}

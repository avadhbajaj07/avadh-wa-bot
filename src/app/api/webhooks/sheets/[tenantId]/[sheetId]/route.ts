import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { adminDb, decryptGoogleSecret } from '@/lib/google/sheets'
import { sendSheetRows, type SheetRow } from '@/lib/google/sync'

export const maxDuration = 60

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string; sheetId: string }> }) {
  const { tenantId, sheetId } = await params
  const db = adminDb()
  const { data: config } = await db.from('sheet_configs').select('id,account_id,google_sheet_id,tab_name,template_id,active,sheet_type,webhook_secret_encrypted').eq('id', sheetId).eq('account_id', tenantId).maybeSingle()
  if (!config) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const provided = request.headers.get('x-sheet-secret') || ''
  const expected = decryptGoogleSecret(config.webhook_secret_encrypted)
  if (provided.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { rows?: SheetRow[] }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 200 || body.rows.some(r => !r || !Number.isInteger(r.rowNumber) || typeof r.values !== 'object' || !r.values)) return NextResponse.json({ error: 'Expected 1-200 rows' }, { status: 400 })
  try {
    const result = await sendSheetRows(db, config, body.rows)
    return NextResponse.json(result)
  } catch { return NextResponse.json({ error: 'Sheet automation unavailable' }, { status: 503 }) }
}

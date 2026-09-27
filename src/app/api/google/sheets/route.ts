import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { accessToken, adminDb, encryptGoogleSecret, googleApi, randomSecret, readHeaders } from '@/lib/google/sheets'

export async function GET() {
  try {
    const { accountId, supabase } = await requireRole('admin')
    const db = adminDb(supabase)
    const [{ data: connection }, { data: sheets, error }, { data: templates }] = await Promise.all([
      db.from('google_connections').select('connected_at').eq('account_id', accountId).maybeSingle(),
      db.from('sheet_configs').select('id,sheet_type,google_sheet_id,tab_name,template_id,active').eq('account_id', accountId).order('created_at'),
      supabase.from('message_templates').select('id,name,language,status').eq('account_id', accountId).eq('status', 'Approved').order('name'),
    ])
    if (error) {
      console.error('Failed to load sheet settings from DB:', error)
      throw new Error('Could not load sheet settings')
    }
    return NextResponse.json({ connected: !!connection, sheets: sheets || [], templates: templates || [] })
  } catch (error) { return toErrorResponse(error) }
}

export async function POST(request: Request) {
  try {
    const { accountId, supabase } = await requireRole('admin')
    const body = await request.json() as { googleSheetId?: string; tabName?: string }
    const id = body.googleSheetId?.trim()
    if (!id || !/^[\w-]{15,100}$/.test(id)) return NextResponse.json({ error: 'Invalid sheet ID' }, { status: 400 })
    const db = adminDb(supabase)
    const token = await accessToken(db, accountId)
    const spreadsheet = await googleApi<{ sheets?: { properties?: { title?: string } }[] }>(token, `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}?fields=sheets.properties.title`)
    const tab = body.tabName?.trim() || spreadsheet.sheets?.[0]?.properties?.title || 'Sheet1'
    if (tab.length > 100) return NextResponse.json({ error: 'Invalid tab' }, { status: 400 })
    const headers = await readHeaders(token, id, tab)
    if (!headers.includes('Name') || !headers.includes('Phone')) return NextResponse.json({ error: 'The selected tab needs Name and Phone columns in row 1' }, { status: 400 })
    const { error } = await db.from('sheet_configs').insert({ account_id: accountId, sheet_type: 'custom', google_sheet_id: id, tab_name: tab, active: true, webhook_secret_encrypted: encryptGoogleSecret(randomSecret()) })
    if (error) return NextResponse.json({ error: 'Sheet is already connected or could not be saved' }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch (error) { return toErrorResponse(error) }
}

export async function PATCH(request: Request) {
  try {
    const { accountId, supabase } = await requireRole('admin')
    const body = await request.json() as { id?: string; active?: boolean; templateId?: string | null }
    if (!body.id || (body.active === undefined && body.templateId === undefined)) return NextResponse.json({ error: 'Invalid update' }, { status: 400 })
    const db = adminDb(supabase)
    const { data: config } = await db.from('sheet_configs').select('id,sheet_type').eq('id', body.id).eq('account_id', accountId).maybeSingle()
    if (!config) return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })
    const update: Record<string, unknown> = {}
    if (typeof body.active === 'boolean') update.active = body.active
    if (body.templateId !== undefined) {
      if (config.sheet_type === 'failed' && body.templateId) return NextResponse.json({ error: 'Failed Messages cannot send templates' }, { status: 400 })
      if (body.templateId) {
        const { data: template } = await db.from('message_templates').select('id').eq('id', body.templateId).eq('account_id', accountId).eq('status', 'Approved').maybeSingle()
        if (!template) return NextResponse.json({ error: 'Select an approved template' }, { status: 400 })
      }
      update.template_id = body.templateId || null
    }
    const { error } = await db.from('sheet_configs').update(update).eq('id', body.id).eq('account_id', accountId)
    if (error) throw new Error('Could not update sheet')
    return NextResponse.json({ success: true })
  } catch (error) { return toErrorResponse(error) }
}

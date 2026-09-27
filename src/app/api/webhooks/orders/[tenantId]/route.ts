import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { accessToken, adminDb, appendBulkLog, decryptGoogleSecret } from '@/lib/google/sheets'
import { formatPhoneNumber } from '@/lib/contacts/parse-pasted-numbers'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendTemplateMessage, MetaApiError } from '@/lib/whatsapp/meta-api'
import { extractTemplatePlaceholders } from '@/lib/whatsapp/template-validators'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'
import { appendSendFailure } from '@/lib/google/sync'

export const maxDuration = 60

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params
  const db = adminDb()
  const { data: connection } = await db.from('google_connections').select('order_webhook_secret_encrypted').eq('account_id', tenantId).maybeSingle()
  if (!connection?.order_webhook_secret_encrypted) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const expected = decryptGoogleSecret(connection.order_webhook_secret_encrypted)
  const supplied = request.headers.get('x-store-secret') || ''
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: { order_id?: string; name?: string; phone?: string; details?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const orderId = String(body.order_id || '').trim().slice(0, 200)
  const phone = formatPhoneNumber(String(body.phone || ''))?.replace(/\D/g, '')
  const name = String(body.name || '').trim().slice(0, 200)
  const details = String(body.details || '').trim().slice(0, 1000)
  if (!orderId || !phone || !name) return NextResponse.json({ error: 'order_id, name, and valid phone are required' }, { status: 400 })
  const { data: sheet } = await db.from('sheet_configs').select('id,google_sheet_id,tab_name,template_id').eq('account_id', tenantId).eq('sheet_type', 'bulk').eq('active', true).maybeSingle()
  if (!sheet?.template_id) return NextResponse.json({ error: 'Active Bulk sheet and approved template required' }, { status: 400 })
  const [{ data: template }, { data: wa }] = await Promise.all([
    db.from('message_templates').select('*').eq('id', sheet.template_id).eq('account_id', tenantId).eq('status', 'Approved').maybeSingle(),
    db.from('whatsapp_config').select('phone_number_id,access_token').eq('account_id', tenantId).maybeSingle(),
  ])
  if (!isMessageTemplate(template) || !wa) return NextResponse.json({ error: 'WhatsApp setup or approved template unavailable' }, { status: 400 })
  const paramsForTemplate = extractTemplatePlaceholders(template.body_text).map((key: string, i: number) => key === 'order_id' ? orderId : key === 'name' ? name : key === 'details' ? details : i === 0 ? name : i === 1 ? details : orderId)
  if (paramsForTemplate.some((value: string) => !value)) return NextResponse.json({ error: 'Order does not fill all template variables' }, { status: 400 })
  const { data: claimed, error: claimError } = await db.from('store_order_events').insert({ account_id: tenantId, external_order_id: orderId, phone, customer_name: name, details, template_id: template.id, status: 'pending' }).select('id').single()
  if (claimError || !claimed) return NextResponse.json({ duplicate: true }, { status: 200 })
  let messageId: string
  const sentAt = new Date().toISOString()
  try {
    const sent = await sendTemplateMessage({ phoneNumberId: wa.phone_number_id, accessToken: decrypt(wa.access_token), to: phone, templateName: template.name, language: template.language || 'en_US', template, params: paramsForTemplate })
    messageId = sent.messageId
    await db.from('store_order_events').update({ status: 'sent', whatsapp_message_id: messageId, sent_at: sentAt }).eq('id', claimed.id)
  } catch (error) {
    const code = error instanceof MetaApiError && error.code ? String(error.code) : 'SEND_ERROR'
    const reason = error instanceof MetaApiError ? error.message.slice(0, 500) : 'WhatsApp send failed'
    await db.from('store_order_events').update({ status: 'failed' }).eq('id', claimed.id)
    await appendSendFailure(db, tenantId, { name, phone, template: template.name, code, reason, attemptedAt: sentAt, retryCount: 0 })
    return NextResponse.json({ error: 'WhatsApp send failed', code }, { status: 502 })
  }
  try {
    const token = await accessToken(db, tenantId)
    const row = await appendBulkLog(token, sheet.google_sheet_id, sheet.tab_name, [name, phone, details, template.name, sentAt, '', '', ''])
    await db.from('store_order_events').update({ sheet_row_number: row }).eq('id', claimed.id)
    await db.from('sheet_message_log').insert({ account_id: tenantId, sheet_config_id: sheet.id, row_number: row, phone, name, template_id: template.id, whatsapp_message_id: messageId, status: 'sent', sent_at: sentAt })
  } catch { console.error('[orders] Confirmation sent but sheet append failed') }
  return NextResponse.json({ sent: true, messageId })
}

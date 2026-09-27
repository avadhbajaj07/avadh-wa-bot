import type { SupabaseClient } from '@supabase/supabase-js'
import { accessToken, appendFailure, writeCells, writeRows } from './sheets'
import { formatPhoneNumber } from '@/lib/contacts/parse-pasted-numbers'
import { extractTemplatePlaceholders } from '@/lib/whatsapp/template-validators'
import { sendTemplateMessage, MetaApiError } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { isMessageTemplate } from '@/lib/whatsapp/template-row-guard'

export interface SheetRow { rowNumber: number; values: Record<string, string> }

export async function appendSendFailure(db: SupabaseClient, accountId: string, data: { name: string; phone: string; template: string; code: string; reason: string; attemptedAt: string; retryCount: number }) {
  const { data: sheet } = await db.from('sheet_configs').select('google_sheet_id,tab_name').eq('account_id', accountId).eq('sheet_type', 'failed').eq('active', true).maybeSingle()
  if (!sheet) return
  try {
    const token = await accessToken(db, accountId)
    await appendFailure(token, sheet.google_sheet_id, sheet.tab_name, [data.name, data.phone, data.template, data.code, data.reason, data.attemptedAt, String(data.retryCount)])
  } catch { console.error('[sheets] Failed to append delivery failure') }
}

export async function sendSheetRows(db: SupabaseClient, config: { id: string; account_id: string; google_sheet_id: string; tab_name: string; template_id: string | null; active: boolean; sheet_type: string }, rows: SheetRow[]): Promise<{ sent: number; skipped: number; failed: number }> {
  const result = { sent: 0, skipped: 0, failed: 0 }
  if (!config.active || config.sheet_type === 'failed' || !config.template_id) return { ...result, skipped: rows.length }
  const { data: template } = await db.from('message_templates').select('*').eq('id', config.template_id).eq('account_id', config.account_id).eq('status', 'Approved').maybeSingle()
  const { data: wa } = await db.from('whatsapp_config').select('phone_number_id,access_token').eq('account_id', config.account_id).maybeSingle()
  if (!isMessageTemplate(template) || !wa) throw new Error('Approved template or WhatsApp connection unavailable')
  const approvedTemplate = template
  const waConfig = wa
  const metaToken = decrypt(waConfig.access_token)
  const updates: { row: number; values: Record<string, string> }[] = []
  let next = 0
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++]
      await processRow(row)
    }
  }
  async function processRow(row: SheetRow) {
    const rawPhone = String(row.values.Phone || row.values.phone || '').trim()
    const phone = formatPhoneNumber(rawPhone)?.replace(/\D/g, '')
    if (!Number.isInteger(row.rowNumber) || row.rowNumber < 2 || row.rowNumber > 1_000_000 || !phone) { result.skipped++; return }
    const { data: prior } = await db.from('sheet_message_log').select('id,status,whatsapp_message_id').eq('sheet_config_id', config.id).eq('row_number', row.rowNumber).maybeSingle()
    if (prior) { result.skipped++; return }
    const name = String(row.values.Name || row.values.name || '').slice(0, 200)
    const details = String(row.values.Details || row.values.details || '').slice(0, 1000)
    const placeholders = extractTemplatePlaceholders(approvedTemplate.body_text)
    const params = placeholders.map((key, i) => String(row.values[key] || row.values[key.toLowerCase()] || (i === 0 ? name : i === 1 ? details : '')).trim())
    if (params.some(p => !p)) { result.skipped++; return }
    // Unique row reference prevents duplicate delivery when Apps Script retries.
    const { data: claimed, error: claimError } = await db.from('sheet_message_log').insert({ account_id: config.account_id, sheet_config_id: config.id, row_number: row.rowNumber, phone, name, template_id: approvedTemplate.id, status: 'pending' }).select('id').single()
    if (claimError || !claimed) { result.skipped++; return }
    const attemptedAt = new Date().toISOString()
    try {
      const sent = await sendTemplateMessage({ phoneNumberId: waConfig.phone_number_id, accessToken: metaToken, to: phone, templateName: approvedTemplate.name, language: approvedTemplate.language || 'en_US', template: approvedTemplate, params })
      await db.from('sheet_message_log').update({ whatsapp_message_id: sent.messageId, status: 'sent', sent_at: attemptedAt }).eq('id', claimed.id)
      result.sent++
      updates.push({ row: row.rowNumber, values: { 'Template Sent': approvedTemplate.name, 'Sent At': attemptedAt, 'Last Contacted': attemptedAt } })
    } catch (error) {
      const code = error instanceof MetaApiError && error.code ? String(error.code) : 'SEND_ERROR'
      const reason = error instanceof MetaApiError ? error.message.slice(0, 500) : 'Send or sheet sync failed'
      await db.from('sheet_message_log').update({ status: 'failed', error_code: code, error_reason: reason }).eq('id', claimed.id)
      await appendSendFailure(db, config.account_id, { name, phone, template: approvedTemplate.name, code, reason, attemptedAt, retryCount: 0 })
      result.failed++
    }
  }
  await Promise.all(Array.from({ length: Math.min(8, rows.length) }, () => worker()))
  if (updates.length) {
    try {
      const token = await accessToken(db, config.account_id)
      await writeRows(token, config.google_sheet_id, config.tab_name, updates)
    } catch {
      // Meta accepted these sends; the DB log remains authoritative.
      console.error('[sheets] Sent messages but could not update spreadsheet')
    }
  }
  return result
}

export async function syncInboundReply(db: SupabaseClient, accountId: string, rawPhone: string, text: string, timestamp: string) {
  const phone = formatPhoneNumber(rawPhone)?.replace(/\D/g, '')
  if (!phone) return
  const { data: activeSheets } = await db.from('sheet_configs').select('id').eq('account_id', accountId).eq('active', true)
  if (!activeSheets?.length) return
  const { data: rows } = await db.from('sheet_message_log').select('id,sheet_config_id,row_number').eq('account_id', accountId).eq('phone', phone).in('sheet_config_id', activeSheets.map(sheet => sheet.id)).in('status', ['sent', 'replied']).order('sent_at', { ascending: false }).limit(1)
  const row = rows?.[0]
  if (!row) return
  const { data: sheet } = await db.from('sheet_configs').select('google_sheet_id,tab_name,active').eq('id', row.sheet_config_id).eq('account_id', accountId).maybeSingle()
  if (!sheet?.active) return
  const { error } = await db.from('sheet_message_log').update({ status: 'replied', replied_at: timestamp }).eq('id', row.id)
  if (error) return
  try {
    const token = await accessToken(db, accountId)
    await writeCells(token, sheet.google_sheet_id, sheet.tab_name, row.row_number, { 'Reply Status': 'Replied', 'Reply Text': text.slice(0, 1000), 'Replied At': timestamp })
  } catch { console.error('[sheets] Failed to sync inbound reply') }
}

export async function syncDeliveryFailure(db: SupabaseClient, messageId: string, code: string, reason: string, attemptedAt: string) {
  const { data: row } = await db.from('sheet_message_log').select('id,account_id,sheet_config_id,phone,name,template_id,status').eq('whatsapp_message_id', messageId).maybeSingle()
  if (!row || row.status === 'failed' || row.status === 'replied') return
  const { data: template } = await db.from('message_templates').select('name').eq('id', row.template_id).maybeSingle()
  await db.from('sheet_message_log').update({ status: 'failed', error_code: code, error_reason: reason }).eq('id', row.id)
  await appendSendFailure(db, row.account_id, { name: row.name || '', phone: row.phone, template: template?.name || '', code, reason: reason.slice(0, 500), attemptedAt, retryCount: 0 })
}

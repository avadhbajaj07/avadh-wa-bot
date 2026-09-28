import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { decrypt } from '@/lib/whatsapp/encryption'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import type { TemplateButton, TemplateSampleValues } from '@/types'

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

interface MetaButton {
  type: string
  text: string
  url?: string
  phone_number?: string
  example?: string[] | string
}

interface MetaTemplateComponent {
  type: string
  text?: string
  format?: string
  buttons?: MetaButton[]
  example?: {
    header_text?: string[]
    header_handle?: string[]
    body_text?: string[][]
  }
}

interface MetaTemplate {
  id: string
  name: string
  language: string
  status: string
  category: string
  components?: MetaTemplateComponent[]
  quality_score?: { score?: string } | string
}

function normalizeCategory(meta: string): 'Marketing' | 'Utility' | 'Authentication' {
  const upper = meta.toUpperCase()
  if (upper === 'UTILITY') return 'Utility'
  if (upper === 'AUTHENTICATION') return 'Authentication'
  return 'Marketing'
}

function parseButtons(metaButtons: MetaButton[] | undefined): TemplateButton[] {
  if (!metaButtons?.length) return []
  const out: TemplateButton[] = []
  for (const b of metaButtons) {
    switch (b.type?.toUpperCase()) {
      case 'QUICK_REPLY':
        out.push({ type: 'QUICK_REPLY', text: b.text })
        break
      case 'URL':
        out.push({
          type: 'URL',
          text: b.text,
          url: b.url ?? '',
          example: Array.isArray(b.example) ? b.example[0] : b.example,
        })
        break
      case 'PHONE_NUMBER':
        out.push({
          type: 'PHONE_NUMBER',
          text: b.text,
          phone_number: b.phone_number ?? '',
        })
        break
      case 'COPY_CODE':
        out.push({
          type: 'COPY_CODE',
          text: b.text,
          example: Array.isArray(b.example) ? b.example[0] ?? '' : b.example ?? '',
        })
        break
    }
  }
  return out
}

function extractSampleValues(
  body: MetaTemplateComponent | undefined,
  header: MetaTemplateComponent | undefined
): TemplateSampleValues | null {
  const bodySample = body?.example?.body_text?.[0]
  const headerSample = header?.example?.header_text
  if (!bodySample?.length && !headerSample?.length) return null
  const sv: TemplateSampleValues = {}
  if (bodySample?.length) sv.body = bodySample
  if (headerSample?.length) sv.header = headerSample
  return sv
}

export async function GET() {
  return handleTemplatesSync()
}

export async function POST() {
  return handleTemplatesSync()
}

async function handleTemplatesSync() {
  const admin = supabaseAdmin()

  try {
    const { data: configs, error: configError } = await admin
      .from('whatsapp_config')
      .select('account_id, user_id, waba_id, access_token')
      .not('waba_id', 'is', null)
      .not('access_token', 'is', null)

    if (configError || !configs || configs.length === 0) {
      return NextResponse.json({ success: true, processedAccounts: 0, message: 'No active WhatsApp configs' })
    }

    let totalSynced = 0

    for (const config of configs) {
      try {
        const accessToken = decrypt(config.access_token)
        const metaRes = await fetch(
          `${META_API_BASE}/${config.waba_id}/message_templates?limit=100&fields=id,name,language,status,category,components,quality_score`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        )

        if (!metaRes.ok) continue

        const metaBody = (await metaRes.json()) as { data?: MetaTemplate[] }
        const templates = metaBody.data || []

        for (const t of templates) {
          const body = (t.components ?? []).find((c) => c.type === 'BODY')
          const header = (t.components ?? []).find((c) => c.type === 'HEADER')
          const footer = (t.components ?? []).find((c) => c.type === 'FOOTER')
          const buttons = (t.components ?? []).find((c) => c.type === 'BUTTONS')

          const parsedButtons = parseButtons(buttons?.buttons)
          const sampleValues = extractSampleValues(body, header)

          const headerFormat = header?.format?.toUpperCase()
          const headerType =
            headerFormat === 'TEXT' ||
            headerFormat === 'IMAGE' ||
            headerFormat === 'VIDEO' ||
            headerFormat === 'DOCUMENT'
              ? headerFormat.toLowerCase()
              : null

          const row = {
            account_id: config.account_id,
            user_id: config.user_id,
            name: t.name,
            category: normalizeCategory(t.category),
            language: t.language,
            header_type: headerType,
            header_content: header?.text ?? null,
            header_handle: header?.example?.header_handle?.[0] ?? null,
            body_text: body?.text ?? '',
            footer_text: footer?.text ?? null,
            buttons: parsedButtons.length ? parsedButtons : null,
            sample_values: sampleValues,
            status: normalizeStatus(t.status),
            meta_template_id: t.id,
            updated_at: new Date().toISOString(),
          }

          try {
            await admin
              .from('message_templates')
              .upsert(row, { onConflict: 'account_id,name,language' })
          } catch {
            // Ignore individual row upsert failures and continue
          }

          totalSynced++
        }
      } catch (err) {
        console.error(`[Templates Cron] Failed for account ${config.account_id}:`, err)
      }
    }

    return NextResponse.json({
      success: true,
      processedAccounts: configs.length,
      syncedTemplates: totalSynced,
    })
  } catch (error) {
    console.error('[Templates Cron] Fatal error:', error)
    return NextResponse.json({ error: 'Cron execution failed' }, { status: 500 })
  }
}

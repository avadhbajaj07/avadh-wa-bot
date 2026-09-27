'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FileSpreadsheet,
  Key,
  Loader2,
  Plus,
  RefreshCw,
  Webhook,
} from 'lucide-react'

import { SettingsPanelHead } from './settings-panel-head'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

export type Sheet = {
  id: string
  sheet_type: string
  google_sheet_id: string
  tab_name: string
  template_id: string | null
  active: boolean
}

export type Template = {
  id: string
  name: string
  language: string
  status: string
}

export type SheetState = {
  connected: boolean
  sheets: Sheet[]
  templates: Template[]
}

declare global {
  interface Window {
    gapi?: { load: (name: string, callback: () => void) => void }
    google?: {
      picker: {
        PickerBuilder: new () => {
          addView: (view: unknown) => unknown
          setOAuthToken: (token: string) => unknown
          setDeveloperKey: (key: string) => unknown
          setAppId: (id: string) => unknown
          setCallback: (
            callback: (data: { action: string; docs?: { id: string }[] }) => void
          ) => unknown
          build: () => { setVisible: (visible: boolean) => void }
        }
        DocsView: new (type: string) => { setMimeTypes: (type: string) => unknown }
        ViewId: { DOCS: string }
      }
    }
  }
}

function loadPicker(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.picker) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://apis.google.com/js/api.js'
    script.onload = () => window.gapi?.load('picker', resolve)
    script.onerror = () => reject(new Error('Google Picker could not load'))
    document.head.appendChild(script)
  })
}

export function GoogleSheetsSettings() {
  const [state, setState] = useState<SheetState | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [scriptModal, setScriptModal] = useState<{ title: string; code: string } | null>(null)
  const [copiedScript, setCopiedScript] = useState(false)
  const [orderWebhook, setOrderWebhook] = useState<{ url: string; secret: string } | null>(null)
  const [loadingWebhook, setLoadingWebhook] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/google/sheets', { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load Google Sheets settings')
      const data = await response.json()
      setState(data)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load Google Sheets settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function updateSheet(
    sheet: Sheet,
    patch: { active?: boolean; templateId?: string | null }
  ) {
    setBusy(true)
    try {
      const response = await fetch('/api/google/sheets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sheet.id, ...patch }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Could not update sheet')
      await refresh()
      toast.success('Sheet settings saved')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update sheet')
    } finally {
      setBusy(false)
    }
  }

  async function showScript(sheet: Sheet) {
    try {
      const response = await fetch(`/api/google/sheets/${sheet.id}/script`, {
        cache: 'no-store',
      })
      if (!response.ok) throw new Error('Could not generate script')
      const code = await response.text()
      setScriptModal({ title: sheet.tab_name, code })
      setCopiedScript(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not generate Apps Script')
    }
  }

  async function pickExisting() {
    setBusy(true)
    try {
      const response = await fetch('/api/google/picker-token', { cache: 'no-store' })
      const credentials = (await response.json()) as {
        token: string
        apiKey: string
        appId: string
        error?: string
      }
      if (!response.ok) throw new Error(credentials.error || 'Could not open Google Picker')
      if (!credentials.apiKey || !credentials.appId) {
        throw new Error(
          'Google Picker API key and project number are not configured (NEXT_PUBLIC_GOOGLE_PICKER_API_KEY, NEXT_PUBLIC_GOOGLE_PROJECT_NUMBER)'
        )
      }
      await loadPicker()
      const picker = window.google!.picker
      const view = new picker.DocsView(picker.ViewId.DOCS)
      view.setMimeTypes('application/vnd.google-apps.spreadsheet')
      const builder = new picker.PickerBuilder()
      builder.addView(view)
      builder.setOAuthToken(credentials.token)
      builder.setDeveloperKey(credentials.apiKey)
      builder.setAppId(credentials.appId)
      builder.setCallback(async (data) => {
        if (data.action !== 'picked' || !data.docs?.[0]?.id) return
        try {
          const save = await fetch('/api/google/sheets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ googleSheetId: data.docs[0].id }),
          })
          const result = await save.json()
          if (!save.ok) throw new Error(result.error || 'Could not connect sheet')
          await refresh()
          toast.success('Existing sheet connected')
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not connect sheet')
        }
      })
      builder.build().setVisible(true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open Google Picker')
    } finally {
      setBusy(false)
    }
  }

  async function loadOrderWebhook() {
    setLoadingWebhook(true)
    try {
      const res = await fetch('/api/google/order-webhook', { cache: 'no-store' })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}))
        throw new Error(payload.error || 'Could not load order webhook')
      }
      setOrderWebhook(await res.json())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load order webhook')
    } finally {
      setLoadingWebhook(false)
    }
  }

  function copyToClipboard(text: string, fieldName: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(fieldName)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopiedField(null), 2000)
    })
  }

  const sheetTypeLabel: Record<string, string> = {
    leads: 'Leads',
    bulk: 'Bulk Campaign',
    failed: 'Delivery Failures',
    custom: 'Custom Sheet',
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <SettingsPanelHead
        title="Google Sheets & Drive Automation"
        description="Connect Google once to automatically provision spreadsheets in Google Drive, trigger WhatsApp messages from sheet rows or store orders, and sync customer replies and failures."
        action={
          state?.connected ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={pickExisting}
                disabled={busy}
              >
                <Plus className="mr-1.5 h-4 w-4" />
                Connect existing sheet
              </Button>
              <a
                href="/api/google/connect"
                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reconnect Google
              </a>
            </div>
          ) : (
            <a
              href="/api/google/connect"
              className={buttonVariants({ size: 'sm' })}
            >
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />
              Connect Google
            </a>
          )
        }
      />

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!state?.connected ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Connect Google Sheets & Drive</CardTitle>
            <CardDescription>
              Authorize your Google account to automatically create a dedicated client folder
              with three purpose-built spreadsheets:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <li className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <strong className="block text-foreground">Leads Sheet</strong>
                  Capture contact info, source, and last contact history.
                </div>
              </li>
              <li className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <strong className="block text-foreground">Bulk WhatsApp Campaign</strong>
                  Paste CSV numbers to automatically send approved WhatsApp templates.
                </div>
              </li>
              <li className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <strong className="block text-foreground">Failed Messages</strong>
                  Real-time logging of undelivered messages with Meta error codes.
                </div>
              </li>
            </ul>
            <div className="pt-2">
              <a
                href="/api/google/connect"
                className={buttonVariants()}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Connect Google Workspace / Gmail
              </a>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Google connected & synchronized</span>
            </div>
            <Badge variant="outline" className="border-green-600/30 text-green-700 dark:text-green-400">
              {state.sheets.length} spreadsheets managed
            </Badge>
          </div>

          <div className="grid gap-4">
            {state.sheets.map((sheet) => (
              <Card key={sheet.id} className="transition-all hover:border-border/80">
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{sheet.tab_name}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {sheetTypeLabel[sheet.sheet_type] || sheet.sheet_type}
                      </Badge>
                    </div>
                    <a
                      href={`https://docs.google.com/spreadsheets/d/${sheet.google_sheet_id}/edit`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <span>Open spreadsheet in Google Sheets</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <CardAction>
                    <div className="flex items-center gap-2">
                      <Label
                        htmlFor={`active-${sheet.id}`}
                        className="cursor-pointer text-xs text-muted-foreground"
                      >
                        {sheet.active ? 'Active' : 'Paused'}
                      </Label>
                      <Switch
                        id={`active-${sheet.id}`}
                        checked={sheet.active}
                        disabled={busy}
                        onCheckedChange={(checked) =>
                          updateSheet(sheet, { active: checked })
                        }
                      />
                    </div>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  {sheet.sheet_type !== 'failed' ? (
                    <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs font-medium text-foreground">
                          Approved WhatsApp Template
                        </Label>
                        <select
                          className="w-full max-w-sm rounded-md border border-input bg-background px-3 py-1.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          value={sheet.template_id || ''}
                          disabled={busy}
                          onChange={(e) =>
                            updateSheet(sheet, {
                              templateId: e.target.value || null,
                            })
                          }
                        >
                          <option value="">No template selected</option>
                          {state.templates.map((tmpl) => (
                            <option key={tmpl.id} value={tmpl.id}>
                              {tmpl.name} ({tmpl.language})
                            </option>
                          ))}
                        </select>
                        {!sheet.template_id && (
                          <p className="text-xs text-amber-600 dark:text-amber-400">
                            Select an approved WhatsApp template to trigger sends on new rows.
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 pt-2 sm:pt-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => showScript(sheet)}
                        >
                          <Code2 className="mr-1.5 h-3.5 w-3.5" />
                          Get Apps Script setup
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      This spreadsheet automatically logs undelivered messages with Meta error code and reason. No template mapping is needed.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Feature 2d: Store Order Webhook */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-primary" />
                <CardTitle className="text-base">Store Order Webhook (E-commerce Automation)</CardTitle>
              </div>
              <CardDescription>
                Configure your store (Shopify, WooCommerce, custom) to POST order details.
                An immediate WhatsApp confirmation is sent to the customer using the active Bulk Campaign template,
                and the record is appended to the spreadsheet afterward.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!orderWebhook ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingWebhook}
                  onClick={loadOrderWebhook}
                >
                  {loadingWebhook ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Key className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Show endpoint and secret
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4 text-sm">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Webhook POST URL</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={orderWebhook.url}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs"
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => copyToClipboard(orderWebhook.url, 'url')}
                      >
                        {copiedField === 'url' ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">HTTP Header</Label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={`x-store-secret: ${orderWebhook.secret}`}
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs"
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => copyToClipboard(orderWebhook.secret, 'secret')}
                      >
                        {copiedField === 'secret' ? (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Example JSON Request Body</Label>
                    <pre className="overflow-x-auto rounded-md border border-input bg-background p-3 font-mono text-xs">
                      {JSON.stringify(
                        {
                          order_id: 'ORDER-1001',
                          name: 'Customer Name',
                          phone: '+919876543210',
                          details: 'Item details / Order summary',
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keep your store secret secure. Duplicate order IDs are automatically deduplicated.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Apps Script Setup Dialog */}
      <Dialog
        open={!!scriptModal}
        onOpenChange={(open) => {
          if (!open) setScriptModal(null)
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Google Apps Script Setup — {scriptModal?.title}</DialogTitle>
            <DialogDescription>
              Install this bound script in your Google Spreadsheet to enable instant sends on new rows or form submissions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <ol className="list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
              <li>Open your spreadsheet and select <strong>Extensions → Apps Script</strong>.</li>
              <li>Replace all code in the script editor with the code below and save.</li>
              <li>Click <strong>Run → setupSheetAutomation</strong> once and approve Google permissions.</li>
              <li>
                Done! Edits and Google Form submissions will send in batches of up to 200 rows within seconds.
              </li>
            </ol>
            <div className="relative">
              <textarea
                readOnly
                value={scriptModal?.code || ''}
                rows={12}
                className="w-full rounded-md border border-input bg-muted/40 p-3 font-mono text-xs leading-relaxed"
                aria-label="Google Apps Script Code"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Contains a secure, encrypted webhook key for this sheet.
              </span>
              <Button
                size="sm"
                onClick={() => {
                  if (scriptModal?.code) {
                    navigator.clipboard.writeText(scriptModal.code).then(() => {
                      setCopiedScript(true)
                      toast.success('Script copied to clipboard')
                      setTimeout(() => setCopiedScript(false), 2000)
                    })
                  }
                }}
              >
                {copiedScript ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy Apps Script
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { adminDb, decryptGoogleSecret } from '@/lib/google/sheets'

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { accountId, supabase } = await requireRole('admin')
    const { id } = await params
    const { data: sheet } = await adminDb(supabase).from('sheet_configs').select('id,tab_name,sheet_type,webhook_secret_encrypted').eq('id', id).eq('account_id', accountId).maybeSingle()
    if (!sheet || sheet.sheet_type === 'failed') return NextResponse.json({ error: 'Sheet not found' }, { status: 404 })
    const endpoint = `${new URL(request.url).origin}/api/webhooks/sheets/${accountId}/${sheet.id}`
    const secret = decryptGoogleSecret(sheet.webhook_secret_encrypted)
    const script = `// Paste into Extensions > Apps Script for this spreadsheet, then run setupSheetAutomation once.
// Only trusted spreadsheet editors should have access to this bound script.
const ENDPOINT = ${JSON.stringify(endpoint)};
const SECRET = ${JSON.stringify(secret)};
const TAB = ${JSON.stringify(sheet.tab_name)};

function setupSheetAutomation() {
  const ss = SpreadsheetApp.getActive();
  for (const t of ScriptApp.getProjectTriggers()) {
    if (['sendEditedRows', 'sendSubmittedRow'].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t);
  }
  ScriptApp.newTrigger('sendEditedRows').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('sendSubmittedRow').forSpreadsheet(ss).onFormSubmit().create();
}

function sendEditedRows(e) { if (e && e.range) sendRows_(e.range); }
function sendSubmittedRow(e) { if (e && e.range) sendRows_(e.range); }

function sendRows_(range) {
  const sheet = range.getSheet();
  if (sheet.getName() !== TAB || range.getLastRow() < 2) return;
  const start = Math.max(2, range.getRow());
  const end = range.getLastRow();
  const width = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, width).getDisplayValues()[0];
  for (let first = start; first <= end; first += 200) {
    const count = Math.min(200, end - first + 1);
    const values = sheet.getRange(first, 1, count, width).getDisplayValues();
    const rows = values.map((cells, i) => ({
      rowNumber: first + i,
      values: Object.fromEntries(headers.map((header, j) => [header, cells[j]]))
    })).filter(row => row.values.Phone);
    if (!rows.length) continue;
    const response = UrlFetchApp.fetch(ENDPOINT, {
      method: 'post', contentType: 'application/json',
      headers: { 'x-sheet-secret': SECRET },
      payload: JSON.stringify({ rows }), muteHttpExceptions: true
    });
    if (response.getResponseCode() >= 300) throw new Error('Sheet automation request failed: ' + response.getResponseCode());
  }
}
`
    return new Response(script, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  } catch (error) { return toErrorResponse(error) }
}

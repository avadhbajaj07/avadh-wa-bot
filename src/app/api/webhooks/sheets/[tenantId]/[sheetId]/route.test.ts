import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sendSheetRows: vi.fn(),
}))

vi.mock('@/lib/google/sheets', () => ({
  adminDb: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: {
          id: 'sheet-1', account_id: 'tenant-1', google_sheet_id: 'google-1',
          tab_name: 'Bulk', template_id: 'template-1', active: true,
          sheet_type: 'bulk', webhook_secret_encrypted: 'ciphertext',
        } }) }) }),
      }),
    }),
  }),
  decryptGoogleSecret: () => 'a'.repeat(64),
}))
vi.mock('@/lib/google/sync', () => ({ sendSheetRows: mocks.sendSheetRows }))

import { POST } from './route'

function send(secret: string, rows: unknown) {
  return POST(new Request('https://example.com/api/webhooks/sheets/tenant-1/sheet-1', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-sheet-secret': secret },
    body: JSON.stringify({ rows }),
  }), { params: Promise.resolve({ tenantId: 'tenant-1', sheetId: 'sheet-1' }) })
}

describe('sheet row webhook', () => {
  it('rejects requests without the sheet secret before sending', async () => {
    mocks.sendSheetRows.mockClear()
    const response = await send('wrong', [{ rowNumber: 2, values: { Phone: '+919876543210' } }])
    expect(response.status).toBe(401)
    expect(mocks.sendSheetRows).not.toHaveBeenCalled()
  })

  it('processes a batch of rows in one authenticated call', async () => {
    mocks.sendSheetRows.mockClear()
    mocks.sendSheetRows.mockResolvedValueOnce({ sent: 1, skipped: 0, failed: 0 })
    const rows = Array.from({ length: 200 }, (_, i) => ({ rowNumber: i + 2, values: { Phone: '+919876543210' } }))
    const response = await send('a'.repeat(64), rows)
    expect(response.status).toBe(200)
    expect(mocks.sendSheetRows).toHaveBeenCalledTimes(1)
    const firstCall = mocks.sendSheetRows.mock.calls[0] as unknown as [unknown, unknown, unknown[]]
    expect(firstCall?.[2]).toHaveLength(200)
  })

  it('rejects a batch over the limit', async () => {
    mocks.sendSheetRows.mockClear()
    const rows = Array.from({ length: 201 }, (_, i) => ({ rowNumber: i + 2, values: {} }))
    const response = await send('a'.repeat(64), rows)
    expect(response.status).toBe(400)
    expect(mocks.sendSheetRows).not.toHaveBeenCalled()
  })
})

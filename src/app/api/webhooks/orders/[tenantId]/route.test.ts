import { describe, expect, it, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  db: null as unknown,
  sendTemplateMessage: vi.fn(),
  appendBulkLog: vi.fn(async () => 15),
  appendSendFailure: vi.fn(async () => {}),
  accessToken: vi.fn(async () => 'mock-google-token'),
  decryptGoogleSecret: vi.fn(() => 'test-secret-1234567890'),
  decrypt: vi.fn(() => 'meta-token'),
}))

vi.mock('@/lib/google/sheets', () => ({
  adminDb: () => mocks.db,
  decryptGoogleSecret: mocks.decryptGoogleSecret,
  accessToken: mocks.accessToken,
  appendBulkLog: mocks.appendBulkLog,
}))

vi.mock('@/lib/google/sync', () => ({
  appendSendFailure: mocks.appendSendFailure,
}))

vi.mock('@/lib/whatsapp/meta-api', () => ({
  sendTemplateMessage: mocks.sendTemplateMessage,
  MetaApiError: class MetaApiError extends Error {
    code = 131026
    constructor(msg: string) {
      super(msg)
    }
  },
}))

vi.mock('@/lib/whatsapp/encryption', () => ({
  decrypt: mocks.decrypt,
}))

import { POST } from './route'

function setMockDb(db: unknown) {
  mocks.db = db
}

function createOrderRequest(secret: string | null, body: unknown) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret !== null) headers['x-store-secret'] = secret
  return new Request('https://example.com/api/webhooks/orders/tenant-1', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('E-commerce store order webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests with invalid secret', async () => {
    setMockDb({
      from: vi.fn((table: string) => {
        if (table === 'google_connections') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { order_webhook_secret_encrypted: 'enc-secret' },
                }),
              }),
            }),
          }
        }
        return {}
      }),
    })

    const res = await POST(
      createOrderRequest('wrong-secret', {
        order_id: 'ord-1',
        name: 'John',
        phone: '+919876543210',
      }),
      { params: Promise.resolve({ tenantId: 'tenant-1' }) }
    )

    expect(res.status).toBe(401)
    expect(mocks.sendTemplateMessage).not.toHaveBeenCalled()
  })

  it('validates required order parameters', async () => {
    setMockDb({
      from: vi.fn((table: string) => {
        if (table === 'google_connections') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { order_webhook_secret_encrypted: 'enc-secret' },
                }),
              }),
            }),
          }
        }
        return {}
      }),
    })

    const res = await POST(
      createOrderRequest('test-secret-1234567890', {
        order_id: 'ord-1',
        name: '',
        phone: 'invalid',
      }),
      { params: Promise.resolve({ tenantId: 'tenant-1' }) }
    )

    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: string }
    expect(data.error).toContain('order_id, name, and valid phone are required')
  })

  it('detects duplicate orders and prevents duplicate sends', async () => {
    setMockDb({
      from: vi.fn((table: string) => {
        if (table === 'google_connections') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { order_webhook_secret_encrypted: 'enc-secret' },
                }),
              }),
            }),
          }
        }
        if (table === 'sheet_configs') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: 'sheet-cfg-1',
                        google_sheet_id: 'gs-1',
                        tab_name: 'Bulk',
                        template_id: 'tmpl-1',
                      },
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'message_templates') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: 'tmpl-1',
                        user_id: 'user-1',
                        name: 'order_conf',
                        body_text: 'Thank you {{1}} for your order {{2}}!',
                        status: 'Approved',
                      },
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'whatsapp_config') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { phone_number_id: 'p1', access_token: 'enc' },
                }),
              }),
            }),
          }
        }
        if (table === 'store_order_events') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: null,
                  error: { code: '23505', message: 'duplicate key' },
                }),
              }),
            }),
          }
        }
        return {}
      }),
    })

    const res = await POST(
      createOrderRequest('test-secret-1234567890', {
        order_id: 'ord-duplicate-123',
        name: 'Bob',
        phone: '+919876543210',
        details: 'Order #ord-duplicate-123',
      }),
      { params: Promise.resolve({ tenantId: 'tenant-1' }) }
    )

    expect(res.status).toBe(200)
    const json = (await res.json()) as { duplicate?: boolean }
    expect(json.duplicate).toBe(true)
    expect(mocks.sendTemplateMessage).not.toHaveBeenCalled()
  })

  it('sends template confirmation and logs to Bulk sheet and message log', async () => {
    mocks.sendTemplateMessage.mockResolvedValueOnce({ messageId: 'wamid.order.456' })
    const storeEventsUpdates: Record<string, unknown>[] = []
    const sheetMessageLogInserts: Record<string, unknown>[] = []

    setMockDb({
      from: vi.fn((table: string) => {
        if (table === 'google_connections') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { order_webhook_secret_encrypted: 'enc-secret' },
                }),
              }),
            }),
          }
        }
        if (table === 'sheet_configs') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: 'sheet-cfg-1',
                        google_sheet_id: 'gs-1',
                        tab_name: 'Bulk',
                        template_id: 'tmpl-1',
                      },
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'message_templates') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: 'tmpl-1',
                        user_id: 'user-1',
                        name: 'order_conf',
                        body_text: 'Thank you {{1}} for your order of {{2}}!',
                        status: 'Approved',
                      },
                    }),
                  }),
                }),
              }),
            }),
          }
        }
        if (table === 'whatsapp_config') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { phone_number_id: 'phone-1', access_token: 'enc' },
                }),
              }),
            }),
          }
        }
        if (table === 'store_order_events') {
          return {
            insert: () => ({
              select: () => ({
                single: async () => ({
                  data: { id: 'order-event-1' },
                  error: null,
                }),
              }),
            }),
            update: (record: Record<string, unknown>) => {
              storeEventsUpdates.push(record)
              return {
                eq: () => Promise.resolve({ error: null }),
              }
            },
          }
        }
        if (table === 'sheet_message_log') {
          return {
            insert: (record: Record<string, unknown>) => {
              sheetMessageLogInserts.push(record)
              return Promise.resolve({ error: null })
            },
          }
        }
        return {}
      }),
    })

    const res = await POST(
      createOrderRequest('test-secret-1234567890', {
        order_id: 'ord-success-999',
        name: 'Charlie',
        phone: '+919876543210',
        details: '1x Yoga Mat',
      }),
      { params: Promise.resolve({ tenantId: 'tenant-1' }) }
    )

    expect(res.status).toBe(200)
    const json = (await res.json()) as { sent?: boolean; messageId?: string }
    expect(json.sent).toBe(true)
    expect(json.messageId).toBe('wamid.order.456')

    expect(mocks.sendTemplateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        to: '919876543210',
        templateName: 'order_conf',
        params: ['Charlie', '1x Yoga Mat'],
      })
    )

    expect(mocks.appendBulkLog).toHaveBeenCalledWith(
      'mock-google-token',
      'gs-1',
      'Bulk',
      expect.arrayContaining(['Charlie', '919876543210', '1x Yoga Mat', 'order_conf'])
    )

    expect(sheetMessageLogInserts[0]).toMatchObject({
      account_id: 'tenant-1',
      sheet_config_id: 'sheet-cfg-1',
      row_number: 15,
      phone: '919876543210',
      name: 'Charlie',
      whatsapp_message_id: 'wamid.order.456',
      status: 'sent',
    })
  })
})

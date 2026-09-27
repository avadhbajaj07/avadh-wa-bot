import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

const mocks = vi.hoisted(() => ({
  sendTemplateMessage: vi.fn(),
  writeRows: vi.fn(),
  writeCells: vi.fn(),
  appendFailure: vi.fn(),
  accessToken: vi.fn(async () => 'mock-google-token'),
  decrypt: vi.fn(() => 'mock-decrypted-token'),
}))

vi.mock('./sheets', () => ({
  accessToken: mocks.accessToken,
  writeRows: mocks.writeRows,
  writeCells: mocks.writeCells,
  appendFailure: mocks.appendFailure,
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

import { sendSheetRows, syncInboundReply, syncDeliveryFailure } from './sync'

describe('sync.ts automation engine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('sendSheetRows', () => {
    it('skips rows if config is inactive or has no template', async () => {
      const db = {} as unknown as SupabaseClient
      const result = await sendSheetRows(
        db,
        {
          id: 'cfg-1',
          account_id: 'acc-1',
          google_sheet_id: 'sheet-1',
          tab_name: 'Bulk',
          template_id: null,
          active: false,
          sheet_type: 'bulk',
        },
        [{ rowNumber: 2, values: { Phone: '+919876543210' } }]
      )
      expect(result).toEqual({ sent: 0, skipped: 1, failed: 0 })
      expect(mocks.sendTemplateMessage).not.toHaveBeenCalled()
    })

    it('skips rows with invalid phone numbers or header rowNumber < 2', async () => {
      const mockDb = {
        from: vi.fn((table: string) => {
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
                          name: 'welcome_template',
                          body_text: 'Hello {{1}}',
                          status: 'Approved',
                          language: 'en_US',
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
                    data: {
                      phone_number_id: 'phone-id-1',
                      access_token: 'enc-token',
                    },
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient

      const result = await sendSheetRows(
        mockDb,
        {
          id: 'cfg-1',
          account_id: 'acc-1',
          google_sheet_id: 'sheet-1',
          tab_name: 'Bulk',
          template_id: 'tmpl-1',
          active: true,
          sheet_type: 'bulk',
        },
        [
          { rowNumber: 1, values: { Phone: '+919876543210' } },
          { rowNumber: 2, values: { Phone: 'invalid' } },
        ]
      )

      expect(result.skipped).toBe(2)
      expect(mocks.sendTemplateMessage).not.toHaveBeenCalled()
    })

    it('processes valid rows, sends template, logs sent status, and updates spreadsheet', async () => {
      mocks.sendTemplateMessage.mockResolvedValueOnce({ messageId: 'wamid.123' })
      const updates: Record<string, unknown>[] = []
      const inserts: Record<string, unknown>[] = []

      const mockDb = {
        from: vi.fn((table: string) => {
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
                          name: 'lead_welcome',
                          body_text: 'Hello {{1}}, details: {{2}}',
                          status: 'Approved',
                          language: 'en_US',
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
                    data: {
                      phone_number_id: 'phone-id-1',
                      access_token: 'enc-token',
                    },
                  }),
                }),
              }),
            }
          }
          if (table === 'sheet_message_log') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: async () => ({ data: null }),
                  }),
                }),
              }),
              insert: (record: Record<string, unknown>) => {
                inserts.push(record)
                return {
                  select: () => ({
                    single: async () => ({ data: { id: 'log-1' }, error: null }),
                  }),
                }
              },
              update: (record: Record<string, unknown>) => {
                updates.push(record)
                return {
                  eq: () => Promise.resolve({ error: null }),
                }
              },
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient

      const result = await sendSheetRows(
        mockDb,
        {
          id: 'cfg-1',
          account_id: 'acc-1',
          google_sheet_id: 'sheet-1',
          tab_name: 'Bulk',
          template_id: 'tmpl-1',
          active: true,
          sheet_type: 'bulk',
        },
        [
          {
            rowNumber: 2,
            values: {
              Name: 'Alice',
              Phone: '+919876543210',
              Details: 'VIP member',
            },
          },
        ]
      )

      expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 })
      expect(inserts[0]).toMatchObject({
        account_id: 'acc-1',
        sheet_config_id: 'cfg-1',
        row_number: 2,
        phone: '919876543210',
        name: 'Alice',
        status: 'pending',
      })
      expect(mocks.sendTemplateMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          to: '919876543210',
          templateName: 'lead_welcome',
          params: ['Alice', 'VIP member'],
        })
      )
      expect(updates[0]).toMatchObject({
        whatsapp_message_id: 'wamid.123',
        status: 'sent',
      })
      expect(mocks.writeRows).toHaveBeenCalledTimes(1)
      expect(mocks.writeRows).toHaveBeenCalledWith(
        'mock-google-token',
        'sheet-1',
        'Bulk',
        expect.arrayContaining([
          expect.objectContaining({
            row: 2,
            values: expect.objectContaining({
              'Template Sent': 'lead_welcome',
            }),
          }),
        ])
      )
    })
  })

  describe('syncInboundReply', () => {
    it('matches sender phone across active sheets and updates reply cells', async () => {
      const dbUpdates: Record<string, unknown>[] = []
      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'sheet_configs') {
            return {
              select: () => ({
                eq: () => ({
                  eq: (col: string) => {
                    if (col === 'active') {
                      return Promise.resolve({
                        data: [{ id: 'cfg-1' }],
                      })
                    }
                    return {
                      maybeSingle: async () => ({
                        data: {
                          google_sheet_id: 'sheet-1',
                          tab_name: 'Bulk',
                          active: true,
                        },
                      }),
                    }
                  },
                }),
              }),
            }
          }
          if (table === 'sheet_message_log') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    in: () => ({
                      in: () => ({
                        order: () => ({
                          limit: () =>
                            Promise.resolve({
                              data: [
                                {
                                  id: 'log-1',
                                  sheet_config_id: 'cfg-1',
                                  row_number: 5,
                                },
                              ],
                            }),
                        }),
                      }),
                    }),
                  }),
                }),
              }),
              update: (record: Record<string, unknown>) => {
                dbUpdates.push(record)
                return {
                  eq: () => Promise.resolve({ error: null }),
                }
              },
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient

      await syncInboundReply(
        mockDb,
        'acc-1',
        '+919876543210',
        'Yes I am interested!',
        '2026-09-27T12:00:00Z'
      )

      expect(dbUpdates[0]).toMatchObject({
        status: 'replied',
        replied_at: '2026-09-27T12:00:00Z',
      })
      expect(mocks.writeCells).toHaveBeenCalledWith(
        'mock-google-token',
        'sheet-1',
        'Bulk',
        5,
        expect.objectContaining({
          'Reply Status': 'Replied',
          'Reply Text': 'Yes I am interested!',
          'Replied At': '2026-09-27T12:00:00Z',
        })
      )
    })
  })

  describe('syncDeliveryFailure', () => {
    it('appends to Failed Messages sheet on status webhook failure', async () => {
      const dbUpdates: Record<string, unknown>[] = []
      const mockDb = {
        from: vi.fn((table: string) => {
          if (table === 'sheet_message_log') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: 'log-1',
                      account_id: 'acc-1',
                      sheet_config_id: 'cfg-1',
                      phone: '919876543210',
                      name: 'Bob',
                      template_id: 'tmpl-1',
                      status: 'sent',
                    },
                  }),
                }),
              }),
              update: (record: Record<string, unknown>) => {
                dbUpdates.push(record)
                return {
                  eq: () => Promise.resolve({ error: null }),
                }
              },
            }
          }
          if (table === 'message_templates') {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { name: 'promo_template' },
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
                          google_sheet_id: 'failed-sheet-1',
                          tab_name: 'Failed Messages',
                        },
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient

      await syncDeliveryFailure(
        mockDb,
        'wamid.fail123',
        '131026',
        'Message undeliverable',
        '2026-09-27T12:05:00Z'
      )

      expect(dbUpdates[0]).toMatchObject({
        status: 'failed',
        error_code: '131026',
        error_reason: 'Message undeliverable',
      })
      expect(mocks.appendFailure).toHaveBeenCalledWith(
        'mock-google-token',
        'failed-sheet-1',
        'Failed Messages',
        [
          'Bob',
          '919876543210',
          'promo_template',
          '131026',
          'Message undeliverable',
          '2026-09-27T12:05:00Z',
          '0',
        ]
      )
    })
  })
})

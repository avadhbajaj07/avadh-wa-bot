import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/auth/account', () => ({
  requireRole: vi.fn(),
  toErrorResponse: vi.fn((err) =>
    new Response(JSON.stringify({ error: err.message }), { status: 500 })
  ),
}))

import { requireRole } from '@/lib/auth/account'

describe('GET /api/whatsapp/analytics/expenses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aggregates total expenses and category breakdowns correctly', async () => {
    const mockTxs = [
      {
        amount: -0.85,
        type: 'broadcast_debit',
        description: 'Marketing campaign',
        metadata: { category: 'MARKETING', recipientsCount: 1 },
        created_at: new Date().toISOString(),
      },
      {
        amount: -0.40,
        type: 'message_debit',
        description: 'Order notification',
        metadata: { category: 'UTILITY', recipientsCount: 1 },
        created_at: new Date().toISOString(),
      },
      {
        amount: -0.30,
        type: 'message_debit',
        description: 'User support response',
        metadata: { category: 'SERVICE', recipientsCount: 1 },
        created_at: new Date().toISOString(),
      },
    ]

    const mockSupabase = {
      from: vi.fn((table: string) => {
        if (table === 'wallet_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({ data: mockTxs, error: null }),
          }
        }
        if (table === 'whatsapp_config') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                phone_number_id: 'pn-1',
                waba_id: 'waba-1',
                access_token: 'enc-token',
              },
            }),
          }
        }
        if (table === 'messages') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            gte: vi.fn().mockResolvedValue({ count: 12, error: null }),
          }
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null }),
        }
      }),
    }

    vi.mocked(requireRole).mockResolvedValue({
      accountId: 'acc-1',
      userId: 'user-1',
      role: 'admin',
      account: { id: 'acc-1', name: 'Test' },
      supabase: mockSupabase as any,
    })

    const res = await GET()
    expect(res.status).toBe(200)

    const json = await res.json()
    // Total should be 0.85 + 0.40 + 0.30 = 1.55
    expect(json.totalExpenses).toBe(1.55)
    expect(json.expensesToday).toBe(1.55)
    expect(json.expensesThisMonth).toBe(1.55)

    expect(json.categoryBreakdown.marketing.amount).toBe(0.85)
    expect(json.categoryBreakdown.utility.amount).toBe(0.40)
    expect(json.categoryBreakdown.service.amount).toBe(0.30)

    expect(json.metaHealth.connected).toBe(true)
    expect(json.metaHealth.freeTierUsed).toBe(12)
    expect(json.metaHealth.freeTierLimit).toBe(1000)
    expect(Array.isArray(json.dailyExpenses)).toBe(true)
  })
})

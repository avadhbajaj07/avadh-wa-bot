import { describe, it, expect, vi } from 'vitest'
import {
  estimateMessageCost,
  DEFAULT_RATES,
  deductWalletBalance,
  refundWalletBalance,
  creditWalletBalance,
} from './wallet'
import type { SupabaseClient } from '@supabase/supabase-js'

describe('Wallet Library', () => {
  describe('estimateMessageCost', () => {
    it('returns marketing rate for MARKETING templates', () => {
      expect(estimateMessageCost('MARKETING')).toBe(0.85)
      expect(estimateMessageCost('marketing')).toBe(0.85)
    })

    it('returns utility rate for UTILITY templates', () => {
      expect(estimateMessageCost('UTILITY')).toBe(0.40)
      expect(estimateMessageCost('utility')).toBe(0.40)
    })

    it('returns auth rate for AUTHENTICATION templates', () => {
      expect(estimateMessageCost('AUTHENTICATION')).toBe(0.40)
      expect(estimateMessageCost('auth')).toBe(0.40)
    })

    it('returns service rate for freeform or unclassified messages', () => {
      expect(estimateMessageCost('text')).toBe(0.30)
      expect(estimateMessageCost(null)).toBe(0.30)
      expect(estimateMessageCost(undefined)).toBe(0.30)
    })

    it('respects custom rates if provided', () => {
      const customRates = {
        ...DEFAULT_RATES,
        marketingRate: 1.25,
        utilityRate: 0.50,
      }
      expect(estimateMessageCost('MARKETING', customRates)).toBe(1.25)
      expect(estimateMessageCost('UTILITY', customRates)).toBe(0.50)
    })
  })

  describe('deductWalletBalance (fallback path)', () => {
    it('returns success immediately if amount is 0', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'no rpc' } }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { balance: 100, is_exempt: false } }),
            }),
          }),
        }),
      } as unknown as SupabaseClient

      const res = await deductWalletBalance(mockSupabase, {
        accountId: 'acc-1',
        amount: 0,
        type: 'message_debit',
        description: 'Free send',
      })

      expect(res.success).toBe(true)
      expect(res.balance).toBe(100)
    })

    it('permits sending if account is marked exempt', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'no rpc' } }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { balance: 5, is_exempt: true } }),
            }),
          }),
        }),
      } as unknown as SupabaseClient

      const res = await deductWalletBalance(mockSupabase, {
        accountId: 'acc-1',
        amount: 50,
        type: 'message_debit',
        description: 'Exempt send',
      })

      expect(res.success).toBe(true)
      expect(res.exempt).toBe(true)
    })

    it('rejects with insufficient_balance when balance is too low', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'no rpc' } }),
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { balance: 10, is_exempt: false } }),
            }),
          }),
        }),
      } as unknown as SupabaseClient

      const res = await deductWalletBalance(mockSupabase, {
        accountId: 'acc-1',
        amount: 50,
        type: 'message_debit',
        description: 'Broadcast 100 msgs',
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain('Insufficient wallet balance')
    })
  })

  describe('refundWalletBalance', () => {
    it('returns immediately if amount is 0', async () => {
      const mockSupabase = {} as unknown as SupabaseClient
      const res = await refundWalletBalance(mockSupabase, {
        accountId: 'acc-1',
        amount: 0,
        description: 'No refund',
      })
      expect(res.success).toBe(true)
    })
  })

  describe('creditWalletBalance (RPC path)', () => {
    it('calls credit_wallet_balance and returns new balance', async () => {
      const mockSupabase = {
        rpc: vi.fn().mockResolvedValue({
          data: { success: true, balance: 600, amount_credited: 500 },
          error: null,
        }),
      } as unknown as SupabaseClient

      const res = await creditWalletBalance(mockSupabase, {
        accountId: 'acc-1',
        amount: 500,
        type: 'topup',
        description: 'UPI Topup',
        referenceId: 'UTR123',
      })

      expect(res.success).toBe(true)
      expect(res.balance).toBe(600)
    })
  })
})

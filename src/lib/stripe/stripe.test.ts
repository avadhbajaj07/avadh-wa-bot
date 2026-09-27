import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isStripeConfigured, getStripe, createStripeCheckoutSession } from './stripe'
import type Stripe from 'stripe'

describe('Stripe Integration Library', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('isStripeConfigured', () => {
    it('returns false when STRIPE_SECRET_KEY is absent', () => {
      delete process.env.STRIPE_SECRET_KEY
      expect(isStripeConfigured()).toBe(false)
    })

    it('returns true when STRIPE_SECRET_KEY is defined', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_fake123'
      expect(isStripeConfigured()).toBe(true)
    })
  })

  describe('getStripe', () => {
    it('returns null when STRIPE_SECRET_KEY is not set', () => {
      delete process.env.STRIPE_SECRET_KEY
      expect(getStripe()).toBeNull()
    })

    it('returns a Stripe instance when STRIPE_SECRET_KEY is set', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_fake123'
      const stripe = getStripe()
      expect(stripe).not.toBeNull()
      expect(typeof stripe?.checkout.sessions.create).toBe('function')
    })
  })

  describe('createStripeCheckoutSession', () => {
    it('creates a checkout session with INR in paise and metadata', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: 'cs_test_999',
        url: 'https://checkout.stripe.com/pay/cs_test_999',
      })

      const mockStripe = {
        checkout: {
          sessions: {
            create: mockCreate,
          },
        },
      } as unknown as Stripe

      const session = await createStripeCheckoutSession(mockStripe, {
        accountId: 'acc-global-1',
        userId: 'user-global-1',
        userEmail: 'user@example.com',
        amount: 500,
        originUrl: 'https://shikhabajaj.online',
      })

      expect(session.id).toBe('cs_test_999')
      expect(session.url).toBe('https://checkout.stripe.com/pay/cs_test_999')

      expect(mockCreate).toHaveBeenCalledTimes(1)
      const args = mockCreate.mock.calls[0][0]

      expect(args.mode).toBe('payment')
      expect(args.client_reference_id).toBe('acc-global-1')
      expect(args.customer_email).toBe('user@example.com')
      expect(args.line_items[0].price_data.currency).toBe('inr')
      // 500 INR = 50000 paise
      expect(args.line_items[0].price_data.unit_amount).toBe(50000)
      expect(args.metadata).toEqual({
        accountId: 'acc-global-1',
        userId: 'user-global-1',
        amount: '500',
        type: 'wallet_topup',
      })
      expect(args.success_url).toContain('/settings?tab=wallet&stripe_session_id={CHECKOUT_SESSION_ID}')
      expect(args.cancel_url).toContain('/settings?tab=wallet&stripe_cancel=true')
    })
  })
})

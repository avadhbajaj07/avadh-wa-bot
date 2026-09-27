import Stripe from 'stripe'

let stripeInstance: Stripe | null = null

/**
 * Returns a singleton Stripe client if STRIPE_SECRET_KEY is configured in the environment.
 */
export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) return null

  if (!stripeInstance) {
    stripeInstance = new Stripe(secretKey)
  }
  return stripeInstance
}

/**
 * Check whether Stripe payments are configured on this server.
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export interface CreateCheckoutParams {
  accountId: string
  userId: string
  userEmail?: string | null
  amount: number // in INR (e.g. 500)
  originUrl: string
}

/**
 * Create a Stripe Checkout Session for wallet recharge.
 */
export async function createStripeCheckoutSession(
  stripe: Stripe,
  params: CreateCheckoutParams
): Promise<Stripe.Checkout.Session> {
  const { accountId, userId, userEmail, amount, originUrl } = params

  const cleanOrigin = originUrl.replace(/\/$/, '')
  const unitAmountInPaise = Math.round(amount * 100)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: accountId,
    customer_email: userEmail || undefined,
    line_items: [
      {
        price_data: {
          currency: 'inr',
          product_data: {
            name: `SandeshAI Wallet Credits (₹${amount.toLocaleString('en-IN')})`,
            description: `Prepaid messaging and automation credits for workspace ${accountId.slice(0, 8)}`,
          },
          unit_amount: unitAmountInPaise,
        },
        quantity: 1,
      },
    ],
    metadata: {
      accountId,
      userId,
      amount: amount.toString(),
      type: 'wallet_topup',
    },
    success_url: `${cleanOrigin}/settings?tab=wallet&stripe_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${cleanOrigin}/settings?tab=wallet&stripe_cancel=true`,
  })

  return session
}

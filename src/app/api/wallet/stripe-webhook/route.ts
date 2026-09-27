import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe/stripe'
import { creditWalletBalance } from '@/lib/wallet/wallet'

function getAdminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  return createClient(url, key)
}

export async function POST(request: Request) {
  const stripe = getStripe()
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe not initialized' }, { status: 500 })
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  const sig = request.headers.get('stripe-signature')

  let event: Stripe.Event
  const rawBody = await request.text()

  try {
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret)
    } else {
      // In dev mode or when webhook secret is not set, parse payload
      event = JSON.parse(rawBody) as Stripe.Event
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid signature'
    console.error('[Stripe Webhook] Verification error:', message)
    return NextResponse.json({ error: `Webhook error: ${message}` }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    const accountId = session.client_reference_id || session.metadata?.accountId
    const amountStr = session.metadata?.amount
    const amount = amountStr
      ? Number(amountStr)
      : session.amount_total
        ? session.amount_total / 100
        : 0
    const paymentRef =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.id
    const userId = session.metadata?.userId

    if (accountId && amount > 0) {
      const db = getAdminDb()

      // Idempotency: skip if this payment was already credited
      const { data: existingTx } = await db
        .from('wallet_transactions')
        .select('id')
        .eq('reference_id', paymentRef)
        .maybeSingle()

      if (!existingTx) {
        await creditWalletBalance(db, {
          accountId,
          amount,
          type: 'topup',
          description: `Stripe Global Top-up (${session.customer_details?.email || 'Card'})`,
          referenceId: paymentRef,
          metadata: {
            stripeSessionId: session.id,
            customerEmail: session.customer_details?.email,
            paymentStatus: session.payment_status,
          },
        })

        if (userId) {
          try {
            await db.from('wallet_topup_requests').insert({
              account_id: accountId,
              user_id: userId,
              amount,
              utr_number: paymentRef,
              payment_method: 'stripe',
              status: 'approved',
              notes: `Auto-credited via Stripe (${session.customer_details?.email || 'Card'})`,
              reviewed_at: new Date().toISOString(),
            })
          } catch {
            // Non-critical insert
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}

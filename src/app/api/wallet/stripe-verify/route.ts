import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getStripe } from '@/lib/stripe/stripe'
import { creditWalletBalance, getWallet } from '@/lib/wallet/wallet'

export async function GET(request: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('admin')

    const url = new URL(request.url)
    const sessionId = url.searchParams.get('session_id')

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id parameter' }, { status: 400 })
    }

    const stripe = getStripe()
    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    // Verify session belongs to this workspace account
    if (session.client_reference_id !== accountId && session.metadata?.accountId !== accountId) {
      return NextResponse.json({ error: 'Session does not belong to this account' }, { status: 403 })
    }

    if (session.payment_status !== 'paid') {
      return NextResponse.json({
        paid: false,
        status: session.payment_status,
        message: 'Payment has not been completed yet.',
      })
    }

    const paymentRef =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.id
    const amountStr = session.metadata?.amount
    const amount = amountStr
      ? Number(amountStr)
      : session.amount_total
        ? session.amount_total / 100
        : 0

    // Check if already credited
    const { data: existingTx } = await supabase
      .from('wallet_transactions')
      .select('id, amount, balance_after')
      .eq('reference_id', paymentRef)
      .maybeSingle()

    if (!existingTx) {
      await creditWalletBalance(supabase, {
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

      try {
        await supabase.from('wallet_topup_requests').insert({
          account_id: accountId,
          user_id: userId,
          amount,
          utr_number: paymentRef,
          payment_method: 'stripe',
          status: 'approved',
          notes: `Verified via Stripe Checkout (${session.customer_details?.email || 'Card'})`,
          reviewed_at: new Date().toISOString(),
        })
      } catch {
        // Non-critical insert
      }
    }

    const wallet = await getWallet(supabase, accountId)

    return NextResponse.json({
      paid: true,
      amount,
      balance: wallet.balance,
      alreadyCredited: Boolean(existingTx),
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

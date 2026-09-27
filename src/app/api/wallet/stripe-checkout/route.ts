import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getStripe, isStripeConfigured, createStripeCheckoutSession } from '@/lib/stripe/stripe'

export async function POST(request: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('admin')

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Stripe payments are not configured on this server. Please configure STRIPE_SECRET_KEY in environment variables.' },
        { status: 503 }
      )
    }

    const stripe = getStripe()
    if (!stripe) {
      return NextResponse.json(
        { error: 'Stripe client initialization failed.' },
        { status: 500 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as { amount?: number }
    const amount = Number(body.amount)

    if (!amount || amount < 50) {
      return NextResponse.json(
        { error: 'Minimum Stripe recharge amount is ₹50.' },
        { status: 400 }
      )
    }

    const { data: userData } = await supabase.auth.getUser()
    const userEmail = userData?.user?.email

    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = request.headers.get('x-forwarded-proto') || 'https'
    const originUrl = process.env.NEXT_PUBLIC_SITE_URL || `${protocol}://${host}`

    const session = await createStripeCheckoutSession(stripe, {
      accountId,
      userId,
      userEmail,
      amount,
      originUrl,
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { creditWalletBalance } from '@/lib/wallet/wallet'

/**
 * Member submits a UPI top-up with amount & UTR reference number.
 */
export async function POST(request: Request) {
  try {
    const { accountId, userId, supabase } = await requireRole('admin')
    const body = (await request.json()) as {
      amount?: number
      utrNumber?: string
      notes?: string
    }

    const amount = Number(body.amount)
    const utr = body.utrNumber?.trim()

    if (!amount || amount < 10) {
      return NextResponse.json(
        { error: 'Minimum recharge amount is ₹10' },
        { status: 400 }
      )
    }

    if (!utr || utr.length < 6 || utr.length > 50) {
      return NextResponse.json(
        { error: 'Please enter a valid 12-digit UPI UTR / Reference Number' },
        { status: 400 }
      )
    }

    // Check for duplicate pending or approved UTR in this account
    const { data: existing } = await supabase
      .from('wallet_topup_requests')
      .select('id, status')
      .eq('account_id', accountId)
      .eq('utr_number', utr)
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: `This UTR has already been submitted (status: ${existing.status}).` },
        { status: 400 }
      )
    }

    const { data: requestRow, error } = await supabase
      .from('wallet_topup_requests')
      .insert({
        account_id: accountId,
        user_id: userId,
        amount,
        utr_number: utr,
        payment_method: 'upi',
        status: 'pending',
        notes: body.notes || null,
      })
      .select()
      .single()

    if (error) {
      throw new Error(`Could not submit top-up request: ${error.message}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Top-up request submitted. Balance will be updated upon verification.',
      request: requestRow,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

/**
 * Admin approves / rejects top-up request or adjusts balance directly.
 */
export async function PATCH(request: Request) {
  try {
    const { accountId, userId, supabase, role } = await requireRole('admin')
    const body = (await request.json()) as {
      requestId?: string
      action?: 'approve' | 'reject'
      adjustAmount?: number
      adjustReason?: string
      isExempt?: boolean
    }

    // Direct balance adjustment / exemption (Owner / Superadmin)
    if (body.adjustAmount !== undefined) {
      const amount = Number(body.adjustAmount)
      if (isNaN(amount) || amount === 0) {
        return NextResponse.json({ error: 'Invalid adjustment amount' }, { status: 400 })
      }

      const res = await creditWalletBalance(supabase, {
        accountId,
        amount,
        type: 'admin_adjustment',
        description: body.adjustReason || `Manual adjustment by admin`,
        referenceId: `adj_${Date.now()}`,
      })

      return NextResponse.json({ success: true, balance: res.balance })
    }

    // Exemption toggle (allow owner to exempt an account from message balance checks)
    if (body.isExempt !== undefined) {
      if (role !== 'owner') {
        return NextResponse.json({ error: 'Only owners can toggle billing exemption' }, { status: 403 })
      }
      await supabase
        .from('wallets')
        .upsert({ account_id: accountId, is_exempt: body.isExempt, updated_at: new Date().toISOString() })
      return NextResponse.json({ success: true, isExempt: body.isExempt })
    }

    // Approve / Reject pending UTR topup request
    if (!body.requestId || !body.action) {
      return NextResponse.json({ error: 'Missing requestId or action' }, { status: 400 })
    }

    const { data: topup, error: fetchErr } = await supabase
      .from('wallet_topup_requests')
      .select('*')
      .eq('id', body.requestId)
      .eq('account_id', accountId)
      .single()

    if (fetchErr || !topup) {
      return NextResponse.json({ error: 'Top-up request not found' }, { status: 404 })
    }

    if (topup.status !== 'pending') {
      return NextResponse.json(
        { error: `Request already ${topup.status}` },
        { status: 400 }
      )
    }

    if (body.action === 'approve') {
      // Credit the account wallet
      const creditRes = await creditWalletBalance(supabase, {
        accountId: topup.account_id,
        amount: Number(topup.amount),
        type: 'topup',
        description: `UPI Recharge - UTR ${topup.utr_number}`,
        referenceId: topup.utr_number,
        metadata: { topup_request_id: topup.id },
      })

      await supabase
        .from('wallet_topup_requests')
        .update({
          status: 'approved',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', topup.id)

      return NextResponse.json({
        success: true,
        action: 'approved',
        balance: creditRes.balance,
      })
    } else {
      await supabase
        .from('wallet_topup_requests')
        .update({
          status: 'rejected',
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', topup.id)

      return NextResponse.json({
        success: true,
        action: 'rejected',
      })
    }
  } catch (error) {
    return toErrorResponse(error)
  }
}

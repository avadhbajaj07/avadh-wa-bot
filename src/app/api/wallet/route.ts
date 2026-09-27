import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { getWallet } from '@/lib/wallet/wallet'

export async function GET() {
  try {
    const { accountId, supabase, role } = await requireRole('viewer')
    const wallet = await getWallet(supabase, accountId)

    // Fetch recent transactions
    const { data: transactions } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(30)

    // Fetch pending topup requests
    const { data: pendingTopups } = await supabase
      .from('wallet_topup_requests')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      ...wallet,
      role,
      transactions: transactions || [],
      pendingTopups: pendingTopups || [],
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

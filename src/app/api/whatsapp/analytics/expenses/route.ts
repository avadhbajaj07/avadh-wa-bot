import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function GET() {
  try {
    const { accountId, supabase } = await requireRole('viewer')

    // 1. Fetch wallet debit transactions for real-time expenses
    const { data: debits, error: debitsError } = await supabase
      .from('wallet_transactions')
      .select('amount, type, description, metadata, created_at')
      .eq('account_id', accountId)
      .in('type', ['message_debit', 'broadcast_debit'])
      .order('created_at', { ascending: false })

    if (debitsError) {
      console.error('[Analytics/Expenses] Failed to fetch debits:', debitsError)
    }

    const txs = debits || []

    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    let totalExpenses = 0
    let expensesThisMonth = 0
    let expensesToday = 0

    const categoryBreakdown = {
      marketing: { amount: 0, count: 0 },
      utility: { amount: 0, count: 0 },
      service: { amount: 0, count: 0 },
      auth: { amount: 0, count: 0 },
    }

    // Daily buckets for the last 30 days
    const dailyMap: Record<string, { date: string; amount: number; count: number }> = {}

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = d.toISOString().split('T')[0]
      dailyMap[dateStr] = { date: dateStr, amount: 0, count: 0 }
    }

    for (const tx of txs) {
      const cost = Math.abs(Number(tx.amount) || 0)
      totalExpenses += cost

      if (tx.created_at >= startOfMonth) {
        expensesThisMonth += cost
      }
      if (tx.created_at >= startOfToday) {
        expensesToday += cost
      }

      // Identify category
      const meta = (tx.metadata || {}) as Record<string, unknown>
      const rawCat = String(meta.category || '').toUpperCase()
      const desc = String(tx.description || '').toUpperCase()
      const recipientsCount = Number(meta.recipientsCount) || 1

      if (rawCat === 'MARKETING' || desc.includes('MARKETING') || tx.type === 'broadcast_debit') {
        categoryBreakdown.marketing.amount += cost
        categoryBreakdown.marketing.count += recipientsCount
      } else if (rawCat === 'UTILITY' || desc.includes('UTILITY')) {
        categoryBreakdown.utility.amount += cost
        categoryBreakdown.utility.count += recipientsCount
      } else if (rawCat === 'AUTHENTICATION' || rawCat === 'AUTH' || desc.includes('AUTH')) {
        categoryBreakdown.auth.amount += cost
        categoryBreakdown.auth.count += recipientsCount
      } else {
        categoryBreakdown.service.amount += cost
        categoryBreakdown.service.count += recipientsCount
      }

      const txDate = tx.created_at.split('T')[0]
      if (dailyMap[txDate]) {
        dailyMap[txDate].amount += cost
        dailyMap[txDate].count += recipientsCount
      }
    }

    // Round amounts to 2 decimal places
    totalExpenses = Math.round(totalExpenses * 100) / 100
    expensesThisMonth = Math.round(expensesThisMonth * 100) / 100
    expensesToday = Math.round(expensesToday * 100) / 100

    categoryBreakdown.marketing.amount = Math.round(categoryBreakdown.marketing.amount * 100) / 100
    categoryBreakdown.utility.amount = Math.round(categoryBreakdown.utility.amount * 100) / 100
    categoryBreakdown.service.amount = Math.round(categoryBreakdown.service.amount * 100) / 100
    categoryBreakdown.auth.amount = Math.round(categoryBreakdown.auth.amount * 100) / 100

    const dailyExpenses = Object.values(dailyMap).map((d) => ({
      ...d,
      amount: Math.round(d.amount * 100) / 100,
    }))

    // 2. Fetch Meta Cloud API details & Health Metrics
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id, waba_id, access_token')
      .eq('account_id', accountId)
      .maybeSingle()

    let metaHealth = {
      connected: false,
      displayPhoneNumber: null as string | null,
      verifiedName: null as string | null,
      qualityRating: 'UNKNOWN',
      messagingLimitTier: 'TIER_1K',
      status: 'DISCONNECTED',
      wabaId: config?.waba_id || null,
      phoneNumberId: config?.phone_number_id || null,
      freeTierUsed: 0,
      freeTierLimit: 1000,
    }

    if (config?.phone_number_id && config?.access_token) {
      metaHealth.connected = true
      try {
        const token = decrypt(config.access_token)
        const metaRes = await fetch(
          `https://graph.facebook.com/v21.0/${config.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,messaging_limit_tier,status,code_verification_status`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
          }
        )

        if (metaRes.ok) {
          const metaJson = await metaRes.json()
          metaHealth = {
            ...metaHealth,
            connected: true,
            displayPhoneNumber: metaJson.display_phone_number || null,
            verifiedName: metaJson.verified_name || null,
            qualityRating: metaJson.quality_rating || 'GREEN',
            messagingLimitTier: metaJson.messaging_limit_tier || 'TIER_10K',
            status: metaJson.status || 'CONNECTED',
          }
        }
      } catch (err) {
        console.warn('[Analytics/Expenses] Meta Graph API query skipped/failed:', err)
      }
    }

    // 3. Count inbound service messages this month to track Meta's 1,000 free conversations tier
    const { count: inboundCount } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('account_id', accountId)
      .eq('direction', 'inbound')
      .gte('created_at', startOfMonth)

    metaHealth.freeTierUsed = Math.min(1000, inboundCount || 0)

    return NextResponse.json({
      totalExpenses,
      expensesThisMonth,
      expensesToday,
      categoryBreakdown,
      dailyExpenses,
      metaHealth,
    })
  } catch (error) {
    return toErrorResponse(error)
  }
}

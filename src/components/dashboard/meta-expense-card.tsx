'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  DollarSign,
  Gift,
  Megaphone,
  MessageSquare,
  ShieldCheck,
  TrendingUp,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ExpenseData {
  totalExpenses: number
  expensesThisMonth: number
  expensesToday: number
  categoryBreakdown: {
    marketing: { amount: number; count: number }
    utility: { amount: number; count: number }
    service: { amount: number; count: number }
    auth: { amount: number; count: number }
  }
  metaHealth: {
    connected: boolean
    displayPhoneNumber: string | null
    verifiedName: string | null
    qualityRating: string
    messagingLimitTier: string
    status: string
    freeTierUsed: number
    freeTierLimit: number
  }
}

export function MetaExpenseCard() {
  const [data, setData] = useState<ExpenseData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetch('/api/whatsapp/analytics/expenses', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (mounted && json) setData(json)
      })
      .catch((err) => console.error('[MetaExpenseCard] fetch error:', err))
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [])

  if (loading) {
    return (
      <Card className="border border-border/80 shadow-xs">
        <CardContent className="p-6">
          <div className="h-28 animate-pulse rounded-xl bg-muted/60" />
        </CardContent>
      </Card>
    )
  }

  if (!data) return null

  const tierFormat = (tier: string) => {
    switch (tier) {
      case 'TIER_1K':
        return '1,000 / day (Tier 1)'
      case 'TIER_10K':
        return '10,000 / day (Tier 2)'
      case 'TIER_100K':
        return '100,000 / day (Tier 3)'
      case 'TIER_UNLIMITED':
        return 'Unlimited (Tier 4)'
      default:
        return tier.replace('TIER_', '') + ' / day'
    }
  }

  const freeTierPercent = Math.min(
    100,
    Math.round((data.metaHealth.freeTierUsed / data.metaHealth.freeTierLimit) * 100)
  )

  return (
    <Card className="border border-border/80 bg-card shadow-xs transition-all hover:border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
                <DollarSign className="h-4 w-4" />
              </div>
              <CardTitle className="text-base font-bold">Meta Expenses & Spending</CardTitle>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Total messaging costs, category breakdown, and official Meta account tiers.
            </CardDescription>
          </div>

          {/* Meta Live Health Pill */}
          <div className="flex items-center gap-2">
            {data.metaHealth.connected && (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs py-1"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Meta Quality: {data.metaHealth.qualityRating}</span>
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs py-1">
              Tier: {tierFormat(data.metaHealth.messagingLimitTier)}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* KPI Row */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Total Expenses Till Now</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                ₹{data.totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center">
                <TrendingUp className="h-3 w-3 mr-0.5" /> All-Time
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Expenses This Month</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                ₹{data.expensesThisMonth.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-muted-foreground">Current Billing</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/30 p-3.5">
            <span className="text-xs font-medium text-muted-foreground">Expenses Today</span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">
                ₹{data.expensesToday.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[11px] text-muted-foreground">Last 24 Hours</span>
            </div>
          </div>
        </div>

        {/* Category Breakdown Chips */}
        <div>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Spending by Meta Category
          </span>
          <div className="mt-2.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
              <div className="flex items-center gap-1.5 text-purple-600 dark:text-purple-400">
                <Megaphone className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Marketing</span>
              </div>
              <p className="mt-1 text-base font-bold text-foreground">
                ₹{data.categoryBreakdown.marketing.amount.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {data.categoryBreakdown.marketing.count.toLocaleString()} sent (@ ₹0.85)
              </p>
            </div>

            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
              <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
                <Zap className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Utility</span>
              </div>
              <p className="mt-1 text-base font-bold text-foreground">
                ₹{data.categoryBreakdown.utility.amount.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {data.categoryBreakdown.utility.count.toLocaleString()} sent (@ ₹0.40)
              </p>
            </div>

            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <MessageSquare className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Service</span>
              </div>
              <p className="mt-1 text-base font-bold text-foreground">
                ₹{data.categoryBreakdown.service.amount.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {data.categoryBreakdown.service.count.toLocaleString()} convs (@ ₹0.30)
              </p>
            </div>

            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <ShieldCheck className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">Auth (OTP)</span>
              </div>
              <p className="mt-1 text-base font-bold text-foreground">
                ₹{data.categoryBreakdown.auth.amount.toFixed(2)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {data.categoryBreakdown.auth.count.toLocaleString()} sent (@ ₹0.40)
              </p>
            </div>
          </div>
        </div>

        {/* Free Tier Tracker Banner */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3.5 sm:flex-row sm:items-center sm:justify-between text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Gift className="h-4 w-4 text-primary" />
              <span>Meta Monthly Free Service Tier: {data.metaHealth.freeTierUsed} / 1,000 used</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Meta grants the first 1,000 user-initiated service conversations free of charge each month per WhatsApp Business Account.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="w-32 bg-border rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all"
                style={{ width: `${freeTierPercent}%` }}
              />
            </div>
            <Link href="/settings?tab=wallet">
              <Button size="sm" variant="outline" className="h-7 text-xs">
                Manage Wallet →
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

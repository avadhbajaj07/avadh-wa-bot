"use client"

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  MessageSquare,
  Users,
  Megaphone,
  Send,
} from 'lucide-react'

import {
  loadActivity,
  loadConversationsSeries,
  loadMetrics,
  loadBroadcastsSummary,
} from '@/lib/dashboard/queries'
import type {
  ActivityItem,
  ConversationsSeriesPoint,
  MetricsBundle,
  BroadcastsSummaryData,
} from '@/lib/dashboard/types'

import { MetricCard } from '@/components/dashboard/metric-card'
import { SkeletonCard } from '@/components/dashboard/skeleton'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ConversationsChart } from '@/components/dashboard/conversations-chart'
import { CampaignOverview } from '@/components/dashboard/campaign-overview'
import { ActivityFeed } from '@/components/dashboard/activity-feed'

import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { WhatsAppSetupGuide } from '@/components/dashboard/whatsapp-setup-guide'

type RangeDays = 7 | 30 | 90

export default function DashboardPage() {
  const t = useTranslations('Dashboard.page')
  const searchParams = useSearchParams()
  const [metrics, setMetrics] = useState<MetricsBundle | null>(null)
  const [metricsLoading, setMetricsLoading] = useState(true)
  const [waConnected, setWaConnected] = useState<boolean | null>(null)

  const [range, setRange] = useState<RangeDays>(30)
  // Keep a cache per range so switching tabs doesn't re-fetch what we
  // already have. Ranges the user hasn't opened yet stay null and
  // trigger a fetch on first view.
  const [series, setSeries] = useState<Record<RangeDays, ConversationsSeriesPoint[] | null>>({
    7: null,
    30: null,
    90: null,
  })
  const [seriesLoading, setSeriesLoading] = useState(true)

  const [campaignsSummary, setCampaignsSummary] = useState<BroadcastsSummaryData | null>(null)
  const [campaignsSummaryLoading, setCampaignsSummaryLoading] = useState(true)

  const [activity, setActivity] = useState<ActivityItem[] | null>(null)
  const [activityLoading, setActivityLoading] = useState(true)

  const loadAll = useCallback(() => {
    const db = createClient()

    // Kick everything off in parallel. Each block has its own
    // setState + finally so a slow query doesn't hold up faster
    // sections — each widget shows its own skeleton independently.
    void loadMetrics(db)
      .then((m) => setMetrics(m))
      .catch((err) => console.error('[dashboard] metrics failed:', err))
      .finally(() => setMetricsLoading(false))

    void loadConversationsSeries(db, 30)
      .then((s) => setSeries((prev) => ({ ...prev, 30: s })))
      .catch((err) => console.error('[dashboard] series failed:', err))
      .finally(() => setSeriesLoading(false))

    void loadBroadcastsSummary(db)
      .then((c) => setCampaignsSummary(c))
      .catch((err) => console.error('[dashboard] campaigns summary failed:', err))
      .finally(() => setCampaignsSummaryLoading(false))

    // Fetch up to 50 so the biggest page-size option in the feed
    // (50 rows) is already in memory — switching sizes then becomes
    // a pure client-side slice with no extra round trip.
    void loadActivity(db, 50)
      .then((a) => setActivity(a))
      .catch((err) => console.error('[dashboard] activity failed:', err))
      .finally(() => setActivityLoading(false))
  }, [])

  const checkWaConnection = useCallback(() => {
    void fetch('/api/whatsapp/config')
      .then((res) => res.json())
      .then((data) => setWaConnected(!!data.connected))
      .catch(() => setWaConnected(false))
  }, [])

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkWaConnection()
    const connected = searchParams.get('connected')
    const oauthError = searchParams.get('oauth_error')
    if (connected === 'true') {
      toast.success('WhatsApp Business Account successfully connected via Facebook!')
    } else if (oauthError) {
      toast.error(`WhatsApp connection error: ${oauthError}`)
    }
  }, [loadAll, checkWaConnection, searchParams])

  // Range switch handler — kept in an event callback (not an effect)
  // so the setState calls stay out of the react-hooks/set-state-in-effect
  // rule's way. The cached bucket check means switching back to a
  // previously-viewed range is instant and doesn't re-fetch.
  const handleRangeChange = useCallback(
    (r: RangeDays) => {
      setRange(r)
      if (series[r] !== null) return
      setSeriesLoading(true)
      const db = createClient()
      loadConversationsSeries(db, r)
        .then((s) => setSeries((prev) => ({ ...prev, [r]: s })))
        .catch((err) => console.error('[dashboard] series failed:', err))
        .finally(() => setSeriesLoading(false))
    },
    [series],
  )

  return (
    <div className="space-y-5">
      {/* SandeshAI-style WhatsApp Setup Guide */}
      {waConnected === false && (
        <WhatsAppSetupGuide isConnected={false} onRefresh={checkWaConnection} />
      )}

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('description')}
        </p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricsLoading || !metrics ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard
              title={t('activeConversations')}
              value={metrics.activeConversations.current.toLocaleString()}
              icon={MessageSquare}
              delta={{
                sign: metrics.activeConversations.previous,
                label: deltaLabel(
                  metrics.activeConversations.previous, 
                  t('newTodayVsYesterday'), 
                  t('noChange', { suffix: t('newTodayVsYesterday') })
                ),
              }}
            />
            <MetricCard
              title={t('totalContacts')}
              value={metrics.totalContacts.current.toLocaleString()}
              icon={Users}
              subtitle={
                metrics.totalContacts.newToday > 0
                  ? t('contactsNewToday', { count: metrics.totalContacts.newToday })
                  : undefined
              }
            />
            <MetricCard
              title={t('totalBroadcasts')}
              value={metrics.totalBroadcasts.current.toLocaleString()}
              icon={Megaphone}
              subtitle={t('broadcastsRecipients', { count: metrics.totalBroadcasts.totalRecipients })}
            />
            <MetricCard
              title={t('messagesSentToday')}
              value={metrics.messagesSentToday.current.toLocaleString()}
              icon={Send}
              delta={{
                sign:
                  metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                label: deltaLabel(
                  metrics.messagesSentToday.current - metrics.messagesSentToday.previous,
                  t('vsYesterday'),
                  t('noChange', { suffix: t('vsYesterday') })
                ),
              }}
            />
          </>
        )}
      </div>

      {/* Quick actions */}
      <QuickActions />

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="h-full lg:col-span-3">
          <ConversationsChart
            series={series}
            loading={seriesLoading}
            range={range}
            onRangeChange={handleRangeChange}
          />
        </div>
        <div className="h-full lg:col-span-2">
          <CampaignOverview
            data={campaignsSummary}
            loading={campaignsSummaryLoading}
          />
        </div>
      </div>

      {/* Activity feed */}
      <ActivityFeed items={activity} loading={activityLoading} />
    </div>
  )
}

// ------------------------------------------------------------

function deltaLabel(delta: number, suffix: string, noChangeLabel: string): string {
  if (delta === 0) return noChangeLabel
  const sign = delta > 0 ? '+' : ''
  return `${sign}${delta.toLocaleString()} ${suffix}`
}

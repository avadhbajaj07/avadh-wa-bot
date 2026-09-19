"use client"

import Link from 'next/link'
import { Megaphone, CheckCheck, Send, AlertCircle, Eye, ArrowRight } from 'lucide-react'
import type { BroadcastsSummaryData } from '@/lib/dashboard/types'
import { EmptyState } from './empty-state'
import { Skeleton } from './skeleton'
import { useTranslations } from 'next-intl'

interface CampaignOverviewProps {
  data: BroadcastsSummaryData | null
  loading: boolean
}

export function CampaignOverview({ data, loading }: CampaignOverviewProps) {
  const t = useTranslations('Dashboard.campaignOverview')

  return (
    <section className="flex h-full flex-col rounded-xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('description')}</p>
        </div>
        <Link
          href="/broadcasts"
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          {t('viewAll')}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <div className="flex flex-1 flex-col p-5">
        {loading || !data ? (
          <Skeleton className="h-56 w-full" />
        ) : data.totalCampaigns === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={t('noCampaigns')}
            hint={t('noCampaignsHint')}
          />
        ) : (
          <div className="flex flex-col h-full justify-between gap-5">
            {/* Top KPI row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Send className="h-3.5 w-3.5 text-blue-400" />
                  <span>{t('sent')}</span>
                </div>
                <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                  {data.totalSent.toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <CheckCheck className="h-3.5 w-3.5 text-teal-400" />
                  <span>{t('delivered')}</span>
                </div>
                <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                  {data.totalDelivered.toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <Eye className="h-3.5 w-3.5 text-sky-400" />
                  <span>{t('read')}</span>
                </div>
                <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                  {data.totalRead.toLocaleString()}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                  <AlertCircle className="h-3.5 w-3.5 text-red-400" />
                  <span>{t('failed')}</span>
                </div>
                <p className="mt-1 text-base font-semibold text-foreground tabular-nums">
                  {data.totalFailed.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Delivery Rate Bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-medium">
                <span className="text-muted-foreground">{t('deliveryRate')}</span>
                <span className="text-foreground tabular-nums font-semibold">{data.deliveryRate}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, data.deliveryRate))}%` }}
                />
              </div>
            </div>

            {/* Recent Campaigns list */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{t('recentCampaigns')}</p>
              <div className="divide-y divide-border rounded-lg border border-border">
                {data.recentCampaigns.map((c) => (
                  <Link
                    key={c.id}
                    href={`/broadcasts/${c.id}`}
                    className="flex items-center justify-between p-2.5 hover:bg-muted/40 transition-colors text-xs first:rounded-t-lg last:rounded-b-lg"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="font-medium text-foreground truncate">{c.name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{c.template_name}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="tabular-nums text-muted-foreground">
                        {c.delivered_count}/{c.total_recipients}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                          c.status === 'completed'
                            ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                            : c.status === 'sending'
                            ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            : c.status === 'failed'
                            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                            : 'bg-muted text-muted-foreground border border-border'
                        }`}
                      >
                        {c.status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

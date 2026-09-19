'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast, BroadcastRecipient, RecipientStatus } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft,
  Loader2,
  Users,
  Send,
  CheckCheck,
  Eye,
  AlertCircle,
  MessageCircle,
  Filter,
  Download,
  ChevronDown,
  Trash2,
  PlayCircle,
  RotateCcw,
  Calendar,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getBroadcastStatus,
  getRecipientStatus,
} from '@/lib/broadcast-status';
import { useTranslations } from 'next-intl';

interface StatCardProps {
  label: string;
  value: number;
  total: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, total, icon, color }: StatCardProps) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${color}`}>
          {icon}
        </div>
        <span className="text-xs text-muted-foreground">{pct}%</span>
      </div>
      <p className="mt-3 text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

/**
 * Pure-CSS funnel chart: decreasing-width rounded bars.
 * Width is relative to the largest step (typically Sent) so we
 * always render a full bar at the top and proportional tails.
 */
function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Funnel</h3>
      <div className="space-y-2">
        {steps.map((step) => {
          const pctOfMax = Math.max(5, Math.round((step.value / max) * 100));
          const pctOfSent =
            steps[0].value > 0
              ? Math.round((step.value / steps[0].value) * 100)
              : 0;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">
                {step.label}
              </span>
              <div className="relative h-7 flex-1 rounded-full bg-muted">
                <div
                  className={`h-7 rounded-full ${step.color} transition-[width] duration-500`}
                  style={{ width: `${pctOfMax}%` }}
                />
                <span className="absolute inset-0 flex items-center px-3 text-xs font-medium text-foreground">
                  {step.value.toLocaleString()}
                  <span className="ml-2 text-muted-foreground/80">
                    ({pctOfSent}%)
                  </span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RECIPIENT_STATUSES: readonly RecipientStatus[] = [
  'pending',
  'sent',
  'delivered',
  'read',
  'replied',
  'failed',
];

/**
 * CSV export helper — RFC 4180 quoting. Quote every field so
 * commas/newlines/quotes round-trip cleanly.
 */
function toCsv(rows: string[][]): string {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return rows.map((r) => r.map(escape).join(',')).join('\n');
}

function downloadBlob(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations('Broadcasts.detail');
  const tStatus = useTranslations('Broadcasts.status');
  const broadcastId = params.id as string;

  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [recipients, setRecipients] = useState<BroadcastRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<RecipientStatus | 'all'>(
    'all',
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [resumingScope, setResumingScope] = useState<
    'pending' | 'failed' | null
  >(null);

  const fetchData = useCallback(async () => {
    try {
      const supabase = createClient();

      const { data: bc, error: bcError } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', broadcastId)
        .single();

      if (bcError) throw bcError;
      setBroadcast(bc);

      const { data: recs, error: recsError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .eq('broadcast_id', broadcastId)
        .order('created_at', { ascending: false });

      if (recsError) throw recsError;
      setRecipients(recs ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('notFound'));
    } finally {
      setLoading(false);
    }
  }, [broadcastId, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRecipients = useMemo(
    () =>
      statusFilter === 'all'
        ? recipients
        : recipients.filter((r) => r.status === statusFilter),
    [recipients, statusFilter],
  );

  function handleExport() {
    if (!broadcast) return;
    const header = [
      t('table.contact'),
      t('table.phone'),
      t('table.status'),
      t('table.sent'),
      t('table.delivered'),
      t('table.read'),
      t('table.error'),
    ];
    const rows = recipients.map((r) => [
      r.contact?.name ?? '',
      r.contact?.phone ?? '',
      r.status,
      r.sent_at ?? '',
      r.delivered_at ?? '',
      r.read_at ?? '',
      r.error_message ?? '',
    ]);
    const csv = toCsv([header, ...rows]);
    const safeName = broadcast.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    downloadBlob(`broadcast-${safeName}-${broadcastId.slice(0, 8)}.csv`, csv);
  }

  /**
   * Hand the leftovers to the server (issue #472).
   *
   * The wizard's send loop lives in the tab that started the campaign,
   * so navigating away strands the rest as 'pending' with the broadcast
   * stuck 'sending'. This is the recovery, and the same call retries
   * failed recipients.
   */
  async function handleResume(scope: 'pending' | 'failed') {
    setResumingScope(scope);
    try {
      const res = await fetch(`/api/whatsapp/broadcast/${broadcastId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(
          t('toastResumeFailed', {
            error: payload?.error || `HTTP ${res.status}`,
          }),
        );
        return;
      }

      toast.success(
        payload.remaining > 0
          ? t('toastResumeStartedCapped', {
              count: payload.resuming,
              remaining: payload.remaining,
            })
          : t('toastResumeStarted', { count: payload.resuming }),
      );
      // Delivery runs server-side after the 202, so the counts here are
      // a snapshot — reload to pick up the first of it.
      await fetchData();
    } catch (err) {
      toast.error(
        t('toastResumeFailed', {
          error: err instanceof Error ? err.message : 'Unknown error',
        }),
      );
    } finally {
      setResumingScope(null);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    // broadcast_recipients cascades on broadcasts.id (migration 001), so a
    // single delete is sufficient — the aggregate trigger in migration 003
    // is defined on broadcast_recipients but fires only on its own row
    // changes, not on a cascaded drop of the parent row.
    const { error: delErr } = await supabase
      .from('broadcasts')
      .delete()
      .eq('id', broadcastId);
    setDeleting(false);
    if (delErr) {
      toast.error(t('toastFailedDelete', { error: delErr.message }));
      return;
    }
    toast.success(t('toastDeleted'));
    router.push('/broadcasts');
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !broadcast) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error ?? t('notFound')}</p>
        <Button variant="outline" onClick={() => router.push('/broadcasts')}>
          {t('backToBroadcasts')}
        </Button>
      </div>
    );
  }

  const status = getBroadcastStatus(broadcast.status);

  const pendingCount = recipients.filter((r) => r.status === 'pending').length;
  const retryableCount = recipients.filter((r) => r.status === 'failed').length;
  // A campaign whose tab went away sits in 'sending' with recipients
  // still pending and nothing left to move them. Name that state rather
  // than leaving a permanently pulsing "sending" badge.
  const isStalled = broadcast.status === 'sending' && pendingCount > 0;

  const funnelSteps: FunnelStep[] = [
    { label: t('stats.sent'), value: broadcast.sent_count, color: 'bg-primary' },
    { label: t('stats.delivered'), value: broadcast.delivered_count, color: 'bg-teal-500' },
    { label: t('stats.read'), value: broadcast.read_count, color: 'bg-blue-500' },
    { label: t('stats.replied'), value: broadcast.replied_count, color: 'bg-indigo-500' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/broadcasts')}
            className="border-border size-9 rounded-xl"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Campaign Insights</h1>
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.classes}`}
              >
                {tStatus(status.label)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Track and analyze your campaign performance in real-time
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-2xs">
            <Calendar className="size-3.5 text-muted-foreground" />
            <span>
              {new Date(broadcast.created_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>

        {/* Delete — inline-confirm pattern matches the pipeline-settings
            "Delete Pipeline" flow. Mid-send broadcasts can't be deleted
            because orphaning in-flight Meta messages would leave the
            funnel inconsistent. */}
        {confirmDelete ? (
          <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm">
            <span className="text-red-300">{t('deletePrompt')}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDelete(false)}
              disabled={deleting}
              className="h-7 border-border bg-transparent text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
              className="h-7 bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? t('deleting') : t('confirm')}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={broadcast.status === 'sending'}
            onClick={() => setConfirmDelete(true)}
            title={
              broadcast.status === 'sending'
                ? t('cannotDeleteSending')
                : t('deleteHover')
            }
            className="border-red-500/30 bg-transparent text-red-400 hover:bg-red-500/10 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('delete')}
          </Button>
        )}
        </div>
      </div>

      {/* Resume / retry (issue #472). Only rendered when there is
          actually something outstanding. */}
      {(pendingCount > 0 || retryableCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {isStalled ? t('resumeStalledTitle') : t('resumeTitle')}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {isStalled
                ? t('resumeStalledHint', { count: pendingCount })
                : t('resumeHint', { count: retryableCount })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {pendingCount > 0 && (
              <Button
                size="sm"
                onClick={() => handleResume('pending')}
                disabled={resumingScope !== null}
              >
                {resumingScope === 'pending' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
                {t('resumePending', { count: pendingCount })}
              </Button>
            )}
            {retryableCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResume('failed')}
                disabled={resumingScope !== null}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {resumingScope === 'failed' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RotateCcw className="h-3.5 w-3.5" />
                )}
                {t('retryFailed', { count: retryableCount })}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Top 7 KPI Cards (SandeshAI style) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {/* 1. Initiated */}
        <div className="rounded-xl border border-primary/20 bg-card p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-500">
              <Users className="size-4" />
            </div>
            <span className="text-xs text-muted-foreground">Initiated</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground tabular-nums">
            {broadcast.total_recipients.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full w-full" />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">100%</span>
          </div>
        </div>

        {/* 2. Sent */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <Send className="size-4" />
            </div>
            <span className="text-xs text-muted-foreground">Sent</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground tabular-nums">
            {broadcast.sent_count.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{
                  width: `${broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.sent_count / broadcast.total_recipients) * 100)) : 0}%`,
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.sent_count / broadcast.total_recipients) * 100)) : 0}%
            </span>
          </div>
        </div>

        {/* 3. Delivered */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-teal-500/10 text-teal-500">
              <CheckCheck className="size-4" />
            </div>
            <span className="text-xs text-muted-foreground">Delivered</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground tabular-nums">
            {broadcast.delivered_count.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full"
                style={{
                  width: `${broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.delivered_count / broadcast.total_recipients) * 100)) : 0}%`,
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.delivered_count / broadcast.total_recipients) * 100)) : 0}%
            </span>
          </div>
        </div>

        {/* 4. Read */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Eye className="size-4" />
            </div>
            <span className="text-xs text-muted-foreground">Read</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground tabular-nums">
            {broadcast.read_count.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{
                  width: `${broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.read_count / broadcast.total_recipients) * 100)) : 0}%`,
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.read_count / broadcast.total_recipients) * 100)) : 0}%
            </span>
          </div>
        </div>

        {/* 5. Reply */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <MessageCircle className="size-4" />
            </div>
            <span className="text-xs text-muted-foreground">Reply</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground tabular-nums">
            {broadcast.replied_count.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{
                  width: `${broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.replied_count / broadcast.total_recipients) * 100)) : 0}%`,
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.replied_count / broadcast.total_recipients) * 100)) : 0}%
            </span>
          </div>
        </div>

        {/* 6. Form */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-500">
              <FileText className="size-4" />
            </div>
            <span className="text-xs text-muted-foreground">Form</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground tabular-nums">0</p>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full w-0" />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">0%</span>
          </div>
        </div>

        {/* 7. Failed */}
        <div className="rounded-xl border border-border bg-card p-3.5 shadow-xs">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
              <AlertCircle className="size-4" />
            </div>
            <span className="text-xs text-muted-foreground">Failed</span>
          </div>
          <p className="mt-2 text-xl font-bold text-foreground tabular-nums">
            {broadcast.failed_count.toLocaleString()}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-red-500 rounded-full"
                style={{
                  width: `${broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.failed_count / broadcast.total_recipients) * 100)) : 0}%`,
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {broadcast.total_recipients > 0 ? Math.min(100, Math.round((broadcast.failed_count / broadcast.total_recipients) * 100)) : 0}%
            </span>
          </div>
        </div>
      </div>

      {/* Middle Section: Campaign Details & Performance Overview Bar Chart (SandeshAI Style) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Campaign Details */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-4 flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <h3 className="font-bold text-foreground text-base">Campaign Details</h3>
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4" />
            </div>
          </div>

          <div className="space-y-4 py-4">
            <div className="rounded-xl border border-border/80 bg-muted/30 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Campaign Name
              </span>
              <p className="mt-1 font-semibold text-foreground text-sm">
                {broadcast.name}
              </p>
            </div>

            <div className="rounded-xl border border-border/80 bg-muted/30 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Template Name
              </span>
              <p className="mt-1 font-mono text-primary font-medium text-xs">
                {broadcast.template_name}
              </p>
            </div>

            <div className="rounded-xl border border-border/80 bg-muted/30 p-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Start Date
              </span>
              <p className="mt-1 font-medium text-foreground text-xs">
                {new Date(broadcast.created_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
          </div>

          <div className="border-t border-border pt-3 text-xs text-muted-foreground flex items-center justify-between">
            <span>Status</span>
            <span className="font-semibold text-foreground uppercase">{broadcast.status}</span>
          </div>
        </div>

        {/* Right: Campaign Performance Overview Vertical Bar Chart */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-xs lg:col-span-8">
          <div>
            <h3 className="font-bold text-foreground text-base">
              Campaign Performance Overview
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Visual breakdown of message statuses
            </p>
          </div>

          {/* Vertical Bar Chart */}
          <div className="mt-6 pt-4">
            {(() => {
              const maxVal = Math.max(
                broadcast.total_recipients,
                broadcast.sent_count,
                broadcast.delivered_count,
                broadcast.read_count,
                broadcast.replied_count,
                broadcast.failed_count,
                10,
              );
              const barData = [
                { label: 'Initiated', val: broadcast.total_recipients, color: 'bg-[#6366f1]' },
                { label: 'Sent', val: broadcast.sent_count, color: 'bg-[#f59e0b]' },
                { label: 'Delivered', val: broadcast.delivered_count, color: 'bg-[#334155]' },
                { label: 'Read', val: broadcast.read_count, color: 'bg-[#3b82f6]' },
                { label: 'Reply', val: broadcast.replied_count, color: 'bg-[#10b981]' },
                { label: 'Form', val: 0, color: 'bg-[#8b5cf6]' },
                { label: 'Failed', val: broadcast.failed_count, color: 'bg-[#ef4444]' },
              ];

              return (
                <div className="relative h-64 w-full flex flex-col justify-end">
                  {/* Grid Lines */}
                  <div className="absolute inset-0 flex flex-col justify-between pointer-events-none text-[10px] text-muted-foreground/60">
                    <div className="border-b border-border/40 pb-1 flex justify-between">
                      <span>{maxVal}</span>
                    </div>
                    <div className="border-b border-border/40 pb-1 flex justify-between">
                      <span>{Math.round(maxVal * 0.75)}</span>
                    </div>
                    <div className="border-b border-border/40 pb-1 flex justify-between">
                      <span>{Math.round(maxVal * 0.5)}</span>
                    </div>
                    <div className="border-b border-border/40 pb-1 flex justify-between">
                      <span>{Math.round(maxVal * 0.25)}</span>
                    </div>
                    <div className="border-b border-border/60 pb-1 flex justify-between">
                      <span>0</span>
                    </div>
                  </div>

                  {/* Bars */}
                  <div className="relative z-10 flex items-end justify-around h-52 px-4">
                    {barData.map((bar) => {
                      const heightPct = Math.max(2, Math.round((bar.val / maxVal) * 100));
                      return (
                        <div
                          key={bar.label}
                          className="flex flex-col items-center gap-2 group relative w-10 sm:w-14"
                        >
                          {/* Value Tooltip */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-7 rounded bg-foreground text-background px-1.5 py-0.5 text-[10px] font-bold shadow-xs whitespace-nowrap pointer-events-none">
                            {bar.val.toLocaleString()}
                          </div>
                          {/* Bar */}
                          <div
                            className={`w-full rounded-t-lg ${bar.color} transition-all duration-500 shadow-sm`}
                            style={{ height: `${heightPct}%` }}
                          />
                          {/* Label */}
                          <span className="text-[11px] font-medium text-muted-foreground truncate w-full text-center">
                            {bar.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Recipients Table */}
      <div className="rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">
            {statusFilter !== 'all'
              ? t('recipientsHeader', { filtered: filteredRecipients.length, total: recipients.length })
              : t('recipientsHeaderAll', { total: recipients.length })}
          </h2>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border text-muted-foreground hover:bg-muted"
                  />
                }
              >
                <Filter className="h-3.5 w-3.5" />
                {statusFilter === 'all'
                  ? t('allStatuses')
                  : tStatus(getRecipientStatus(statusFilter).label)}
                <ChevronDown className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="border-border bg-popover">
                <DropdownMenuItem
                  onClick={() => setStatusFilter('all')}
                  className={
                    statusFilter === 'all' ? 'text-primary' : 'text-popover-foreground'
                  }
                >
                  {t('allStatuses')}
                </DropdownMenuItem>
                {RECIPIENT_STATUSES.map((s) => (
                  <DropdownMenuItem
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={
                      statusFilter === s
                        ? 'text-primary'
                        : 'text-popover-foreground'
                    }
                  >
                    {tStatus(getRecipientStatus(s).label)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={recipients.length === 0}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" />
              {t('exportCsv')}
            </Button>
          </div>
        </div>

        {filteredRecipients.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <p className="text-sm text-muted-foreground">
              {recipients.length === 0
                ? t('noRecipients')
                : t('noRecipientsFilter')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">{t('table.contact')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.phone')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.status')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.sent')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.delivered')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.read')}</TableHead>
                  <TableHead className="text-muted-foreground">{t('table.error')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecipients.map((recipient) => {
                  const rStatus = getRecipientStatus(recipient.status);
                  return (
                    <TableRow key={recipient.id} className="border-border">
                      <TableCell className="font-medium text-foreground">
                        {recipient.contact?.name ?? 'Unknown'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.contact?.phone ?? '-'}
                      </TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${rStatus.classes}`}
                        >
                          {tStatus(rStatus.label)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.sent_at
                          ? new Date(recipient.sent_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.delivered_at
                          ? new Date(recipient.delivered_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {recipient.read_at
                          ? new Date(recipient.read_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-xs text-red-400">
                        {recipient.error_message ?? '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

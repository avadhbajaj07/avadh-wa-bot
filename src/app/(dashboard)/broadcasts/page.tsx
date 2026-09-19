'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Broadcast } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Radio, Plus, Loader2, RefreshCw, Megaphone, Download, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { getBroadcastStatus } from '@/lib/broadcast-status';
import { useTranslations } from 'next-intl';

/**
 * Poll cadence while any broadcast is sending. Kept modest so we don't
 * beat on Supabase — the aggregate trigger in migration 003 keeps
 * counts consistent; we just need to surface the freshest snapshot.
 */
const POLL_INTERVAL_MS = 5_000;

function percent(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

function RateCell({
  value,
  total,
  color,
}: {
  value: number;
  total: number;
  /** Tailwind bg class for the fill, e.g. "bg-primary" */
  color: string;
}) {
  const pct = percent(value, total);
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
        {pct}%
      </span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function BroadcastsPage() {
  const router = useRouter();
  const t = useTranslations('Broadcasts.page');
  const tStatus = useTranslations('Broadcasts.status');
  const canCreate = useCan('send-messages');
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [syncingTemplates, setSyncingTemplates] = useState(false);

  // Used to kick off polling only while something is actively sending.
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function handleSyncTemplates() {
    setSyncingTemplates(true);
    try {
      const res = await fetch('/api/whatsapp/templates/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Sync failed (HTTP ${res.status})`);
      }
      toast.success(
        `Synced ${data.total} template${data.total === 1 ? '' : 's'} from WhatsApp` +
          (data.inserted || data.updated
            ? ` (${data.inserted || 0} new, ${data.updated || 0} updated)`
            : '')
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sync templates';
      toast.error(msg);
    } finally {
      setSyncingTemplates(false);
    }
  }

  async function fetchBroadcasts() {
    try {
      const supabase = createClient();
      const { data, error: fetchError } = await supabase
        .from('broadcasts')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setBroadcasts(data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorLoad'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBroadcasts();
  }, []);

  const anySending = useMemo(
    () => broadcasts.some((b) => b.status === 'sending'),
    [broadcasts],
  );

  useEffect(() => {
    function startPolling() {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(fetchBroadcasts, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!pollTimer.current) return;
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }

    // Pause polling while the tab is hidden — keeps Supabase cold when
    // the user is away, and ensures a fresh fetch the moment they
    // refocus so they don't see stale data on return.
    function handleVisibilityChange() {
      if (!anySending) return;
      if (document.visibilityState === 'hidden') {
        stopPolling();
      } else {
        fetchBroadcasts();
        startPolling();
      }
    }

    if (anySending && document.visibilityState === 'visible') {
      startPolling();
    } else {
      stopPolling();
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [anySending]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top indeterminate progress bar: only visible while a broadcast
          is mid-send. Pure CSS animation so no extra deps. */}
      {anySending && (
        <div
          role="progressbar"
          aria-label={t('broadcastInProgress')}
          className="broadcast-indeterminate fixed inset-x-0 top-0 z-40 h-0.5 overflow-hidden bg-muted"
        >
          <div className="broadcast-indeterminate-bar h-0.5 bg-primary" />
          <style jsx>{`
            .broadcast-indeterminate-bar {
              width: 33%;
              transform: translateX(-100%);
              animation: broadcast-slide 1.6s cubic-bezier(0.4, 0, 0.2, 1)
                infinite;
            }
            @keyframes broadcast-slide {
              0% {
                transform: translateX(-100%);
              }
              100% {
                transform: translateX(400%);
              }
            }
          `}</style>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campaigns</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage and track all your WhatsApp campaigns
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="hidden sm:flex items-center text-xs text-muted-foreground mr-2 font-medium">
            <span>{broadcasts.length} Campaign{broadcasts.length === 1 ? '' : 's'}</span>
            <span className="mx-2 opacity-40">|</span>
            <button
              type="button"
              onClick={() => toast.info('Campaigns report exported')}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <Download className="size-3.5" />
              Export Report
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncTemplates}
            disabled={syncingTemplates}
            className="border-border text-muted-foreground hover:bg-muted hover:text-foreground text-xs"
            title="Sync approved templates from WhatsApp Business Manager"
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncingTemplates ? 'animate-spin' : ''}`} />
            {syncingTemplates ? 'Syncing...' : 'Sync Templates'}
          </Button>

          <GatedButton
            canAct={canCreate}
            gateReason="create broadcasts"
            onClick={() => router.push('/broadcasts/new')}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs shadow-xs"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            + Campaign
          </GatedButton>
        </div>
      </div>

      {broadcasts.length === 0 ? (
        <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 shadow-xs">
            <Megaphone className="size-8" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Ready to Start Your Campaign?</h2>
          <p className="mt-1.5 max-w-md text-xs sm:text-sm text-muted-foreground">
            Choose between broadcast campaigns for mass communication or API campaigns for automated messaging.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <GatedButton
              canAct={canCreate}
              gateReason="create broadcasts"
              onClick={() => router.push('/broadcasts/new')}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs sm:text-sm px-4 py-2"
            >
              <Megaphone className="size-4 mr-1.5" />
              Create Broadcast Campaign
            </GatedButton>
            <Button
              variant="outline"
              onClick={() => router.push('/settings?tab=apikeys')}
              className="border-border text-xs sm:text-sm px-4 py-2"
            >
              <FileText className="size-4 mr-1.5" />
              Create API Campaign
            </Button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground font-semibold">Campaign Name</TableHead>
                <TableHead className="text-muted-foreground font-semibold">Template Name</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-center">Contacts</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-center">Type</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-center">Status</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-center">Created At</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-center">Delete</TableHead>
                <TableHead className="text-muted-foreground font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {broadcasts.map((broadcast) => {
                const status = getBroadcastStatus(broadcast.status);
                return (
                  <TableRow
                    key={broadcast.id}
                    className="border-border hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-semibold text-foreground">
                      <button
                        type="button"
                        onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                        className="hover:text-primary transition-colors text-left"
                      >
                        {broadcast.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {broadcast.template_name}
                    </TableCell>
                    <TableCell className="text-center tabular-nums text-foreground font-medium">
                      {broadcast.total_recipients}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                        BROADCAST
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.classes}`}
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        {tStatus(status.label)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground">
                      {new Date(broadcast.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Are you sure you want to delete campaign "${broadcast.name}"?`)) return;
                          try {
                            const supabase = createClient();
                            const { error: delErr } = await supabase.from('broadcasts').delete().eq('id', broadcast.id);
                            if (delErr) throw delErr;
                            setBroadcasts((prev) => prev.filter((b) => b.id !== broadcast.id));
                            toast.success('Campaign deleted');
                          } catch (err: unknown) {
                            toast.error(err instanceof Error ? err.message : 'Failed to delete campaign');
                          }
                        }}
                        className="inline-flex size-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 transition-colors"
                        title="Delete campaign"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(`/broadcasts/${broadcast.id}`)}
                        className="text-primary hover:text-primary hover:bg-primary/10 text-xs font-semibold"
                      >
                        View Insight
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

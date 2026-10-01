'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Users,
  Megaphone,
  Download,
  Copy,
  Search,
  MessageSquare,
  Sparkles,
  MousePointerClick,
  CheckCircle2,
  Loader2,
  TrendingUp,
  Flame,
  Filter,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { LeadContact, ActionBreakdownItem } from '@/app/api/contacts/leads/route';

const BUTTON_BADGE_COLORS = [
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
  'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
  'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
  'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  'bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30',
  'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30',
];

function getButtonColorClass(index: number) {
  return BUTTON_BADGE_COLORS[index % BUTTON_BADGE_COLORS.length];
}

export default function LeadsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadContact[]>([]);
  const [counts, setCounts] = useState<{
    total: number;
    buttons: number;
    replies: number;
    byAction?: Record<string, number>;
  }>({ total: 0, buttons: 0, replies: 0 });
  const [actionBreakdown, setActionBreakdown] = useState<ActionBreakdownItem[]>([]);
  const [search, setSearch] = useState('');
  const [days, setDays] = useState<'1' | '2' | '7' | 'all'>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [copied, setCopied] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/contacts/leads?days=${days}&filter=${encodeURIComponent(filterAction)}&search=${encodeURIComponent(search)}`
      );
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setCounts(
          data.counts || {
            total: 0,
            buttons: 0,
            replies: 0,
          }
        );
        setActionBreakdown(data.actionBreakdown || []);
      } else {
        toast.error('Failed to load leads');
      }
    } catch (err) {
      console.error('Failed to fetch leads:', err);
      toast.error('Network error while loading leads');
    } finally {
      setLoading(false);
    }
  }, [days, filterAction, search]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Copy all lead numbers
  function handleCopyNumbers() {
    if (leads.length === 0) {
      toast.info('No numbers to copy');
      return;
    }
    const numbers = leads.map((l) => l.phone).join('\n');
    navigator.clipboard.writeText(numbers).then(() => {
      setCopied(true);
      toast.success(`Copied ${leads.length} lead numbers to clipboard!`);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  // Export CSV
  function handleExportCsv() {
    if (leads.length === 0) {
      toast.info('No leads to export');
      return;
    }
    const headers = [
      'Phone',
      'Name',
      'Action Type',
      'Button / Response',
      'Snippet',
      'Last Interaction',
    ];
    const rows = leads.map((l) => [
      `"${l.phone}"`,
      `"${l.name || ''}"`,
      `"${l.actionType === 'button' ? 'Button Click' : 'Direct Reply'}"`,
      `"${(l.buttonText || l.actionLabel || '').replace(/"/g, '""')}"`,
      `"${(l.snippet || '').replace(/"/g, '""')}"`,
      `"${new Date(l.lastInteractionAt).toLocaleString()}"`,
    ]);

    const csvContent =
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `leads_${days}days_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Leads CSV downloaded successfully!');
  }

  // Send follow-up broadcast
  function handleSendBroadcast() {
    if (leads.length === 0) {
      toast.info('No leads available to broadcast');
      return;
    }
    const contactsPayload = leads.map((l) => ({
      phone: l.phone,
      name: l.name || undefined,
    }));
    try {
      sessionStorage.setItem(
        'broadcast_lead_contacts',
        JSON.stringify(contactsPayload)
      );
    } catch {}
    router.push('/broadcasts/new?source=leads');
  }

  // Button items and reply items separated
  const buttonItems = useMemo(
    () => actionBreakdown.filter((item) => item.type === 'button'),
    [actionBreakdown]
  );
  const replyItem = useMemo(
    () => actionBreakdown.find((item) => item.type === 'reply'),
    [actionBreakdown]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Campaign Leads
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Flame className="size-3.5 fill-emerald-500 text-emerald-500" />
              Hot Leads
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Contacts who clicked template buttons or replied to recent campaigns in your account.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={handleSendBroadcast}
            disabled={leads.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-xs"
          >
            <Megaphone className="size-4 mr-2" />
            Send Follow-Up Campaign ({leads.length})
          </Button>

          <Button
            variant="outline"
            onClick={handleCopyNumbers}
            disabled={leads.length === 0}
            className="border-border text-foreground hover:bg-muted"
          >
            {copied ? (
              <CheckCircle2 className="size-4 mr-2 text-emerald-500" />
            ) : (
              <Copy className="size-4 mr-2" />
            )}
            {copied ? 'Copied!' : 'Copy Numbers'}
          </Button>

          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={leads.length === 0}
            className="border-border text-foreground hover:bg-muted"
          >
            <Download className="size-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Dynamic KPI Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {/* Total Leads Card */}
        <div
          onClick={() => setFilterAction('all')}
          className={cn(
            'cursor-pointer rounded-xl border p-4 shadow-xs transition-all',
            filterAction === 'all'
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'border-border bg-card hover:border-primary/50'
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Total Leads ({days === 'all' ? 'All Time' : `Last ${days} Days`})
            </span>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Users className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">
              {counts.total}
            </span>
            <span className="text-xs text-muted-foreground">active responders</span>
          </div>
        </div>

        {/* Dynamic Cards for each Button clicked in this account */}
        {buttonItems.map((item, idx) => {
          const isSelected = filterAction === item.key;
          const colorClass = getButtonColorClass(idx);
          return (
            <div
              key={item.key}
              onClick={() =>
                setFilterAction(filterAction === item.key ? 'all' : item.key)
              }
              className={cn(
                'cursor-pointer rounded-xl border p-4 shadow-xs transition-all relative overflow-hidden',
                isSelected
                  ? 'border-primary bg-primary/10 ring-1 ring-primary'
                  : 'border-border bg-card hover:border-primary/50'
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <span
                  className="text-xs font-medium truncate max-w-[80%]"
                  title={item.buttonText || item.label}
                >
                  Clicked &ldquo;{item.buttonText || item.label}&rdquo;
                </span>
                <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
                  <MousePointerClick className="size-4" />
                </div>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-foreground">
                  {item.count}
                </span>
                <span className="text-xs text-muted-foreground">
                  button {item.count === 1 ? 'click' : 'clicks'}
                </span>
              </div>
            </div>
          );
        })}

        {/* Direct Replies Card */}
        {replyItem && (
          <div
            onClick={() =>
              setFilterAction(filterAction === 'reply' ? 'all' : 'reply')
            }
            className={cn(
              'cursor-pointer rounded-xl border p-4 shadow-xs transition-all',
              filterAction === 'reply'
                ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
                : 'border-border bg-card hover:border-indigo-500/50'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                Direct Replies
              </span>
              <div className="rounded-lg bg-indigo-500/10 p-2 text-indigo-500">
                <MessageSquare className="size-4" />
              </div>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-foreground">
                {replyItem.count}
              </span>
              <span className="text-xs text-muted-foreground">custom messages</span>
            </div>
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-border bg-card p-3 shadow-xs">
        {/* Search */}
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by phone, name, or button..."
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Timeframe selector */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDays('1')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                days === '1'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              24h
            </button>
            <button
              type="button"
              onClick={() => setDays('2')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                days === '2'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              2 Days
            </button>
            <button
              type="button"
              onClick={() => setDays('7')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                days === '7'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setDays('all')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                days === 'all'
                  ? 'bg-card text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Dynamic Action Filter Pills */}
          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterAction('all')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                filterAction === 'all'
                  ? 'bg-card text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({counts.total})
            </button>

            {actionBreakdown.map((item) => {
              const isSelected = filterAction === item.key;
              const isButton = item.type === 'button';
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilterAction(isSelected ? 'all' : item.key)}
                  className={cn(
                    'rounded-md px-2.5 py-1 font-medium transition-colors flex items-center gap-1.5',
                    isSelected
                      ? 'bg-card text-primary font-semibold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  title={item.buttonText || item.label}
                >
                  {isButton ? (
                    <MousePointerClick className="size-3 text-primary shrink-0" />
                  ) : (
                    <MessageSquare className="size-3 shrink-0" />
                  )}
                  <span className="max-w-[140px] truncate">
                    {item.buttonText || item.label}
                  </span>
                  <span className="text-[10px] opacity-75">({item.count})</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">
              Loading leads...
            </span>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-muted p-3 text-muted-foreground">
              <Users className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              No leads found
            </h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {filterAction !== 'all'
                ? `No contacts matched the filter "${filterAction}". Try selecting "All" above.`
                : days === 'all'
                ? 'No campaign leads or responders found in this account.'
                : `No contacts responded in the selected timeframe (${days} days). Try switching to "All Time".`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-12 text-center text-xs font-semibold">
                    #
                  </TableHead>
                  <TableHead className="text-xs font-semibold">Contact</TableHead>
                  <TableHead className="text-xs font-semibold">Phone Number</TableHead>
                  <TableHead className="text-xs font-semibold">
                    Button Clicked / Action
                  </TableHead>
                  <TableHead className="text-xs font-semibold">
                    Last Message Snippet
                  </TableHead>
                  <TableHead className="text-xs font-semibold">
                    Last Interaction
                  </TableHead>
                  <TableHead className="text-right text-xs font-semibold">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead, idx) => {
                  const isButton = lead.actionType === 'button';
                  const buttonLabel = lead.buttonText || lead.actionLabel;
                  return (
                    <TableRow
                      key={lead.id}
                      className="hover:bg-muted/40 transition-colors"
                    >
                      <TableCell className="text-center text-xs text-muted-foreground font-mono">
                        {idx + 1}
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-foreground">
                            {lead.name || 'Unnamed Contact'}
                          </span>
                          {lead.tags && lead.tags.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {lead.tags.map((t) => (
                                <span
                                  key={t.id}
                                  className="inline-block rounded px-1.5 py-0.2 text-[9px] font-medium"
                                  style={{
                                    backgroundColor: `${t.color || '#6366f1'}20`,
                                    color: t.color || '#6366f1',
                                  }}
                                >
                                  {t.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {lead.phone}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {isButton ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold shadow-2xs',
                                getButtonColorClass(idx)
                              )}
                            >
                              <MousePointerClick className="size-3 shrink-0" />
                              <span className="truncate max-w-[200px]" title={buttonLabel}>
                                {buttonLabel}
                              </span>
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground border-border"
                            >
                              <MessageSquare className="size-3 shrink-0" />
                              <span>Direct Reply</span>
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>
                        <span
                          className="text-xs text-muted-foreground truncate max-w-[240px] block"
                          title={lead.snippet}
                        >
                          &ldquo;{lead.snippet}&rdquo;
                        </span>
                      </TableCell>

                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {new Date(lead.lastInteractionAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </TableCell>

                      <TableCell className="text-right">
                        {lead.conversationId ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              router.push(`/inbox?c=${lead.conversationId}`)
                            }
                            className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                          >
                            <MessageSquare className="size-3 mr-1" />
                            Chat
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              router.push(
                                `/contacts?search=${encodeURIComponent(lead.phone)}`
                              )
                            }
                            className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          >
                            View
                          </Button>
                        )}
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

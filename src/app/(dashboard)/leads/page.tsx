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
  Calendar,
  Filter,
  CheckCircle2,
  PhoneCall,
  Loader2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Flame,
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
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import type { LeadContact } from '@/app/api/contacts/leads/route';

export default function LeadsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadContact[]>([]);
  const [counts, setCounts] = useState({ total: 0, register: 0, session: 0 });
  const [search, setSearch] = useState('');
  const [days, setDays] = useState<'1' | '2' | '7' | 'all'>('2');
  const [filterAction, setFilterAction] = useState<'all' | 'register' | 'session'>('all');
  const [copied, setCopied] = useState(false);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/leads?days=${days}&filter=${filterAction}&search=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setCounts(data.counts || { total: 0, register: 0, session: 0 });
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
    const headers = ['Phone', 'Name', 'Action', 'Snippet', 'Last Interaction'];
    const rows = leads.map((l) => [
      `"${l.phone}"`,
      `"${l.name || ''}"`,
      `"${l.actionLabel}"`,
      `"${(l.snippet || '').replace(/"/g, '""')}"`,
      `"${new Date(l.lastInteractionAt).toLocaleString()}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `leads_${days}days_${new Date().toISOString().slice(0, 10)}.csv`);
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
      sessionStorage.setItem('broadcast_lead_contacts', JSON.stringify(contactsPayload));
    } catch {}
    router.push('/broadcasts/new?source=leads');
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Campaign Leads</h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              <Flame className="size-3.5 fill-emerald-500 text-emerald-500" />
              Hot Leads
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Contacts who clicked &quot;Register Now&quot; or &quot;Session Details&quot; in recent campaigns.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={handleSendBroadcast}
            disabled={leads.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
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
            {copied ? <CheckCircle2 className="size-4 mr-2 text-emerald-500" /> : <Copy className="size-4 mr-2" />}
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

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Total Leads */}
        <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Leads ({days === 'all' ? 'All Time' : `Last ${days} Days`})</span>
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Users className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground">{counts.total}</span>
            <span className="text-xs text-muted-foreground">active responders</span>
          </div>
        </div>

        {/* Clicked Register */}
        <div
          onClick={() => setFilterAction(filterAction === 'register' ? 'all' : 'register')}
          className={`cursor-pointer rounded-xl border p-4 shadow-xs transition-all ${
            filterAction === 'register'
              ? 'border-emerald-500 bg-emerald-500/10'
              : 'border-border bg-card hover:border-emerald-500/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Clicked &quot;Register Now&quot;</span>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{counts.register}</span>
            <span className="text-xs text-muted-foreground">high intent</span>
          </div>
        </div>

        {/* Clicked Session Details */}
        <div
          onClick={() => setFilterAction(filterAction === 'session' ? 'all' : 'session')}
          className={`cursor-pointer rounded-xl border p-4 shadow-xs transition-all ${
            filterAction === 'session'
              ? 'border-cyan-500 bg-cyan-500/10'
              : 'border-border bg-card hover:border-cyan-500/50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">Clicked &quot;Session Details&quot;</span>
            <div className="rounded-lg bg-cyan-500/10 p-2 text-cyan-600 dark:text-cyan-400">
              <Sparkles className="size-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{counts.session}</span>
            <span className="text-xs text-muted-foreground">inquired for info</span>
          </div>
        </div>
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
            placeholder="Search by phone or name..."
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
                days === '1' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              24h
            </button>
            <button
              type="button"
              onClick={() => setDays('2')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                days === '2' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              2 Days
            </button>
            <button
              type="button"
              onClick={() => setDays('7')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                days === '7' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setDays('all')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                days === 'all' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All Time
            </button>
          </div>

          {/* Action filter */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setFilterAction('all')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                filterAction === 'all' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterAction('register')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                filterAction === 'register' ? 'bg-card text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Register ({counts.register})
            </button>
            <button
              type="button"
              onClick={() => setFilterAction('session')}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                filterAction === 'session' ? 'bg-card text-cyan-600 dark:text-cyan-400 font-semibold shadow-xs' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Session Details ({counts.session})
            </button>
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading leads...</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="rounded-full bg-muted p-3 text-muted-foreground">
              <Users className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">No leads found</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-sm">
              {days === 'all'
                ? 'No contacts have clicked Register Now or Session Details yet.'
                : `No contacts clicked Register Now or Session Details in the selected timeframe (${days} days). Try switching to "7 Days" or "All Time".`}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                  <TableHead className="text-xs font-semibold">Contact</TableHead>
                  <TableHead className="text-xs font-semibold">Phone Number</TableHead>
                  <TableHead className="text-xs font-semibold">Action / Response</TableHead>
                  <TableHead className="text-xs font-semibold">Last Interaction</TableHead>
                  <TableHead className="text-right text-xs font-semibold">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead, idx) => (
                  <TableRow key={lead.id} className="hover:bg-muted/40 transition-colors">
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
                                style={{ backgroundColor: `${t.color || '#6366f1'}20`, color: t.color || '#6366f1' }}
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
                        {lead.action === 'register' ? (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px]">
                            Register Now
                          </Badge>
                        ) : (
                          <Badge className="bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 text-[10px]">
                            Session Details
                          </Badge>
                        )}
                        {lead.snippet && lead.snippet.toLowerCase() !== lead.action && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                            &quot;{lead.snippet}&quot;
                          </span>
                        )}
                      </div>
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
                          onClick={() => router.push(`/inbox?conversationId=${lead.conversationId}`)}
                          className="h-7 text-xs text-primary hover:text-primary hover:bg-primary/10"
                        >
                          <MessageSquare className="size-3 mr-1" />
                          Chat
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push(`/contacts?search=${encodeURIComponent(lead.phone)}`)}
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        >
                          View
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

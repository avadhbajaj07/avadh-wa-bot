'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import type { Contact, Tag, ContactTag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Search,
  Plus,
  Upload,
  Download,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Users,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Filter,
  X,
  MessageSquare,
  Sparkles,
  CheckSquare,
  Megaphone,
  ClipboardPaste,
} from 'lucide-react';
import { ContactForm } from '@/components/contacts/contact-form';
import { ContactDetailView } from '@/components/contacts/contact-detail-view';
import { ImportModal } from '@/components/contacts/import-modal';
import { CustomFieldsManager } from '@/components/contacts/custom-fields-manager';
import { useCan } from '@/hooks/use-can';
import { GatedButton } from '@/components/ui/gated-button';
import { useTranslations } from 'next-intl';

const PAGE_SIZE = 25;

interface ContactWithTags extends Contact {
  tags?: Tag[];
  conversationId?: string | null;
  hasMessages?: boolean;
}

export default function ContactsPage() {
  const t = useTranslations('Contacts.page');
  const router = useRouter();
  const supabase = createClient();
  const canEdit = useCan('send-messages');
  const canEditSettings = useCan('edit-settings');

  const [contacts, setContacts] = useState<ContactWithTags[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // Status filter: all | active (has conversation) | leads (campaign clicks) | unused (never contacted)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'leads' | 'unused'>('all');
  const [unusedStats, setUnusedStats] = useState<{ count: number; ids: string[] }>({
    count: 0,
    ids: [],
  });
  const [leadsStats, setLeadsStats] = useState<{
    count: number;
    registerCount: number;
    sessionCount: number;
    leads: any[];
  }>({
    count: 0,
    registerCount: 0,
    sessionCount: 0,
    leads: [],
  });
  const [leadTimeframe, setLeadTimeframe] = useState<'1' | '2' | '7' | 'all'>('2');
  const [leadActionFilter, setLeadActionFilter] = useState<'all' | 'register' | 'session'>('all');
  const [cleanUpModalOpen, setCleanUpModalOpen] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  // Tag filter — contacts shown must have ANY of these tags (OR).
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  // Modals
  const [formOpen, setFormOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [editContactTags, setEditContactTags] = useState<ContactTag[]>([]);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailContactId, setDetailContactId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [customFieldsOpen, setCustomFieldsOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk selection (page-scoped or all-matching)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  // All tags for display
  const [tagsMap, setTagsMap] = useState<Record<string, Tag>>({});

  // Guards against out-of-order fetch responses: each fetchContacts run
  // claims a sequence number and only the latest is allowed to commit its
  // results. Without this, rapidly toggling tag filters could let a slower
  // earlier request resolve last and render stale rows.
  const fetchSeq = useRef(0);

  const fetchTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('*');
    if (data) {
      const map: Record<string, Tag> = {};
      data.forEach((t) => (map[t.id] = t));
      setTagsMap(map);
      // Drop any filter selections whose tag no longer exists (e.g. a tag
      // deleted elsewhere) so it can't linger invisibly in the query.
      setSelectedTagIds((prev) => {
        const pruned = prev.filter((id) => map[id]);
        return pruned.length === prev.length ? prev : pruned;
      });
    }
  }, [supabase]);

  const fetchUnusedStats = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts/unused');
      if (res.ok) {
        const data = await res.json();
        setUnusedStats({
          count: data.count || 0,
          ids: data.ids || [],
        });
      }
    } catch (err) {
      console.error('Failed to fetch unused stats:', err);
    }
  }, []);

  const fetchLeadsStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/contacts/leads?days=${leadTimeframe}&filter=${leadActionFilter}`);
      if (res.ok) {
        const data = await res.json();
        setLeadsStats({
          count: data.counts?.total || 0,
          registerCount: data.counts?.register || 0,
          sessionCount: data.counts?.session || 0,
          leads: data.leads || [],
        });
      }
    } catch (err) {
      console.error('Failed to fetch leads stats:', err);
    }
  }, [leadTimeframe, leadActionFilter]);

  const fetchContacts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    // The visible rows are about to change — drop any selection that
    // referred to the old page/search results so the bulk bar can't
    // act on rows the user can no longer see.
    setSelected(new Set());

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const term = search.trim();

    let contactRows: Contact[] = [];
    let count: number = 0;

    if (selectedTagIds.length > 0) {
      // Tag filter active — resolve it server-side (join + distinct +
      // windowed total count + pagination)
      const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
        p_tag_ids: selectedTagIds,
        p_search: term || null,
        p_limit: PAGE_SIZE,
        p_offset: from,
      });
      if (seq !== fetchSeq.current) return;
      if (error) {
        toast.error(t('toastFailedLoad'));
        setLoading(false);
        return;
      }
      const rows = (data ?? []) as { contact: Contact; total_count: number }[];
      contactRows = rows.map((r) => r.contact);
      count = rows.length > 0 ? Number(rows[0].total_count) : 0;
    } else if (statusFilter === 'unused') {
      let uIds = unusedStats.ids;
      if (uIds.length === 0 && unusedStats.count === 0) {
        try {
          const res = await fetch('/api/contacts/unused');
          if (res.ok) {
            const data = await res.json();
            uIds = data.ids || [];
            setUnusedStats(data);
          }
        } catch {}
      }

      if (uIds.length === 0) {
        contactRows = [];
        count = 0;
      } else if (term) {
        const like = `%${term}%`;
        const { data, count: matchCount, error } = await supabase
          .from('contacts')
          .select('*', { count: 'exact' })
          .in('id', uIds)
          .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (seq !== fetchSeq.current) return;
        if (error) {
          toast.error(t('toastFailedLoad'));
          setLoading(false);
          return;
        }
        contactRows = data ?? [];
        count = matchCount ?? 0;
      } else {
        const pageIds = uIds.slice(from, to + 1);
        count = uIds.length;
        if (pageIds.length > 0) {
          const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .in('id', pageIds)
            .order('created_at', { ascending: false });
          if (seq !== fetchSeq.current) return;
          if (error) {
            toast.error(t('toastFailedLoad'));
            setLoading(false);
            return;
          }
          contactRows = data ?? [];
        } else {
          contactRows = [];
        }
      }
    } else if (statusFilter === 'active') {
      const { data: convsWithMsgs } = await supabase
        .from('conversations')
        .select('contact_id')
        .or('last_message_at.not.is.null,last_message_text.not.is.null');

      const activeIds = Array.from(
        new Set((convsWithMsgs ?? []).map((c) => c.contact_id).filter(Boolean) as string[])
      );

      if (activeIds.length === 0) {
        contactRows = [];
        count = 0;
      } else if (term) {
        const like = `%${term}%`;
        const { data, count: matchCount, error } = await supabase
          .from('contacts')
          .select('*', { count: 'exact' })
          .in('id', activeIds)
          .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
          .order('created_at', { ascending: false })
          .range(from, to);
        if (seq !== fetchSeq.current) return;
        if (error) {
          toast.error(t('toastFailedLoad'));
          setLoading(false);
          return;
        }
        contactRows = data ?? [];
        count = matchCount ?? 0;
      } else {
        const pageIds = activeIds.slice(from, to + 1);
        count = activeIds.length;
        if (pageIds.length > 0) {
          const { data, error } = await supabase
            .from('contacts')
            .select('*')
            .in('id', pageIds)
            .order('created_at', { ascending: false });
          if (seq !== fetchSeq.current) return;
          if (error) {
            toast.error(t('toastFailedLoad'));
            setLoading(false);
            return;
          }
          contactRows = data ?? [];
        } else {
          contactRows = [];
        }
      }
    } else if (statusFilter === 'leads') {
      let leadList = leadsStats.leads;
      if (leadList.length === 0 && leadsStats.count === 0) {
        try {
          const res = await fetch(`/api/contacts/leads?days=${leadTimeframe}&filter=${leadActionFilter}`);
          if (res.ok) {
            const data = await res.json();
            leadList = data.leads || [];
            setLeadsStats({
              count: data.counts?.total || 0,
              registerCount: data.counts?.register || 0,
              sessionCount: data.counts?.session || 0,
              leads: leadList,
            });
          }
        } catch {}
      }

      if (term) {
        leadList = leadList.filter(
          (l: any) =>
            l.phone.toLowerCase().includes(term.toLowerCase()) ||
            (l.name && l.name.toLowerCase().includes(term.toLowerCase()))
        );
      }

      count = leadList.length;
      contactRows = leadList.slice(from, to + 1) as unknown as Contact[];
    } else {
      let query = supabase
        .from('contacts')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (term) {
        const like = `%${term}%`;
        query = query.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
      }

      const { data, count: exactCount, error } = await query;
      if (seq !== fetchSeq.current) return;
      if (error) {
        toast.error(t('toastFailedLoad'));
        setLoading(false);
        return;
      }
      contactRows = data ?? [];
      count = exactCount ?? 0;
    }

    setTotalCount(count);

    if (contactRows.length === 0) {
      setContacts([]);
      setLoading(false);
      return;
    }

    // Fetch tags and conversations for these contacts in parallel
    const contactIds = contactRows.map((c) => c.id);
    const [tagsRes, convRes] = await Promise.all([
      supabase
        .from('contact_tags')
        .select('contact_id, tag_id')
        .in('contact_id', contactIds),
      supabase
        .from('conversations')
        .select('id, contact_id, last_message_at, last_message_text')
        .in('contact_id', contactIds),
    ]);

    if (seq !== fetchSeq.current) return;

    const tagsByContact: Record<string, string[]> = {};
    tagsRes.data?.forEach((ct) => {
      if (!tagsByContact[ct.contact_id]) tagsByContact[ct.contact_id] = [];
      tagsByContact[ct.contact_id].push(ct.tag_id);
    });

    const convByContact: Record<string, { id: string; hasMessages: boolean }> = {};
    convRes.data?.forEach((conv) => {
      convByContact[conv.contact_id] = {
        id: conv.id,
        hasMessages: Boolean(conv.last_message_at || conv.last_message_text),
      };
    });

    const enriched: ContactWithTags[] = contactRows.map((c) => ({
      ...c,
      tags: (tagsByContact[c.id] ?? [])
        .map((tid) => tagsMap[tid])
        .filter(Boolean),
      conversationId: convByContact[c.id]?.id ?? null,
      hasMessages: convByContact[c.id]?.hasMessages ?? false,
    }));

    setContacts(enriched);
    setLoading(false);
  }, [supabase, page, search, selectedTagIds, statusFilter, unusedStats, leadsStats, leadTimeframe, leadActionFilter, tagsMap, t]);

  useEffect(() => {
    fetchTags();
    fetchUnusedStats();
    fetchLeadsStats();
  }, [fetchTags, fetchUnusedStats, fetchLeadsStats]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  function openAddForm() {
    setEditContact(null);
    setEditContactTags([]);
    setFormOpen(true);
  }

  async function openEditForm(contact: Contact) {
    const { data } = await supabase
      .from('contact_tags')
      .select('*')
      .eq('contact_id', contact.id);
    setEditContact(contact);
    setEditContactTags(data ?? []);
    setFormOpen(true);
  }

  function openDetail(contactId: string) {
    setDetailContactId(contactId);
    setDetailOpen(true);
  }

  function confirmDelete(contact: Contact) {
    setDeleteTarget(contact);
    setDeleteConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast.error(t('toastFailedDelete'));
    } else {
      toast.success(t('toastDeleted'));
      fetchContacts();
      fetchUnusedStats();
    }

    setDeleting(false);
    setDeleteConfirmOpen(false);
    setDeleteTarget(null);
  }

  const allOnPageSelected =
    contacts.length > 0 && contacts.every((c) => selected.has(c.id));
  const someOnPageSelected = contacts.some((c) => selected.has(c.id));
  const isAllMatchingSelected = totalCount > 0 && selected.size === totalCount;

  function toggleSelectAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) {
        contacts.forEach((c) => next.delete(c.id));
      } else {
        contacts.forEach((c) => next.add(c.id));
      }
      return next;
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const fetchAllContactIds = useCallback(async (): Promise<string[]> => {
    const term = search.trim();

    if (selectedTagIds.length > 0) {
      const { data, error } = await supabase.rpc('filter_contacts_by_tags', {
        p_tag_ids: selectedTagIds,
        p_search: term || null,
        p_limit: 10000,
        p_offset: 0,
      });
      if (error) throw error;
      const rows = (data ?? []) as { contact: Contact }[];
      return rows.map((r) => r.contact.id);
    }

    if (statusFilter === 'unused') {
      let uIds = unusedStats.ids;
      if (uIds.length === 0 && unusedStats.count > 0) {
        try {
          const res = await fetch('/api/contacts/unused');
          if (res.ok) {
            const d = await res.json();
            uIds = d.ids || [];
          }
        } catch {}
      }
      if (!term) return uIds;
      const like = `%${term}%`;
      const { data, error } = await supabase
        .from('contacts')
        .select('id')
        .in('id', uIds)
        .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .limit(10000);
      if (error) throw error;
      return (data ?? []).map((c) => c.id);
    }

    if (statusFilter === 'active') {
      const { data: convsWithMsgs } = await supabase
        .from('conversations')
        .select('contact_id')
        .or('last_message_at.not.is.null,last_message_text.not.is.null');

      const activeIds = Array.from(
        new Set((convsWithMsgs ?? []).map((c) => c.contact_id).filter(Boolean) as string[])
      );
      if (!term) return activeIds;
      const like = `%${term}%`;
      const { data, error } = await supabase
        .from('contacts')
        .select('id')
        .in('id', activeIds)
        .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .limit(10000);
      if (error) throw error;
      return (data ?? []).map((c) => c.id);
    }

    let q = supabase.from('contacts').select('id');
    if (term) {
      const like = `%${term}%`;
      q = q.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`);
    }
    const { data, error } = await q.limit(10000);
    if (error) throw error;
    return (data ?? []).map((c) => c.id);
  }, [supabase, search, selectedTagIds, statusFilter, unusedStats]);

  async function handleSelectAllToggle() {
    if (selected.size === totalCount && totalCount > 0) {
      setSelected(new Set());
      return;
    }

    setSelectingAll(true);
    try {
      if (totalCount <= contacts.length) {
        setSelected(new Set(contacts.map((c) => c.id)));
        return;
      }

      const allIds = await fetchAllContactIds();
      setSelected(new Set(allIds));
      toast.success(`Selected all ${allIds.length} contacts`);
    } catch (err) {
      console.error('Failed to select all contacts:', err);
      setSelected(new Set(contacts.map((c) => c.id)));
    } finally {
      setSelectingAll(false);
    }
  }

  async function handleSelectAllMatching() {
    setSelectingAll(true);
    try {
      const allIds = await fetchAllContactIds();
      setSelected(new Set(allIds));
      toast.success(`Selected all ${allIds.length} contacts`);
    } catch (err) {
      console.error('Failed to select all contacts:', err);
      toast.error('Could not select all contacts');
    } finally {
      setSelectingAll(false);
    }
  }

  function handleOpenBulkDeleteModal() {
    setBulkDeleteOpen(true);
  }

  async function handleDeleteAllMatching() {
    setDeleting(true);
    try {
      let idsToDelete: string[] = [];
      if (selected.size > 0) {
        idsToDelete = [...selected];
      } else {
        idsToDelete = await fetchAllContactIds();
      }

      if (idsToDelete.length === 0) {
        toast.error('No contacts to delete');
        setDeleting(false);
        return;
      }

      const BATCH_SIZE = 100;
      let deleted = 0;
      for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const batch = idsToDelete.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('contacts').delete().in('id', batch);
        if (error) throw error;
        deleted += batch.length;
      }

      toast.success(t('toastBulkDeleted', { count: deleted }));
      setSelected(new Set());
      setBulkDeleteOpen(false);
      await fetchUnusedStats();
      fetchContacts();
    } catch (err) {
      console.error('Failed to bulk delete contacts:', err);
      toast.error(t('toastBulkFailedDelete'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeletePage() {
    if (contacts.length === 0) return;
    setDeleting(true);
    try {
      const idsToDelete = contacts.map((c) => c.id);
      const BATCH_SIZE = 100;
      let deleted = 0;
      for (let i = 0; i < idsToDelete.length; i += BATCH_SIZE) {
        const batch = idsToDelete.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('contacts').delete().in('id', batch);
        if (error) throw error;
        deleted += batch.length;
      }

      toast.success(t('toastBulkDeleted', { count: deleted }));
      setSelected(new Set());
      setBulkDeleteOpen(false);
      await fetchUnusedStats();
      fetchContacts();
    } catch (err) {
      console.error('Failed to bulk delete page contacts:', err);
      toast.error(t('toastBulkFailedDelete'));
    } finally {
      setDeleting(false);
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setDeleting(true);

    try {
      // Safe batch deletion to prevent statement/URL length limits
      const BATCH_SIZE = 100;
      let deleted = 0;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('contacts').delete().in('id', batch);
        if (error) throw error;
        deleted += batch.length;
      }

      toast.success(t('toastBulkDeleted', { count: deleted }));
      setSelected(new Set());
      fetchContacts();
      fetchUnusedStats();
    } catch (err) {
      console.error('Failed to bulk delete contacts:', err);
      toast.error(t('toastBulkFailedDelete'));
    } finally {
      setDeleting(false);
      setBulkDeleteOpen(false);
    }
  }

  async function handleCleanUpUnused() {
    setCleaningUp(true);
    try {
      const res = await fetch('/api/contacts/unused', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete unused contacts');
      }
      toast.success(
        data.deletedCount > 0
          ? `Deleted ${data.deletedCount} unused contacts`
          : 'No unused contacts to delete'
      );
      setCleanUpModalOpen(false);
      await fetchUnusedStats();
      fetchContacts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to clean up unused contacts';
      toast.error(msg);
    } finally {
      setCleaningUp(false);
    }
  }

  async function handleExportCsv() {
    try {
      toast.info('Preparing contacts export...');
      const { data, error } = await supabase
        .from('contacts')
        .select('name, phone, email, company, created_at')
        .order('created_at', { ascending: false })
        .limit(10000);

      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error('No contacts to export');
        return;
      }

      const headers = ['Name', 'Phone', 'Email', 'Company', 'Created At'];
      const rows = data.map((c) => [
        `"${(c.name || '').replace(/"/g, '""')}"`,
        `"${(c.phone || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.company || '').replace(/"/g, '""')}"`,
        `"${new Date(c.created_at).toISOString()}"`,
      ]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `contacts-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${data.length} contacts`);
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export contacts');
    }
  }

  function handleStatusFilterChange(filter: 'all' | 'active' | 'leads' | 'unused') {
    setStatusFilter(filter);
    setPage(0);
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const hasNext = page < totalPages - 1;
  const hasPrev = page > 0;

  // Tag filter helpers. Every change resets to page 0 — the result set
  // shrinks/grows so page N may no longer be valid (mirrors the search box).
  const allTags = Object.values(tagsMap).sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const hasActiveFilters = search.trim().length > 0 || selectedTagIds.length > 0 || statusFilter !== 'all';

  function toggleTagFilter(tagId: string) {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
    setPage(0);
  }

  function clearTagFilters() {
    setSelectedTagIds([]);
    setPage(0);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalCount > 0 ? t('subtitle', { count: totalCount }) : t('subtitleZero')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {totalCount > 0 && (
            <GatedButton
              variant="outline"
              size="sm"
              canAct={canEdit}
              gateReason="delete contacts"
              onClick={handleOpenBulkDeleteModal}
              className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-600 font-medium"
            >
              <Trash2 className="size-3.5 mr-1" />
              Bulk Delete {selected.size > 0 ? `(${selected.size})` : ''}
            </GatedButton>
          )}
          {unusedStats.count > 0 && (
            <GatedButton
              variant="outline"
              size="sm"
              canAct={canEdit}
              gateReason="delete contacts"
              onClick={() => setCleanUpModalOpen(true)}
              className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-600"
            >
              <Trash2 className="size-3.5" />
              Clean Up Unused ({unusedStats.count})
            </GatedButton>
          )}
          {canEditSettings && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCustomFieldsOpen(true)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              <SlidersHorizontal className="size-3.5" />
              {t('customFieldsBtn')}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="border-border text-muted-foreground hover:bg-muted"
          >
            <Download className="size-3.5" />
            Export CSV
          </Button>
          <GatedButton
            variant="outline"
            size="sm"
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={() => setImportOpen(true)}
            className="border-primary/40 text-primary hover:bg-primary/5 font-semibold text-xs"
          >
            <Upload className="size-3.5 mr-1" />
            Import Contacts
          </GatedButton>
          <GatedButton
            size="sm"
            canAct={canEdit}
            gateReason="add or import contacts"
            onClick={openAddForm}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs"
          >
            <Plus className="size-3.5 mr-1" />
            + Add Contact
          </GatedButton>
        </div>
      </div>

      {/* Status Filter Tabs */}
      <Tabs
        value={statusFilter}
        onValueChange={(val) => handleStatusFilterChange(val as 'all' | 'active' | 'leads' | 'unused')}
        className="w-full"
      >
        <TabsList className="bg-muted/50 border border-border">
          <TabsTrigger value="all" className="text-xs">
            All Contacts
            {statusFilter === 'all' && totalCount > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                {totalCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" className="text-xs">
            Active (Has Chat)
          </TabsTrigger>
          <TabsTrigger value="leads" className="text-xs flex items-center gap-1.5 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-300">
            <span>🔥 Leads (Register / Session)</span>
            {leadsStats.count > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                {leadsStats.count}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="unused" className="text-xs flex items-center gap-1.5">
            <span>Unused</span>
            {unusedStats.count > 0 && (
              <span className="rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {unusedStats.count}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Leads filter helper banner */}
      {statusFilter === 'leads' && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs text-emerald-900 dark:text-emerald-200 shadow-xs">
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-semibold text-sm">Campaign Leads ({leadsStats.count})</p>
              <p className="text-emerald-700 dark:text-emerald-300">
                Contacts who clicked &quot;Register Now&quot; ({leadsStats.registerCount}) or &quot;Session Details&quot; ({leadsStats.sessionCount}) in recent campaigns.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              size="sm"
              onClick={() => {
                if (leadsStats.leads.length === 0) {
                  toast.info('No leads available');
                  return;
                }
                const contactsPayload = leadsStats.leads.map((l: any) => ({
                  phone: l.phone,
                  name: l.name || undefined,
                }));
                try {
                  sessionStorage.setItem('broadcast_lead_contacts', JSON.stringify(contactsPayload));
                } catch {}
                router.push('/broadcasts/new?source=leads');
              }}
              className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-sm"
            >
              <Megaphone className="size-3.5 mr-1.5" />
              Send Follow-up Broadcast ({leadsStats.count})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (leadsStats.leads.length === 0) {
                  toast.info('No numbers to copy');
                  return;
                }
                const numbers = leadsStats.leads.map((l: any) => l.phone).join('\n');
                navigator.clipboard.writeText(numbers).then(() => {
                  toast.success(`Copied ${leadsStats.leads.length} lead numbers to clipboard!`);
                });
              }}
              className="h-8 border-emerald-500/40 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-500/20 text-xs"
            >
              <ClipboardPaste className="size-3.5 mr-1" />
              Copy Numbers
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => router.push('/leads')}
              className="h-8 border-emerald-500/40 text-emerald-900 dark:text-emerald-100 hover:bg-emerald-500/20 text-xs"
            >
              View Full Leads Page →
            </Button>
          </div>
        </div>
      )}

      {/* Unused filter helper banner */}
      {statusFilter === 'unused' && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>
              Showing contacts that have never had any conversation or messages exchanged, and have no active deals.
            </span>
          </div>
          {unusedStats.count > 0 && canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCleanUpModalOpen(true)}
              className="h-7 shrink-0 text-xs border-amber-500/40 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
            >
              <Trash2 className="size-3 mr-1" />
              Delete all {unusedStats.count} unused
            </Button>
          )}
        </div>
      )}

      {/* Search + tag filter */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 flex-1">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  // Reset pagination when the query changes — the result
                  // set shrinks/grows, page N may no longer be valid.
                  setPage(0);
                }}
                placeholder="Search by name or number"
                className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground text-xs h-9"
              />
            </div>
            <Button
              size="sm"
              onClick={() => fetchContacts()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold h-9 px-3.5 shadow-xs"
            >
              Search
            </Button>

          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="border-border text-muted-foreground hover:bg-muted shrink-0"
                />
              }
            >
              <Filter className="size-4" />
              {t('filterByTags')}
              {selectedTagIds.length > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                  {selectedTagIds.length}
                </span>
              )}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-64 p-0">
              <div className="flex items-center justify-between px-3 py-2 border-b border-border">
                <span className="text-sm font-medium text-popover-foreground">
                  {t('filterByTags')}
                </span>
                {selectedTagIds.length > 0 && (
                  <button
                    onClick={clearTagFilters}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t('clearAll')}
                  </button>
                )}
              </div>
              {allTags.length === 0 ? (
                <p className="px-3 py-4 text-sm text-muted-foreground text-center">
                  {t('noTagsYet')}
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto py-1">
                  {allTags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={selectedTagIds.includes(tag.id)}
                        onCheckedChange={() => toggleTagFilter(tag.id)}
                        aria-label={`Filter by ${tag.name}`}
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span className="text-sm text-popover-foreground truncate">
                        {tag.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>

          {/* 1-Click Select All Button */}
          {totalCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSelectAllToggle}
              disabled={loading || selectingAll}
              className={`border-border text-xs shrink-0 ${
                isAllMatchingSelected
                  ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
              title="Select all contacts in one click"
            >
              {selectingAll ? (
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
              ) : (
                <CheckSquare className="size-3.5 mr-1.5" />
              )}
              {isAllMatchingSelected
                ? `Deselect All (${selected.size})`
                : selected.size > 0
                ? `Select All (${totalCount})`
                : `Select All (${totalCount})`}
            </Button>
          )}

          {selected.size > 0 && (
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason="delete contacts"
              onClick={handleOpenBulkDeleteModal}
              className="h-8 text-xs shrink-0 font-medium"
            >
              <Trash2 className="size-3.5 mr-1" />
              Delete ({selected.size})
            </GatedButton>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium self-end sm:self-auto shrink-0">
          <span>{totalCount} Contacts</span>
          <span className="opacity-40">|</span>
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1 hover:text-foreground transition-colors font-semibold text-primary"
          >
            <Download className="size-3.5" />
            Export
          </button>
        </div>
      </div>

        {/* Active tag-filter chips */}
        {selectedTagIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedTagIds.map((id) => {
              const tag = tagsMap[id];
              if (!tag) return null;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
                  style={{
                    backgroundColor: tag.color + '20',
                    color: tag.color,
                  }}
                >
                  {tag.name}
                  <button
                    onClick={() => toggleTagFilter(id)}
                    aria-label={`Remove ${tag.name} filter`}
                    className="hover:opacity-70"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
            <button
              onClick={clearTagFilters}
              className="text-xs text-muted-foreground hover:text-foreground px-1"
            >
              {t('clearAll')}
            </button>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground">
              {t('selectedCount', { count: selected.size })}
              {isAllMatchingSelected && (
                <span className="ml-1.5 text-xs text-primary font-semibold">
                  (all {totalCount} contacts selected)
                </span>
              )}
            </p>
            {totalCount > contacts.length && !isAllMatchingSelected && (
              <button
                type="button"
                onClick={handleSelectAllMatching}
                disabled={selectingAll}
                className="text-xs font-semibold text-primary underline hover:text-primary/80 transition-colors ml-1"
              >
                {selectingAll ? (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="size-3 animate-spin" /> Selecting all...
                  </span>
                ) : (
                  `Select all ${totalCount} contacts in 1 click`
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground h-8 text-xs"
            >
              {t('clearSelection')}
            </Button>
            <GatedButton
              variant="destructive"
              size="sm"
              canAct={canEdit}
              gateReason="delete contacts"
              onClick={() => setBulkDeleteOpen(true)}
              className="h-8 text-xs font-medium"
            >
              <Trash2 className="size-3.5 mr-1" />
              Bulk Delete ({selected.size})
            </GatedButton>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10">
                <Checkbox
                  checked={allOnPageSelected}
                  indeterminate={!allOnPageSelected && someOnPageSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={contacts.length === 0}
                  aria-label={t('selectAllOnPage')}
                />
              </TableHead>
              <TableHead className="text-muted-foreground">{t('tableColumns.name')}</TableHead>
              <TableHead className="text-muted-foreground">{t('tableColumns.phone')}</TableHead>
              <TableHead className="text-muted-foreground">Status</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">{t('tableColumns.email')}</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">{t('tableColumns.company')}</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">{t('tableColumns.tags')}</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">{t('tableColumns.createdAt')}</TableHead>
              <TableHead className="text-muted-foreground w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={9} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{t('loading')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : contacts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={9} className="text-center py-16">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 shadow-xs">
                      <Users className="size-8" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">
                      {hasActiveFilters ? t('noContactsMatch') : 'No contacts added yet'}
                    </h3>
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {hasActiveFilters
                        ? 'Try adjusting your search query or tag filters.'
                        : 'Get started by adding your first contact or import contacts from a spreadsheet.'}
                    </p>
                    <div className="mt-6 flex items-center justify-center gap-2.5">
                      <GatedButton
                        canAct={canEdit}
                        gateReason="add or import contacts"
                        size="sm"
                        onClick={openAddForm}
                        className="bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-semibold shadow-xs"
                      >
                        <Plus className="size-3.5 mr-1" />
                        + Add New Contact
                      </GatedButton>
                      <GatedButton
                        canAct={canEdit}
                        gateReason="add or import contacts"
                        variant="outline"
                        size="sm"
                        onClick={() => setImportOpen(true)}
                        className="border-border text-xs text-foreground hover:bg-muted"
                      >
                        <Upload className="size-3.5 mr-1" />
                        Import Contacts
                      </GatedButton>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              contacts.map((contact) => (
                <TableRow
                  key={contact.id}
                  className="border-border hover:bg-muted/50 cursor-pointer"
                  onClick={() => openDetail(contact.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(contact.id)}
                      onCheckedChange={() => toggleSelect(contact.id)}
                      aria-label={`Select ${contact.name || contact.phone}`}
                    />
                  </TableCell>
                  <TableCell className="text-foreground font-medium">
                    {contact.name || <span className="text-muted-foreground italic">{t('unnamed')}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {contact.phone}
                  </TableCell>
                  <TableCell>
                    {contact.hasMessages ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium inline-flex items-center gap-1"
                      >
                        <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
                        Active
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-border bg-muted/40 text-muted-foreground text-[10px] font-medium inline-flex items-center gap-1"
                      >
                        <span className="size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                        Unused
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell text-sm">
                    {contact.email || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell text-sm">
                    {contact.company || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags && contact.tags.length > 0 ? (
                        contact.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor: tag.color + '20',
                              color: tag.color,
                            }}
                          >
                            {tag.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                      {contact.tags && contact.tags.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs hidden lg:table-cell">
                    {new Date(contact.created_at).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-primary hover:bg-muted"
                        title={contact.conversationId ? "Open chat in Inbox" : "Start chat"}
                        onClick={() => {
                          if (contact.conversationId) {
                            router.push(`/inbox?c=${contact.conversationId}`);
                          } else {
                            openDetail(contact.id);
                          }
                        }}
                      >
                        <MessageSquare className="size-3.5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground hover:text-foreground"
                              onClick={(e) => e.stopPropagation()}
                            />
                          }
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="bg-popover border-border"
                        >
                          <DropdownMenuItem
                            onClick={() => {
                              if (contact.conversationId) {
                                router.push(`/inbox?c=${contact.conversationId}`);
                              } else {
                                openDetail(contact.id);
                              }
                            }}
                            className="text-popover-foreground focus:bg-muted focus:text-foreground"
                          >
                            <MessageSquare className="size-4 mr-2" />
                            {contact.conversationId ? "Open chat" : "Start chat"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openEditForm(contact)}
                            className="text-popover-foreground focus:bg-muted focus:text-foreground"
                          >
                            <Pencil className="size-4 mr-2" />
                            {t('editAction')}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-border" />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => confirmDelete(contact)}
                          >
                            <Trash2 className="size-4 mr-2" />
                            {t('deleteAction')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {t('showingPagination', {
              start: page * PAGE_SIZE + 1,
              end: Math.min((page + 1) * PAGE_SIZE, totalCount),
              total: totalCount
            })}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasPrev}
              onClick={() => setPage((p) => p - 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground px-2">
              {t('pageCount', { page: page + 1, total: totalPages })}
            </span>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={!hasNext}
              onClick={() => setPage((p) => p + 1)}
              className="border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Contact Form Dialog */}
      <ContactForm
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editContact}
        contactTags={editContactTags}
        onSaved={() => {
          fetchContacts();
          fetchTags();
        }}
        onViewExisting={(id) => {
          setFormOpen(false);
          openDetail(id);
        }}
      />

      {/* Contact Detail Sheet */}
      <ContactDetailView
        open={detailOpen}
        onOpenChange={setDetailOpen}
        contactId={detailContactId}
        onUpdated={() => {
          fetchContacts();
          fetchUnusedStats();
        }}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={fetchContacts}
      />

      {/* Custom Fields Manager (admin+) */}
      {canEditSettings && (
        <CustomFieldsManager
          open={customFieldsOpen}
          onOpenChange={setCustomFieldsOpen}
        />
      )}

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t('deleteContactTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('deleteContactDesc', { name: deleteTarget?.name || deleteTarget?.phone || '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              {t('deleteBtn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground flex items-center gap-2">
              <Trash2 className="size-4 text-red-500" />
              {selected.size > 0
                ? t('deleteBulkTitle')
                : 'Bulk Delete Contacts'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {selected.size > 0
                ? t('deleteBulkDesc', { count: selected.size })
                : `You have ${totalCount} contact${totalCount === 1 ? '' : 's'} matching your current filters. Choose an option below:`}
            </DialogDescription>
          </DialogHeader>

          {selected.size === 0 ? (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2">
                <p className="text-sm font-semibold text-foreground">Option 1: Delete All Matching Contacts</p>
                <p className="text-xs text-muted-foreground">
                  Permanently delete all <strong className="text-foreground">{totalCount}</strong> contact{totalCount === 1 ? '' : 's'} across all pages.
                </p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAllMatching}
                  disabled={deleting || totalCount === 0}
                  className="w-full text-xs font-medium"
                >
                  {deleting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                  <Trash2 className="size-3.5 mr-1.5" />
                  Delete All {totalCount} Contacts
                </Button>
              </div>

              {contacts.length > 0 && contacts.length < totalCount && (
                <div className="rounded-lg border border-border bg-muted/40 p-3.5 space-y-2">
                  <p className="text-sm font-semibold text-foreground">Option 2: Delete Current Page Only</p>
                  <p className="text-xs text-muted-foreground">
                    Delete only the <strong className="text-foreground">{contacts.length}</strong> contacts shown on this page.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeletePage}
                    disabled={deleting}
                    className="w-full text-xs border-red-500/30 text-red-500 hover:bg-red-500/10"
                  >
                    {deleting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
                    <Trash2 className="size-3.5 mr-1.5" />
                    Delete Page ({contacts.length} contacts)
                  </Button>
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setBulkDeleteOpen(false);
                    handleSelectAllMatching();
                  }}
                  className="text-xs text-primary p-0 h-auto"
                >
                  Select all first to review
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setBulkDeleteOpen(false)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <DialogFooter className="bg-popover border-border">
              <Button
                variant="outline"
                onClick={() => setBulkDeleteOpen(false)}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                {t('cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleBulkDelete}
                disabled={deleting}
              >
                {deleting && <Loader2 className="size-4 animate-spin" />}
                {t('deleteBtn')} ({selected.size})
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Clean Up Unused Contacts Dialog */}
      <Dialog open={cleanUpModalOpen} onOpenChange={setCleanUpModalOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground flex items-center gap-2">
              <Trash2 className="size-4 text-red-500" />
              Clean Up Unused Contacts
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This will permanently delete all contacts that have never sent or received messages and have no active deals in the pipeline.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            <p>
              Found <strong className="text-foreground">{unusedStats.count}</strong> unused contact{unusedStats.count === 1 ? '' : 's'}. This action cannot be undone.
            </p>
          </div>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setCleanUpModalOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCleanUpUnused}
              disabled={cleaningUp || unusedStats.count === 0}
            >
              {cleaningUp && <Loader2 className="size-4 animate-spin" />}
              Delete {unusedStats.count} Contact{unusedStats.count === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { Ban, Loader2, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SettingsPanelHead } from './settings-panel-head';

interface Exclusion {
  id: string;
  phone: string;
  reason: string;
  note: string | null;
  created_at: string;
  contact?: { name: string | null };
}

export function ExclusionsPanel() {
  const { accountId } = useAuth();
  
  const [exclusions, setExclusions] = useState<Exclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [singlePhone, setSinglePhone] = useState('');
  const [bulkPhones, setBulkPhones] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isAdding, setIsAdding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const fetchExclusions = async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/broadcast-exclusions${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      if (res.ok) {
        const data = await res.json();
        setExclusions(data);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load exclusions');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchExclusions();
  }, [accountId, search]);
  
  const handleAddSingle = async () => {
    if (!singlePhone.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch('/api/broadcast-exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: singlePhone.trim() })
      });
      if (res.ok) {
        toast.success('Number added to exclusion list');
        setSinglePhone('');
        fetchExclusions();
      } else {
        toast.error('Failed to add number');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to add number');
    } finally {
      setIsAdding(false);
    }
  };
  
  const handleAddBulk = async () => {
    if (!bulkPhones.trim()) return;
    setIsAdding(true);
    const phones = bulkPhones.split('\n').map(p => p.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/broadcast-exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones })
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`Added ${data.added} numbers to exclusion list`);
        setBulkPhones('');
        fetchExclusions();
      } else {
        toast.error('Failed to add numbers');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to add numbers');
    } finally {
      setIsAdding(false);
    }
  };
  
  const handleDelete = async (ids: string[]) => {
    if (ids.length === 0) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/broadcast-exclusions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        toast.success('Removed from exclusion list');
        setSelectedIds(new Set());
        fetchExclusions();
      } else {
        toast.error('Failed to remove');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove');
    } finally {
      setIsDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === exclusions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(exclusions.map(e => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  
  return (
    <section className="max-w-3xl animate-in fade-in-50 space-y-6 duration-200">
      <SettingsPanelHead
        title="DND / Exclusion List"
        description="Manage phone numbers that should never receive broadcast messages."
      />
      
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-medium">Add Single Number</h3>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. +1234567890"
              value={singlePhone}
              onChange={(e) => setSinglePhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddSingle();
              }}
            />
            <Button onClick={handleAddSingle} disabled={isAdding || !singlePhone.trim()}>
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              <span className="ml-2">Add</span>
            </Button>
          </div>
        </div>
        
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-medium">Add Multiple Numbers</h3>
          <Textarea
            placeholder="Paste numbers here, one per line"
            className="mb-4 h-24"
            value={bulkPhones}
            onChange={(e) => setBulkPhones(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {bulkPhones.split('\n').filter(p => p.trim()).length} numbers
            </span>
            <Button onClick={handleAddBulk} disabled={isAdding || !bulkPhones.trim()}>
              {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              <span className="ml-2">Add All</span>
            </Button>
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search phones or notes..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleDelete(Array.from(selectedIds))}
              disabled={isDeleting}
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              <span className="ml-2">Remove Selected ({selectedIds.size})</span>
            </Button>
          )}
        </div>
        
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    className="rounded border-input"
                    checked={exclusions.length > 0 && selectedIds.size === exclusions.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-3 text-left font-medium">Phone</th>
                <th className="p-3 text-left font-medium">Contact</th>
                <th className="p-3 text-left font-medium">Date Added</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && exclusions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : exclusions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                      <Ban className="h-6 w-6 text-muted-foreground/50" />
                    </div>
                    <p className="mt-4">No exclusions found</p>
                  </td>
                </tr>
              ) : (
                exclusions.map((exclusion) => (
                  <tr key={exclusion.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="p-3">
                      <input
                        type="checkbox"
                        className="rounded border-input"
                        checked={selectedIds.has(exclusion.id)}
                        onChange={() => toggleSelect(exclusion.id)}
                      />
                    </td>
                    <td className="p-3 font-medium">{exclusion.phone}</td>
                    <td className="p-3 text-muted-foreground">
                      {exclusion.contact?.name || '-'}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {new Date(exclusion.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete([exclusion.id])}
                        disabled={isDeleting}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <div className="border-t bg-muted/20 p-3 text-xs text-muted-foreground">
            Total exclusions: {exclusions.length}
          </div>
        </div>
      </div>
    </section>
  );
}

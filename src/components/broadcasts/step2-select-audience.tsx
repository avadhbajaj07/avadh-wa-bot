'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseBroadcastCsv } from '@/lib/broadcast-csv';
import { parsePastedNumbers } from '@/lib/contacts/parse-pasted-numbers';
import { CustomField, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Users,
  Tags,
  Filter,
  Upload,
  FileText,
  Loader2,
  ArrowRight,
  ArrowLeft,
  X,
  Trash2,
  ClipboardPaste,
  Plus,
  Check,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

type AudienceType = 'all' | 'tags' | 'custom_field' | 'csv' | 'paste';
type CustomFieldOperator = 'is' | 'is_not' | 'contains';

interface CustomFieldFilter {
  fieldId: string;
  operator: CustomFieldOperator;
  value: string;
}

interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: CustomFieldFilter;
  csvContacts?: { phone: string; name?: string; tags?: string[] }[];
  applyTagIds?: string[];
  excludeTagIds?: string[];
}

interface Step2Props {
  audience: AudienceConfig;
  onUpdate: (audience: AudienceConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

export function Step2SelectAudience({
  audience,
  onUpdate,
  onNext,
  onBack,
}: Step2Props) {
  const t = useTranslations('Broadcasts.wizard');

  const OPERATOR_OPTIONS = useMemo<{ value: CustomFieldOperator; label: string }[]>(() => [
    { value: 'is', label: t('selectAudience.operatorIs') },
    { value: 'is_not', label: t('selectAudience.operatorIsNot') },
    { value: 'contains', label: t('selectAudience.operatorContains') },
  ], [t]);

  const audienceOptions = useMemo<{
    type: AudienceType;
    label: string;
    description: string;
    icon: typeof Users;
  }[]>(() => [
    {
      type: 'all',
      label: t('selectAudience.method.all'),
      description: t('selectAudience.allDescLoading'),
      icon: Users,
    },
    {
      type: 'tags',
      label: t('selectAudience.method.tags'),
      description: t('selectAudience.tagDesc'),
      icon: Tags,
    },
    {
      type: 'custom_field',
      label: t('selectAudience.method.customField'),
      description: t('selectAudience.customFieldDesc'),
      icon: Filter,
    },
    {
      type: 'csv',
      label: t('selectAudience.method.csv'),
      description: t('selectAudience.csvDesc'),
      icon: Upload,
    },
    {
      type: 'paste',
      label: 'Paste Numbers (500+)',
      description: 'Directly copy & paste up to 500+ phone numbers.',
      icon: ClipboardPaste,
    },
  ], [t]);

  const [tags, setTags] = useState<Tag[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [estimatedCount, setEstimatedCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  // File upload state
  const [pickedCsvName, setPickedCsvName] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Paste numbers state
  const [pastedText, setPastedText] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);

  // Sub-mode for CSV / Paste view: 'csv' | 'paste'
  const [csvSubMode, setCsvSubMode] = useState<'csv' | 'paste'>(
    audience.type === 'paste' ? 'paste' : 'csv'
  );

  const csvCount = audience.csvContacts?.length ?? 0;
  const csvFileName = csvCount > 0 ? pickedCsvName : null;

  // Real-time parsing of pasted numbers
  const pasteParseResult = useMemo(
    () => parsePastedNumbers(pastedText),
    [pastedText]
  );

  // Tags are used by filter, auto-apply, and exclude lists
  useEffect(() => {
    async function fetchTags() {
      setLoadingTags(true);
      try {
        const supabase = createClient();
        const { data } = await supabase.from('tags').select('*').order('name');
        setTags(data ?? []);
      } finally {
        setLoadingTags(false);
      }
    }
    fetchTags();
  }, []);

  // Lazy-load custom fields only when that audience type is active
  useEffect(() => {
    if (audience.type !== 'custom_field') return;
    async function fetchFields() {
      setLoadingFields(true);
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('custom_fields')
          .select('*')
          .order('field_name');
        setCustomFields(data ?? []);
      } finally {
        setLoadingFields(false);
      }
    }
    fetchFields();
  }, [audience.type]);

  // Sync paste sub-mode with audience type selection
  useEffect(() => {
    if (audience.type === 'paste') {
      setCsvSubMode('paste');
    } else if (audience.type === 'csv') {
      setCsvSubMode('csv');
    }
  }, [audience.type]);

  const fetchEstimatedCount = useCallback(async () => {
    setLoadingCount(true);
    try {
      const supabase = createClient();
      let baseIds: Set<string> | null = null;

      if (audience.type === 'all') {
        // Handled below — full-table count adjusted by excludes.
      } else if (
        audience.type === 'tags' &&
        audience.tagIds &&
        audience.tagIds.length > 0
      ) {
        const { data } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.tagIds);
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        audience.type === 'custom_field' &&
        audience.customField?.fieldId &&
        audience.customField.value
      ) {
        const { fieldId, operator, value } = audience.customField;
        let q = supabase
          .from('contact_custom_values')
          .select('contact_id')
          .eq('custom_field_id', fieldId);
        if (operator === 'is') q = q.eq('value', value);
        else if (operator === 'is_not') q = q.neq('value', value);
        else q = q.ilike('value', `%${value}%`);
        const { data } = await q;
        baseIds = new Set((data ?? []).map((r) => r.contact_id));
      } else if (
        (audience.type === 'csv' || audience.type === 'paste') &&
        audience.csvContacts &&
        audience.csvContacts.length > 0
      ) {
        setEstimatedCount(audience.csvContacts.length);
        return;
      } else {
        setEstimatedCount(null);
        return;
      }

      // Apply exclude tags
      let excludeSet: Set<string> | null = null;
      if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
        const { data: excludeRows } = await supabase
          .from('contact_tags')
          .select('contact_id')
          .in('tag_id', audience.excludeTagIds);
        excludeSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
      }

      if (baseIds) {
        const effective = [...baseIds].filter((id) => !excludeSet?.has(id));
        setEstimatedCount(effective.length);
      } else {
        const { count } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true });
        const total = count ?? 0;
        setEstimatedCount(excludeSet ? Math.max(0, total - excludeSet.size) : total);
      }
    } finally {
      setLoadingCount(false);
    }
  }, [
    audience.type,
    audience.tagIds,
    audience.customField,
    audience.csvContacts,
    audience.excludeTagIds,
  ]);

  useEffect(() => {
    fetchEstimatedCount();
  }, [fetchEstimatedCount]);

  async function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;

    try {
      const text = await selected.text();
      const result = parseBroadcastCsv(text);

      if (!result.ok) {
        toast.error(
          result.error === 'missing_phone_column'
            ? 'CSV must contain a phone column (e.g. phone, mobile, contact, number).'
            : t('selectAudience.errorCsvParse')
        );
        if (csvInputRef.current) csvInputRef.current.value = '';
        return;
      }

      setPickedCsvName(selected.name);
      onUpdate({
        ...audience,
        type: 'csv',
        csvContacts: result.contacts,
      });
      toast.success(`${result.contacts.length} valid contacts loaded from CSV.`);
    } catch (err) {
      toast.error('Failed to read CSV file.');
      console.error(err);
    }
  }

  function handleClearCsv() {
    setPickedCsvName(null);
    if (csvInputRef.current) csvInputRef.current.value = '';
    onUpdate({ ...audience, csvContacts: undefined });
    toast.info('CSV file cleared.');
  }

  function handleApplyPastedNumbers() {
    if (pasteParseResult.validCount === 0) {
      toast.error('Please paste at least one valid phone number.');
      return;
    }

    onUpdate({
      ...audience,
      type: 'paste',
      csvContacts: pasteParseResult.contacts,
    });
    toast.success(`${pasteParseResult.validCount} numbers applied to broadcast.`);
  }

  function handleClearPastedNumbers() {
    setPastedText('');
    onUpdate({ ...audience, csvContacts: undefined });
  }

  function toggleTag(tagId: string) {
    const current = audience.tagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, tagIds: updated });
  }

  function toggleApplyTag(tagId: string) {
    const current = audience.applyTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, applyTagIds: updated });
  }

  function toggleExcludeTag(tagId: string) {
    const current = audience.excludeTagIds ?? [];
    const updated = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onUpdate({ ...audience, excludeTagIds: updated });
  }

  async function handleCreateNewTag() {
    const name = newTagName.trim();
    if (!name) return;

    setCreatingTag(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('profiles')
        .select('account_id')
        .eq('id', session.user.id)
        .single();

      if (!profile?.account_id) throw new Error('No account found');

      const { data: newTag, error } = await supabase
        .from('tags')
        .insert({
          account_id: profile.account_id,
          user_id: session.user.id,
          name,
          color: '#3b82f6',
        })
        .select('*')
        .single();

      if (error) throw error;

      setTags((prev) => [...prev, newTag]);
      // Automatically add to applyTagIds
      onUpdate({
        ...audience,
        applyTagIds: [...(audience.applyTagIds ?? []), newTag.id],
      });
      setNewTagName('');
      toast.success(`Tag "${name}" created and applied.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create tag');
    } finally {
      setCreatingTag(false);
    }
  }

  function updateCustomField(patch: Partial<CustomFieldFilter>) {
    const prev = audience.customField ?? {
      fieldId: '',
      operator: 'is' as CustomFieldOperator,
      value: '',
    };
    onUpdate({ ...audience, customField: { ...prev, ...patch } });
  }

  const isValid =
    audience.type === 'all' ||
    (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) ||
    (audience.type === 'custom_field' &&
      !!audience.customField?.fieldId &&
      audience.customField.value.length > 0) ||
    ((audience.type === 'csv' || audience.type === 'paste') &&
      audience.csvContacts &&
      audience.csvContacts.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('selectAudience.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('selectAudience.subtitle')}
        </p>
      </div>

      {/* Audience Type Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {audienceOptions.map((option) => {
          const isSelected =
            audience.type === option.type ||
            (option.type === 'csv' && audience.type === 'paste' && csvSubMode === 'csv') ||
            (option.type === 'paste' && audience.type === 'csv' && csvSubMode === 'paste');

          const Icon = option.icon;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => {
                const targetType = option.type;
                if (targetType === 'paste') setCsvSubMode('paste');
                if (targetType === 'csv') setCsvSubMode('csv');

                onUpdate({
                  ...audience,
                  type: targetType,
                  tagIds: targetType === 'tags' ? audience.tagIds : undefined,
                  customField:
                    targetType === 'custom_field'
                      ? audience.customField
                      : undefined,
                  csvContacts:
                    targetType === 'csv' || targetType === 'paste'
                      ? audience.csvContacts
                      : undefined,
                });
              }}
              className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                  : 'border-border bg-card/50 hover:border-border'
              }`}
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  isSelected
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{option.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {option.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* 1. Filter by Tags */}
      {audience.type === 'tags' && (
        <div className="rounded-xl border border-border bg-card/50 p-4">
          <p className="mb-3 text-sm font-medium text-foreground">{t('selectAudience.selectTags')}</p>
          {loadingTags ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : tags.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('selectAudience.noTagsFound')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const isSelected = audience.tagIds?.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      isSelected
                        ? 'border-primary/40 bg-primary/15 text-primary ring-1 ring-primary/30'
                        : 'border-border bg-muted text-muted-foreground hover:border-border'
                    }`}
                  >
                    <span
                      className="mr-1.5 h-2 w-2 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    {tag.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. Custom Field */}
      {audience.type === 'custom_field' && (
        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-4">
          <p className="text-sm font-medium text-foreground">{t('selectAudience.method.customField')}</p>
          {loadingFields ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : customFields.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('selectAudience.errorLoadFields')}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_140px_minmax(0,1fr)]">
              <select
                value={audience.customField?.fieldId ?? ''}
                onChange={(e) => updateCustomField({ fieldId: e.target.value })}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                <option value="">{t('selectAudience.selectField')}</option>
                {customFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.field_name}
                  </option>
                ))}
              </select>
              <select
                value={audience.customField?.operator ?? 'is'}
                onChange={(e) =>
                  updateCustomField({
                    operator: e.target.value as CustomFieldOperator,
                  })
                }
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {OPERATOR_OPTIONS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={audience.customField?.value ?? ''}
                onChange={(e) => updateCustomField({ value: e.target.value })}
                placeholder={t('selectAudience.valuePlaceholder')}
                className="h-9 rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>
      )}

      {/* 3 & 4. CSV Upload & Direct Paste (Unified Container) */}
      {(audience.type === 'csv' || audience.type === 'paste') && (
        <div className="space-y-4 rounded-xl border border-border bg-card/50 p-5">
          {/* Sub-mode Tab Switcher */}
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setCsvSubMode('csv');
                  onUpdate({ ...audience, type: 'csv' });
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  csvSubMode === 'csv'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <Upload className="h-3.5 w-3.5" />
                Upload CSV File
              </button>

              <button
                type="button"
                onClick={() => {
                  setCsvSubMode('paste');
                  onUpdate({ ...audience, type: 'paste' });
                }}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  csvSubMode === 'paste'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste Numbers (500+)
              </button>
            </div>

            {csvCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearCsv}
                className="h-7 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear Contacts
              </Button>
            )}
          </div>

          {/* Sub-mode: CSV File Upload */}
          {csvSubMode === 'csv' && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Upload CSV File
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Supports .csv files with phone numbers (formats like phone, mobile, contact, or headerless numbers). Indian 10-digit numbers automatically formatted with +91.
                </p>
              </div>

              {csvCount === 0 ? (
                <button
                  type="button"
                  onClick={() => csvInputRef.current?.click()}
                  className="group flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-primary/40 hover:bg-muted/60"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground group-hover:text-primary transition-colors">
                    <Upload className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Click to choose CSV file
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      or drag and drop your file here
                    </p>
                  </div>
                </button>
              ) : (
                <div className="rounded-lg border border-border bg-background p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {csvFileName || 'contacts.csv'}
                        </p>
                        <p className="text-xs text-emerald-400 font-medium">
                          ✓ {csvCount.toLocaleString()} valid contact(s) loaded
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => csvInputRef.current?.click()}
                        className="h-8 text-xs"
                      >
                        Change File
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearCsv}
                        className="h-8 text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remove
                      </Button>
                    </div>
                  </div>

                  {/* Preview Table of first 5 contacts */}
                  <div className="border-t border-border pt-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Preview (First 5 Contacts)
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left">
                        <thead>
                          <tr className="border-b border-border text-muted-foreground">
                            <th className="pb-1 font-medium">#</th>
                            <th className="pb-1 font-medium">Phone</th>
                            <th className="pb-1 font-medium">Name</th>
                            <th className="pb-1 font-medium">Tags</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-mono">
                          {audience.csvContacts?.slice(0, 5).map((c, i) => (
                            <tr key={i} className="text-foreground">
                              <td className="py-1 text-muted-foreground">{i + 1}</td>
                              <td className="py-1 font-medium text-emerald-400">{c.phone}</td>
                              <td className="py-1 text-muted-foreground">{c.name || '—'}</td>
                              <td className="py-1 text-muted-foreground">
                                {c.tags && c.tags.length > 0 ? (
                                  <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                    {c.tags.join(', ')}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {csvCount > 5 && (
                        <p className="text-[11px] text-muted-foreground mt-2 italic">
                          ... and {(csvCount - 5).toLocaleString()} more contacts.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <input
                ref={csvInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvChange}
                className="hidden"
              />
            </div>
          )}

          {/* Sub-mode: Direct Copy & Paste (500+ Numbers) */}
          {csvSubMode === 'paste' && (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Directly Copy & Paste Phone Numbers
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Paste up to 500+ phone numbers (one per line, or separated by commas). Names are optional (e.g. &quot;9406633778, Ramesh&quot; or &quot;9406633778 - Priya&quot;).
                </p>
              </div>

              <div className="relative">
                <textarea
                  value={pastedText}
                  onChange={(e) => {
                    setPastedText(e.target.value);
                    const parsed = parsePastedNumbers(e.target.value);
                    if (parsed.validCount > 0) {
                      onUpdate({
                        ...audience,
                        type: 'paste',
                        csvContacts: parsed.contacts,
                      });
                    }
                  }}
                  rows={8}
                  placeholder={`Paste numbers here (one per line or comma-separated):\n\n9406633778\n7282316090\n9823456789, Ramesh\n+91 94066 33778 - Priya\n09876543210`}
                  className="w-full rounded-lg border border-border bg-background p-3 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Parsing status bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`font-mono text-xs ${
                      pasteParseResult.validCount > 0
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'text-muted-foreground'
                    }`}
                  >
                    ✓ {pasteParseResult.validCount} valid numbers
                  </Badge>

                  {pasteParseResult.duplicatesCount > 0 && (
                    <Badge
                      variant="outline"
                      className="border-amber-500/30 bg-amber-500/10 text-amber-300 font-mono text-xs"
                    >
                      {pasteParseResult.duplicatesCount} duplicate(s) removed
                    </Badge>
                  )}

                  {pasteParseResult.invalidCount > 0 && (
                    <Badge
                      variant="outline"
                      className="border-red-500/30 bg-red-500/10 text-red-300 font-mono text-xs"
                    >
                      {pasteParseResult.invalidCount} invalid line(s)
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {pastedText && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClearPastedNumbers}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApplyPastedNumbers}
                    disabled={pasteParseResult.validCount === 0}
                    className="h-7 text-xs bg-primary text-primary-foreground"
                  >
                    <Check className="h-3.5 w-3.5 mr-1" />
                    Apply {pasteParseResult.validCount} Numbers
                  </Button>
                </div>
              </div>

              {/* Preview of pasted contacts */}
              {pasteParseResult.validCount > 0 && (
                <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Preview (First 5 Parsed Contacts)
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="pb-1 font-medium">#</th>
                          <th className="pb-1 font-medium">Phone</th>
                          <th className="pb-1 font-medium">Name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40 font-mono">
                        {pasteParseResult.contacts.slice(0, 5).map((c, i) => (
                          <tr key={i} className="text-foreground">
                            <td className="py-1 text-muted-foreground">{i + 1}</td>
                            <td className="py-1 font-medium text-emerald-400">{c.phone}</td>
                            <td className="py-1 text-muted-foreground">{c.name || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Auto-Accept & Apply Tags to Audience */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <p className="text-sm font-medium text-foreground">
              Apply Tags to Audience (Auto-Accept Tags)
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Optional</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Selected tags will be automatically assigned to all contacts in this broadcast audience in your database.
        </p>

        {/* Existing tags list */}
        {loadingTags ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <div className="flex flex-wrap gap-2 pt-1">
            {tags.map((tag) => {
              const isApplied = audience.applyTagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleApplyTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isApplied
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30'
                      : 'border-border bg-muted text-muted-foreground hover:border-border'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                  {isApplied && <Check className="ml-1.5 h-3 w-3 text-emerald-400" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Add new tag inline */}
        <div className="flex items-center gap-2 pt-2">
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateNewTag();
              }
            }}
            placeholder="Create & apply new tag (e.g. khargone)..."
            className="h-8 max-w-xs text-xs bg-muted border-border"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleCreateNewTag}
            disabled={!newTagName.trim() || creatingTag}
            className="h-8 text-xs"
          >
            {creatingTag ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5 mr-1" />
            )}
            Add Tag
          </Button>
        </div>
      </div>

      {/* Exclude list — clearly styled as EXCLUSION */}
      <div className="rounded-xl border border-red-500/20 bg-card/50 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <X className="h-4 w-4 text-red-400" />
            <p className="text-sm font-medium text-foreground">
              Exclude Contacts with Tags
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Optional</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Contacts that carry any of these tags will be excluded from receiving this broadcast.
        </p>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {tags.map((tag) => {
              const isExcluded = audience.excludeTagIds?.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggleExcludeTag(tag.id)}
                  className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                    isExcluded
                      ? 'border-red-500/40 bg-red-500/15 text-red-300 ring-1 ring-red-500/30'
                      : 'border-border bg-muted/60 text-muted-foreground hover:border-border'
                  }`}
                >
                  <span
                    className="mr-1.5 h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  {tag.name}
                  {isExcluded && <X className="ml-1.5 h-3 w-3 text-red-400" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Audience Summary */}
      <div className="rounded-xl border border-border bg-card/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            {t('selectAudience.audienceSummary')}
          </p>
          {loadingCount && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>{t('selectAudience.calculating')}</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-background p-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  {estimatedCount !== null ? estimatedCount.toLocaleString() : '—'}
                </span>
                <span className="text-xs text-muted-foreground">estimated recipients</span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {audience.type === 'csv'
                  ? `Uploaded via CSV: ${csvFileName || 'contacts.csv'}`
                  : audience.type === 'paste'
                    ? `Pasted numbers (${audience.csvContacts?.length ?? 0} contacts)`
                    : audience.type === 'tags'
                      ? `Filtered by ${audience.tagIds?.length ?? 0} tag(s)`
                      : audience.type === 'custom_field'
                        ? 'Filtered by custom field rule'
                        : 'All contacts in database'}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 text-xs">
            {audience.applyTagIds && audience.applyTagIds.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Applying:</span>
                <span className="rounded bg-emerald-500/15 text-emerald-300 font-medium px-2 py-0.5 text-[11px]">
                  {audience.applyTagIds.length} tag(s)
                </span>
              </div>
            )}
            {audience.excludeTagIds && audience.excludeTagIds.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Excluding:</span>
                <span className="rounded bg-red-500/15 text-red-300 font-medium px-2 py-0.5 text-[11px]">
                  {audience.excludeTagIds.length} tag(s)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Footer */}
      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>
        <Button
          onClick={onNext}
          disabled={!isValid}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

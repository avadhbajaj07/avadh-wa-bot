'use client';

import { useState, useMemo, useRef } from 'react';
import { parseBroadcastCsv, BroadcastCsvContact } from '@/lib/broadcast-csv';
import { parsePastedNumbers } from '@/lib/contacts/parse-pasted-numbers';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Users,
  Upload,
  FileText,
  ArrowRight,
  ArrowLeft,
  Trash2,
  ClipboardPaste,
  Check,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

type AudienceType = 'all' | 'tags' | 'custom_field' | 'csv' | 'paste';

export interface AudienceConfig {
  type: AudienceType;
  tagIds?: string[];
  customField?: {
    fieldId: string;
    operator: 'is' | 'is_not' | 'contains';
    value: string;
  };
  csvContacts?: BroadcastCsvContact[];
  csvColumns?: string[];
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

  const audienceOptions = useMemo<{
    type: 'all' | 'csv' | 'paste';
    label: string;
    description: string;
    icon: typeof Users;
  }[]>(() => [
    {
      type: 'all',
      label: t('selectAudience.method.all'),
      description: 'Send to all contacts in your database.',
      icon: Users,
    },
    {
      type: 'csv',
      label: t('selectAudience.method.csv'),
      description: 'Upload a CSV with phone numbers.',
      icon: Upload,
    },
    {
      type: 'paste',
      label: 'Paste Numbers (500+)',
      description: 'Directly copy & paste up to 500+ phone numbers.',
      icon: ClipboardPaste,
    },
  ], [t]);

  // File upload state
  const [pickedCsvName, setPickedCsvName] = useState<string | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Paste numbers state
  const [pastedText, setPastedText] = useState('');

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

  function handleCsvChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPickedCsvName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== 'string') {
        toast.error(t('selectAudience.errorReadFile'));
        return;
      }

      const result = parseBroadcastCsv(text);
      if (!result.ok) {
        if (result.error === 'missing_phone_column') {
          toast.error(t('selectAudience.errorNoPhoneHeader'));
        } else {
          toast.error(t('selectAudience.errorNoValidRows'));
        }
        return;
      }

      onUpdate({
        ...audience,
        type: 'csv',
        csvContacts: result.contacts,
        csvColumns: result.headers,
      });

      if (result.duplicates > 0) {
        toast.info(
          t('selectAudience.infoDuplicates', { count: result.duplicates })
        );
      }
      toast.success(
        t('selectAudience.successLoaded', { count: result.contacts.length })
      );
    };

    reader.onerror = () => {
      toast.error(t('selectAudience.errorReadFile'));
    };

    reader.readAsText(file);
    if (csvInputRef.current) csvInputRef.current.value = '';
  }

  function handleClearCsv() {
    setPickedCsvName(null);
    setPastedText('');
    onUpdate({
      ...audience,
      csvContacts: undefined,
      csvColumns: undefined,
    });
    if (csvInputRef.current) csvInputRef.current.value = '';
  }

  function handleApplyPastedNumbers() {
    if (pasteParseResult.validCount === 0) {
      toast.error('No valid phone numbers found to apply.');
      return;
    }

    onUpdate({
      ...audience,
      type: 'paste',
      csvContacts: pasteParseResult.contacts,
    });

    toast.success(`Loaded ${pasteParseResult.validCount} valid phone number(s).`);
  }

  function handleClearPastedNumbers() {
    setPastedText('');
    onUpdate({
      ...audience,
      csvContacts: undefined,
    });
  }

  const isValid =
    audience.type === 'all' ||
    ((audience.type === 'csv' || audience.type === 'paste') &&
      Boolean(audience.csvContacts && audience.csvContacts.length > 0));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('selectAudience.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('selectAudience.subtitle')}
        </p>
      </div>

      {/* Audience Type Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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

      {/* CSV Upload & Direct Paste Container */}
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
                  Supports .csv files with phone numbers. Indian 10-digit numbers automatically formatted with +91.
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
                  Paste up to 500+ phone numbers (one per line, or separated by commas). Names are optional (e.g. &quot;9406633778, Ramesh&quot;).
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

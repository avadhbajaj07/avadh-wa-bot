'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, CustomField, MessageTemplate } from '@/types';
import { AudienceConfig } from '@/components/broadcasts/step2-select-audience';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  ImageIcon,
  Loader2,
  Upload,
  FileText,
  Video,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  uploadAccountMedia,
  MEDIA_MAX_BYTES_BY_KIND,
} from '@/lib/storage/upload-media';
import { useTranslations } from 'next-intl';

export type VariableType = 'static' | 'field' | 'custom_field' | 'csv_column';

export interface VariableMapping {
  type: VariableType;
  value: string;
}

interface Step3Props {
  template: MessageTemplate;
  audience?: AudienceConfig;
  variables: Record<string, VariableMapping>;
  onUpdate: (variables: Record<string, VariableMapping>) => void;
  /** Media URL for an IMAGE/VIDEO/DOCUMENT header, when the template has one. */
  headerMediaUrl: string;
  onHeaderMediaUrlChange: (url: string) => void;
  onNext: () => void;
  onBack: () => void;
}

const MEDIA_HEADER_TYPES = ['image', 'video', 'document'] as const;
type MediaHeaderType = (typeof MEDIA_HEADER_TYPES)[number];

function isMediaHeaderType(value: unknown): value is MediaHeaderType {
  return MEDIA_HEADER_TYPES.includes(value as MediaHeaderType);
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

const contactFields = [
  { value: 'name', labelKey: 'name' },
  { value: 'company', labelKey: 'company' },
  { value: 'phone', labelKey: 'phone' },
  { value: 'email', labelKey: 'email' },
];

const SAMPLE_CONTACT: Contact = {
  id: 'sample',
  user_id: '',
  account_id: '',
  name: 'John Doe',
  phone: '+1234567890',
  email: 'john@example.com',
  company: 'Acme Corp',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export function Step3Personalize({
  template,
  audience,
  variables,
  onUpdate,
  headerMediaUrl,
  onHeaderMediaUrlChange,
  onNext,
  onBack,
}: Step3Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loadingFields, setLoadingFields] = useState(true);
  const [firstContact, setFirstContact] = useState<Contact | null>(null);
  const [firstContactCustomValues, setFirstContactCustomValues] = useState<
    Map<string, string>
  >(new Map());
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [showManualUrl, setShowManualUrl] = useState(false);

  async function handleMediaUpload(file: File) {
    if (!mediaHeaderType) return;
    const maxBytes = MEDIA_MAX_BYTES_BY_KIND[mediaHeaderType];
    if (file.size > maxBytes) {
      toast.error(
        `File too large. Maximum size for ${mediaHeaderType} is ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`
      );
      return;
    }
    setIsUploadingMedia(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      onHeaderMediaUrlChange(publicUrl);
      setUploadedFileName(file.name);
      toast.success(`${mediaHeaderType.toUpperCase()} uploaded successfully!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload media');
    } finally {
      setIsUploadingMedia(false);
    }
  }

  // Load user's custom fields + a representative contact for the
  // live preview. Fall back to sample data if no contacts exist yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [fieldsRes, contactRes] = await Promise.all([
        supabase.from('custom_fields').select('*').order('field_name'),
        supabase
          .from('contacts')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;

      setCustomFields(fieldsRes.data ?? []);
      setLoadingFields(false);

      const contact = contactRes.data ?? null;
      setFirstContact(contact);

      if (contact) {
        const { data: customVals } = await supabase
          .from('contact_custom_values')
          .select('custom_field_id, value')
          .eq('contact_id', contact.id);
        if (!cancelled) {
          const map = new Map<string, string>();
          for (const row of customVals ?? []) {
            map.set(row.custom_field_id, row.value ?? '');
          }
          setFirstContactCustomValues(map);
        }
      }
      setLoadingPreview(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const placeholders = useMemo(() => {
    const matches = template.body_text.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
    const list: string[] = [];
    const seen = new Set<string>();
    for (const m of matches) {
      if (!seen.has(m[0])) {
        seen.add(m[0]);
        list.push(m[0]);
      }
    }
    return list;
  }, [template.body_text]);

  // Auto-match template variables to CSV columns OR contact fields
  useEffect(() => {
    const hasCsv = Boolean(audience?.csvColumns && audience.csvColumns.length > 0);
    const newVars = { ...variables };
    let changed = false;

    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const lowerKey = key.toLowerCase();

      if (!newVars[key] || !newVars[key].value) {
        if (hasCsv && audience?.csvColumns) {
          // Look for matching column in csvColumns
          const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
          let match = audience.csvColumns.find((col) => {
            const normCol = col.toLowerCase().replace(/[^a-z0-9]/g, '');
            return (
              normCol === normalizedKey ||
              normCol.includes(normalizedKey) ||
              normalizedKey.includes(normCol)
            );
          });

          // Semantic aliases for business / company
          if (
            !match &&
            [
              'business_name',
              'business',
              'company',
              'company_name',
              'nom_entreprise',
              'entreprise',
              'societe',
            ].includes(lowerKey)
          ) {
            match = audience.csvColumns.find((col) => {
              const c = col.toLowerCase();
              return (
                c.includes('company') ||
                c.includes('business') ||
                c.includes('entreprise') ||
                c.includes('societe') ||
                c.includes('org') ||
                c.includes('name') ||
                c === 'nom'
              );
            });
          }

          // Semantic aliases for contact name
          if (
            !match &&
            [
              'name',
              'full_name',
              'first_name',
              'contact_name',
              'client_name',
              'customer_name',
              'nom',
              'prenom',
            ].includes(lowerKey)
          ) {
            match = audience.csvColumns.find((col) => {
              const c = col.toLowerCase();
              return (
                c.includes('name') ||
                c.includes('nom') ||
                c.includes('prenom') ||
                c.includes('client') ||
                c.includes('customer') ||
                c.includes('contact')
              );
            });
          }

          // Positional aliases (e.g. {{1}} or {{2}})
          if (!match && /^\d+$/.test(key)) {
            match = audience.csvColumns.find((col) => {
              const c = col.toLowerCase();
              return (
                c.includes('name') ||
                c.includes('company') ||
                c.includes('business') ||
                c.includes('client')
              );
            });
            if (!match) {
              match = audience.csvColumns.find((col) => {
                const c = col.toLowerCase();
                return (
                  !c.includes('phone') &&
                  !c.includes('mobile') &&
                  !c.includes('number') &&
                  !c.includes('tel') &&
                  !c.includes('tag')
                );
              });
            }
          }

          if (match) {
            newVars[key] = { type: 'csv_column', value: match };
            changed = true;
          } else if (!newVars[key]) {
            newVars[key] = { type: 'csv_column', value: '' };
            changed = true;
          }
        } else {
          // Contact-based audience auto-matching
          if (
            [
              'business_name',
              'business',
              'company',
              'company_name',
              'nom_entreprise',
              'entreprise',
            ].includes(lowerKey)
          ) {
            newVars[key] = { type: 'field', value: 'company' };
            changed = true;
          } else if (
            [
              'name',
              'full_name',
              'first_name',
              'contact_name',
              'client_name',
              'customer_name',
              'nom',
              'prenom',
            ].includes(lowerKey)
          ) {
            newVars[key] = { type: 'field', value: 'name' };
            changed = true;
          } else if (['phone', 'mobile', 'tel', 'telephone'].includes(lowerKey)) {
            newVars[key] = { type: 'field', value: 'phone' };
            changed = true;
          } else if (['email', 'mail'].includes(lowerKey)) {
            newVars[key] = { type: 'field', value: 'email' };
            changed = true;
          }
        }
      }
    }

    if (changed) {
      onUpdate(newVars);
    }
  }, [placeholders, audience?.csvColumns]);

  // Templates with an IMAGE/VIDEO/DOCUMENT header need a media URL at
  // send time — Meta requires the media component on every delivery and
  // rejects the broadcast without it. The field is hidden for text-only
  // headers.
  const mediaHeaderType = isMediaHeaderType(template.header_type)
    ? template.header_type
    : null;

  // Seed the field with the template's stored sample URL the first time
  // we land on a media-header template, so the common "reuse the
  // approved media" case needs no typing. Only seeds when empty to avoid
  // clobbering a URL the user already edited.
  useEffect(() => {
    if (mediaHeaderType && !headerMediaUrl && template.header_media_url) {
      onHeaderMediaUrlChange(template.header_media_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaHeaderType, template.header_media_url]);

  const headerMediaError = useMemo<'missing' | 'invalid' | null>(() => {
    if (!mediaHeaderType) return null;
    const value = headerMediaUrl.trim();
    if (!value) return 'missing';
    if (!isValidHttpUrl(value)) return 'invalid';
    return null;
  }, [mediaHeaderType, headerMediaUrl]);

  /**
   * A placeholder is "unmapped" if the user hasn't picked either a
   * static value or a field/custom-field/csv source. Blocks Next until
   * every placeholder has something — otherwise the broadcast would
   * ship with empty strings and confuse recipients.
   */
  const unmappedKeys = useMemo(() => {
    const missing: string[] = [];
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      if (!mapping || !mapping.value?.trim()) {
        missing.push(placeholder);
      }
    }
    return missing;
  }, [placeholders, variables]);

  function updateVariable(key: string, patch: Partial<VariableMapping>) {
    const defaultType: VariableType =
      audience?.csvColumns && audience.csvColumns.length > 0
        ? 'csv_column'
        : 'static';
    const current = variables[key] ?? { type: defaultType, value: '' };
    onUpdate({
      ...variables,
      [key]: { ...current, ...patch },
    });
  }

  /**
   * Substitute placeholders using the first real contact or CSV row where
   * possible.
   */
  const previewText = useMemo(() => {
    const contact = firstContact ?? SAMPLE_CONTACT;
    const customValues = firstContact
      ? firstContactCustomValues
      : new Map<string, string>();
    const firstCsvRow = audience?.csvContacts?.[0]?.columns;

    let text = template.body_text;
    for (const placeholder of placeholders) {
      const key = placeholder.replace(/^\{\{|\}\}$/g, '');
      const mapping = variables[key];
      let replacement = placeholder;

      if (mapping) {
        if (mapping.type === 'static' && mapping.value) {
          replacement = mapping.value;
        } else if (mapping.type === 'field' && mapping.value) {
          const fieldMap: Record<string, string | undefined> = {
            name: contact.name || contact.company,
            phone: contact.phone,
            email: contact.email,
            company: contact.company || contact.name,
          };
          replacement = fieldMap[mapping.value] ?? placeholder;
        } else if (mapping.type === 'custom_field' && mapping.value) {
          replacement = customValues.get(mapping.value) || placeholder;
        } else if (mapping.type === 'csv_column' && mapping.value) {
          let val = firstCsvRow?.[mapping.value];
          if (val === undefined && firstCsvRow) {
            const target = mapping.value.toLowerCase();
            for (const [k, v] of Object.entries(firstCsvRow)) {
              if (k.toLowerCase() === target) {
                val = v;
                break;
              }
            }
          }
          if (!val && ['name', 'full_name', 'company', 'business_name', 'business'].includes(mapping.value.toLowerCase())) {
            val = audience?.csvContacts?.[0]?.name;
          }
          replacement = val || placeholder;
        }
      }
      text = text.replaceAll(placeholder, replacement);
    }
    return text;
  }, [
    template.body_text,
    variables,
    placeholders,
    firstContact,
    firstContactCustomValues,
    audience?.csvContacts,
  ]);

  const hasCsvData = Boolean(audience?.csvContacts && audience.csvContacts.length > 0);
  const previewLabel = hasCsvData
    ? `CSV Preview (${audience!.csvContacts![0].name || audience!.csvContacts![0].phone})`
    : firstContact
      ? firstContact.name || firstContact.phone
      : t('personalize.previewSample');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('personalize.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('personalize.subtitle')}
        </p>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex items-start gap-2.5">
        <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        <div className="text-xs space-y-0.5">
          <p className="font-semibold text-foreground">
            Map Template Attributes to Your Audience
          </p>
          <p className="text-muted-foreground">
            Each placeholder in your template (like <code className="text-primary font-mono font-semibold">{"{{business_name}}"}</code>) can be connected to a column from your uploaded CSV, a contact profile field, or a fixed text value.
          </p>
        </div>
      </div>

      {mediaHeaderType && (
        <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {mediaHeaderType === 'image' && <ImageIcon className="h-4 w-4 text-primary" />}
              {mediaHeaderType === 'video' && <Video className="h-4 w-4 text-primary" />}
              {mediaHeaderType === 'document' && <FileText className="h-4 w-4 text-primary" />}
              <p className="text-sm font-medium text-foreground">
                Header {mediaHeaderType.charAt(0).toUpperCase() + mediaHeaderType.slice(1)}
              </p>
              <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium uppercase text-primary">
                {mediaHeaderType}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Max {mediaHeaderType === 'image' ? '5 MB' : '16 MB'}
            </span>
          </div>

          {/* Uploaded media preview & action */}
          {headerMediaUrl.trim() ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 truncate">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span className="text-xs font-medium text-foreground truncate">
                    {uploadedFileName || 'Media attached'}
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onHeaderMediaUrlChange('');
                    setUploadedFileName(null);
                  }}
                  className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Remove
                </Button>
              </div>

              {mediaHeaderType === 'image' && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={headerMediaUrl.trim()}
                  alt={t('personalize.headerPreviewAlt')}
                  className="max-h-48 rounded-lg border border-border object-contain bg-black/20"
                />
              )}
              {mediaHeaderType === 'video' && (
                <video
                  src={headerMediaUrl.trim()}
                  controls
                  className="max-h-48 rounded-lg border border-border bg-black/20"
                />
              )}
              {mediaHeaderType === 'document' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                  <FileText className="h-4 w-4 text-primary" />
                  <a
                    href={headerMediaUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    View Document <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          ) : (
            /* Upload Zone */
            <div className="space-y-2">
              <label
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 transition-colors cursor-pointer ${
                  isUploadingMedia
                    ? 'border-primary/50 bg-primary/5 cursor-wait'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                }`}
              >
                <input
                  type="file"
                  className="sr-only"
                  disabled={isUploadingMedia}
                  accept={
                    mediaHeaderType === 'image'
                      ? 'image/jpeg,image/png'
                      : mediaHeaderType === 'video'
                        ? 'video/mp4,video/3gpp'
                        : 'application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  }
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleMediaUpload(file);
                    e.target.value = '';
                  }}
                />
                {isUploadingMedia ? (
                  <div className="flex flex-col items-center gap-2 text-center">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="text-xs font-medium text-foreground">
                      Uploading to internal storage...
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-center">
                    <div className="rounded-full bg-primary/10 p-2 text-primary">
                      <Upload className="h-5 w-5" />
                    </div>
                    <p className="text-xs font-medium text-foreground">
                      Click to upload {mediaHeaderType} from computer
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Stored in your dedicated workspace memory. No external links required!
                    </p>
                  </div>
                )}
              </label>

              {/* Toggle manual URL input if needed */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowManualUrl(!showManualUrl)}
                  className="text-[11px] text-muted-foreground hover:text-foreground underline"
                >
                  {showManualUrl ? 'Hide manual URL input' : 'Or enter external media URL manually'}
                </button>
                {showManualUrl && (
                  <div className="mt-2 space-y-1">
                    <Input
                      type="url"
                      value={headerMediaUrl}
                      onChange={(e) => onHeaderMediaUrlChange(e.target.value)}
                      placeholder={t('personalize.imageUrlPlaceholder')}
                      className="border-border bg-muted text-foreground placeholder:text-muted-foreground text-xs"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {headerMediaError && (
            <p className="text-xs text-amber-300">
              {headerMediaError === 'missing'
                ? t('personalize.mediaUrlRequired')
                : t('personalize.mediaUrlInvalid')}
            </p>
          )}
        </div>
      )}

      {placeholders.length === 0 && !mediaHeaderType ? (
        <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {t('personalize.noPreview')}
          </p>
        </div>
      ) : placeholders.length === 0 ? null : (
        <div className="space-y-4">
          {placeholders.map((placeholder) => {
            const key = placeholder.replace(/^\{\{|\}\}$/g, '');
            const mapping = variables[key] ?? { type: 'static', value: '' };

            return (
              <div
                key={placeholder}
                className="rounded-xl border border-border bg-card/50 p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary">
                    {placeholder}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {t('personalize.type')}
                    </label>
                    <Select
                      value={mapping.type}
                      onValueChange={(val) =>
                        updateVariable(key, {
                          type: val as VariableType,
                          value: '',
                        })
                      }
                    >
                      <SelectTrigger className="w-full border-border bg-muted text-foreground">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-border bg-popover">
                        {audience?.csvColumns && audience.csvColumns.length > 0 && (
                          <SelectItem value="csv_column">{t('personalize.typeCsv')}</SelectItem>
                        )}
                        <SelectItem value="static">{t('personalize.typeStatic')}</SelectItem>
                        <SelectItem value="field">{t('personalize.typeContact')}</SelectItem>
                        <SelectItem value="custom_field">
                          {t('personalize.typeCustom')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                      {mapping.type === 'static'
                        ? t('personalize.staticValue')
                        : mapping.type === 'csv_column'
                          ? t('personalize.csvColumn')
                          : t('personalize.contactField')}
                    </label>
                    {mapping.type === 'static' ? (
                      <Input
                        value={mapping.value}
                        onChange={(e) =>
                          updateVariable(key, { value: e.target.value })
                        }
                        placeholder={t('personalize.enterValue')}
                        className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
                      />
                    ) : mapping.type === 'csv_column' ? (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) =>
                          updateVariable(key, { value: val || '' })
                        }
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground">
                          <SelectValue placeholder={t('personalize.selectCsvColumn')} />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {audience?.csvColumns?.map((col) => (
                            <SelectItem key={col} value={col}>
                              {col}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : mapping.type === 'field' ? (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) =>
                          updateVariable(key, { value: val || '' })
                        }
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground">
                          <SelectValue placeholder={t('personalize.selectContactField')} />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {contactFields.map((field) => (
                            <SelectItem key={field.value} value={field.value}>
                              {t(`personalize.fieldMap.${field.labelKey}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select
                        value={mapping.value || undefined}
                        onValueChange={(val) =>
                          updateVariable(key, { value: val || '' })
                        }
                      >
                        <SelectTrigger className="w-full border-border bg-muted text-foreground">
                          <SelectValue
                            placeholder={
                              loadingFields
                                ? t('personalize.loadingFields')
                                : customFields.length === 0
                                  ? t('personalize.noCustomFields')
                                  : t('personalize.selectCustomField')
                            }
                          />
                        </SelectTrigger>
                        <SelectContent className="border-border bg-popover">
                          {customFields.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.field_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Live Preview — rendered as a WhatsApp-style bubble so the user
          sees approximately what the recipient will see. */}
      <div className="rounded-xl border border-border bg-card/50 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">{t('personalize.preview')}</p>
          <span className="text-xs text-muted-foreground">({previewLabel})</span>
          {loadingPreview && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          )}
        </div>
        <div className="rounded-lg bg-[#0e1a12] p-3">
          <div className="ml-auto max-w-[85%] rounded-lg bg-primary/30 px-3 py-2 shadow-sm">
            <p className="whitespace-pre-wrap text-sm text-primary">
              {previewText}
            </p>
          </div>
        </div>
      </div>

      {unmappedKeys.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          {t.rich('personalize.unmappedWarning', {
            keys: unmappedKeys.join(', '),
            mono: (chunks) => <span className="font-mono font-semibold">{chunks}</span>,
          })}
        </div>
      )}

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
          disabled={unmappedKeys.length > 0 || headerMediaError !== null}
          className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {t('next')}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

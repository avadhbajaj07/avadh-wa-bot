'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { MessageTemplate, Tag } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ArrowLeft,
  Send,
  Loader2,
  Users,
  Save,
  Sparkles,
  Check,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  Smartphone,
  Calendar,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface AudienceConfig {
  type: 'all' | 'tags' | 'custom_field' | 'csv' | 'paste';
  tagIds?: string[];
  customField?: {
    fieldId: string;
    operator: 'is' | 'is_not' | 'contains';
    value: string;
  };
  csvContacts?: { phone: string; name?: string; tags?: string[] }[];
  applyTagIds?: string[];
  excludeTagIds?: string[];
}

interface Step4Props {
  name: string;
  onNameChange: (name: string) => void;
  template: MessageTemplate;
  audience: AudienceConfig;
  onAudienceChange?: (audience: AudienceConfig) => void;
  variables?: Record<string, { type: 'static' | 'field' | 'custom_field'; value: string }>;
  headerMediaUrl?: string;
  scheduledAt?: string | null;
  onScheduleChange?: (date: string | null) => void;
  onSend: () => void;
  onSaveDraft?: () => void;
  onBack: () => void;
  isProcessing: boolean;
  progress: number;
}

export function Step4ScheduleSend({
  name,
  onNameChange,
  template,
  audience,
  onAudienceChange,
  variables,
  headerMediaUrl,
  scheduledAt,
  onScheduleChange,
  onSend,
  onSaveDraft,
  onBack,
  isProcessing,
  progress,
}: Step4Props) {
  const t = useTranslations('Broadcasts.wizard');
  const [showConfirm, setShowConfirm] = useState(false);
  const [estimatedReach, setEstimatedReach] = useState<number>(0);
  const [loadingReach, setLoadingReach] = useState(true);

  const [testPhone, setTestPhone] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'now' | 'later'>(
    scheduledAt ? 'later' : 'now'
  );

  async function handleSendTest() {
    if (!testPhone.trim()) {
      toast.error('Please enter a test phone number with country code (e.g. +91...)');
      return;
    }
    setIsSendingTest(true);
    try {
      const params: string[] = [];
      if (variables) {
        const keys = Object.keys(variables).sort((a, b) => Number(a) - Number(b));
        for (const k of keys) {
          params.push(variables[k]?.value || 'Sample');
        }
      }

      const res = await fetch('/api/whatsapp/broadcast/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: testPhone.trim(),
          template_name: template.name,
          template_language: template.language || 'en_US',
          params,
          header_media_url: headerMediaUrl || undefined,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || 'Failed to send test message');
      }

      toast.success(`Sample message sent to ${testPhone.trim()}! Check your WhatsApp.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send test message');
    } finally {
      setIsSendingTest(false);
    }
  }

  // Tags for optional auto-apply & exclude
  const [tags, setTags] = useState<Tag[]>([]);
  const [loadingTags, setLoadingTags] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [creatingTag, setCreatingTag] = useState(false);
  const [showTagOptions, setShowTagOptions] = useState(
    Boolean(
      (audience.applyTagIds && audience.applyTagIds.length > 0) ||
        (audience.excludeTagIds && audience.excludeTagIds.length > 0)
    )
  );

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

  useEffect(() => {
    async function calculateReach() {
      setLoadingReach(true);
      try {
        const supabase = createClient();

        let baseCount = 0;
        let baseContactIds: string[] = [];

        if (audience.type === 'all') {
          if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
            const { data } = await supabase.from('contacts').select('id');
            baseContactIds = (data ?? []).map((c) => c.id);
          } else {
            const { count } = await supabase
              .from('contacts')
              .select('*', { count: 'exact', head: true });
            baseCount = count ?? 0;
          }
        } else if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
          const { data: contactTags } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', audience.tagIds);

          const uniqueIds = [...new Set((contactTags ?? []).map((ct) => ct.contact_id))];
          baseContactIds = uniqueIds;
        } else if ((audience.type === 'csv' || audience.type === 'paste') && audience.csvContacts) {
          baseCount = audience.csvContacts.length;
        }

        if (baseContactIds.length > 0) {
          let finalIds = baseContactIds;
          if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
            const { data: excludeRows } = await supabase
              .from('contact_tags')
              .select('contact_id')
              .in('tag_id', audience.excludeTagIds);
            const excludedSet = new Set((excludeRows ?? []).map((r) => r.contact_id));
            finalIds = finalIds.filter((id) => !excludedSet.has(id));
          }
          setEstimatedReach(finalIds.length);
        } else {
          setEstimatedReach(baseCount);
        }
      } finally {
        setLoadingReach(false);
      }
    }

    calculateReach();
  }, [audience]);

  function toggleApplyTag(tagId: string) {
    if (!onAudienceChange) return;
    const current = audience.applyTagIds ?? [];
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onAudienceChange({ ...audience, applyTagIds: next });
  }

  function toggleExcludeTag(tagId: string) {
    if (!onAudienceChange) return;
    const current = audience.excludeTagIds ?? [];
    const next = current.includes(tagId)
      ? current.filter((id) => id !== tagId)
      : [...current, tagId];
    onAudienceChange({ ...audience, excludeTagIds: next });
  }

  async function handleCreateNewTag() {
    const name = newTagName.trim();
    if (!name || !onAudienceChange) return;

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
      onAudienceChange({
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

  const audienceLabel =
    audience.type === 'all'
      ? t('scheduleSend.audienceAll')
      : audience.type === 'tags'
        ? t('scheduleSend.audienceTags')
        : audience.type === 'csv'
          ? t('scheduleSend.audienceCsv')
          : audience.type === 'paste'
            ? 'Pasted Numbers'
            : t('scheduleSend.audienceField');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{t('scheduleSend.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('scheduleSend.subtitle')}
        </p>
      </div>

      {/* Broadcast Name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">{t('scheduleSend.broadcastName')}</label>
        <Input
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('scheduleSend.broadcastNamePlaceholder')}
          className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Summary Card */}
      <div className="rounded-xl border border-border bg-card/50 p-4 space-y-3">
        <p className="text-sm font-medium text-foreground">{t('scheduleSend.summary')}</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.template')}</p>
            <p className="text-foreground font-medium">{template.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.audience')}</p>
            <p className="text-foreground font-medium">{audienceLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.estimatedReach')}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              {loadingReach ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : (
                <>
                  <Users className="h-3.5 w-3.5 text-primary" />
                  <p className="font-bold text-foreground text-base">{estimatedReach.toLocaleString()}</p>
                </>
              )}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{t('scheduleSend.language')}</p>
            <p className="text-foreground font-medium">{template.language ?? 'en_US'}</p>
          </div>
        </div>

        {/* Tags summary indicator */}
        {((audience.applyTagIds && audience.applyTagIds.length > 0) ||
          (audience.excludeTagIds && audience.excludeTagIds.length > 0)) && (
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs">
            {audience.applyTagIds && audience.applyTagIds.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Auto-assigning:</span>
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
        )}
      </div>

      {/* Optional Tag Options & Exclusions */}
      {onAudienceChange && (
        <div className="rounded-xl border border-border bg-card/40 p-4 space-y-4">
          <div
            onClick={() => setShowTagOptions(!showTagOptions)}
            className="flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-400" />
              <p className="text-sm font-medium text-foreground">
                Apply Tags & Exclusions
              </p>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                Optional
              </Badge>
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              {showTagOptions ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>

          {showTagOptions && (
            <div className="space-y-4 pt-2 border-t border-border">
              {/* Auto-Accept & Apply Tags */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-foreground">
                  Apply Tags to Audience (Auto-Accept Tags)
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Selected tags will be automatically assigned to all contacts in this broadcast.
                </p>

                {loadingTags ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {tags.map((tag) => {
                      const isApplied = audience.applyTagIds?.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleApplyTag(tag.id)}
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
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
                          {isApplied && <Check className="ml-1 h-3 w-3 text-emerald-400" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1.5">
                  <Input
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateNewTag();
                      }
                    }}
                    placeholder="Create & apply new tag..."
                    className="h-7 max-w-xs text-xs bg-muted border-border"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleCreateNewTag}
                    disabled={!newTagName.trim() || creatingTag}
                    className="h-7 text-xs"
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

              {/* Exclude Contacts with Tags */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <X className="h-3.5 w-3.5 text-red-400" />
                  <p className="text-xs font-medium text-foreground">
                    Exclude Contacts with Tags
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Contacts with any of these tags will not receive this broadcast.
                </p>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {tags.map((tag) => {
                      const isExcluded = audience.excludeTagIds?.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleExcludeTag(tag.id)}
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
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
                          {isExcluded && <X className="ml-1 h-3 w-3 text-red-400" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Send Sample / Test Message */}
      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Send Test / Sample Message</p>
          <Badge variant="outline" className="text-[10px] text-muted-foreground">
            Recommended
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Send a real preview of this template to your own phone number before sending to all {estimatedReach.toLocaleString()} recipients.
        </p>
        <div className="flex items-center gap-2 pt-1">
          <Input
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            placeholder="e.g. +919876543210"
            className="h-9 max-w-xs text-xs bg-muted border-border"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleSendTest}
            disabled={!testPhone.trim() || isSendingTest}
            className="h-9 text-xs font-medium"
          >
            {isSendingTest ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1.5 text-primary" />
            )}
            Send Sample Message
          </Button>
        </div>
      </div>

      {/* Schedule Options */}
      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Delivery Schedule</p>
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={() => {
              setScheduleMode('now');
              if (onScheduleChange) onScheduleChange(null);
            }}
            className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
              scheduleMode === 'now'
                ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30'
                : 'border-border bg-muted/30 text-muted-foreground hover:border-border'
            }`}
          >
            <div className="flex items-center gap-2 font-medium text-xs text-foreground">
              <Send className="h-3.5 w-3.5 text-primary" />
              Send Immediately
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Start delivering messages as soon as you confirm.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setScheduleMode('later');
              if (!scheduledAt && onScheduleChange) {
                const d = new Date(Date.now() + 60 * 60 * 1000);
                onScheduleChange(d.toISOString());
              }
            }}
            className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
              scheduleMode === 'later'
                ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30'
                : 'border-border bg-muted/30 text-muted-foreground hover:border-border'
            }`}
          >
            <div className="flex items-center gap-2 font-medium text-xs text-foreground">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              Schedule for Later
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pick a date & time to automatically deliver this broadcast.
            </p>
          </button>
        </div>

        {scheduleMode === 'later' && (
          <div className="pt-2 border-t border-border space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Select Date and Time
            </label>
            <Input
              type="datetime-local"
              value={scheduledAt ? new Date(scheduledAt).toISOString().slice(0, 16) : ''}
              min={new Date().toISOString().slice(0, 16)}
              onChange={(e) => {
                if (onScheduleChange) {
                  onScheduleChange(e.target.value ? new Date(e.target.value).toISOString() : null);
                }
              }}
              className="h-9 max-w-xs text-xs bg-muted border-border"
            />
            <p className="text-[11px] text-muted-foreground">
              Campaign will be stored safely and can be monitored or launched early anytime from Broadcasts.
            </p>
          </div>
        )}
      </div>

      {/* Processing overlay */}
      {isProcessing && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">{t('scheduleSend.sending')}</p>
            </div>
            <span className="text-xs font-medium text-primary">{progress}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isProcessing}
          className="border-border text-muted-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('back')}
        </Button>

        <div className="flex items-center gap-2">
          {onSaveDraft && (
            <Button
              variant="outline"
              onClick={onSaveDraft}
              disabled={!name.trim() || isProcessing}
              className="border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {t('scheduleSend.saveDraft')}
            </Button>
          )}

          {scheduleMode === 'later' ? (
            <Button
              onClick={() => {
                if (!scheduledAt) {
                  toast.error('Please select a date and time for the scheduled broadcast.');
                  return;
                }
                onSend();
              }}
              disabled={!name.trim() || isProcessing || !scheduledAt}
              className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Clock className="h-4 w-4 mr-1.5" />
              Schedule Broadcast
            </Button>
          ) : (
            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
              <DialogTrigger
                render={
                  <Button
                    disabled={!name.trim() || isProcessing}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  />
                }
              >
                <Send className="h-4 w-4 mr-1.5" />
                {t('scheduleSend.sendNow')}
              </DialogTrigger>
              <DialogContent className="border-border bg-popover sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-popover-foreground">{t('scheduleSend.confirmTitle')}</DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    {t.rich('scheduleSend.confirmDesc', {
                      count: estimatedReach,
                      template: template.name,
                      b: (chunks) => (
                        <span className="font-medium text-popover-foreground">{chunks}</span>
                      ),
                    })}
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setShowConfirm(false)}
                    className="border-border text-muted-foreground"
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowConfirm(false);
                      onSend();
                    }}
                    className="bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Send className="h-4 w-4 mr-1.5" />
                    {t('scheduleSend.sendNow')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  FileText,
  Copy,
  Eye,
  BookOpen,
  Sparkles,
  CheckCircle2,
  Clock,
  XCircle,
  Upload,
  MessageSquare,
  ExternalLink,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { MessageTemplate, TemplateButton } from '@/types';
import { templateStatusConfig } from '@/lib/template-status';
import { uploadAccountMedia } from '@/lib/storage/upload-media';

type StatusTab = 'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED';

interface BrowsePreset {
  name: string;
  category: 'Marketing' | 'Utility';
  language: string;
  header_format: 'none' | 'text' | 'image';
  header_content?: string;
  body_text: string;
  footer_text: string;
  buttons: TemplateButton[];
}

const TEMPLATE_PRESETS: BrowsePreset[] = [
  {
    name: 'welcome_customer',
    category: 'Marketing',
    language: 'en_US',
    header_format: 'text',
    header_content: 'Welcome to our service!',
    body_text: 'Hi {{1}}, thanks for reaching out. Our support team is here to assist you with any questions.',
    footer_text: 'Reply STOP to unsubscribe',
    buttons: [{ type: 'QUICK_REPLY', text: 'Chat with agent' }],
  },
  {
    name: 'order_status_update',
    category: 'Utility',
    language: 'en_US',
    header_format: 'text',
    header_content: 'Order Confirmation',
    body_text: 'Hello {{1}}, your order #{{2}} has been confirmed and is scheduled for delivery on {{3}}.',
    footer_text: 'Thank you for choosing us',
    buttons: [{ type: 'URL', text: 'Track Order', url: 'https://example.com/track' }],
  },
  {
    name: 'payment_reminder_v1',
    category: 'Utility',
    language: 'en_US',
    header_format: 'none',
    body_text: 'Dear {{1}}, this is a friendly reminder that invoice #{{2}} of {{3}} is due today.',
    footer_text: 'Account Billing Team',
    buttons: [{ type: 'URL', text: 'Pay Now', url: 'https://example.com/pay' }],
  },
  {
    name: 'exclusive_discount_offer',
    category: 'Marketing',
    language: 'en_US',
    header_format: 'image',
    body_text: 'Special gift for you, {{1}}! Use coupon code {{2}} to get 20% off your next purchase.',
    footer_text: 'Valid for 48 hours only',
    buttons: [{ type: 'URL', text: 'Claim Discount', url: 'https://example.com/shop' }],
  },
];

export default function TemplatesPage() {
  const { account } = useAuth();
  const canManage = useCan('edit-settings');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');

  // Modals
  const [createOpen, setCreateOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<MessageTemplate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  // Create Form State
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<'Marketing' | 'Utility' | 'Authentication'>('Marketing');
  const [formLanguage, setFormLanguage] = useState('en_US');
  const [formHeaderType, setFormHeaderType] = useState<'none' | 'text' | 'image' | 'video' | 'document'>('none');
  const [formHeaderText, setFormHeaderText] = useState('');
  const [formHeaderMediaUrl, setFormHeaderMediaUrl] = useState('');
  const [formBodyText, setFormBodyText] = useState('');
  const [formFooterText, setFormFooterText] = useState('');
  const [formButtons, setFormButtons] = useState<TemplateButton[]>([]);
  const [formBodySamples, setFormBodySamples] = useState<Record<number, string>>({});
  const [formHeaderSample, setFormHeaderSample] = useState('');

  const bodyVariables = useMemo(() => {
    const matches = formBodyText.matchAll(/\{\{(\d+)\}\}/g);
    const set = new Set<number>();
    for (const m of matches) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 1) set.add(n);
    }
    return [...set].sort((a, b) => a - b);
  }, [formBodyText]);

  async function fetchTemplates() {
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates((data as MessageTemplate[]) || []);
    } catch (err) {
      console.error('Failed to load templates:', err);
      toast.error('Could not load message templates');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function handleSyncFromMeta() {
    setSyncing(true);
    try {
      const res = await fetch('/api/whatsapp/templates/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Sync failed');
      }
      toast.success(`Successfully synced ${data.count ?? data.synced ?? 0} templates from Meta`);
      await fetchTemplates();
    } catch (err) {
      console.error('Meta sync error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to sync templates from WhatsApp');
    } finally {
      setSyncing(false);
    }
  }

  function handleOpenCreate(preset?: BrowsePreset) {
    if (preset) {
      setFormName(preset.name);
      setFormCategory(preset.category);
      setFormLanguage(preset.language);
      setFormHeaderType(preset.header_format);
      setFormHeaderText(preset.header_content || '');
      setFormHeaderMediaUrl('');
      setFormBodyText(preset.body_text);
      setFormFooterText(preset.footer_text || '');
      setFormButtons(preset.buttons || []);
      setFormBodySamples({});
      setFormHeaderSample('');
      setBrowseOpen(false);
    } else {
      setFormName('');
      setFormCategory('Marketing');
      setFormLanguage('en_US');
      setFormHeaderType('none');
      setFormHeaderText('');
      setFormHeaderMediaUrl('');
      setFormBodyText('');
      setFormFooterText('');
      setFormButtons([]);
      setFormBodySamples({});
      setFormHeaderSample('');
    }
    setCreateOpen(true);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);
    try {
      const { publicUrl } = await uploadAccountMedia('chat-media', file);
      setFormHeaderMediaUrl(publicUrl);
      toast.success('Media header uploaded successfully');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Media upload failed');
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleSaveTemplate() {
    if (!formName.trim()) {
      toast.error('Template name is required');
      return;
    }
    if (!formBodyText.trim()) {
      toast.error('Body text is required');
      return;
    }

    const sanitizedName = formName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!/^[a-z0-9_]{1,512}$/.test(sanitizedName)) {
      toast.error('Template name must contain only lowercase letters, digits, and underscores');
      return;
    }

    for (let i = 0; i < bodyVariables.length; i++) {
      if (bodyVariables[i] !== i + 1) {
        toast.error(`Variables must be contiguous starting from {{1}} (found {{${bodyVariables[i]}}})`);
        return;
      }
    }

    const bodySamples: string[] = [];
    for (let i = 1; i <= bodyVariables.length; i++) {
      const val = formBodySamples[i]?.trim();
      bodySamples.push(val || (i === 1 ? 'Customer' : i === 2 ? '1001' : `Value_${i}`));
    }

    const sample_values: { body?: string[]; header?: string[] } = {};
    if (bodySamples.length > 0) {
      sample_values.body = bodySamples;
    }
    if (formHeaderType === 'text' && formHeaderText.includes('{{1}}')) {
      sample_values.header = [formHeaderSample.trim() || 'Notice'];
    }

    const payload = {
      name: sanitizedName,
      category: formCategory,
      language: formLanguage,
      header_type: formHeaderType === 'none' ? undefined : formHeaderType,
      header_content: formHeaderType === 'text' ? formHeaderText.trim() : undefined,
      header_media_url: ['image', 'video', 'document'].includes(formHeaderType)
        ? formHeaderMediaUrl.trim() || undefined
        : undefined,
      body_text: formBodyText.trim(),
      footer_text: formFooterText.trim() || undefined,
      buttons: formButtons.length > 0 ? formButtons : undefined,
      sample_values: Object.keys(sample_values).length > 0 ? sample_values : undefined,
    };

    setSubmitting(true);

    try {
      let res = await fetch('/api/whatsapp/templates/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok && res.status === 404) {
        res = await fetch('/api/whatsapp/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit template to WhatsApp');
      }

      toast.success(
        data.dry_run
          ? 'Template saved locally (dry-run mode)'
          : 'Template submitted to Meta WhatsApp for approval!'
      );
      setCreateOpen(false);
      await fetchTemplates();
    } catch (err) {
      console.error('Template submit error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to submit template');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      let res = await fetch(`/api/whatsapp/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        res = await fetch(`/api/whatsapp/templates?id=${id}`, { method: 'DELETE' });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete template');
      }
      toast.success('Template deleted successfully');
      setDeleteId(null);
      await fetchTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete template');
    }
  }

  const filteredTemplates = useMemo(() => {
    return templates.filter((t) => {
      const status = (t.status || 'DRAFT').toUpperCase();
      if (activeTab === 'ALL') return true;
      if (activeTab === 'APPROVED') return status === 'APPROVED';
      if (activeTab === 'PENDING') return status === 'PENDING' || status === 'SUBMITTED';
      if (activeTab === 'REJECTED') return status === 'REJECTED' || status === 'FAILED';
      return true;
    });
  }, [templates, activeTab]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Templates</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-2xl">
            It usually takes 1 - 2 minutes to approve a template, but for new WhatsApp API accounts it can take up to 24 hours for the first template approval.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setBrowseOpen(true)}
            className="border-border text-foreground hover:bg-muted"
          >
            <BookOpen className="size-3.5 mr-1.5" />
            Browse Templates
          </Button>
          <Button
            size="sm"
            onClick={() => handleOpenCreate()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shadow-xs"
          >
            <Plus className="size-3.5 mr-1.5" />
            + Template
          </Button>
        </div>
      </div>

      {/* Tabs & Sync Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-1">
          {(['ALL', 'APPROVED', 'PENDING', 'REJECTED'] as StatusTab[]).map((tab) => {
            const isActive = activeTab === tab;
            const count = templates.filter((t) => {
              const s = (t.status || 'DRAFT').toUpperCase();
              if (tab === 'ALL') return true;
              if (tab === 'APPROVED') return s === 'APPROVED';
              if (tab === 'PENDING') return s === 'PENDING' || s === 'SUBMITTED';
              if (tab === 'REJECTED') return s === 'REJECTED' || s === 'FAILED';
              return true;
            }).length;

            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`relative px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors capitalize ${
                  isActive
                    ? 'text-primary bg-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                }`}
              >
                {tab.toLowerCase()} ({count})
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleSyncFromMeta}
          disabled={syncing}
          className="text-xs text-muted-foreground hover:text-foreground h-8"
        >
          <RefreshCw className={`size-3.5 mr-1.5 ${syncing ? 'animate-spin text-primary' : ''}`} />
          {syncing ? 'Syncing...' : 'Sync'}
        </Button>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="size-7 animate-spin text-primary" />
        </div>
      ) : filteredTemplates.length === 0 ? (
        /* Empty State */
        <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-4 shadow-xs">
            <MessageSquare className="size-7" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Create Your First Template</h2>
          <p className="mt-1.5 max-w-md text-xs sm:text-sm text-muted-foreground">
            Design and set up WhatsApp message templates to streamline your communication with customers.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Button
              onClick={() => handleOpenCreate()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-xs sm:text-sm"
            >
              <Plus className="size-4 mr-1.5" />
              Create New Template
            </Button>
            <Button
              variant="outline"
              onClick={() => setBrowseOpen(true)}
              className="border-border text-xs sm:text-sm"
            >
              <BookOpen className="size-4 mr-1.5" />
              Browse Examples
            </Button>
          </div>
        </div>
      ) : (
        /* Template Grid */
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template) => {
            const statusKey = template.status || 'DRAFT';
            const status = templateStatusConfig[statusKey] || {
              label: statusKey,
              classes: 'bg-muted text-muted-foreground border-border',
            };

            return (
              <div
                key={template.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/40 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-sm text-foreground truncate" title={template.name}>
                        {template.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground uppercase">
                          {template.language}
                        </span>
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {template.category}
                        </span>
                      </div>
                    </div>
                    <Badge className={`text-[10px] border shrink-0 ${status.classes}`}>
                      {status.label}
                    </Badge>
                  </div>

                  {/* Bubble Preview */}
                  <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs space-y-2">
                    {template.header_type && (
                      <div className="font-semibold text-foreground text-[11px] pb-1 border-b border-border/50">
                        [{template.header_type.toUpperCase()}] {template.header_content || ''}
                      </div>
                    )}
                    <p className="text-foreground/90 whitespace-pre-wrap line-clamp-4 leading-relaxed">
                      {template.body_text}
                    </p>
                    {template.footer_text && (
                      <p className="text-[10px] text-muted-foreground italic border-t border-border/40 pt-1">
                        {template.footer_text}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-border">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(template.name);
                      toast.success(`Copied "${template.name}"`);
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    <Copy className="size-3 mr-1" />
                    Copy
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPreviewTemplate(template)}
                      className="text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                    >
                      <Eye className="size-3 mr-1" />
                      Preview
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteId(template.id)}
                      className="text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 h-7 px-2"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Template Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Create WhatsApp Template</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Templates must be reviewed and approved by Meta before they can be sent to customers.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Template Name</Label>
                <Input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value.toLowerCase().replace(/\s+/g, '_'))}
                  placeholder="e.g. order_confirmation"
                  className="mt-1 text-xs"
                />
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Lowercase letters, numbers, and underscores only.
                </p>
              </div>

              <div>
                <Label className="text-xs">Category</Label>
                <Select
                  value={formCategory}
                  onValueChange={(val) => {
                    if (val) setFormCategory(val as 'Marketing' | 'Utility' | 'Authentication');
                  }}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Marketing">Marketing</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                    <SelectItem value="Authentication">Authentication</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Language</Label>
                <Select
                  value={formLanguage}
                  onValueChange={(val) => {
                    if (val) setFormLanguage(val);
                  }}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en_US">English (US)</SelectItem>
                    <SelectItem value="en_GB">English (UK)</SelectItem>
                    <SelectItem value="hi">Hindi (hi)</SelectItem>
                    <SelectItem value="es">Spanish (es)</SelectItem>
                    <SelectItem value="pt_BR">Portuguese (BR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Header Format</Label>
                <Select
                  value={formHeaderType}
                  onValueChange={(val) => {
                    if (val) setFormHeaderType(val as 'none' | 'text' | 'image' | 'video' | 'document');
                  }}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="text">Text Header</SelectItem>
                    <SelectItem value="image">Image (Media)</SelectItem>
                    <SelectItem value="video">Video (Media)</SelectItem>
                    <SelectItem value="document">Document (PDF)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formHeaderType === 'text' && (
              <div>
                <Label className="text-xs">Header Text</Label>
                <Input
                  value={formHeaderText}
                  onChange={(e) => setFormHeaderText(e.target.value)}
                  placeholder="e.g. Special Announcement"
                  className="mt-1 text-xs"
                />
              </div>
            )}

            {['image', 'video', 'document'].includes(formHeaderType) && (
              <div>
                <Label className="text-xs">Header Media File</Label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="file"
                    onChange={handleFileUpload}
                    className="text-xs file:bg-primary/10 file:text-primary file:border-0 file:rounded-md file:mr-2 cursor-pointer"
                  />
                  {uploadingMedia && <Loader2 className="size-4 animate-spin text-primary" />}
                </div>
                {formHeaderMediaUrl && (
                  <p className="text-[10px] text-emerald-600 mt-1 truncate">
                    Uploaded: {formHeaderMediaUrl}
                  </p>
                )}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Body Text</Label>
                <button
                  type="button"
                  onClick={() => setFormBodyText((prev) => `${prev} {{${(prev.match(/{{/g) || []).length + 1}}}`)}
                  className="text-[11px] text-primary hover:underline font-semibold"
                >
                  + Insert Variable
                </button>
              </div>
              <Textarea
                value={formBodyText}
                onChange={(e) => setFormBodyText(e.target.value)}
                placeholder="Hello {{1}}, your order {{2}} is confirmed!"
                rows={4}
                className="mt-1 text-xs font-sans"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Use variables like <code className="bg-muted px-1 rounded">{"{{1}}"}</code> for contact name, order ID, etc.
              </p>
            </div>

            {/* Dynamic Meta Review Sample Values */}
            {bodyVariables.length > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-primary" />
                  <p className="text-xs font-semibold text-primary">
                    WhatsApp Sample Values (Required by Meta)
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Meta requires realistic example values for each variable so human reviewers can approve your template.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {bodyVariables.map((v) => (
                    <div key={v}>
                      <Label className="text-[11px] font-medium text-foreground">
                        Sample for {`{{${v}}}`}
                      </Label>
                      <Input
                        value={formBodySamples[v] || ''}
                        onChange={(e) =>
                          setFormBodySamples((prev) => ({ ...prev, [v]: e.target.value }))
                        }
                        placeholder={v === 1 ? 'e.g. John Doe' : v === 2 ? 'e.g. #ORD-9821' : `e.g. Sample ${v}`}
                        className="text-xs mt-1 bg-background"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {formHeaderType === 'text' && formHeaderText.includes('{{1}}') && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                <Label className="text-[11px] font-medium text-primary">
                  Header Variable {"{{1}}"} Sample Value
                </Label>
                <Input
                  value={formHeaderSample}
                  onChange={(e) => setFormHeaderSample(e.target.value)}
                  placeholder="e.g. Special Announcement"
                  className="text-xs mt-1 bg-background"
                />
              </div>
            )}

            <div>
              <Label className="text-xs">Footer Text (Optional)</Label>
              <Input
                value={formFooterText}
                onChange={(e) => setFormFooterText(e.target.value)}
                placeholder="e.g. Reply STOP to opt out"
                className="mt-1 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveTemplate}
              disabled={submitting}
              className="bg-primary text-primary-foreground font-semibold"
            >
              {submitting && <Loader2 className="size-3.5 mr-1.5 animate-spin" />}
              Submit to WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Browse Templates Preset Dialog */}
      <Dialog open={browseOpen} onOpenChange={setBrowseOpen}>
        <DialogContent className="max-w-2xl bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <BookOpen className="size-5 text-primary" />
              WhatsApp Template Library
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select any pre-built, high-converting template to load into your editor with 1 click.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2 max-h-[60vh] overflow-y-auto">
            {TEMPLATE_PRESETS.map((preset) => (
              <div
                key={preset.name}
                className="flex flex-col justify-between rounded-xl border border-border bg-muted/40 p-4 space-y-3"
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <p className="font-bold text-xs text-foreground">{preset.name}</p>
                    <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                      {preset.category}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 line-clamp-3">
                    {preset.body_text}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleOpenCreate(preset)}
                  className="w-full text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  <Sparkles className="size-3 mr-1" />
                  Use This Template
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewTemplate} onOpenChange={(open) => !open && setPreviewTemplate(null)}>
        <DialogContent className="max-w-md bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">{previewTemplate?.name}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              WhatsApp Message Preview
            </DialogDescription>
          </DialogHeader>

          {previewTemplate && (
            <div className="rounded-2xl border border-border bg-slate-100 dark:bg-slate-900 p-4">
              <div className="rounded-xl bg-white dark:bg-slate-800 p-3.5 shadow-sm text-xs space-y-2 text-slate-900 dark:text-slate-100">
                {previewTemplate.header_content && (
                  <p className="font-bold text-xs pb-1 border-b border-slate-200 dark:border-slate-700">
                    {previewTemplate.header_content}
                  </p>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{previewTemplate.body_text}</p>
                {previewTemplate.footer_text && (
                  <p className="text-[10px] text-slate-500 italic pt-1 border-t border-slate-200 dark:border-slate-700">
                    {previewTemplate.footer_text}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="max-w-sm bg-card border-border text-foreground">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Delete Template</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Are you sure you want to delete this template? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => deleteId && handleDelete(deleteId)}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

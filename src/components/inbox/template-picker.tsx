"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Phone,
  Search,
  Video,
} from "lucide-react";
import { extractVariableIndices } from "@/lib/whatsapp/template-validators";
import { useTranslations } from "next-intl";

export interface TemplateSendValues {
  body: string[];
  headerText?: string;
  headerMediaUrl?: string;
  buttonParams?: Record<number, string>;
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: MessageTemplate, values: TemplateSendValues) => void;
}

function renderBodyPreview(body: string, params: string[]): string {
  return (body || "").replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    const value = params[idx];
    return value && value.trim().length > 0 ? value : `{{${raw}}}`;
  });
}

function renderHeaderText(header: string, param?: string): string {
  if (!header) return "";
  if (!param || !param.trim()) return header;
  return header.replace(/\{\{1\}\}/g, param.trim());
}

interface UrlButtonSlot {
  index: number;
  text: string;
  url: string;
}

/**
 * Templates may need values for: body variables, a text-header
 * variable, media header url, and per-URL-button suffixes.
 */
function collectVariableSlots(template: MessageTemplate): {
  bodyVars: number[];
  headerVarCount: number;
  urlButtonSlots: UrlButtonSlot[];
  isMediaHeader: boolean;
} {
  const bodyVars = extractVariableIndices(template.body_text || "");
  const headerVarCount =
    template.header_type === "text" && template.header_content
      ? extractVariableIndices(template.header_content).length
      : 0;
  const isMediaHeader =
    template.header_type === "image" ||
    template.header_type === "video" ||
    template.header_type === "document";
  const urlButtonSlots: UrlButtonSlot[] = [];
  (template.buttons ?? []).forEach((b, i) => {
    if (b.type === "URL" && extractVariableIndices(b.url || "").length > 0) {
      urlButtonSlots.push({ index: i, text: b.text, url: b.url });
    }
  });
  return { bodyVars, headerVarCount, urlButtonSlots, isMediaHeader };
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
}: TemplatePickerProps) {
  const t = useTranslations("Inbox.templatePicker");

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState<string>("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState<string>("");
  const [buttonParams, setButtonParams] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      // Scope by RLS (message_templates_select → is_account_member), NOT by
      // user_id. Templates are account-owned.
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("status", "APPROVED")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch templates:", error);
        setTemplates([]);
      } else {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function resetSelection() {
    setSelected(null);
    setParams([]);
    setHeaderText("");
    setHeaderMediaUrl("");
    setButtonParams({});
    setSearch("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetSelection();
    onOpenChange(next);
  }

  function pickTemplate(template: MessageTemplate) {
    const slots = collectVariableSlots(template);
    setSelected(template);
    setParams(new Array(slots.bodyVars.length).fill(""));
    setHeaderText("");
    setHeaderMediaUrl(template.header_media_url || "");
    setButtonParams({});
  }

  function confirm() {
    if (!selected) return;
    const values: TemplateSendValues = { body: params };
    if (headerText.trim()) values.headerText = headerText.trim();
    const effectiveMediaUrl = headerMediaUrl.trim() || selected.header_media_url?.trim();
    if (effectiveMediaUrl) values.headerMediaUrl = effectiveMediaUrl;
    if (Object.keys(buttonParams).length > 0) {
      values.buttonParams = Object.fromEntries(
        Object.entries(buttonParams).map(([k, v]) => [Number(k), v.trim()]),
      );
    }
    onSelect(selected, values);
    handleOpenChange(false);
  }

  const slots = useMemo(
    () => (selected ? collectVariableSlots(selected) : null),
    [selected],
  );

  const canConfirm = useMemo(() => {
    if (!selected || !slots) return false;
    const bodyFilled = slots.bodyVars.every((_, i) => (params[i] ?? "").trim().length > 0);
    const headerTextFilled = slots.headerVarCount === 0 || headerText.trim().length > 0;
    const headerMediaFilled =
      !slots.isMediaHeader ||
      headerMediaUrl.trim().length > 0 ||
      (selected.header_media_url && selected.header_media_url.trim().length > 0);
    const buttonsFilled = slots.urlButtonSlots.every(
      (s) => (buttonParams[s.index] ?? "").trim().length > 0,
    );
    return bodyFilled && headerTextFilled && headerMediaFilled && buttonsFilled;
  }, [selected, slots, params, headerText, headerMediaUrl, buttonParams]);

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(
      (tmpl) =>
        tmpl.name.toLowerCase().includes(q) ||
        (tmpl.body_text && tmpl.body_text.toLowerCase().includes(q)) ||
        (tmpl.category && tmpl.category.toLowerCase().includes(q)),
    );
  }, [templates, search]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            {selected ? selected.name : t("sendTemplate")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selected
              ? t("fillPlaceholders")
              : t("pickTemplate")}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates by name, content, or category..."
                className="pl-8 text-xs border-border bg-background/60 text-foreground placeholder:text-muted-foreground"
              />
            </div>

            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="rounded-md border border-border bg-background/50 p-6 text-center">
                  <p className="text-sm text-popover-foreground">
                    {search ? "No matching templates found" : t("noApprovedTemplates")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {search ? "Try adjusting your search term" : t("noApprovedTemplatesHint")}
                  </p>
                </div>
              ) : (
                filteredTemplates.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    onClick={() => pickTemplate(tmpl)}
                    className="w-full rounded-md border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-popover group"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium text-popover-foreground group-hover:text-primary transition-colors">
                            {tmpl.name}
                          </p>
                          <Badge className="border border-primary/30 bg-primary/20 text-[10px] text-primary">
                            {tmpl.category}
                          </Badge>
                          {tmpl.header_type && (
                            <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
                              {tmpl.header_type}
                            </Badge>
                          )}
                          {tmpl.language && (
                            <span className="text-[10px] uppercase text-muted-foreground">
                              {tmpl.language}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {tmpl.body_text}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {/* WhatsApp-style card preview */}
            <div className="rounded-lg border border-border bg-background/70 p-3.5 shadow-sm space-y-2">
              <div className="flex items-center justify-between pb-1 border-b border-border/50">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("preview")}
                </span>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {selected.language || "en_US"}
                </Badge>
              </div>

              {/* Header preview */}
              {selected.header_type === "text" && selected.header_content && (
                <p className="text-sm font-semibold text-foreground">
                  {renderHeaderText(selected.header_content, headerText)}
                </p>
              )}
              {slots?.isMediaHeader && (
                <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-center flex flex-col items-center gap-1.5">
                  {selected.header_type === "image" && <ImageIcon className="h-6 w-6 text-primary/80" />}
                  {selected.header_type === "video" && <Video className="h-6 w-6 text-primary/80" />}
                  {selected.header_type === "document" && <FileText className="h-6 w-6 text-primary/80" />}
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Header {selected.header_type}
                  </span>
                  {(headerMediaUrl || selected.header_media_url) ? (
                    <span className="text-[10px] text-muted-foreground break-all max-w-full truncate">
                      {headerMediaUrl || selected.header_media_url}
                    </span>
                  ) : (
                    <span className="text-[10px] text-amber-400">Media URL required below</span>
                  )}
                </div>
              )}

              {/* Body text preview */}
              <p className="whitespace-pre-wrap text-sm text-popover-foreground leading-relaxed">
                {renderBodyPreview(selected.body_text || "", params)}
              </p>

              {/* Footer preview */}
              {selected.footer_text && (
                <p className="text-xs italic text-muted-foreground pt-1">
                  {selected.footer_text}
                </p>
              )}

              {/* Buttons preview */}
              {selected.buttons && selected.buttons.length > 0 && (
                <div className="pt-2 border-t border-border/50 flex flex-wrap gap-1.5">
                  {selected.buttons.map((btn, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-muted text-[11px] font-medium text-foreground border border-border"
                    >
                      {btn.type === "PHONE_NUMBER" && <Phone className="h-3 w-3 text-muted-foreground" />}
                      {btn.type === "URL" && <ExternalLink className="h-3 w-3 text-muted-foreground" />}
                      {btn.type === "COPY_CODE" && <Copy className="h-3 w-3 text-muted-foreground" />}
                      <span>{btn.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inputs for parameters */}
            <div className="space-y-3">
              {/* Media header input */}
              {slots?.isMediaHeader && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-popover-foreground flex items-center justify-between">
                    <span>
                      Header {selected.header_type?.toUpperCase()} URL
                      <span className="text-red-400 ml-0.5">*</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground">Direct HTTPS link</span>
                  </Label>
                  <Input
                    value={headerMediaUrl}
                    onChange={(e) => setHeaderMediaUrl(e.target.value)}
                    placeholder={`https://example.com/file.${selected.header_type === "image" ? "jpg" : selected.header_type === "video" ? "mp4" : "pdf"}`}
                    className="border-border bg-muted text-foreground placeholder:text-muted-foreground text-xs"
                  />
                </div>
              )}

              {/* Text header variable */}
              {slots && slots.headerVarCount > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs font-medium text-popover-foreground">
                    Header Variable {"{{1}}"}
                    <span className="text-red-400 ml-0.5">*</span>
                  </Label>
                  <Input
                    value={headerText}
                    onChange={(e) => setHeaderText(e.target.value)}
                    placeholder={t("headerValuePlaceholder")}
                    className="border-border bg-muted text-foreground placeholder:text-muted-foreground text-xs"
                  />
                </div>
              )}

              {/* Body variables */}
              {slots?.bodyVars.map((v, i) => (
                <div key={v} className="space-y-1">
                  <Label className="text-xs font-medium text-popover-foreground">
                    Body Variable {`{{${v}}}`}
                    <span className="text-red-400 ml-0.5">*</span>
                  </Label>
                  <Input
                    value={params[i] ?? ""}
                    onChange={(e) => {
                      const next = [...params];
                      next[i] = e.target.value;
                      setParams(next);
                    }}
                    placeholder={t("bodyValuePlaceholder", { val: `{{${v}}}` })}
                    className="border-border bg-muted text-foreground placeholder:text-muted-foreground text-xs"
                  />
                </div>
              ))}

              {/* URL button suffixes */}
              {slots?.urlButtonSlots.map((slot) => (
                <div key={slot.index} className="space-y-1">
                  <Label className="text-xs font-medium text-popover-foreground">
                    {`URL Button "${slot.text}" — Suffix for `}{"{{1}}"}
                    <span className="text-red-400 ml-0.5">*</span>
                  </Label>
                  <Input
                    value={buttonParams[slot.index] ?? ""}
                    onChange={(e) =>
                      setButtonParams((prev) => ({
                        ...prev,
                        [slot.index]: e.target.value,
                      }))
                    }
                    placeholder={t("urlSuffixValuePlaceholder")}
                    className="border-border bg-muted text-foreground placeholder:text-muted-foreground text-xs"
                  />
                  <p className="text-[10px] text-muted-foreground break-all">
                    {t("finalUrl", { url: slot.url.replace(/\{\{1\}\}/g, buttonParams[slot.index] || "{{1}}") })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {selected ? (
            <>
              <Button
                variant="outline"
                onClick={resetSelection}
                className="border-border text-popover-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("back")}
              </Button>
              <Button
                disabled={!canConfirm}
                onClick={confirm}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {t("send")}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-popover-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

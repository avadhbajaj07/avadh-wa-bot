"use client";

/**
 * Editor toolbar — flow name / description, status chip, dirty
 * indicator, and the action buttons (Save, Activate/Pause, Delete,
 * View runs, Back).
 *
 * Restyled to the Flow Builder design handoff: a single compact
 * toolbar row (back · icon · inline-editable name · status chip ·
 * edited dot on the left; Runs · Delete · Activate · Save on the
 * right) followed by a subtle, full-width description "note" line.
 * Replaces the old three-row stack so the editor reads as one app
 * chrome bar above the canvas/list stage.
 *
 * Lifted out of flow-builder.tsx so the same toolbar renders above
 * both views in FlowEditorShell. Without this, canvas users had no
 * way to save without toggling to list view.
 *
 * Reads everything from the editor context (`useFlowEditor`) so it
 * stays in sync with whichever view is mutating state, and routes
 * router navigation locally (back to /flows, View runs to
 * /flows/[id]/runs) — those don't belong in the hook.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  CircleDot,
  History,
  Loader2,
  PauseCircle,
  PlayCircle,
  Save,
  Trash2,
  Workflow,
  Pencil,
  Play,
  Send,
  ExternalLink,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  useFlowEditor,
  type BuilderState,
} from "./flow-editor-state";

export function EditorHeader() {
  const router = useRouter();
  const t = useTranslations("Flows.header");
  const [testOpen, setTestOpen] = useState(false);
  const {
    flow,
    state,
    setState,
    dirty,
    saving,
    activating,
    canActivate,
    save,
    setStatus,
    deleteFlow,
  } = useFlowEditor();

  const keywords =
    state.trigger_type === "keyword" && Array.isArray((state.trigger_config as { keywords?: string[] })?.keywords)
      ? (state.trigger_config as { keywords: string[] }).keywords
      : [];

  return (
    <>
      <div className="flex flex-col gap-1.5 px-6 pt-5">
        <div className="flex flex-wrap items-center gap-3">
          {/* ---- left: back · icon · name · status · edited ---- */}
          <button
            type="button"
            onClick={() => router.push("/flows")}
            title={t("backToFlows")}
            aria-label={t("backToFlows")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <Workflow className="h-[18px] w-[18px]" />
          </span>

          <div className="group relative flex items-center">
            <input
              value={state.name}
              onChange={(e) => setState((s) => ({ ...s, name: e.target.value }))}
              placeholder={t("namePlaceholder")}
              spellCheck={false}
              aria-label={t("namePlaceholder")}
              className="min-w-[120px] max-w-[340px] rounded-lg border border-transparent bg-transparent pr-7 py-1 text-lg font-bold leading-tight tracking-tight text-foreground outline-none transition-colors hover:bg-muted focus:border-primary focus:bg-transparent focus:shadow-[0_0_0_3px_var(--primary-soft)]"
            />
            <Pencil className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
          </div>

          <StatusChip status={state.status} />
          {dirty && (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-300"
              title={t("unsavedHint")}
              aria-live="polite"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              {t("edited")}
            </span>
          )}

          {/* ---- right: runs · delete · test flow · publish/save ---- */}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/flows/${flow.id}/runs`)}
            >
              <History className="h-3.5 w-3.5" />
              {t("runs")}
              <span className="ml-0.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {flow.execution_count}
              </span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => void deleteFlow()}
              className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("delete")}
            </Button>

            {/* Test Flow button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTestOpen(true)}
              className="border-border text-foreground hover:bg-muted"
            >
              <Play className="h-3.5 w-3.5 text-emerald-400" />
              Test Flow
            </Button>

            {state.status === "active" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void setStatus("draft")}
                  disabled={activating}
                >
                  {activating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <PauseCircle className="h-3.5 w-3.5" />
                  )}
                  {t("pause")}
                </Button>
                <Button
                  onClick={() => void save()}
                  disabled={saving || !dirty}
                  size="sm"
                  className={cn(
                    "transition-all",
                    dirty
                      ? "bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {t("save")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void save()}
                  disabled={saving}
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {t("save")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => void setStatus("active")}
                  disabled={activating || !canActivate}
                  title={!canActivate ? t("fixIssues") : undefined}
                  className="bg-purple-600 text-white hover:bg-purple-700 shadow-sm transition-all font-medium"
                >
                  {activating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                  )}
                  Publish Flow
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ---- description note (subtle, inline-editable) ---- */}
        <input
          value={state.description}
          onChange={(e) =>
            setState((s) => ({ ...s, description: e.target.value }))
          }
          placeholder={t("descriptionPlaceholder")}
          aria-label={t("descriptionLabel")}
          className="w-full max-w-[78ch] rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] text-muted-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-muted/50 focus:border-primary focus:bg-transparent focus:text-foreground"
        />
      </div>

      {/* Test Flow Dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent className="sm:max-w-md bg-popover text-popover-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-emerald-400" />
              Test &quot;{state.name}&quot; Flow
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              You can test this automated conversation flow directly from WhatsApp.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-sm">
            {state.status !== "active" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300">
                <p className="font-semibold text-xs">⚠️ Flow is currently in Draft</p>
                <p className="text-xs text-amber-300/80 mt-1">
                  Click &quot;Publish Flow&quot; before testing so WhatsApp can trigger it automatically.
                </p>
              </div>
            )}

            <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Trigger Method
              </p>
              {state.trigger_type === "keyword" ? (
                <div>
                  <p className="text-sm">
                    Send any of these keywords to your connected WhatsApp number:
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {keywords.length > 0 ? (
                      keywords.map((kw) => (
                        <Badge key={kw} variant="secondary" className="font-mono text-xs">
                          {kw}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground italic">No keywords set</span>
                    )}
                  </div>
                </div>
              ) : state.trigger_type === "first_inbound_message" ? (
                <p className="text-sm">
                  Triggers on any contact&apos;s first incoming message.
                </p>
              ) : (
                <p className="text-sm">Manual trigger only.</p>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Connected Numbers
              </p>
              <div className="grid grid-cols-1 gap-2">
                <a
                  href={`https://wa.me/919406633778?text=${encodeURIComponent(keywords[0] || "hi")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5 hover:bg-muted transition-colors text-xs"
                >
                  <div>
                    <p className="font-medium text-foreground">+91 94066 33778 (Shikha Bajaj)</p>
                    <p className="text-muted-foreground text-[11px]">Send &quot;{keywords[0] || "hi"}&quot; to test</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
                <a
                  href={`https://wa.me/917282316090?text=${encodeURIComponent(keywords[0] || "hi")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded-lg border border-border bg-background p-2.5 hover:bg-muted transition-colors text-xs"
                >
                  <div>
                    <p className="font-medium text-foreground">+91 72823 16090 (Maruti Digital)</p>
                    <p className="text-muted-foreground text-[11px]">Send &quot;{keywords[0] || "hi"}&quot; to test</p>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </a>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setTestOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                setTestOpen(false);
                router.push(`/flows/${flow.id}/runs`);
              }}
              variant="outline"
            >
              <History className="h-3.5 w-3.5 mr-1" />
              View Run History
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StatusChip({ status }: { status: BuilderState["status"] }) {
  // Status labels live with the flows list so the chip and the list
  // badge can never drift apart.
  const t = useTranslations("Flows.list");
  const cfg = {
    draft: {
      // Neutral, not amber — amber is reserved for the adjacent
      // "Edited" dirty signal, so the two don't read as the same alert.
      cls: "border-border bg-muted text-muted-foreground",
      label: t("statusDraft"),
    },
    active: {
      cls: "border-emerald-600/40 bg-emerald-500/10 text-emerald-300",
      label: t("statusActive"),
    },
    archived: {
      cls: "border-border bg-muted/50 text-muted-foreground",
      label: t("statusArchived"),
    },
  }[status];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium",
        cfg.cls,
      )}
    >
      <CircleDot className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag, PipelineStage } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import { contactHandle } from "@/lib/whatsapp/wa-identity";
import { addContactTag, deleteContactTag } from "@/lib/contacts/tag-api";
import { DealForm } from "@/components/pipelines/deal-form";
import { formatCurrency } from "@/lib/currency";
import { toast } from "sonner";

const SPEC_DEFAULT_STAGES = [
  { name: "Lead", color: "#6366f1", position: 0 },
  { name: "Contact Made", color: "#3b82f6", position: 1 },
  { name: "Proposal Sent", color: "#f59e0b", position: 2 },
  { name: "Negotiation", color: "#8b5cf6", position: 3 },
  { name: "Closed Won", color: "#10b981", position: 4 },
  { name: "Closed Lost", color: "#ef4444", position: 5 },
];

const PRESET_TAG_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

function hashTagColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return PRESET_TAG_COLORS[Math.abs(hash) % PRESET_TAG_COLORS.length];
}

interface ContactSidebarProps {
  contact: Contact | null;
  onContactUpdated?: () => void;
}

export function ContactSidebar({ contact, onContactUpdated }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId, defaultCurrency } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Tag management state
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const [savingTagId, setSavingTagId] = useState<string | null>(null);
  const [creatingTag, setCreatingTag] = useState(false);

  // Deal management state
  const [dealFormOpen, setDealFormOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loadingPipeline, setLoadingPipeline] = useState(false);

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, contact tags, and all available account tags in parallel
    const [dealsRes, notesRes, tagsRes, allTagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
      supabase
        .from("tags")
        .select("*")
        .order("name", { ascending: true }),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
    if (allTagsRes.data) {
      setAllTags(allTagsRes.data);
    }
  }, [contact]);

  useEffect(() => {
    fetchContactData();
  }, [fetchContactData]);

  const loadPipelines = useCallback(async () => {
    const supabase = createClient();
    try {
      setLoadingPipeline(true);
      const { data: pList } = await supabase
        .from("pipelines")
        .select("*, stages:pipeline_stages(*)")
        .order("created_at");

      if (pList && pList.length > 0) {
        const firstPipeline = pList[0];
        const sortedStages = (
          (firstPipeline.stages as PipelineStage[]) || []
        ).sort((a, b) => a.position - b.position);
        setPipelineId(firstPipeline.id);
        setStages(sortedStages);
        return { pipelineId: firstPipeline.id, stages: sortedStages };
      }

      // Seed default pipeline if none exists yet
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || !accountId) return null;

      const { data: pipeline, error: pipeErr } = await supabase
        .from("pipelines")
        .insert({
          user_id: user.id,
          account_id: accountId,
          name: "Sales Pipeline",
        })
        .select()
        .single();

      if (pipeErr || !pipeline) return null;

      const stagesPayload = SPEC_DEFAULT_STAGES.map((s) => ({
        pipeline_id: pipeline.id,
        name: s.name,
        color: s.color,
        position: s.position,
      }));

      const { data: createdStages } = await supabase
        .from("pipeline_stages")
        .insert(stagesPayload)
        .select()
        .order("position");

      const sorted = (createdStages ?? []).sort(
        (a, b) => a.position - b.position
      );
      setPipelineId(pipeline.id);
      setStages(sorted);
      return { pipelineId: pipeline.id, stages: sorted };
    } catch (err) {
      console.error("Failed to load/seed pipeline:", err);
      return null;
    } finally {
      setLoadingPipeline(false);
    }
  }, [accountId]);

  const handleCopyPhone = useCallback(async () => {
    const handle = contact ? contactHandle(contact) : "";
    if (!handle) return;
    await navigator.clipboard.writeText(handle);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [contact]);

  const handleToggleTag = useCallback(
    async (tag: Tag) => {
      if (!contact) return;
      const isAssigned = tags.some((t) => t.id === tag.id);
      setSavingTagId(tag.id);
      try {
        if (isAssigned) {
          await deleteContactTag(contact.id, tag.id);
          setTags((prev) => prev.filter((t) => t.id !== tag.id));
          toast.success(`Removed tag "${tag.name}"`);
        } else {
          await addContactTag(contact.id, tag.id);
          setTags((prev) => [
            ...prev,
            { ...tag, contact_tag_id: `${contact.id}_${tag.id}` },
          ]);
          toast.success(`Added tag "${tag.name}"`);
        }
        onContactUpdated?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to update tag");
        fetchContactData();
      } finally {
        setSavingTagId(null);
      }
    },
    [contact, tags, onContactUpdated, fetchContactData]
  );

  const handleRemoveTag = useCallback(
    async (tagId: string, tagName: string) => {
      if (!contact) return;
      setSavingTagId(tagId);
      try {
        await deleteContactTag(contact.id, tagId);
        setTags((prev) => prev.filter((t) => t.id !== tagId));
        toast.success(`Removed tag "${tagName}"`);
        onContactUpdated?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to remove tag");
        fetchContactData();
      } finally {
        setSavingTagId(null);
      }
    },
    [contact, onContactUpdated, fetchContactData]
  );

  const handleCreateTag = useCallback(async () => {
    if (!contact || !tagSearch.trim() || !accountId) return;
    setCreatingTag(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        toast.error("Not authenticated");
        return;
      }

      const tagName = tagSearch.trim();
      const color = hashTagColor(tagName);

      const { data: createdTag, error } = await supabase
        .from("tags")
        .insert({
          account_id: accountId,
          user_id: user.id,
          name: tagName,
          color,
        })
        .select()
        .single();

      if (error || !createdTag) {
        throw error || new Error("Failed to create tag");
      }

      await addContactTag(contact.id, createdTag.id);

      setAllTags((prev) => [...prev, createdTag]);
      setTags((prev) => [
        ...prev,
        { ...createdTag, contact_tag_id: `${contact.id}_${createdTag.id}` },
      ]);
      setTagSearch("");
      toast.success(`Created & added tag "${createdTag.name}"`);
      onContactUpdated?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tag");
    } finally {
      setCreatingTag(false);
    }
  }, [contact, tagSearch, accountId, onContactUpdated]);

  const handleOpenNewDeal = useCallback(async () => {
    if (!contact) return;
    if (!pipelineId || stages.length === 0) {
      const res = await loadPipelines();
      if (!res) {
        toast.error("Could not load sales pipeline");
        return;
      }
    }
    setSelectedDeal(null);
    setDealFormOpen(true);
  }, [contact, pipelineId, stages.length, loadPipelines]);

  const handleEditDeal = useCallback(
    async (deal: Deal) => {
      if (!pipelineId || stages.length === 0) {
        await loadPipelines();
      }
      setSelectedDeal(deal);
      setDealFormOpen(true);
    },
    [pipelineId, stages.length, loadPipelines]
  );

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  const filteredTags = useMemo(() => {
    if (!tagSearch.trim()) return allTags;
    const q = tagSearch.trim().toLowerCase();
    return allTags.filter((t) => t.name.toLowerCase().includes(q));
  }, [allTags, tagSearch]);

  const showCreateOption = useMemo(() => {
    const q = tagSearch.trim();
    if (!q) return false;
    return !allTags.some((t) => t.name.toLowerCase() === q.toLowerCase());
  }, [allTags, tagSearch]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || contactHandle(contact);
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">
                {contactHandle(contact)}
              </span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <TagIcon className="h-3 w-3" />
                {tSidebar("tags")}
              </div>

              <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
                <PopoverTrigger
                  className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  title="Add or manage tags"
                  aria-label="Add or manage tags"
                >
                  <Plus className="h-3.5 w-3.5" />
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 p-2.5">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-border">
                    <span className="text-xs font-semibold text-foreground">
                      Manage Tags
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {tags.length} applied
                    </span>
                  </div>

                  {/* Search or create input */}
                  <Input
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search or add tag..."
                    className="h-7 text-xs mb-2 bg-muted/50 border-border"
                  />

                  {/* Tag list */}
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {filteredTags.map((tag) => {
                      const isAssigned = tags.some((t) => t.id === tag.id);
                      const isSaving = savingTagId === tag.id;
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => handleToggleTag(tag)}
                          disabled={savingTagId !== null}
                          className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted transition-colors text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: tag.color }}
                            />
                            <span className="truncate text-foreground">
                              {tag.name}
                            </span>
                          </div>
                          {isSaving ? (
                            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                          ) : isAssigned ? (
                            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                          ) : null}
                        </button>
                      );
                    })}

                    {/* Create new tag option */}
                    {showCreateOption && (
                      <button
                        type="button"
                        onClick={handleCreateTag}
                        disabled={creatingTag}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-primary hover:bg-primary/10 transition-colors text-left font-medium"
                      >
                        {creatingTag ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        <span className="truncate">
                          Create tag &ldquo;{tagSearch.trim()}&rdquo;
                        </span>
                      </button>
                    )}

                    {filteredTags.length === 0 && !showCreateOption && (
                      <p className="text-center py-2 text-xs text-muted-foreground">
                        No tags found
                      </p>
                    )}
                  </div>

                  {/* Auto-tagging link */}
                  <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Tag automatically?</span>
                    <Link
                      href="/automations"
                      className="text-primary hover:underline font-medium inline-flex items-center gap-0.5"
                    >
                      Automations
                      <ExternalLink className="h-2.5 w-2.5" />
                    </Link>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Tag Pills Display */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setTagPickerOpen(true)}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-dashed border-border"
                >
                  <Plus className="h-3 w-3" />
                  <span>{tSidebar("noTags")} &mdash; Add tag</span>
                </button>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id || tag.id}
                    className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-medium transition-all"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    <span>{tag.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTag(tag.id, tag.name);
                      }}
                      disabled={savingTagId === tag.id}
                      className="rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
                      title={`Remove ${tag.name}`}
                    >
                      {savingTagId === tag.id ? (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      ) : (
                        <X className="h-2.5 w-2.5" />
                      )}
                    </button>
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                {tSidebar("deals")}
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                onClick={handleOpenNewDeal}
                disabled={loadingPipeline}
                title="Add deal"
              >
                {loadingPipeline ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>

            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <button
                  type="button"
                  onClick={handleOpenNewDeal}
                  disabled={loadingPipeline}
                  className="flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-dashed border-border w-full"
                >
                  <Plus className="h-3 w-3" />
                  <span>{tSidebar("noDeals")} &mdash; Add deal</span>
                </button>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    onClick={() => handleEditDeal(deal)}
                    className="group rounded-lg bg-muted px-3 py-2 cursor-pointer transition-colors hover:bg-muted/80 border border-transparent hover:border-border"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {deal.title}
                      </p>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] shrink-0 font-medium"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {formatCurrency(
                          deal.value ?? 0,
                          deal.currency || defaultCurrency
                        )}
                      </span>
                      {deal.status && deal.status !== "open" && (
                        <span
                          className={cn(
                            "text-[10px] font-medium capitalize",
                            deal.status === "won"
                              ? "text-primary"
                              : "text-destructive"
                          )}
                        >
                          {deal.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder={tSidebar("addNotePlaceholder")}
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>

      {/* Deal Sheet Modal */}
      {dealFormOpen && (
        <DealForm
          open={dealFormOpen}
          onOpenChange={setDealFormOpen}
          deal={selectedDeal}
          pipelineId={selectedDeal?.pipeline_id || pipelineId}
          stages={stages}
          defaultContactId={contact.id}
          onSaved={() => {
            fetchContactData();
            onContactUpdated?.();
          }}
        />
      )}
    </div>
  );
}

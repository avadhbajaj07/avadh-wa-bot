'use client';

/**
 * Canvas / mind-map view of a flow. Editable, in parity with the
 * list view for everything except the trigger / header / fallback
 * panels (those are list-only — they don't fit visually inside a
 * node graph and the user can switch to List for them).
 *
 * What this view does:
 *   - Renders every flow_node as a draggable tile, pan + zoom +
 *     minimap. Drag positions persist via the editor context
 *     (writing on dragStop, not every frame).
 *   - Renders edges between nodes, labeled per slot (button title,
 *     "true" / "false", list row title) so a branching flow reads
 *     as a real decision tree.
 *   - Click a node → side-sheet opens with the same per-node form
 *     the list view uses, plus "Set as entry" / "Delete".
 *   - Drag from a source handle on one node to a target handle on
 *     another → wires that slot's `next_node_key`. Per-slot handles
 *     for multi-outgoing types (condition, send_buttons, send_list)
 *     so the user picks which branch they're wiring.
 *   - Backspace / Delete on a selected node → removes it AND clears
 *     every inbound `next_node_key` reference (no dangling arrows).
 *   - Delete on a selected edge → clears just that slot.
 *   - "+ Add node" floating button drops a new node at the visible
 *     viewport center.
 *   - Runs dagre auto-layout once on mount for flows whose
 *     `position_x` / `position_y` are all zero (pre-canvas flows
 *     and brand-new flows) — otherwise everything would pile at
 *     the origin.
 *
 * The toggle in `flow-editor-shell.tsx` swaps this in for
 * `<FlowBuilder>` on the same page. Both views share the same
 * `BuilderState` via `useFlowEditor()` — toggling never resets
 * unsaved edits, and a drag here updates the same nodes array the
 * list view reads.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Node as RfNode,
  type Edge as RfEdge,
  type NodeChange,
  type NodeProps,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Trash2, Play, Volume2, Maximize2, Image as ImageIcon, MessageSquare, Video as VideoIcon } from 'lucide-react';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  applyEdgeConnection,
  deriveCanvasEdges,
  outgoingSlots,
} from '@/lib/flows/edges';
import { autoLayout, shouldAutoLayout } from '@/lib/flows/layout';
import {
  NODE_META,
  NodeIconChip,
  groupNodeTypesByCategory,
  nodeColors,
  summarizeNode,
  type BuilderNode,
  type NodeType,
} from './shared';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFlowEditor } from './flow-editor-state';
import { NodeConfigForm } from './forms/node-config-form';

// React-Flow node `data` payload — the bits our custom renderer needs.
interface NodeData extends Record<string, unknown> {
  node: BuilderNode;
  isEntry: boolean;
  /** Validator's "look here" pulse — flashes the card border for
   *  ~1.6s. Drives a CSS animation, doesn't change layout. */
  isFlashed: boolean;
}

function WhatsAppIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.83-1.56 1.56-3.63 2.41-5.83 2.41-1.48 0-2.93-.39-4.21-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.188 8.188 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.59c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.03-1.25-.75-.67-1.26-1.5-1.41-1.75-.15-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.45 1.03 2.61.12.17 1.78 2.72 4.31 3.81.6.26 1.07.42 1.44.54.61.19 1.16.17 1.6.1.49-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.17-.48-.29" />
    </svg>
  );
}

const NODE_WIDTH = 280;
const NODE_HEIGHT = 200;

// ============================================================
// Custom node — one card per flow node, styled to match the list
// view's collapsed card so the two views feel like the same product.
// ============================================================

// Echo the design's green/red branch ports for the condition node's
// true / false slots; every other slot inherits the node's own hue.
// The true/false hues are derived from the start (emerald) and handoff
// (rose) node colors so all branch/port colors stay single-sourced in
// NODE_HUE — a palette tweak there can't leave these stale.
function slotColor(nodeType: NodeType, slotId: string, fallback: string) {
  if (nodeType === 'condition' && slotId === 'true') {
    return nodeColors('start').solid;
  }
  if (nodeType === 'condition' && slotId === 'false') {
    return nodeColors('handoff').solid;
  }
  return fallback;
}

function FlowNodeCard({ data, selected }: NodeProps) {
  const t = useTranslations('Flows.builder');
  const { node, isEntry, isFlashed } = data as NodeData;
  const { removeNode } = useFlowEditor();
  const c = nodeColors(node.node_type);
  const tSummary = useTranslations('Flows.summary');
  const summary = summarizeNode(node, tSummary);
  const slots = outgoingSlots(node);
  const hasTarget = node.node_type !== 'start';
  const isMultiSlot = slots.length > 1;

  const cfg = (node.config || {}) as Record<string, unknown>;

  // Display label for message index (e.g. Message 1, Message 2)
  const messageNumber = node.node_key.replace(/^node-/, '');

  return (
    <div
      style={
        {
          '--nc': c.solid,
          '--nc-soft': c.soft,
          '--nc-ring': c.ring,
          '--nc-text': c.text,
        } as React.CSSProperties
      }
      className={cn(
        'group relative w-[280px] rounded-2xl border bg-card text-left shadow-sm transition-all duration-200',
        selected
          ? 'border-primary ring-2 ring-primary/25 shadow-md'
          : 'border-border/80 hover:border-primary/50 hover:shadow-md',
        isFlashed && '!border-amber-400 ring-2 ring-amber-400/60'
      )}
    >
      {/* Target (incoming) Handle */}
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-3.5 !bg-card !border-2 !border-primary !rounded-full -translate-x-1.5 shadow-xs"
        />
      )}

      {/* WhatsApp Card Header (SandeshAI style) */}
      <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5 bg-muted/20 rounded-t-2xl">
        <div className="flex items-center gap-2">
          {/* WhatsApp green icon */}
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-2xs">
            <WhatsAppIcon className="size-3" />
          </div>
          <span className="text-xs font-bold text-foreground">
            {node.node_type === 'send_media'
              ? 'Media'
              : node.node_type === 'send_buttons'
              ? 'Buttons'
              : node.node_type === 'send_message'
              ? 'Text'
              : node.node_type === 'send_list'
              ? 'List'
              : t(`nodes.${node.node_type}.label`)}
          </span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
            Message {messageNumber}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {isEntry && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">
              Entry
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeNode(node.node_key);
            }}
            className="size-5 rounded-full text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors text-sm leading-none"
            title="Delete node"
          >
            ×
          </button>
        </div>
      </div>

      {/* Card Body based on node type */}
      <div className="p-3 space-y-2.5">
        {/* 1. MEDIA NODE (Video or Image preview) */}
        {node.node_type === 'send_media' && (
          <>
            {/* Video or Image player/thumbnail */}
            {cfg.media_type === 'video' ? (
              <div className="relative w-full h-40 rounded-xl overflow-hidden bg-slate-900 flex flex-col justify-between p-2.5 border border-border/50 text-white shadow-inner">
                {typeof cfg.media_url === 'string' && cfg.media_url.endsWith('.mp4') ? (
                  <video src={cfg.media_url} className="absolute inset-0 size-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-center">
                    <div className="size-11 rounded-full bg-white/25 backdrop-blur-xs flex items-center justify-center text-white hover:scale-105 transition-transform shadow-md">
                      <Play className="size-5 fill-white translate-x-0.5" />
                    </div>
                  </div>
                )}
                {/* Title badge overlay */}
                <div className="relative z-10 text-[11px] font-bold px-1 text-white/90 drop-shadow-md truncate">
                  {(cfg.caption as string) || 'सुदर्शन क्रिया के फायदे'}
                </div>
                {/* Video Duration / Controls bar */}
                <div className="relative z-10 flex items-center justify-between text-[9px] text-white/80 bg-black/60 backdrop-blur-xs rounded-md px-2 py-1">
                  <span>0:00 / 0:59</span>
                  <div className="flex items-center gap-1.5">
                    <Volume2 className="size-3" />
                    <Maximize2 className="size-3" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-32 rounded-xl overflow-hidden bg-muted/60 flex items-center justify-center border border-border/50">
                {typeof cfg.media_url === 'string' && cfg.media_url ? (
                  <img src={cfg.media_url} alt="Media" className="size-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-muted-foreground">
                    <ImageIcon className="size-6 opacity-60" />
                    <span className="text-[10px]">Image Media</span>
                  </div>
                )}
              </div>
            )}

            {/* Caption display */}
            <div className="rounded-xl border border-border/70 bg-muted/20 p-2 text-xs text-foreground">
              <p className="line-clamp-2 text-[11px] leading-relaxed">
                {(cfg.caption as string) || 'सुदर्शन क्रिया के फायदे'}
              </p>
              <div className="mt-1 text-right text-[9px] text-muted-foreground font-mono">
                {((cfg.caption as string) || '').length} / 1024 characters
              </div>
            </div>

            {/* Button list preview & handle */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground">
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">Reply Buttons</span>
              </div>
              <div className="relative flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-3 py-1.5 text-xs font-semibold text-foreground">
                <span>और वीडियो देखें</span>
                <Handle
                  type="source"
                  id="next"
                  position={Position.Right}
                  className="!size-3.5 !bg-primary !border-2 !border-white dark:!border-zinc-900 !rounded-full translate-x-4 shadow-xs"
                />
              </div>
              <div className="text-[10px] text-muted-foreground/80 pl-1">+ Add Button 1/3</div>
            </div>
          </>
        )}

        {/* 2. BUTTONS NODE */}
        {node.node_type === 'send_buttons' && (
          <>
            <div className="rounded-xl border border-border/70 bg-muted/20 p-2 text-xs text-foreground">
              <p className="line-clamp-3 text-[11px] leading-relaxed">
                {(cfg.text as string) || 'Choose an option:'}
              </p>
              <div className="mt-1 text-right text-[9px] text-muted-foreground font-mono">
                {((cfg.text as string) || '').length} / 1024 characters
              </div>
            </div>

            {/* Buttons with handles */}
            <div className="space-y-1.5 pt-1">
              <div className="text-[10px] font-semibold text-primary">Reply Buttons</div>
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className="relative flex items-center justify-between rounded-lg border border-border/80 bg-muted/30 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted/50 transition-colors"
                >
                  <span className="truncate pr-2">{slot.label}</span>
                  <Handle
                    type="source"
                    id={slot.id}
                    position={Position.Right}
                    className="!size-3.5 !bg-primary !border-2 !border-white dark:!border-zinc-900 !rounded-full translate-x-4 shadow-xs"
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* 3. TEXT MESSAGE NODE */}
        {node.node_type === 'send_message' && (
          <div className="space-y-2">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs text-foreground">
              <p className="line-clamp-6 text-[11px] leading-relaxed whitespace-pre-line">
                {(cfg.text as string) || 'Enter your message text...'}
              </p>
              <div className="mt-1 text-right text-[9px] text-muted-foreground font-mono">
                {((cfg.text as string) || '').length} characters
              </div>
            </div>
            {/* Single output handle */}
            <div className="relative flex justify-end items-center pr-1 text-[10px] text-muted-foreground font-medium">
              <span>Next Step</span>
              <Handle
                type="source"
                id="next"
                position={Position.Right}
                className="!size-3.5 !bg-primary !border-2 !border-white dark:!border-zinc-900 !rounded-full translate-x-4 shadow-xs"
              />
            </div>
          </div>
        )}

        {/* 4. LIST MESSAGE NODE */}
        {node.node_type === 'send_list' && (
          <div className="space-y-2">
            <div className="rounded-xl border border-border/70 bg-muted/20 p-2 text-xs text-foreground">
              <p className="line-clamp-2 text-[11px] leading-relaxed">
                {(cfg.text as string) || 'List message prompt'}
              </p>
            </div>
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-center text-xs font-bold text-primary">
              {(cfg.button_label as string) || 'View Options'}
            </div>
            {/* Multi-slot rows */}
            <div className="space-y-1">
              {slots.map((slot) => (
                <div
                  key={slot.id}
                  className="relative flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] font-medium text-foreground"
                >
                  <span className="truncate pr-2">{slot.label}</span>
                  <Handle
                    type="source"
                    id={slot.id}
                    position={Position.Right}
                    className="!size-3.5 !bg-primary !border-2 !border-white dark:!border-zinc-900 !rounded-full translate-x-4 shadow-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. OTHER NODES (condition, collect_input, set_tag, handoff, start, end) */}
        {!['send_media', 'send_buttons', 'send_message', 'send_list'].includes(node.node_type) && (
          <div className="space-y-2">
            {summary && (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-2 text-xs text-muted-foreground line-clamp-3">
                {summary}
              </div>
            )}
            {/* Slots */}
            {isMultiSlot ? (
              <div className="space-y-1 pt-1">
                {slots.map((slot) => (
                  <div
                    key={slot.id}
                    className="relative flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-medium"
                  >
                    <span>{slot.label}</span>
                    <Handle
                      type="source"
                      id={slot.id}
                      position={Position.Right}
                      style={{
                        backgroundColor: slotColor(node.node_type, slot.id, c.solid),
                      }}
                      className="!size-3.5 !border-2 !border-white dark:!border-zinc-900 !rounded-full translate-x-4 shadow-xs"
                    />
                  </div>
                ))}
              </div>
            ) : slots.length === 1 ? (
              <div className="relative flex justify-end items-center pr-1 text-[10px] text-muted-foreground font-medium">
                <span>Next</span>
                <Handle
                  type="source"
                  id={slots[0].id}
                  position={Position.Right}
                  style={{ backgroundColor: c.solid }}
                  className="!size-3.5 !border-2 !border-white dark:!border-zinc-900 !rounded-full translate-x-4 shadow-xs"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

const NODE_TYPES = { flow: FlowNodeCard };

// ============================================================
// Root canvas
// ============================================================

/**
 * Outer wrapper provides the React-Flow context to the inner body,
 * so `useReactFlow()` works from anywhere in `FlowCanvasInner`
 * (notably, the pan-to-flash effect). The split is required because
 * useReactFlow() must be called inside a ReactFlowProvider.
 */
export function FlowCanvas() {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner />
    </ReactFlowProvider>
  );
}

function FlowCanvasInner() {
  const t = useTranslations('Flows.builder');
  const {
    state,
    setState,
    updateNodeConfig,
    updateNodePosition,
    updateNodePositions,
    removeNode,
    flashKey,
  } = useFlowEditor();
  const reactFlow = useReactFlow();
  const builderNodes = state.nodes;
  const entryNodeId = state.entry_node_id;

  // Side-panel state — which node's form is open. Canvas-only UI; the
  // list view's analogue is the per-card expanded set in
  // flow-builder.tsx.
  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const selectedNode = useMemo(
    () =>
      selectedNodeKey
        ? (builderNodes.find((n) => n.node_key === selectedNodeKey) ?? null)
        : null,
    [selectedNodeKey, builderNodes]
  );

  const autoLayoutPositions = useMemo(() => {
    const canvasEdges = deriveCanvasEdges(builderNodes);

    return shouldAutoLayout(builderNodes)
      ? autoLayout(
          builderNodes.map((n) => ({
            id: n.node_key,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          })),
          canvasEdges.map((e) => ({ source: e.source, target: e.target })),
          { direction: 'TB' }
        )
      : null;
  }, [builderNodes]);

  // If dagre had to place an all-zero flow, persist the generated
  // positions into editor state once. Otherwise the next drag would
  // save only the dragged node and every other node would fall back
  // to (0,0), which feels like nodes teleporting around the canvas.
  const persistedAutoLayoutRef = useRef(false);
  useEffect(() => {
    if (!autoLayoutPositions || persistedAutoLayoutRef.current) return;
    persistedAutoLayoutRef.current = true;
    updateNodePositions(
      Object.fromEntries(
        [...autoLayoutPositions].map(([key, pos]) => [key, pos])
      )
    );
  }, [autoLayoutPositions, updateNodePositions]);

  const derivedRfNodes = useMemo(() => {
    const nodes: RfNode<NodeData>[] = builderNodes.map((n) => {
      const fallback = autoLayoutPositions?.get(n.node_key);
      return {
        id: n.node_key,
        type: 'flow',
        position: {
          x: fallback?.x ?? n.position_x ?? 0,
          y: fallback?.y ?? n.position_y ?? 0,
        },
        data: {
          node: n,
          isEntry: n.node_key === entryNodeId,
          isFlashed: n.node_key === flashKey,
        },
      };
    });

    return nodes;
  }, [builderNodes, entryNodeId, flashKey, autoLayoutPositions]);

  const [rfNodes, setRfNodes] = useState<RfNode<NodeData>[]>(derivedRfNodes);

  useEffect(() => {
    setRfNodes(derivedRfNodes);
  }, [derivedRfNodes]);

  const rfEdges = useMemo(() => {
    const canvasEdges = deriveCanvasEdges(builderNodes);

    // sourceHandle is now wired up — the FlowNodeCard renders a Handle
    // per slot whose id matches the scheme in edges.ts, so React-Flow
    // can hang the arrow off the right place on each card.
    const rfEdges: RfEdge[] = canvasEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      label: e.label,
      // Mode-aware via CSS tokens so edge chrome flips with light/dark.
      labelStyle: { fill: 'var(--muted-foreground)', fontSize: 11 },
      labelBgStyle: { fill: 'var(--card)' },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      style: { stroke: 'var(--border)', strokeWidth: 1.5 },
    }));

    return rfEdges;
  }, [builderNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<RfNode<NodeData>>[]) => {
      setRfNodes((nodes) => applyNodeChanges(changes, nodes));
    },
    []
  );

  // Drag-to-position: React-Flow tracks the visual drag internally and
  // fires this once on release. We write the final coordinate back to
  // the editor context (which flips `dirty`); save then ships the new
  // positions in the existing PUT /api/flows/[id] body (the route
  // already destructures position_x / position_y per migration 010).
  // Writing only on dragStop (not on every position-change tick during
  // the drag) keeps state updates cheap on long drags.
  const handleNodeDragStop = useCallback<OnNodeDrag<RfNode<NodeData>>>(
    (_event, node) => {
      updateNodePosition(node.id, node.position.x, node.position.y);
    },
    [updateNodePosition]
  );

  // Pan to the flashed node when the validator panel requests one.
  // Animate over 400ms; landing zoom is whatever the user already has
  // (don't force a zoom reset — that would be jarring mid-edit).
  useEffect(() => {
    if (!flashKey) return;
    const node = builderNodes.find((n) => n.node_key === flashKey);
    if (!node) return;
    const x = (node.position_x ?? 0) + NODE_WIDTH / 2;
    const y = (node.position_y ?? 0) + NODE_HEIGHT / 2;
    reactFlow.setCenter(x, y, {
      zoom: reactFlow.getZoom(),
      duration: 400,
    });
  }, [flashKey, builderNodes, reactFlow]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: RfNode<NodeData>) => {
      setSelectedNodeKey(node.id);
    },
    []
  );

  // Drag-to-connect: React-Flow fires onConnect when the user drops a
  // handle drag onto a target handle. We look up the source node,
  // compute the right config patch via applyEdgeConnection (matches
  // the same slot scheme as deriveCanvasEdges), and dispatch via
  // updateNodeConfig. The resulting state change re-derives edges on
  // the next render — no need to maintain a separate edge list.
  const handleConnect = useCallback(
    (connection: Connection) => {
      if (
        !connection.source ||
        !connection.target ||
        !connection.sourceHandle
      ) {
        return;
      }
      const sourceNode = builderNodes.find(
        (n) => n.node_key === connection.source
      );
      if (!sourceNode) return;
      // Self-loops are a footgun (a button whose target is its own
      // node = infinite reprompt). Reject silently — the user can
      // still wire one via the per-node dropdown if they really want.
      if (connection.source === connection.target) return;
      const patch = applyEdgeConnection(
        sourceNode,
        connection.sourceHandle,
        connection.target
      );
      if (patch) updateNodeConfig(connection.source, patch);
    },
    [builderNodes, updateNodeConfig]
  );

  // Keyboard delete (Backspace / Delete) + drag-to-trash. React-Flow
  // fires this with the set of deleted-node objects; we route each
  // through the editor context's removeNode (which now also unlinks
  // inbound references so no dangling arrows survive). Closing the
  // side panel on delete keeps the UI honest if the user deleted the
  // node currently being edited.
  const handleNodesDelete = useCallback(
    (deleted: RfNode<NodeData>[]) => {
      for (const n of deleted) {
        removeNode(n.id);
        if (selectedNodeKey === n.id) setSelectedNodeKey(null);
      }
    },
    [removeNode, selectedNodeKey]
  );

  // Edge delete: clear the source node's slot rather than removing
  // anything. Edges are derived from configs, so the only way to
  // "delete" one is to null out its underlying next_node_key.
  const handleEdgesDelete = useCallback(
    (deleted: RfEdge[]) => {
      for (const e of deleted) {
        if (!e.sourceHandle) continue;
        const sourceNode = builderNodes.find((n) => n.node_key === e.source);
        if (!sourceNode) continue;
        const patch = applyEdgeConnection(sourceNode, e.sourceHandle, '');
        if (patch) updateNodeConfig(e.source, patch);
      }
    },
    [builderNodes, updateNodeConfig]
  );

  // Wrapped mutators that target the currently-selected node — pass to
  // the form so each keystroke goes through the editor context (which
  // flips `dirty` and feeds the validator).
  const onSelectedUpdateConfig = useCallback(
    (patch: Record<string, unknown>) => {
      if (selectedNodeKey) updateNodeConfig(selectedNodeKey, patch);
    },
    [selectedNodeKey, updateNodeConfig]
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeKey) return;
    removeNode(selectedNodeKey);
    setSelectedNodeKey(null);
  }, [selectedNodeKey, removeNode]);

  const handleSetEntry = useCallback(() => {
    if (!selectedNodeKey) return;
    setState((s) => ({ ...s, entry_node_id: selectedNodeKey }));
  }, [selectedNodeKey, setState]);

  if (rfNodes.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 text-sm">
        <p>{t('noNodesYet')}</p>
        <CanvasAddNodeButton t={t} />
      </div>
    );
  }

  return (
    <>
      <div className="h-full w-full overflow-hidden">
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
          proOptions={{ hideAttribution: true }}
          onNodesChange={handleNodesChange}
          onNodeDragStop={handleNodeDragStop}
          onNodeClick={handleNodeClick}
          onConnect={handleConnect}
          onNodesDelete={handleNodesDelete}
          onEdgesDelete={handleEdgesDelete}
          // Default is "Backspace" only — accept both so Mac users
          // hitting Delete (Fn+Backspace) get the same behavior.
          deleteKeyCode={['Backspace', 'Delete']}
          nodesConnectable={true}
          edgesFocusable={true}
          elementsSelectable={true}
          // Lower default min/max zoom than the lib's defaults; the
          // tiles already truncate their summary at a reasonable
          // size, so we don't need to zoom past 1.5x.
          minZoom={0.2}
          maxZoom={1.5}
        >
          {/* Dot grid, matching the design's faint canvas backdrop. */}
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.4}
            color="var(--border)"
          />
          <Controls
            className="!border-border !bg-card [&_button]:!border-border [&_button]:!bg-card [&_button:hover]:!bg-muted [&_button_svg]:!fill-foreground !overflow-hidden !rounded-xl !border !shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)]"
            showInteractive={false}
          />
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) =>
              nodeColors((n.data as NodeData).node.node_type).solid
            }
            nodeStrokeWidth={0}
            nodeBorderRadius={3}
            maskColor="color-mix(in oklch, var(--background) 70%, transparent)"
            className="!border-border !bg-card !rounded-xl !border !shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)]"
          />
          <Panel position="top-left" className="!top-4 !left-4">
            <CanvasAddNodeButton t={t} />
          </Panel>
        </ReactFlow>
      </div>

      <NodeEditSheet
        node={selectedNode}
        isEntry={selectedNode?.node_key === entryNodeId}
        allNodes={builderNodes}
        onClose={() => setSelectedNodeKey(null)}
        onUpdateConfig={onSelectedUpdateConfig}
        onDelete={handleDeleteSelected}
        onSetEntry={handleSetEntry}
        t={t}
      />
    </>
  );
}

// ============================================================
// Side panel — opens when a canvas node is clicked. Mounts the
// shared NodeConfigForm dispatcher so edits made here behave
// identically to the list view's per-card editor.
// ============================================================

function NodeEditSheet({
  node,
  isEntry,
  allNodes,
  onClose,
  onUpdateConfig,
  onDelete,
  onSetEntry,
  t,
}: {
  node: BuilderNode | null;
  isEntry: boolean;
  allNodes: BuilderNode[];
  onClose: () => void;
  onUpdateConfig: (patch: Record<string, unknown>) => void;
  onDelete: () => void;
  onSetEntry: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  // Sheet is controlled — opens when a node is selected, closes via
  // Esc / overlay / close button (all delegated to onClose).
  const open = node !== null;
  if (!node) {
    return (
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md" />
      </Sheet>
    );
  }
  const meta = NODE_META[node.node_type];
  const c = nodeColors(node.node_type);
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="border-border bg-popover flex w-full flex-col gap-0 border-l p-0 sm:max-w-md"
      >
        <SheetHeader className="border-border flex-row items-center gap-3 space-y-0 border-b px-5 py-4">
          <NodeIconChip type={node.node_type} size={36} iconSize={18} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase">
              <span style={{ color: c.text }}>{t(`nodes.${node.node_type}.label`)}</span>
              {isEntry && (
                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-emerald-300 uppercase">
                  {t('badgeEntry')}
                </span>
              )}
            </SheetTitle>
            <SheetDescription className="text-muted-foreground mt-0.5 text-xs">
              {t(`nodes.${node.node_type}.blurb`)}
            </SheetDescription>
          </div>
          <code className="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]">
            {node.node_key}
          </code>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
          <NodeConfigForm
            node={node}
            allNodes={allNodes}
            showAdvanced={false}
            onUpdateConfig={onUpdateConfig}
          />
        </div>

        <SheetFooter className="border-border border-t px-5 py-3 sm:flex-row sm:justify-between">
          {!isEntry ? (
            <Button variant="ghost" size="sm" onClick={onSetEntry}>
              {t('setAsEntry')}
            </Button>
          ) : (
            <span />
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="text-red-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t('deleteNode')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================
// Floating add-node button — bottom-right of the canvas. Mirrors
// the list view's AddNodeButton (same dropdown menu, same NodeType
// list, same icons via NODE_META) but drops the new node into the
// center of the visible viewport rather than appending to a list.
// ============================================================

const ADD_NODE_TYPES: NodeType[] = [
  'start',
  'send_buttons',
  'send_list',
  'send_message',
  'send_media',
  'collect_input',
  'condition',
  'set_tag',
  'handoff',
  'end',
];

function CanvasAddNodeButton({ t }: { t: ReturnType<typeof useTranslations> }) {
  const reactFlow = useReactFlow();
  const { addNode, updateNodePosition } = useFlowEditor();

  const handleAdd = (type: NodeType) => {
    const key = addNode(type);
    // Place the new node at the visible canvas center. The Panel's
    // own DOM lives inside ReactFlow so we can climb up to find the
    // .react-flow root and read its bounding rect. If we can't find
    // it (test envs, etc.), addNode's default (0, 0) is the fallback
    // and the user can drag the node into view.
    const root = document.querySelector('.react-flow') as HTMLElement | null;
    if (!root) return;
    const rect = root.getBoundingClientRect();
    const center = reactFlow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    // NODE_WIDTH / NODE_HEIGHT are the dagre layout defaults; offset
    // so the card sits visually centered rather than top-left at the
    // viewport center.
    updateNodePosition(
      key,
      center.x - NODE_WIDTH / 2,
      center.y - NODE_HEIGHT / 2
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="bg-primary text-primary-foreground hover:bg-primary-hover inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium shadow-[0_6px_20px_-8px_rgba(0,0,0,0.5)] transition-colors"
        aria-label={t('addNode')}
      >
        <Plus className="h-4 w-4" />
        {t('addNode')}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="border-border bg-popover w-[268px] p-1.5"
      >
        {groupNodeTypesByCategory(ADD_NODE_TYPES).map((group, i) => (
          // DropdownMenuGroup (base-ui Menu.Group) is REQUIRED: the
          // DropdownMenuLabel below is base-ui's Menu.GroupLabel, which
          // throws at render without a Menu.Group ancestor. A plain <div>
          // here crashed the page when this menu opened (issue #336).
          <Fragment key={group.id}>
            {i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-[11px] font-semibold tracking-wider uppercase">
                {t(`categories.${group.id}`)}
              </DropdownMenuLabel>
              {group.types.map((t_type) => {
                const meta = NODE_META[t_type];
                return (
                  <DropdownMenuItem
                    key={t_type}
                    onClick={() => handleAdd(t_type)}
                    className="gap-3 py-2"
                  >
                    <NodeIconChip
                      type={t_type}
                      size={28}
                      iconSize={16}
                      className="rounded-md"
                    />
                    <span className="flex flex-col">
                      <span className="text-popover-foreground text-[13px] font-semibold">
                        {t(`nodes.${t_type}.label`)}
                      </span>
                      <span className="text-muted-foreground text-[11.5px]">
                        {t(`nodes.${t_type}.blurb`)}
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

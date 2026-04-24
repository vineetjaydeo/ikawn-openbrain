import { create } from 'zustand';
import * as api from './api';
import type { Design, DesignSnapshot, ChatMessageRow, TodoItem, GenerationStage } from './types';

// ── Local type definitions ──────────────────────────────────────────────────

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
}

export type AppView = 'hub' | 'workspace';
export type HubTab = 'recent' | 'your' | 'examples';
export type PreviewViewport = 'desktop' | 'tablet' | 'mobile';

/** Canvas tabs -- 'files' is the pinned tab, 'file' wraps a single file preview. */
export type CanvasTab = { kind: 'files' } | { kind: 'file'; path: string };
export const FILES_TAB: CanvasTab = { kind: 'files' };

/** Tool call payload for in-flight tool calls. */
export interface ToolCallPayload {
  toolName: string;
  toolCallId: string;
  args?: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  result?: string;
  durationMs?: number;
  error?: { message: string };
}

/** Prompt request saved for retry. */
interface PromptRequest {
  prompt: string;
  referenceUrl?: string;
}

// ── Canvas tab pure reducers (exported for testability) ─────────────────────

export function openFileTab(tabs: CanvasTab[], path: string): { tabs: CanvasTab[]; index: number } {
  const existing = tabs.findIndex((t) => t.kind === 'file' && t.path === path);
  if (existing !== -1) return { tabs, index: existing };
  const next: CanvasTab[] = [...tabs, { kind: 'file', path }];
  return { tabs: next, index: next.length - 1 };
}

export function closeTabAt(
  tabs: CanvasTab[],
  activeIndex: number,
  target: number,
): { tabs: CanvasTab[]; activeIndex: number } {
  const tab = tabs[target];
  if (!tab || tab.kind === 'files') return { tabs, activeIndex };
  const next = tabs.filter((_, i) => i !== target);
  let nextActive = activeIndex;
  if (activeIndex === target) {
    nextActive = Math.max(0, target - 1);
  } else if (activeIndex > target) {
    nextActive = activeIndex - 1;
  }
  return { tabs: next, activeIndex: nextActive };
}

// ── Preview pool (LRU cache for instant design switching) ───────────────────

const PREVIEW_POOL_LIMIT = 5;

function recordPreviewInPool(
  prevCache: Record<string, string>,
  prevRecent: string[],
  designId: string,
  html: string | null,
): { cache: Record<string, string>; recent: string[] } {
  const recent = [designId, ...prevRecent.filter((x) => x !== designId)].slice(
    0,
    PREVIEW_POOL_LIMIT,
  );
  const merged = html !== null ? { ...prevCache, [designId]: html } : prevCache;
  const cache: Record<string, string> = {};
  for (const id of recent) {
    if (merged[id] !== undefined) cache[id] = merged[id];
  }
  return { cache, recent };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function autoNameFromPrompt(prompt: string): string {
  const condensed = prompt.replace(/\s+/g, ' ').trim();
  if (condensed.length === 0) return 'Untitled design';
  return condensed.length > 40 ? `${condensed.slice(0, 40).trimEnd()}...` : condensed;
}

function isDefaultDesignName(name: string): boolean {
  return name === 'Untitled design' || /^Untitled design \d+$/.test(name);
}

// ── Store interface ─────────────────────────────────────────────────────────

interface DesignStore {
  // ── Preview ──
  previewHtml: string | null;
  previewHtmlByDesign: Record<string, string>;
  recentDesignIds: string[];
  previewViewport: PreviewViewport;
  previewZoom: number;

  // ── Generation ──
  isGenerating: boolean;
  activeGenerationId: string | null;
  generatingDesignId: string | null;
  generationStage: GenerationStage;
  streamingAssistantText: { designId: string; text: string } | null;
  errorMessage: string | null;
  lastError: string | null;
  todos: TodoItem[];

  // ── Designs ──
  designs: Design[];
  currentDesignId: string | null;
  designsLoaded: boolean;
  designsViewOpen: boolean;
  designToDelete: Design | null;
  designToRename: Design | null;

  // ── Input files / reference ──
  referenceUrl: string;
  lastPromptInput: PromptRequest | null;

  // ── UI ──
  view: AppView;
  previousView: AppView;
  hubTab: HubTab;
  toasts: Toast[];
  sidebarCollapsed: boolean;

  // ── Chat ──
  chatMessages: ChatMessageRow[];
  chatLoaded: boolean;
  pendingToolCalls: ToolCallPayload[];

  // ── Snapshots ──
  snapshots: DesignSnapshot[];
  currentSnapshotId: string | null;

  // ── Canvas tabs ──
  canvasTabs: CanvasTab[];
  activeCanvasTab: number;

  // ── Preview files (multi-file) ──
  previewFiles: Record<string, string>;

  // ── Cancel handle ──
  cancelFn: (() => void) | null;

  // ── Actions: Preview ──
  setPreviewViewport: (viewport: PreviewViewport) => void;
  setPreviewZoom: (zoom: number) => void;
  setPreviewHtml: (content: string) => void;
  setPreviewHtmlFromAgent: (input: { designId: string; content: string }) => void;

  // ── Actions: Designs ──
  loadDesigns: () => Promise<void>;
  ensureCurrentDesign: () => Promise<void>;
  createNewDesign: () => Promise<Design | null>;
  switchDesign: (id: string) => Promise<void>;
  renameCurrentDesign: (name: string) => Promise<void>;
  renameDesign: (id: string, name: string) => Promise<void>;
  duplicateDesign: (id: string) => Promise<Design | null>;
  softDeleteDesign: (id: string) => Promise<void>;
  openDesignsView: () => void;
  closeDesignsView: () => void;
  requestDeleteDesign: (design: Design | null) => void;
  requestRenameDesign: (design: Design | null) => void;

  // ── Actions: Generation ──
  sendPrompt: (input: { prompt: string; referenceUrl?: string }) => Promise<void>;
  cancelGeneration: () => void;
  retryLastPrompt: () => Promise<void>;
  clearError: () => void;

  // ── Actions: Chat ──
  loadChatForCurrentDesign: () => Promise<void>;
  appendChatMessage: (input: {
    designId: string;
    kind: string;
    payload: Record<string, unknown>;
    snapshotId?: string;
  }) => Promise<ChatMessageRow | null>;
  clearChatLocal: () => void;
  setStreamingAssistantText: (value: { designId: string; text: string } | null) => void;
  pushPendingToolCall: (designId: string, call: ToolCallPayload) => void;
  resolvePendingToolCall: (
    designId: string,
    toolName: string,
    result?: string,
    durationMs?: number,
  ) => void;

  // ── Actions: Snapshots ──
  loadSnapshots: (designId: string) => Promise<void>;
  createSnapshot: (designId: string, data: Partial<DesignSnapshot>) => Promise<DesignSnapshot | null>;

  // ── Actions: Toasts ──
  addToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id?: string) => void;

  // ── Actions: UI ──
  setView: (view: AppView) => void;
  setHubTab: (tab: HubTab) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setReferenceUrl: (value: string) => void;

  // ── Actions: Canvas tabs ──
  openCanvasFileTab: (path: string) => void;
  closeCanvasTab: (index: number) => void;
  setActiveCanvasTab: (index: number) => void;
  resetCanvasTabs: () => void;
}

// ── Store implementation ────────────────────────────────────────────────────

export const useDesignStore = create<DesignStore>((set, get) => ({
  // ── Initial state ──

  previewHtml: null,
  previewHtmlByDesign: {},
  recentDesignIds: [],
  previewViewport: 'desktop',
  previewZoom: 100,

  isGenerating: false,
  activeGenerationId: null,
  generatingDesignId: null,
  generationStage: 'idle',
  streamingAssistantText: null,
  errorMessage: null,
  lastError: null,
  todos: [],

  designs: [],
  currentDesignId: null,
  designsLoaded: false,
  designsViewOpen: false,
  designToDelete: null,
  designToRename: null,

  referenceUrl: '',
  lastPromptInput: null,

  view: 'hub',
  previousView: 'hub',
  hubTab: 'recent',
  toasts: [],
  sidebarCollapsed: false,

  chatMessages: [],
  chatLoaded: false,
  pendingToolCalls: [],

  snapshots: [],
  currentSnapshotId: null,

  canvasTabs: [FILES_TAB],
  activeCanvasTab: 0,

  previewFiles: {},
  cancelFn: null,

  // ── Preview actions ──

  setPreviewViewport(viewport) {
    set({ previewViewport: viewport });
  },

  setPreviewZoom(zoom) {
    set({ previewZoom: zoom });
  },

  setPreviewHtml(content) {
    const state = get();
    if (state.currentDesignId === null) {
      set({ previewHtml: content });
      return;
    }
    const pool = recordPreviewInPool(
      state.previewHtmlByDesign,
      state.recentDesignIds,
      state.currentDesignId,
      content,
    );
    set({
      previewHtml: content,
      previewHtmlByDesign: pool.cache,
      recentDesignIds: pool.recent,
    });
  },

  setPreviewHtmlFromAgent({ designId, content }) {
    const state = get();
    // Only adopt when the event's design matches the active or generating design
    if (state.currentDesignId !== designId && state.generatingDesignId !== designId) {
      const pool = recordPreviewInPool(
        state.previewHtmlByDesign,
        state.recentDesignIds,
        designId,
        content,
      );
      set({ previewHtmlByDesign: pool.cache, recentDesignIds: pool.recent });
      return;
    }
    const pool = recordPreviewInPool(
      state.previewHtmlByDesign,
      state.recentDesignIds,
      designId,
      content,
    );
    set({
      previewHtml: content,
      previewHtmlByDesign: pool.cache,
      recentDesignIds: pool.recent,
    });
  },

  // ── Design CRUD actions ──

  async loadDesigns() {
    try {
      const designs = await api.listDesigns();
      set({ designs, designsLoaded: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load designs';
      get().addToast({ variant: 'error', title: 'Load failed', description: msg });
      set({ designsLoaded: true });
    }
  },

  async ensureCurrentDesign() {
    await get().loadDesigns();
    const designs = get().designs;
    if (get().currentDesignId !== null) return;
    if (designs.length > 0 && designs[0]) {
      await get().switchDesign(designs[0].id);
      return;
    }
    await get().createNewDesign();
  },

  async createNewDesign() {
    if (get().isGenerating) {
      get().addToast({
        variant: 'info',
        title: 'Cannot create design while generating',
      });
      return null;
    }
    const existingNames = new Set(get().designs.map((d) => d.name));
    let n = 1;
    while (existingNames.has(`Untitled design ${n}`)) n += 1;
    const name = `Untitled design ${n}`;
    try {
      const design = await api.createDesign(name);
      set({
        currentDesignId: design.id,
        previewHtml: null,
        errorMessage: null,
        lastPromptInput: null,
        designsViewOpen: false,
        chatMessages: [],
        chatLoaded: false,
        pendingToolCalls: [],
        snapshots: [],
        currentSnapshotId: null,
        canvasTabs: [FILES_TAB],
        activeCanvasTab: 0,
        previewFiles: {},
        streamingAssistantText: null,
        todos: [],
      });
      await get().loadDesigns();
      void get().loadChatForCurrentDesign();
      return design;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create design';
      get().addToast({ variant: 'error', title: 'Create failed', description: msg });
      return null;
    }
  },

  async switchDesign(id) {
    const state = get();
    if (state.currentDesignId === id) {
      set({ designsViewOpen: false });
      return;
    }

    // Snapshot outgoing design's preview into pool
    const outgoingPool =
      state.currentDesignId !== null && state.previewHtml !== null
        ? recordPreviewInPool(
            state.previewHtmlByDesign,
            state.recentDesignIds,
            state.currentDesignId,
            state.previewHtml,
          )
        : { cache: state.previewHtmlByDesign, recent: state.recentDesignIds };

    // Cache hit -- render instantly
    const cachedHtml = outgoingPool.cache[id];
    if (cachedHtml !== undefined) {
      const incomingPool = recordPreviewInPool(
        outgoingPool.cache,
        outgoingPool.recent,
        id,
        cachedHtml,
      );
      set({
        currentDesignId: id,
        previewHtml: cachedHtml,
        previewHtmlByDesign: incomingPool.cache,
        recentDesignIds: incomingPool.recent,
        errorMessage: null,
        lastPromptInput: null,
        designsViewOpen: false,
        chatMessages: [],
        chatLoaded: false,
        pendingToolCalls: [],
        snapshots: [],
        currentSnapshotId: null,
        canvasTabs: [FILES_TAB, { kind: 'file', path: 'index.html' }],
        activeCanvasTab: 1,
        previewFiles: {},
        streamingAssistantText: null,
        todos: [],
      });
      void get().loadChatForCurrentDesign();
      // Background refresh from server
      void (async () => {
        try {
          const snaps = await api.listSnapshots(id);
          if (get().currentDesignId !== id) return;
          const latest = snaps[0] ?? null;
          const fresh = latest?.artifact_source ?? null;
          if (fresh !== null && fresh !== get().previewHtml) {
            const refreshed = recordPreviewInPool(
              get().previewHtmlByDesign,
              get().recentDesignIds,
              id,
              fresh,
            );
            set({
              previewHtml: fresh,
              previewHtmlByDesign: refreshed.cache,
              recentDesignIds: refreshed.recent,
              snapshots: snaps,
              currentSnapshotId: latest?.id ?? null,
            });
          } else {
            set({ snapshots: snaps, currentSnapshotId: latest?.id ?? null });
          }
        } catch {
          // Background refresh failure is harmless
        }
      })();
      return;
    }

    // Cold path -- fetch from server
    try {
      const snaps = await api.listSnapshots(id);
      const latest = snaps[0] ?? null;
      const html = latest?.artifact_source ?? null;
      const incomingPool = recordPreviewInPool(outgoingPool.cache, outgoingPool.recent, id, html);
      set({
        currentDesignId: id,
        previewHtml: html,
        previewHtmlByDesign: incomingPool.cache,
        recentDesignIds: incomingPool.recent,
        errorMessage: null,
        lastPromptInput: null,
        designsViewOpen: false,
        chatMessages: [],
        chatLoaded: false,
        pendingToolCalls: [],
        snapshots: snaps,
        currentSnapshotId: latest?.id ?? null,
        canvasTabs: latest ? [FILES_TAB, { kind: 'file', path: 'index.html' }] : [FILES_TAB],
        activeCanvasTab: latest ? 1 : 0,
        previewFiles: {},
        streamingAssistantText: null,
        todos: [],
      });
      void get().loadChatForCurrentDesign();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to switch design';
      get().addToast({ variant: 'error', title: 'Switch failed', description: msg });
    }
  },

  async renameCurrentDesign(name) {
    const id = get().currentDesignId;
    if (!id) return;
    await get().renameDesign(id, name);
  },

  async renameDesign(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await api.renameDesign(id, trimmed);
      set((s) => ({
        designs: s.designs.map((d) => (d.id === id ? { ...d, name: trimmed } : d)),
        designToRename: null,
      }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to rename';
      get().addToast({ variant: 'error', title: 'Rename failed', description: msg });
    }
  },

  async duplicateDesign(id) {
    const source = get().designs.find((d) => d.id === id);
    if (!source) return null;
    const name = `${source.name} (copy)`;
    try {
      const cloned = await api.duplicateDesign(id, name);
      await get().loadDesigns();
      get().addToast({ variant: 'success', title: `Duplicated: ${cloned.name}` });
      return cloned;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to duplicate';
      get().addToast({ variant: 'error', title: 'Duplicate failed', description: msg });
      return null;
    }
  },

  async softDeleteDesign(id) {
    if (get().isGenerating) {
      get().addToast({ variant: 'info', title: 'Cannot delete while generating' });
      return;
    }
    try {
      await api.deleteDesign(id);
      const wasCurrent = get().currentDesignId === id;
      await get().loadDesigns();
      if (wasCurrent) {
        const remaining = get().designs;
        set({
          currentDesignId: null,
          previewHtml: null,
          canvasTabs: [FILES_TAB],
          activeCanvasTab: 0,
          previewFiles: {},
        });
        if (remaining.length > 0 && remaining[0]) {
          await get().switchDesign(remaining[0].id);
        } else {
          await get().createNewDesign();
        }
      }
      set({ designToDelete: null });
      get().addToast({ variant: 'info', title: 'Design deleted' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete';
      get().addToast({ variant: 'error', title: 'Delete failed', description: msg });
    }
  },

  openDesignsView() {
    void get().loadDesigns();
    set({ designsViewOpen: true });
  },

  closeDesignsView() {
    set({ designsViewOpen: false });
  },

  requestDeleteDesign(design) {
    set({ designToDelete: design });
  },

  requestRenameDesign(design) {
    set({ designToRename: design });
  },

  // ── Generation actions ──

  async sendPrompt(input) {
    if (get().isGenerating) return;

    const prompt = input.prompt.trim();
    if (!prompt) return;

    let designId = get().currentDesignId;

    // Auto-create a design if none exists
    if (!designId) {
      const design = await get().createNewDesign();
      if (!design) return;
      designId = design.id;
    }

    const generationId = newId();
    const designIdAtStart = designId;
    const refUrl = input.referenceUrl?.trim() || undefined;

    set({
      isGenerating: true,
      activeGenerationId: generationId,
      generatingDesignId: designIdAtStart,
      generationStage: 'sending',
      streamingAssistantText: null,
      errorMessage: null,
      lastPromptInput: { prompt, ...(refUrl ? { referenceUrl: refUrl } : {}) },
      todos: [],
      previewFiles: get().previewFiles,
    });

    // Append user message to chat
    void get().appendChatMessage({
      designId: designIdAtStart,
      kind: 'user',
      payload: { text: prompt },
    });

    // Auto-rename if this is the first prompt on an untitled design
    const isFirstPrompt = get().chatMessages.filter(
      (m) => m.design_id === designIdAtStart && m.kind === 'user',
    ).length <= 1;
    if (isFirstPrompt) {
      const design = get().designs.find((d) => d.id === designIdAtStart);
      if (design && isDefaultDesignName(design.name)) {
        const newName = autoNameFromPrompt(prompt);
        void api.renameDesign(designIdAtStart, newName).then(() => get().loadDesigns()).catch(() => {});
      }
    }

    // Build history from current chat messages
    const HISTORY_CAP = 12;
    const fullHistory = get()
      .chatMessages.filter(
        (m) =>
          m.design_id === designIdAtStart &&
          (m.kind === 'user' || m.kind === 'assistant_text'),
      )
      .map((m) => ({
        role: m.kind === 'user' ? 'user' : 'assistant',
        content: ((m.payload as { text?: string })?.text) || '',
      }));
    const history =
      fullHistory.length > HISTORY_CAP ? fullHistory.slice(-HISTORY_CAP) : fullHistory;

    // Start SSE streaming generation
    const cancel = api.streamGeneration(
      { designId: designIdAtStart, prompt, history },
      (event) => {
        const state = get();
        // Ignore events if generation was superseded
        if (state.activeGenerationId !== generationId) return;

        const type = event.type as string;

        if (type === 'generation_start') {
          set({
            generationStage: 'thinking',
            activeGenerationId: (event.generationId as string) || generationId,
          });
        } else if (type === 'text_delta') {
          const delta = event.text as string;
          set((s) => {
            const prev = s.streamingAssistantText;
            const currentText = prev && prev.designId === designIdAtStart ? prev.text : '';
            return {
              generationStage: 'streaming',
              streamingAssistantText: {
                designId: designIdAtStart,
                text: currentText + delta,
              },
            };
          });
        } else if (type === 'fs_updated') {
          const path = event.path as string;
          const content = event.content as string;
          set((s) => ({
            previewFiles: { ...s.previewFiles, [path]: content },
          }));
          // Update preview if it's index.html
          if (path === 'index.html') {
            get().setPreviewHtmlFromAgent({ designId: designIdAtStart, content });
          }
        } else if (type === 'todos_updated') {
          set({ todos: (event.todos as TodoItem[]) || [] });
        } else if (type === 'generation_end') {
          const artifact = event.artifact as string | null | undefined;
          const files = event.files as Record<string, string> | null | undefined;
          const snapshotId = event.snapshotId as string | null | undefined;

          // Finalize preview
          const finalHtml = artifact || get().previewHtml;
          const pool =
            designIdAtStart && finalHtml
              ? recordPreviewInPool(
                  get().previewHtmlByDesign,
                  get().recentDesignIds,
                  designIdAtStart,
                  finalHtml,
                )
              : { cache: get().previewHtmlByDesign, recent: get().recentDesignIds };

          set({
            isGenerating: false,
            generationStage: 'done',
            activeGenerationId: null,
            generatingDesignId: null,
            cancelFn: null,
            previewHtml: finalHtml,
            previewHtmlByDesign: pool.cache,
            recentDesignIds: pool.recent,
            previewFiles: files || get().previewFiles,
          });

          // Auto-open generated file tab
          if (artifact) {
            get().openCanvasFileTab('index.html');
          }

          // Persist chat rows for the completed generation
          const assistantText = get().streamingAssistantText?.text || '';
          if (assistantText.length > 0) {
            void get().appendChatMessage({
              designId: designIdAtStart,
              kind: 'assistant_text',
              payload: { text: assistantText },
            });
          }
          if (artifact) {
            void get().appendChatMessage({
              designId: designIdAtStart,
              kind: 'artifact_delivered',
              payload: { createdAt: new Date().toISOString(), snapshotId },
            });
          }

          // Reload snapshots
          void get().loadSnapshots(designIdAtStart);

          // Clear streaming text
          set({ streamingAssistantText: null });
        } else if (type === 'error') {
          const msg = (event.message as string) || 'Generation failed';
          set({
            isGenerating: false,
            generationStage: 'error',
            activeGenerationId: null,
            generatingDesignId: null,
            streamingAssistantText: null,
            cancelFn: null,
            errorMessage: msg,
            lastError: msg,
          });
          void get().appendChatMessage({
            designId: designIdAtStart,
            kind: 'error',
            payload: { message: msg },
          });
          get().addToast({ variant: 'error', title: 'Generation failed', description: msg });
        }
      },
      // onError
      (err) => {
        if (get().activeGenerationId !== generationId) return;
        const msg = err.message || 'Generation failed';
        set({
          isGenerating: false,
          generationStage: 'error',
          activeGenerationId: null,
          generatingDesignId: null,
          streamingAssistantText: null,
          cancelFn: null,
          errorMessage: msg,
          lastError: msg,
        });
        void get().appendChatMessage({
          designId: designIdAtStart,
          kind: 'error',
          payload: { message: msg },
        });
        get().addToast({ variant: 'error', title: 'Generation failed', description: msg });
      },
      // onDone
      () => {
        // If stream ends and we're still generating (no generation_end event received),
        // finalize gracefully
        if (get().isGenerating && get().activeGenerationId === generationId) {
          set({
            isGenerating: false,
            generationStage: 'done',
            activeGenerationId: null,
            generatingDesignId: null,
            cancelFn: null,
          });
        }
      },
    );

    set({ cancelFn: cancel });
  },

  cancelGeneration() {
    const { cancelFn, activeGenerationId } = get();
    if (cancelFn) cancelFn();
    // Also notify server
    if (activeGenerationId) {
      fetch(`/api/design/generate/${activeGenerationId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    }
    set({
      isGenerating: false,
      generationStage: 'idle',
      activeGenerationId: null,
      generatingDesignId: null,
      streamingAssistantText: null,
      cancelFn: null,
    });
  },

  async retryLastPrompt() {
    const lastPromptInput = get().lastPromptInput;
    if (!lastPromptInput) return;
    set({ errorMessage: null });
    await get().sendPrompt(lastPromptInput);
  },

  clearError() {
    set({ errorMessage: null });
  },

  // ── Chat actions ──

  async loadChatForCurrentDesign() {
    const designId = get().currentDesignId;
    if (!designId) {
      set({ chatMessages: [], chatLoaded: true });
      return;
    }
    try {
      const rows = await api.listChat(designId);
      // Guard against design switch during fetch
      if (get().currentDesignId !== designId) return;
      set({ chatMessages: rows, chatLoaded: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load chat';
      console.warn('[design-store] loadChatForCurrentDesign failed:', msg);
      set({ chatLoaded: true });
    }
  },

  async appendChatMessage(input) {
    try {
      const row = await api.appendChat(input.designId, input.kind, input.payload, input.snapshotId);
      // Only merge if still on the same design
      if (get().currentDesignId === input.designId) {
        set((s) => ({ chatMessages: [...s.chatMessages, row] }));
      }
      return row;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to append chat';
      console.warn('[design-store] appendChatMessage failed:', msg);
      return null;
    }
  },

  clearChatLocal() {
    set({ chatMessages: [], chatLoaded: false });
  },

  setStreamingAssistantText(value) {
    set({ streamingAssistantText: value });
  },

  pushPendingToolCall(designId, call) {
    if (get().currentDesignId !== designId) return;
    set((s) => ({ pendingToolCalls: [...s.pendingToolCalls, call] }));
  },

  resolvePendingToolCall(designId, toolName, result, durationMs) {
    const s = get();
    const idx = s.pendingToolCalls.findIndex(
      (c) => c.toolName === toolName && c.status === 'running',
    );
    const resolved = idx >= 0 ? s.pendingToolCalls[idx] : null;
    if (idx >= 0) {
      const next = [...s.pendingToolCalls];
      next.splice(idx, 1);
      set({ pendingToolCalls: next });
    }
    if (resolved) {
      void get().appendChatMessage({
        designId,
        kind: 'tool_call',
        payload: {
          ...resolved,
          status: 'done' as const,
          ...(result !== undefined ? { result } : {}),
          ...(durationMs !== undefined ? { durationMs } : {}),
        },
      });
    }
  },

  // ── Snapshot actions ──

  async loadSnapshots(designId) {
    try {
      const snaps = await api.listSnapshots(designId);
      if (get().currentDesignId !== designId) return;
      set({ snapshots: snaps });
      const latest = snaps[0] ?? null;
      if (latest) {
        set({ currentSnapshotId: latest.id });
        if (latest.artifact_source && !get().previewHtml) {
          set({ previewHtml: latest.artifact_source });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load snapshots';
      console.warn('[design-store] loadSnapshots failed:', msg);
    }
  },

  async createSnapshot(designId, data) {
    try {
      const snap = await api.createSnapshot(designId, data);
      if (get().currentDesignId === designId) {
        set((s) => ({ snapshots: [snap, ...s.snapshots], currentSnapshotId: snap.id }));
      }
      return snap;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create snapshot';
      get().addToast({ variant: 'error', title: 'Snapshot failed', description: msg });
      return null;
    }
  },

  // ── Toast actions ──

  addToast(toast) {
    const id = newId();
    const next: Toast = { id, ...toast };
    set((s) => {
      let toasts = s.toasts;
      // Cap error toasts at 3 to prevent pile-up
      if (toast.variant === 'error') {
        const errors = toasts.filter((t) => t.variant === 'error');
        if (errors.length >= 3) {
          const oldestId = errors[0]?.id;
          if (oldestId !== undefined) {
            toasts = toasts.filter((t) => t.id !== oldestId);
          }
        }
      }
      return { toasts: [...toasts, next] };
    });
    // Auto-dismiss non-error toasts after 5s
    if (toast.variant !== 'error') {
      setTimeout(() => get().dismissToast(id), 5000);
    }
    return id;
  },

  dismissToast(id) {
    if (id === undefined) {
      set({ toasts: [] });
      return;
    }
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  // ── UI actions ──

  setView(view) {
    const prev = get().view;
    set({ view, previousView: prev === view ? get().previousView : prev });
  },

  setHubTab(tab) {
    set({ hubTab: tab });
  },

  setSidebarCollapsed(collapsed) {
    set({ sidebarCollapsed: collapsed });
  },

  toggleSidebar() {
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed }));
  },

  setReferenceUrl(value) {
    set({ referenceUrl: value });
  },

  // ── Canvas tab actions ──

  openCanvasFileTab(path) {
    set((s) => {
      const result = openFileTab(s.canvasTabs, path);
      return { canvasTabs: result.tabs, activeCanvasTab: result.index };
    });
  },

  closeCanvasTab(index) {
    set((s) => {
      const result = closeTabAt(s.canvasTabs, s.activeCanvasTab, index);
      return { canvasTabs: result.tabs, activeCanvasTab: result.activeIndex };
    });
  },

  setActiveCanvasTab(index) {
    set((s) => {
      if (index < 0 || index >= s.canvasTabs.length) return {};
      return { activeCanvasTab: index };
    });
  },

  resetCanvasTabs() {
    set({ canvasTabs: [FILES_TAB], activeCanvasTab: 0 });
  },
}));

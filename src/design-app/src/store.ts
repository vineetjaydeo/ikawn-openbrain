import { create } from 'zustand';
import * as api from './api';
import type { Design, DesignSnapshot, ChatMessageRow, TodoItem, GenerationStage } from './types';

interface DesignStore {
  // Designs
  designs: Design[];
  currentDesignId: string | null;
  loadDesigns: () => Promise<void>;
  createDesign: (name?: string) => Promise<Design>;
  switchDesign: (id: string) => void;
  renameDesign: (id: string, name: string) => Promise<void>;
  deleteDesign: (id: string) => Promise<void>;

  // Snapshots
  snapshots: DesignSnapshot[];
  currentSnapshotId: string | null;
  loadSnapshots: (designId: string) => Promise<void>;

  // Chat
  chatMessages: ChatMessageRow[];
  loadChat: (designId: string) => Promise<void>;

  // Generation
  isGenerating: boolean;
  generationStage: GenerationStage;
  activeGenerationId: string | null;
  streamingText: string;
  todos: TodoItem[];
  cancelFn: (() => void) | null;

  // Preview
  previewHtml: string | null;
  previewFiles: Record<string, string>;
  previewViewport: 'desktop' | 'tablet' | 'mobile';
  setPreviewViewport: (v: 'desktop' | 'tablet' | 'mobile') => void;

  // UI
  view: 'hub' | 'workspace';
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  toasts: Array<{ id: string; message: string; type: 'info' | 'error' }>;
  addToast: (message: string, type?: 'info' | 'error') => void;
  dismissToast: (id: string) => void;

  // Actions
  sendPrompt: (prompt: string) => Promise<void>;
  cancelGeneration: () => void;
}

export const useStore = create<DesignStore>((set, get) => ({
  designs: [],
  currentDesignId: null,
  snapshots: [],
  currentSnapshotId: null,
  chatMessages: [],
  isGenerating: false,
  generationStage: 'idle',
  activeGenerationId: null,
  streamingText: '',
  todos: [],
  cancelFn: null,
  previewHtml: null,
  previewFiles: {},
  previewViewport: 'desktop',
  view: 'hub',
  sidebarCollapsed: false,
  toasts: [],

  loadDesigns: async () => {
    const designs = await api.listDesigns();
    set({ designs });
  },

  createDesign: async (name) => {
    const design = await api.createDesign(name);
    set((s) => ({ designs: [design, ...s.designs], currentDesignId: design.id, view: 'workspace' }));
    return design;
  },

  switchDesign: (id) => {
    set({ currentDesignId: id, view: 'workspace', previewHtml: null, chatMessages: [], snapshots: [], streamingText: '', todos: [] });
    get().loadChat(id);
    get().loadSnapshots(id);
  },

  renameDesign: async (id, name) => {
    await api.renameDesign(id, name);
    set((s) => ({ designs: s.designs.map((d) => (d.id === id ? { ...d, name } : d)) }));
  },

  deleteDesign: async (id) => {
    await api.deleteDesign(id);
    set((s) => ({
      designs: s.designs.filter((d) => d.id !== id),
      currentDesignId: s.currentDesignId === id ? null : s.currentDesignId,
      view: s.currentDesignId === id ? 'hub' : s.view,
    }));
  },

  loadSnapshots: async (designId) => {
    const snapshots = await api.listSnapshots(designId);
    set({ snapshots });
    const latest = snapshots[snapshots.length - 1];
    if (latest?.artifact_source) {
      set({ previewHtml: latest.artifact_source, currentSnapshotId: latest.id });
    }
  },

  loadChat: async (designId) => {
    const messages = await api.listChat(designId);
    set({ chatMessages: messages });
  },

  setPreviewViewport: (v) => set({ previewViewport: v }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  addToast: (message, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().dismissToast(id), 5000);
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  sendPrompt: async (prompt) => {
    const { currentDesignId, chatMessages } = get();

    let designId = currentDesignId;
    if (!designId) {
      const design = await get().createDesign(prompt.slice(0, 50));
      designId = design.id;
    }

    await api.appendChat(designId, 'user', { text: prompt });

    const history = chatMessages
      .filter((m) => m.kind === 'user' || m.kind === 'assistant_text')
      .map((m) => ({
        role: m.kind === 'user' ? 'user' : 'assistant',
        content: (m.payload as { text?: string }).text || '',
      }));

    set({
      isGenerating: true,
      generationStage: 'sending',
      streamingText: '',
      todos: [],
    });

    const cancel = api.streamGeneration(
      { designId, prompt, history },
      (event) => {
        const { type } = event;
        if (type === 'generation_start') {
          set({ generationStage: 'thinking', activeGenerationId: event.generationId as string });
        } else if (type === 'text_delta') {
          set((s) => ({ generationStage: 'streaming', streamingText: s.streamingText + (event.text as string) }));
        } else if (type === 'fs_updated') {
          const path = event.path as string;
          const content = event.content as string;
          set((s) => ({
            previewFiles: { ...s.previewFiles, [path]: content },
            previewHtml: path === 'index.html' ? content : s.previewHtml,
          }));
        } else if (type === 'todos_updated') {
          set({ todos: event.todos as TodoItem[] });
        } else if (type === 'generation_end') {
          const artifact = event.artifact as string | null;
          set({
            isGenerating: false,
            generationStage: 'done',
            previewHtml: artifact || get().previewHtml,
            previewFiles: (event.files as Record<string, string>) || get().previewFiles,
            activeGenerationId: null,
            cancelFn: null,
          });
          if (designId) {
            api.appendChat(designId, 'assistant_text', { text: get().streamingText });
            if (artifact) {
              api.appendChat(designId, 'artifact_delivered', { snapshotId: event.snapshotId });
            }
          }
          if (designId) get().loadSnapshots(designId);
        } else if (type === 'error') {
          set({
            isGenerating: false,
            generationStage: 'error',
            cancelFn: null,
          });
          get().addToast((event.message as string) || 'Generation failed', 'error');
        }
      },
      (err) => {
        set({ isGenerating: false, generationStage: 'error', cancelFn: null });
        get().addToast(err.message, 'error');
      },
      () => {
        if (get().isGenerating) {
          set({ isGenerating: false, generationStage: 'done', cancelFn: null });
        }
      },
    );

    set({ cancelFn: cancel });
  },

  cancelGeneration: () => {
    const { cancelFn, activeGenerationId } = get();
    if (cancelFn) cancelFn();
    if (activeGenerationId) {
      fetch(`/api/design/generate/${activeGenerationId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      }).catch(() => {});
    }
    set({ isGenerating: false, generationStage: 'idle', cancelFn: null });
  },
}));

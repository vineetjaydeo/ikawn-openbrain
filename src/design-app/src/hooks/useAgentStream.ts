/**
 * Thin observation hook for generation state.
 *
 * The store's `sendPrompt` action handles all SSE streaming internally via
 * `api.streamGeneration()` callbacks, so this hook does NOT set up its own
 * event listener. Instead it exposes a convenient bundle of selectors that
 * components can destructure to react to generation progress.
 *
 * Usage:
 *   const { isGenerating, stage, streamingText, todos } = useAgentStream();
 */

import { useDesignStore } from '../store';
import type { GenerationStage, TodoItem } from '../types';

export interface AgentStreamState {
  /** True while a generation request is in flight. */
  isGenerating: boolean;
  /** Current stage of the generation lifecycle. */
  stage: GenerationStage;
  /** The design ID that is currently being generated for, or null. */
  generatingDesignId: string | null;
  /** Opaque ID for the active generation run, or null. */
  activeGenerationId: string | null;
  /** Live-updating assistant text while streaming, or null when idle. */
  streamingText: string | null;
  /** Design ID the streaming text belongs to, or null. */
  streamingDesignId: string | null;
  /** Todos extracted during generation. */
  todos: TodoItem[];
  /** Last error message from a failed generation, or null. */
  errorMessage: string | null;
  /** Cancel the current generation. No-op if nothing is running. */
  cancel: () => void;
  /** Retry the last failed prompt. No-op if there is nothing to retry. */
  retry: () => Promise<void>;
}

/**
 * Subscribe to generation / agent streaming state from the store.
 * All heavy lifting (SSE connection, event dispatch, state mutations) lives
 * in the store's `sendPrompt` action -- this hook is purely a read lens.
 */
export function useAgentStream(): AgentStreamState {
  const isGenerating = useDesignStore((s) => s.isGenerating);
  const stage = useDesignStore((s) => s.generationStage);
  const generatingDesignId = useDesignStore((s) => s.generatingDesignId);
  const activeGenerationId = useDesignStore((s) => s.activeGenerationId);
  const streamingAssistantText = useDesignStore((s) => s.streamingAssistantText);
  const todos = useDesignStore((s) => s.todos);
  const errorMessage = useDesignStore((s) => s.errorMessage);
  const cancel = useDesignStore((s) => s.cancelGeneration);
  const retry = useDesignStore((s) => s.retryLastPrompt);

  return {
    isGenerating,
    stage,
    generatingDesignId,
    activeGenerationId,
    streamingText: streamingAssistantText?.text ?? null,
    streamingDesignId: streamingAssistantText?.designId ?? null,
    todos,
    errorMessage,
    cancel,
    retry,
  };
}

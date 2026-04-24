import { Link2, Paperclip, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useDesignStore } from '../store';
import { ChatMessageList } from './chat/ChatMessageList';
import { EmptyState } from './chat/EmptyState';
import { PromptInput } from './chat/PromptInput';
import { WorkingCard } from './chat/WorkingCard';

export interface SidebarProps {
  prompt: string;
  setPrompt: (value: string) => void;
  onSubmit: () => void;
}

/**
 * Sidebar -- chat-style conversation pane.
 *
 * Renders the chat history for the current design, a streaming indicator,
 * the prompt input area, and optional context chips (reference URL).
 */
export function Sidebar({ prompt, setPrompt, onSubmit }: SidebarProps) {
  const isGenerating = useDesignStore(
    (s) => s.isGenerating && s.generatingDesignId === s.currentDesignId,
  );
  const cancelGeneration = useDesignStore((s) => s.cancelGeneration);
  const referenceUrl = useDesignStore((s) => s.referenceUrl);
  const setReferenceUrl = useDesignStore((s) => s.setReferenceUrl);

  const chatMessages = useDesignStore((s) => s.chatMessages);
  const chatLoaded = useDesignStore((s) => s.chatLoaded);
  const streamingAssistantText = useDesignStore((s) => s.streamingAssistantText);
  const pendingToolCalls = useDesignStore((s) => s.pendingToolCalls);
  const loadChatForCurrentDesign = useDesignStore((s) => s.loadChatForCurrentDesign);
  const currentDesignId = useDesignStore((s) => s.currentDesignId);
  const designs = useDesignStore((s) => s.designs);
  const streamingText = useDesignStore((s) => s.streamingAssistantText?.text ?? null);
  const todos = useDesignStore((s) => s.todos);

  const currentDesign = designs.find((d) => d.id === currentDesignId) ?? null;
  const hasMessages = chatMessages.length > 0 || isGenerating;

  // Load chat history when switching designs
  useEffect(() => {
    if (currentDesignId && !chatLoaded) {
      void loadChatForCurrentDesign();
    }
  }, [currentDesignId, chatLoaded, loadChatForCurrentDesign]);

  const handlePickStarter = (starterPrompt: string): void => {
    setPrompt(starterPrompt);
  };

  return (
    <aside
      className="flex flex-col h-full overflow-x-hidden border-r border-[var(--color-border)] bg-[var(--color-background-secondary)]"
      style={{ minHeight: 0, minWidth: 0 }}
      aria-label="Chat sidebar"
    >
      {/* Spacer */}
      <div className="h-3 shrink-0" />

      {/* Chat scroll area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!hasMessages && !currentDesignId ? (
          <EmptyState onPickStarter={handlePickStarter} />
        ) : (
          <>
            <ChatMessageList messages={chatMessages} loading={!chatLoaded} />
            {isGenerating && (
              <WorkingCard calls={pendingToolCalls} />
            )}
          </>
        )}
      </div>

      {/* Prompt input + context chips */}
      <div className="border-t border-[var(--color-border-subtle)] px-4 pt-3 pb-3 space-y-[10px] bg-[var(--color-background-secondary)]">
        {/* Reference URL chip */}
        {referenceUrl.trim() ? (
          <div className="flex flex-wrap gap-2">
            <span
              className="inline-flex max-w-full items-center gap-[6px] rounded-full border border-[var(--color-border)] bg-[var(--color-background-secondary)] px-[10px] py-[5px] text-[11px] text-[var(--color-text-secondary)]"
              title={referenceUrl.trim()}
            >
              <Link2 className="w-3.5 h-3.5" aria-hidden />
              <span className="truncate max-w-[220px]">{referenceUrl.trim()}</span>
              <button
                type="button"
                onClick={() => setReferenceUrl('')}
                aria-label="Remove reference URL"
                className="inline-flex items-center justify-center rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <X className="w-3 h-3" aria-hidden />
              </button>
            </span>
          </div>
        ) : null}

        <PromptInput
          prompt={prompt}
          setPrompt={setPrompt}
          onSubmit={onSubmit}
          onCancel={cancelGeneration}
          isGenerating={isGenerating}
        />
      </div>
    </aside>
  );
}

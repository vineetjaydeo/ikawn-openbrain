import { useStore } from '../store';
import { ChatMessageList } from './chat/ChatMessageList';
import { PromptInput } from './chat/PromptInput';
import { EmptyState } from './chat/EmptyState';
import { WorkingCard } from './chat/WorkingCard';

export function Sidebar() {
  const { chatMessages, isGenerating, streamingText, todos, currentDesignId } = useStore();
  const hasMessages = chatMessages.length > 0 || isGenerating;

  return (
    <div className="flex flex-col h-full bg-[var(--bg)]">
      <div className="flex-1 overflow-y-auto p-4">
        {!hasMessages && !currentDesignId ? (
          <EmptyState />
        ) : (
          <>
            <ChatMessageList messages={chatMessages} />
            {isGenerating && (
              <WorkingCard text={streamingText} todos={todos} />
            )}
          </>
        )}
      </div>
      <div className="p-4 border-t border-[var(--border)]">
        <PromptInput />
      </div>
    </div>
  );
}

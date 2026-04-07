import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { ConversationItem, type Conversation } from '@/components/chat/ConversationItem'

interface ConversationListProps {
  conversations: Conversation[]
  onRename: (id: string, newTitle: string) => void
  onDelete: (id: string) => void
}

interface DateGroup {
  label: string
  items: Conversation[]
}

function groupByDate(conversations: Conversation[]): DateGroup[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: [],
  }

  for (const conv of conversations) {
    const d = new Date(conv.updated_at)
    if (d >= today) {
      groups['Today'].push(conv)
    } else if (d >= yesterday) {
      groups['Yesterday'].push(conv)
    } else if (d >= sevenDaysAgo) {
      groups['Previous 7 Days'].push(conv)
    } else {
      groups['Older'].push(conv)
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }))
}

export function ConversationList({ conversations, onRename, onDelete }: ConversationListProps) {
  const { id: activeId } = useParams<{ id: string }>()
  const groups = useMemo(() => groupByDate(conversations), [conversations])

  if (conversations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-xs text-[var(--text-tertiary)] text-center">
          No conversations yet. Start one!
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-1.5 pb-2 scrollbar-thin">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-2 pt-3 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            {group.label}
          </div>
          <div className="flex flex-col gap-0.5">
            {group.items.map((conv) => (
              <ConversationItem
                key={conv.uuid}
                conversation={conv}
                isActive={activeId === conv.uuid}
                onRename={onRename}
                onDelete={onDelete}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

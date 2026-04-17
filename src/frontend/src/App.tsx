import { UserLayout } from '@/components/layout/UserLayout'
import { ChatView } from '@/components/chat/ChatView'

export function App() {
  return (
    <UserLayout>
      <ChatView />
    </UserLayout>
  )
}

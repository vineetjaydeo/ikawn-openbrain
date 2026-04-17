import { create } from 'zustand'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  attachments?: { name: string; type: string; url: string }[]
  isStreaming?: boolean
}

export interface Conversation {
  id: string
  title: string
  lastMessage: string
  updatedAt: Date
  unread?: boolean
}

interface ChatState {
  conversations: Conversation[]
  activeConversationId: string | null
  messages: Message[]
  isStreaming: boolean
  draftText: string
  setActiveConversation: (id: string | null) => void
  setMessages: (messages: Message[]) => void
  addMessage: (message: Message) => void
  updateStreamingMessage: (content: string) => void
  setIsStreaming: (streaming: boolean) => void
  setDraftText: (text: string) => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [
    {
      id: '1',
      title: 'Brand strategy for MaxFashion Q2',
      lastMessage: 'I have prepared a comprehensive analysis of the current market positioning...',
      updatedAt: new Date(Date.now() - 1000 * 60 * 5),
    },
    {
      id: '2',
      title: 'Competitor analysis deep dive',
      lastMessage: 'Based on the data from the last quarter, here are the key trends...',
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: '3',
      title: 'Social media content calendar',
      lastMessage: 'Here is the proposed content schedule for the next two weeks...',
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
    {
      id: '4',
      title: 'Product photography brief',
      lastMessage: 'The visual direction should emphasize minimalism with warm tones...',
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    },
    {
      id: '5',
      title: 'Email campaign performance review',
      lastMessage: 'Open rates improved by 12% after implementing the new subject line strategy...',
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    },
  ],
  activeConversationId: '1',
  messages: [
    {
      id: 'm1',
      role: 'user',
      content: 'Can you analyze our brand positioning for MaxFashion in Q2? I want to understand where we stand against competitors and what opportunities exist.',
      timestamp: new Date(Date.now() - 1000 * 60 * 10),
    },
    {
      id: 'm2',
      role: 'assistant',
      content: 'I have prepared a comprehensive analysis of MaxFashion\'s current market positioning for Q2.\n\n**Market Position**\nMaxFashion currently holds approximately 8.3% of the mid-range fashion e-commerce segment in India, up from 7.1% in Q1. This growth is primarily driven by the expansion of the ethnic wear category and improved mobile conversion rates.\n\n**Competitive Landscape**\n\n| Competitor | Market Share | Growth | Key Strength |\n|-----------|-------------|--------|-------------|\n| Myntra | 27.4% | +2.1% | Brand partnerships |\n| Ajio | 15.2% | +3.8% | Private labels |\n| MaxFashion | 8.3% | +1.2% | Value positioning |\n| Tata Cliq | 6.1% | -0.4% | Premium segment |\n\n**Key Opportunities**\n\n1. **Ethnic wear expansion** -- The category grew 34% YoY and MaxFashion\'s curation is resonating with the 25-35 demographic\n2. **Sustainability messaging** -- Competitors have not yet captured this narrative in the mid-range segment\n3. **Regional language support** -- Only 12% of competitors offer vernacular shopping experiences\n\nWould you like me to drill deeper into any of these areas, or shall I prepare a strategic recommendation document?',
      timestamp: new Date(Date.now() - 1000 * 60 * 8),
    },
    {
      id: 'm3',
      role: 'user',
      content: 'This is great. Can you elaborate on the sustainability angle? I think that could be our differentiator.',
      timestamp: new Date(Date.now() - 1000 * 60 * 6),
    },
    {
      id: 'm4',
      role: 'assistant',
      content: 'Excellent instinct. Sustainability is indeed an underexploited differentiator in the mid-range fashion segment.\n\n**Current State of Sustainability in Indian E-Commerce Fashion**\n\nMost competitors treat sustainability as a marketing checkbox rather than a core value proposition. Myntra has a small "Earth Edit" collection, but it represents less than 2% of their catalog. Ajio has no dedicated sustainability initiative.\n\n**The Opportunity for MaxFashion**\n\nThree strategic pillars I would recommend:\n\n1. **Transparent Supply Chain**\n   Launch a "Made Right" badge system where products carry verifiable sourcing information. Consumer research shows 67% of Indian millennials are willing to pay a 10-15% premium for verified ethical sourcing.\n\n2. **Circular Fashion Program**\n   Introduce a buy-back program for MaxFashion products. This creates a secondary revenue stream while building brand loyalty. H&M\'s similar program in Europe increased repeat purchase rates by 23%.\n\n3. **Content-Led Education**\n   Create a content series explaining the environmental impact of fast fashion choices. This positions MaxFashion as a thought leader, not just a retailer.\n\n**Projected Impact**\nBased on comparable case studies, a well-executed sustainability strategy could increase brand favorability by 15-20% within two quarters and improve customer lifetime value by approximately 18%.\n\nShall I draft a detailed implementation roadmap with timeline and budget estimates?',
      timestamp: new Date(Date.now() - 1000 * 60 * 4),
    },
  ],
  isStreaming: false,
  draftText: '',
  setActiveConversation: (id) => set({ activeConversationId: id }),
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateStreamingMessage: (content) =>
    set((state) => {
      const msgs = [...state.messages]
      const last = msgs[msgs.length - 1]
      if (last && last.isStreaming) {
        msgs[msgs.length - 1] = { ...last, content }
      }
      return { messages: msgs }
    }),
  setIsStreaming: (streaming) => set({ isStreaming: streaming }),
  setDraftText: (text) => set({ draftText: text }),
}))

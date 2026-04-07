import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Activity, Image, Code } from 'lucide-react'
import type { User } from '@/hooks/useAuth'

interface WelcomeScreenProps {
  user: User | null
  onSuggestionClick: (text: string) => void
}

function getGreeting(name: string): { greeting: string; subtitle: string } {
  const h = new Date().getHours()
  const day = new Date().getDay()
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

  let greetingPool: string[]
  if (h < 5) {
    greetingPool = [
      `Burning the midnight oil${name ? ', ' + name : ''}?`,
      'The world is quiet. Perfect time to think.',
      `Late night, big ideas${name ? ', ' + name : ''}?`,
    ]
  } else if (h < 12) {
    greetingPool = [
      `Good morning${name ? ', ' + name : ''}`,
      `Fresh day, fresh start${name ? ', ' + name : ''}`,
      `Morning${name ? ', ' + name : ''}. What's on your mind?`,
      `Rise and create${name ? ', ' + name : ''}`,
      ...(day === 1 ? [`Happy Monday${name ? ', ' + name : ''}. Let's make it count.`] : []),
      ...(day === 5 ? [`Friday morning${name ? ', ' + name : ''}. Let's finish strong.`] : []),
    ]
  } else if (h < 17) {
    greetingPool = [
      `Good afternoon${name ? ', ' + name : ''}`,
      `What are we working on${name ? ', ' + name : ''}?`,
      `Afternoon focus time${name ? ', ' + name : ''}`,
      'How can I help this afternoon?',
    ]
  } else if (h < 21) {
    greetingPool = [
      `Good evening${name ? ', ' + name : ''}`,
      `Evening${name ? ', ' + name : ''}. What's next?`,
      `Winding down or ramping up${name ? ', ' + name : ''}?`,
    ]
  } else {
    greetingPool = [
      `Working late${name ? ', ' + name : ''}?`,
      `Night owl mode${name ? ', ' + name : ''}`,
      'One more thing before bed?',
      `The best ideas come at night${name ? ', ' + name : ''}`,
    ]
  }

  const subtitles = [
    'Your intelligence layer, ready when you are.',
    'Think out loud. I\'ll keep up.',
    'Memory, reasoning, action. All in one place.',
    'Ask me anything, or give me a task.',
  ]

  return {
    greeting: pick(greetingPool),
    subtitle: pick(subtitles),
  }
}

const suggestions = [
  { icon: Sparkles, text: 'What can you do?', color: 'text-[var(--gold)]' },
  { icon: Activity, text: 'Check system status', color: 'text-emerald-400' },
  { icon: Image, text: 'Generate an image', color: 'text-purple-400' },
  { icon: Code, text: 'Write some code', color: 'text-blue-400' },
]

export function WelcomeScreen({ user, onSuggestionClick }: WelcomeScreenProps) {
  const firstName = user?.name ? user.name.split(' ')[0] : ''
  const { greeting, subtitle } = useMemo(() => getGreeting(firstName), [firstName])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <span className="text-4xl text-[var(--gold)]">{'\u2726'}</span>
        <h1
          className="text-3xl font-bold tracking-tight text-[hsl(var(--foreground))]"
          style={{ fontFamily: "'Parkinsans', 'Google Sans', sans-serif" }}
        >
          {greeting}
        </h1>
        <p
          className="text-lg text-[var(--text-secondary)] italic"
          style={{ fontFamily: "'Noto Serif', Georgia, serif" }}
        >
          {subtitle}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2 mt-4 max-w-lg">
        {suggestions.map((s) => (
          <button
            key={s.text}
            onClick={() => onSuggestionClick(s.text)}
            className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-all hover:border-[var(--gold)]/40 hover:bg-[var(--surface-3)] hover:text-[var(--text)]"
          >
            <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
            {s.text}
          </button>
        ))}
      </div>
    </div>
  )
}

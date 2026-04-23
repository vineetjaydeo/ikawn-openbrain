import { useStore } from '../../store';

const STARTERS = [
  'A sleek SaaS pricing page with dark theme and gradient accents',
  'A portfolio landing page with bento grid layout and smooth animations',
  'An e-commerce product page with image gallery and sticky add-to-cart',
  'A dashboard with charts, stats cards, and a clean data table',
];

export function EmptyState() {
  const { sendPrompt, createDesign } = useStore();

  const handleStarter = async (prompt: string) => {
    await createDesign(prompt.slice(0, 50));
    sendPrompt(prompt);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="text-2xl mb-2">&#10022;</div>
      <h2 className="text-lg font-medium mb-1" style={{ fontFamily: 'var(--font-serif)' }}>What would you like to design?</h2>
      <p className="text-xs text-[var(--text-muted)] mb-6">Describe a page, and I'll build it for you</p>
      <div className="w-full max-w-sm space-y-2">
        {STARTERS.map((s, i) => (
          <button
            key={i}
            onClick={() => handleStarter(s)}
            className="w-full text-left px-3 py-2.5 rounded-lg text-xs bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)] border border-[var(--border-subtle)] transition-colors text-[var(--text-muted)] hover:text-[var(--text)]"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

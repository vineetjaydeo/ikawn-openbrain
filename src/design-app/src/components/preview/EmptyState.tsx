import { ArrowUpRight } from 'lucide-react';

export interface EmptyStateProps {
  onPickStarter: (prompt: string) => void;
}

interface Starter {
  label: string;
  prompt: string;
  desc: string;
  accent: string;
}

const STARTERS: Starter[] = [
  {
    label: 'Landing page',
    prompt: 'Design a modern SaaS landing page with a hero section, features grid, testimonials, and a bold CTA. Use a clean color palette with one strong accent color.',
    desc: 'Hero, features, social proof, CTA',
    accent: '#b5441a',
  },
  {
    label: 'Dashboard',
    prompt: 'Create an analytics dashboard with a sidebar navigation, key metric cards at the top, a line chart for trends, and a recent activity table. Dark theme preferred.',
    desc: 'Metrics, charts, tables, nav',
    accent: '#1a7a6d',
  },
  {
    label: 'Mobile app',
    prompt: 'Design a mobile app screen for a food delivery service with a search bar, category pills, restaurant cards with ratings, and a bottom tab bar.',
    desc: 'Cards, search, bottom nav',
    accent: '#3b6caa',
  },
  {
    label: 'Pitch deck',
    prompt: 'Create a 5-slide pitch deck for an AI startup. Include a title slide, problem statement, solution overview with mockups, market size, and team slide.',
    desc: 'Slides, narrative flow, data viz',
    accent: '#8b5e3c',
  },
  {
    label: 'Email template',
    prompt: 'Design a product launch email with a header banner, feature highlights with icons, a prominent CTA button, and a clean footer. Mobile-responsive.',
    desc: 'Header, features, CTA, footer',
    accent: '#6b4c9a',
  },
  {
    label: 'Portfolio',
    prompt: 'Design a minimal portfolio page for a designer with a large hero image, a project grid with hover effects, an about section, and contact form.',
    desc: 'Hero, project grid, about, contact',
    accent: '#2d6a4f',
  },
  {
    label: 'Case study',
    prompt: 'Create a case study page layout with a project overview, before/after comparisons, process breakdown, metrics section, and key takeaways.',
    desc: 'Overview, process, metrics',
    accent: '#142d4c',
  },
  {
    label: 'Interactive animation',
    prompt: 'Build an interactive hero section with smooth scroll-triggered animations, floating elements, gradient backgrounds, and a parallax effect.',
    desc: 'Scroll effects, parallax, gradients',
    accent: '#a0522d',
  },
];

export function EmptyState({ onPickStarter }: EmptyStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center overflow-y-auto select-none px-[var(--space-4)] py-[var(--space-8)]">
      <div className="w-full max-w-[760px] px-[var(--space-8)] flex flex-col items-center my-auto">
        {/* Headline */}
        <h1
          className="text-center"
          style={{
            fontFamily: 'var(--font-display, system-ui)',
            fontWeight: 400,
            fontSize: 'clamp(32px, 3.5vw, 46px)',
            lineHeight: 1.1,
            letterSpacing: '-0.025em',
            color: 'var(--color-text-primary, #142d4c)',
          }}
        >
          What would you like to design?
        </h1>

        <p
          className="mt-[14px] text-center"
          style={{
            fontSize: '15px',
            lineHeight: 1.65,
            maxWidth: '380px',
            color: 'var(--color-text-muted, #8a7e72)',
          }}
        >
          Describe your vision and Lucy will bring it to life.
        </p>

        {/* Starter grid */}
        <div className="w-full mt-[48px]">
          <p
            className="mb-[14px] font-medium uppercase"
            style={{ fontSize: '11px', letterSpacing: '0.12em', color: 'var(--color-text-muted, #a89e92)' }}
          >
            Try one of these
          </p>

          <div className="grid grid-cols-4 gap-[10px]">
            {STARTERS.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => onPickStarter(s.prompt)}
                className="group relative text-left overflow-hidden rounded-[10px] px-[16px] pt-[14px] pb-[12px] transition-all duration-200 ease-out hover:shadow-[0_6px_20px_rgba(0,0,0,0.07)] hover:-translate-y-[2px] active:translate-y-0 active:shadow-none"
                style={{
                  border: `1px solid color-mix(in srgb, ${s.accent} 14%, var(--color-border-muted, #e0dcd6))`,
                  background: `color-mix(in srgb, ${s.accent} 5%, var(--color-surface, #fff))`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `color-mix(in srgb, ${s.accent} 9%, var(--color-surface, #fff))`;
                  e.currentTarget.style.borderColor = `color-mix(in srgb, ${s.accent} 35%, transparent)`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = `color-mix(in srgb, ${s.accent} 5%, var(--color-surface, #fff))`;
                  e.currentTarget.style.borderColor = `color-mix(in srgb, ${s.accent} 14%, var(--color-border-muted, #e0dcd6))`;
                }}
              >
                <span
                  aria-hidden
                  className="absolute top-0 left-[12px] right-[12px] h-[2px] rounded-b-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ backgroundColor: s.accent }}
                />

                <div className="flex items-start justify-between gap-[6px]">
                  <span
                    className="text-[13px] font-medium leading-[1.35] transition-colors duration-150"
                    style={{ color: s.accent }}
                  >
                    {s.label}
                  </span>
                  <ArrowUpRight
                    className="w-[12px] h-[12px] shrink-0 mt-[2px] opacity-0 group-hover:opacity-70 transition-opacity duration-150"
                    style={{ color: s.accent }}
                  />
                </div>

                <span className="mt-[5px] block text-[11px] leading-[1.5] text-[var(--color-text-muted)]">
                  {s.desc}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

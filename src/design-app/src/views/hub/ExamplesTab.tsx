import { useState } from 'react';
import { ExampleCard } from './ExampleCard';

// Lucy Design Studio example definitions. Each example has a prompt that gets
// filled into the composer when the user clicks "Use this prompt".
export interface LucyExample {
  id: string;
  title: string;
  description: string;
  prompt: string;
  category: ExampleCategory;
}

export type ExampleCategory =
  | 'landing'
  | 'dashboard'
  | 'marketing'
  | 'mobile'
  | 'presentation'
  | 'email';

type CategoryFilter = 'all' | ExampleCategory;

const FILTERS: { id: CategoryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'landing', label: 'Landing Pages' },
  { id: 'dashboard', label: 'Dashboards' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'presentation', label: 'Presentations' },
  { id: 'email', label: 'Email' },
];

const EXAMPLES: LucyExample[] = [
  {
    id: 'saas-landing',
    title: 'SaaS Landing Page',
    description:
      'A modern, conversion-focused landing page for a B2B SaaS product with hero section, features grid, pricing table, and testimonials.',
    prompt:
      'Create a modern SaaS landing page with a bold hero section, three-column feature grid with icons, a pricing table with three tiers, customer testimonials carousel, and a final CTA section. Use a clean dark navy and gold color scheme.',
    category: 'landing',
  },
  {
    id: 'analytics-dashboard',
    title: 'Analytics Dashboard',
    description:
      'A data-rich analytics dashboard with charts, KPI cards, and a responsive sidebar navigation.',
    prompt:
      'Build an analytics dashboard with a collapsible sidebar, top KPI cards showing revenue/users/conversion/churn, a large area chart for monthly trends, a donut chart for traffic sources, and a recent activity table. Dark theme with accent colors for data visualization.',
    category: 'dashboard',
  },
  {
    id: 'product-launch-email',
    title: 'Product Launch Email',
    description:
      'A visually rich HTML email template for announcing a new product launch, optimized for email clients.',
    prompt:
      'Design an HTML email template for a product launch announcement. Include a header with logo, a hero image area, product highlights in a two-column layout, a prominent CTA button, social links footer. Keep it under 600px width for email compatibility. Clean, modern aesthetic.',
    category: 'email',
  },
  {
    id: 'mobile-app-ui',
    title: 'Mobile App Screens',
    description:
      'A set of mobile app screens including onboarding, home feed, and profile -- designed for a fitness tracking app.',
    prompt:
      'Create three mobile app screens (375px width) for a fitness app: (1) onboarding screen with illustration and "Get Started" button, (2) home feed with daily stats cards, activity ring, and workout suggestions, (3) profile page with avatar, stats summary, and settings list. Use a vibrant green and dark theme.',
    category: 'mobile',
  },
  {
    id: 'pitch-deck',
    title: 'Startup Pitch Deck',
    description:
      'A clean, investor-ready pitch deck layout with problem/solution/traction/team slides.',
    prompt:
      'Design a startup pitch deck with 6 slides: (1) Title slide with company name and tagline, (2) Problem statement with stats, (3) Solution overview with product screenshot placeholder, (4) Traction metrics with growth chart, (5) Business model with revenue streams, (6) Team slide with photo placeholders and bios. Minimalist design, dark background, gold accents.',
    category: 'presentation',
  },
  {
    id: 'ecommerce-landing',
    title: 'E-commerce Product Page',
    description:
      'A high-conversion product detail page with image gallery, specs, reviews, and add-to-cart flow.',
    prompt:
      'Create a premium e-commerce product page for a luxury watch. Include: a large product image gallery with thumbnails, product title and price, color/size selectors, add-to-cart button with quantity picker, tabbed section for specs/reviews/shipping, and a "You may also like" product carousel at the bottom. Clean white background with subtle luxury feel.',
    category: 'landing',
  },
  {
    id: 'social-media-kit',
    title: 'Social Media Kit',
    description:
      'A set of social media post templates for Instagram, Twitter/X, and LinkedIn with consistent branding.',
    prompt:
      'Design a social media content kit with three templates: (1) Instagram square post (1080x1080) with bold typography and gradient background, (2) Twitter/X header card with product screenshot and headline, (3) LinkedIn carousel slide with data visualization and key stat. Use a cohesive brand palette of navy, gold, and white.',
    category: 'marketing',
  },
  {
    id: 'crm-dashboard',
    title: 'CRM Dashboard',
    description:
      'A sales CRM dashboard with pipeline view, deal cards, and team performance metrics.',
    prompt:
      'Build a CRM sales dashboard with: a Kanban-style deal pipeline (columns: Lead, Qualified, Proposal, Negotiation, Closed), deal cards showing company name/value/stage, a sidebar with team leaderboard, and top-level metrics for total pipeline value, win rate, and average deal size. Professional look with blue and gray tones.',
    category: 'dashboard',
  },
  {
    id: 'newsletter-template',
    title: 'Newsletter Template',
    description:
      'A weekly newsletter email template with curated content sections, author bio, and reading time estimates.',
    prompt:
      'Design a weekly newsletter email template with: branded header, featured article with large image and excerpt, three secondary article cards in a row, an "In case you missed it" section with text links, author bio with photo, and unsubscribe footer. Warm, editorial feel with serif headings and clean sans-serif body text.',
    category: 'email',
  },
];

export interface ExamplesTabProps {
  onUsePrompt: (example: LucyExample) => void;
}

export function ExamplesTab({ onUsePrompt }: ExamplesTabProps) {
  const [filter, setFilter] = useState<CategoryFilter>('all');

  const visible = filter === 'all' ? EXAMPLES : EXAMPLES.filter((e) => e.category === filter);

  return (
    <section className="flex h-full flex-col gap-[var(--space-6)] overflow-auto px-[var(--space-8)] py-[var(--space-8)]">
      <header className="flex flex-col gap-[var(--space-2)]">
        <h1
          className="text-[var(--font-size-display-lg)] leading-[var(--leading-heading)] tracking-[var(--tracking-heading)] text-[var(--color-text-primary)]"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
        >
          Examples
        </h1>
        <p className="max-w-2xl text-[var(--font-size-body)] leading-[var(--leading-body)] text-[var(--color-text-secondary)]">
          Start from a curated prompt. Click any example to fill the composer and begin designing.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Example categories"
        className="flex flex-wrap gap-[var(--space-2)]"
      >
        {FILTERS.map(({ id, label }) => {
          const active = id === filter;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => setFilter(id)}
              className={`
                rounded-full border px-[var(--space-3)] py-[var(--space-1)]
                text-[var(--font-size-body-sm)] leading-[var(--leading-ui)]
                transition-[border-color,background-color,color]
                duration-[var(--duration-fast)] ease-[var(--ease-out)]
                ${
                  active
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-background)]'
                    : 'border-[var(--color-border)] bg-[var(--color-background-secondary)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text-primary)]'
                }
              `}
            >
              {label}
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] px-[var(--space-4)] py-[var(--space-6)] text-center text-[var(--font-size-body-sm)] text-[var(--color-text-muted)]">
          No examples in this category yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((example) => (
            <ExampleCard key={example.id} example={example} onUsePrompt={onUsePrompt} />
          ))}
        </div>
      )}
    </section>
  );
}

// Mock data for Ruhi demo

import type { AccessLevel } from './components';
import type { IconName } from './icons';

// --- Brand ---

export interface Brand {
  id: string;
  name: string;
  industry: string;
  color: string;
  initial: string;
  current?: boolean;
}

export const BRANDS: Brand[] = [
  { id: 'meridian', name: 'Meridian Bank', industry: 'Commercial Banking', color: '#0A4D8C', initial: 'M', current: true },
  { id: 'helix', name: 'Helix Capital', industry: 'Investment Advisory', color: '#8C0A3F', initial: 'H' },
  { id: 'floret', name: 'Floret & Fern', industry: 'D2C Skincare', color: '#2F7D3F', initial: 'F' },
  { id: 'northfield', name: 'Northfield Atelier', industry: 'D2C Apparel', color: '#B35C00', initial: 'N' },
  { id: 'cartograph', name: 'Cartograph Home', industry: 'Ecommerce - Home Goods', color: '#4A3B8C', initial: 'C' },
];

// --- Chat ---

export interface Citation {
  tag: string;
}

export interface ChatMessage {
  role: 'user' | 'agent';
  text: string;
  avatar?: boolean;
  headline?: string;
  citations?: Citation[];
  footnote?: string;
  typing?: boolean;
}

export const CHAT_TRANSCRIPT: ChatMessage[] = [
  { role: 'user',
    text: "Give me a treasury exposure summary for Meridian this morning. Anything a CRO needs to know before the 10am risk committee." },
  { role: 'agent', avatar: true,
    headline: "FX exposure is live, within policy.",
    text: "Consolidated GBP positions crossed the internal alert at 06:42 GMT as the Trafalgar desk re-hedged after the overnight BoE note. Net 312M, up 14 percent against last Thursday. Review cadence moves to daily until Friday.",
    citations: [{ tag: 'treasury-fx-limits' }, { tag: 'trafalgar-desk' }],
    footnote: "Pulled 3 memories, confidence 92%" },
  { role: 'agent',
    headline: "Two borrowers tripped the early warning. No escalation needed yet.",
    text: "Ardent Logistics is a known watchlist. Keyline Foods is new, first breach, flagged by the RM on Tuesday. Your policy treats a first breach as review, not escalation.",
    citations: [{ tag: 'watchlist-ardent' }, { tag: 'keyline-foods' }, { tag: 'early-warning-policy' }],
    footnote: "Pulled 5 memories, confidence 88%" },
  { role: 'user',
    text: "Is Keyline the same group we advised on refinancing last quarter?" },
  { role: 'agent', typing: true,
    text: '' },
];

// --- Memory Recall ---

export interface MemoryRecallItem {
  title: string;
  access: AccessLevel;
  tags: string[];
  brand: string;
  score: number;
  snippet: string;
}

export const MEMORY_RECALL: MemoryRecallItem[] = [
  { title: 'Treasury FX hedging limits, 2026 policy',
    access: 'Management',
    tags: ['treasury', 'fx-limits', 'policy'],
    brand: 'Meridian Bank',
    score: 0.94,
    snippet: 'Internal alert threshold for consolidated GBP positions set at 300M with 72-hour review cadence...' },
  { title: 'Trafalgar desk mandate and counterparties',
    access: 'Internal',
    tags: ['trafalgar-desk', 'counterparties'],
    brand: 'Meridian Bank',
    score: 0.89,
    snippet: 'Desk runs GBP, EUR, and cross-crown pairs. Primary counterparties: three named...' },
  { title: 'Keyline Foods credit file, Q1 2026',
    access: 'Private',
    tags: ['keyline-foods', 'credit-file'],
    brand: 'Meridian Bank',
    score: 0.86,
    snippet: 'First borrower breach of the early-warning ratio on 14 April. RM notes margin compression in...' },
  { title: 'Early-warning ratio response policy',
    access: 'Management',
    tags: ['early-warning-policy', 'credit-risk'],
    brand: 'Meridian Bank',
    score: 0.81,
    snippet: 'First breach: review within 5 business days. Second breach: escalate to credit committee...' },
  { title: 'Ardent Logistics watchlist, since 2025-11',
    access: 'Management',
    tags: ['watchlist-ardent', 'logistics'],
    brand: 'Meridian Bank',
    score: 0.78,
    snippet: 'Placed on watchlist November 2025 after consecutive covenant waivers. Quarterly monitoring...' },
];

// --- Full Memories ---

export interface MemoryItem {
  id: number;
  title: string;
  access: AccessLevel;
  tags: string[];
  brand: string;
  brandColor: string;
  date: string;
  snippet: string;
}

export const MEMORIES_FULL: MemoryItem[] = [
  { id: 1, title: 'Treasury FX hedging limits, 2026 policy', access: 'Management', tags: ['treasury','fx-limits','policy'], brand: 'Meridian Bank', brandColor: '#0A4D8C', date: '12 Apr 2026', snippet: 'Internal alert threshold for consolidated GBP positions set at 300M with 72-hour review cadence. Breach triggers desk-level notification and daily CRO brief for the following week.' },
  { id: 2, title: 'Keyline Foods credit file, Q1 2026', access: 'Private', tags: ['keyline-foods','credit-file'], brand: 'Meridian Bank', brandColor: '#0A4D8C', date: '14 Apr 2026', snippet: 'First borrower breach of the early-warning ratio on 14 April. Relationship manager notes margin compression in ready-meals segment. No covenant waiver requested yet.' },
  { id: 3, title: 'Helix Q2 portfolio rebalance notes', access: 'Investor', tags: ['portfolio','rebalance'], brand: 'Helix Capital', brandColor: '#8C0A3F', date: '09 Apr 2026', snippet: 'Decision memo from the 8 April IC. Shift 4% from US small-cap into short-duration credit. Retain EM equity weight. Two dissenting views logged.' },
  { id: 4, title: 'Floret customer cohort, reorder velocity', access: 'Internal', tags: ['cohort','reorder','skincare'], brand: 'Floret & Fern', brandColor: '#2F7D3F', date: '11 Apr 2026', snippet: 'March cohort reorders at 42 days vs 38-day baseline. Driver is the new retinol SKU: skewing review cycle longer. Not a churn signal yet.' },
  { id: 5, title: 'Northfield wholesale pricing grid', access: 'Management', tags: ['pricing','wholesale'], brand: 'Northfield Atelier', brandColor: '#B35C00', date: '08 Apr 2026', snippet: 'Tier-1 partners receive 45 to 50 percent off MSRP on core, 38 percent on limited drops. Grid refreshed each season with 2-week notice window.' },
  { id: 6, title: 'Cartograph supplier risk log', access: 'Advisor', tags: ['supplier','risk','logistics'], brand: 'Cartograph Home', brandColor: '#4A3B8C', date: '07 Apr 2026', snippet: 'Two of five ceramics suppliers have port dependency on Long Beach. Single-point-of-failure flagged. Mitigation plan in draft, owner is Ops lead.' },
  { id: 7, title: 'Regulatory filing calendar, 2026', access: 'Public', tags: ['regulatory','calendar'], brand: 'Meridian Bank', brandColor: '#0A4D8C', date: '05 Apr 2026', snippet: 'Quarterly capital adequacy on 30 April. Annual resolution plan on 15 June. Consumer compliance audit window opens 1 July.' },
  { id: 8, title: 'Ardent Logistics, watchlist', access: 'Management', tags: ['watchlist-ardent','logistics','credit-risk'], brand: 'Meridian Bank', brandColor: '#0A4D8C', date: '04 Apr 2026', snippet: 'Placed on watchlist Nov 2025 after consecutive covenant waivers. Quarterly monitoring by credit team. Next review 30 April.' },
  { id: 9, title: 'Trafalgar desk mandate', access: 'Internal', tags: ['trafalgar-desk','mandate'], brand: 'Meridian Bank', brandColor: '#0A4D8C', date: '02 Apr 2026', snippet: 'Desk runs GBP, EUR, and cross-crown pairs. Primary counterparties: three named institutions. Delta and vega limits reviewed quarterly.' },
  { id: 10, title: 'Floret packaging unit economics', access: 'Private', tags: ['packaging','unit-econ'], brand: 'Floret & Fern', brandColor: '#2F7D3F', date: '31 Mar 2026', snippet: 'Glass dropper bottles land at 2.14 USD all-in. Carton at 0.38 USD. Net contribution per unit holds at 61 percent on the 48 USD price point.' },
  { id: 11, title: 'Helix advisor briefing, energy transition', access: 'Advisor', tags: ['energy','thesis'], brand: 'Helix Capital', brandColor: '#8C0A3F', date: '28 Mar 2026', snippet: 'Thesis memo from the 25 March offsite. Overweight utility-scale storage, neutral on residential solar, reduce exposure to legacy pipeline operators.' },
  { id: 12, title: 'Cartograph brand voice guidelines', access: 'Public', tags: ['brand-voice','copy'], brand: 'Cartograph Home', brandColor: '#4A3B8C', date: '22 Mar 2026', snippet: 'Warm, lived-in, considered. Avoid superlatives. Read-aloud test every email headline. No exclamation points in the first paragraph.' },
];

// --- Suggested Prompts ---

export interface SuggestedPromptData {
  icon: IconName;
  label: string;
}

export const SUGGESTED_PROMPTS: SuggestedPromptData[] = [
  { icon: 'trend', label: 'Treasury exposure summary' },
  { icon: 'alert', label: 'Compliance alerts this week' },
  { icon: 'shield', label: 'Top client risk flags' },
  { icon: 'calendar', label: 'Regulatory filing calendar' },
];

import {
  BrainCircuit,
  CheckCircle,
  Loader,
  RadioTower,
  Send,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { GenerationStage } from '../../types';
import { useDesignStore } from '../../store';

const STAGES: GenerationStage[] = [
  'sending',
  'thinking',
  'streaming',
  'done',
];

const STAGE_PROGRESS: Record<GenerationStage, number> = {
  idle: 0,
  sending: 1,
  thinking: 2,
  streaming: 3,
  done: 4,
  error: 0,
};

const STAGE_LABELS: Record<GenerationStage, string> = {
  idle: 'Preparing...',
  sending: 'Sending prompt...',
  thinking: 'Thinking...',
  streaming: 'Generating design...',
  done: 'Complete',
  error: 'Error',
};

const MAX_PROGRESS = 4;

function StageIcon({ stage }: { stage: GenerationStage }): ReactNode {
  const cls = 'w-4 h-4 shrink-0';
  switch (stage) {
    case 'sending':
      return <Send className={cls} />;
    case 'thinking':
      return <BrainCircuit className={cls} />;
    case 'streaming':
      return <RadioTower className={cls} />;
    case 'done':
      return <CheckCircle className={cls} />;
    default:
      return <Loader className={`${cls} animate-spin`} />;
  }
}

export interface LoadingStateProps {
  stage?: GenerationStage;
}

export function LoadingState({ stage: stageProp }: LoadingStateProps = {}) {
  const storeStage = useDesignStore((s) => s.generationStage);

  const stage = stageProp ?? storeStage;
  const activeStage: GenerationStage = stage === 'idle' || stage === 'error' ? 'thinking' : stage;

  const progress = STAGE_PROGRESS[stage];

  return (
    <div className="h-full p-[var(--space-6)]">
      <div className="h-full w-full rounded-[var(--radius-2xl)] border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex flex-col">
        {/* Skeleton header */}
        <div className="px-[var(--space-6)] py-[var(--space-5)] border-b border-[var(--color-border-muted)] space-y-3">
          <div className="h-4 w-40 rounded bg-[var(--color-background-secondary)] animate-pulse" />
          <div className="h-3 w-64 rounded bg-[var(--color-background-secondary)] animate-pulse" />
        </div>
        {/* Skeleton body */}
        <div className="flex-1 grid grid-cols-3 gap-4 p-[var(--space-6)]">
          <div className="rounded-lg bg-[var(--color-background-secondary)] animate-pulse" />
          <div className="rounded-lg bg-[var(--color-background-secondary)] animate-pulse" />
          <div className="rounded-lg bg-[var(--color-background-secondary)] animate-pulse" />
        </div>
        {/* Stage feedback bar */}
        <div className="px-[var(--space-6)] py-4 border-t border-[var(--color-border-muted)] flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)] text-sm">
            <StageIcon stage={activeStage} />
            <span>{STAGE_LABELS[activeStage]}</span>
          </div>
          <progress
            value={progress}
            max={MAX_PROGRESS}
            aria-label={STAGE_LABELS[activeStage]}
            className="w-full h-1 rounded-full appearance-none [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-[var(--color-border)] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[var(--color-accent)] transition-all duration-300"
          />
        </div>
      </div>
    </div>
  );
}

export { STAGES };

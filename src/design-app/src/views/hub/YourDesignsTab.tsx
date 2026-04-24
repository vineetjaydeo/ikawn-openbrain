import { useDesignStore } from '../../store';
import { DesignGrid } from './DesignGrid';

export function YourDesignsTab() {
  const designs = useDesignStore((s) => s.designs);
  const sorted = [...designs]
    .filter((d) => d.deleted_at === null)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  return (
    <DesignGrid
      designs={sorted}
      emptyLabel="You have no designs yet. Create one from the Recent tab or try an example."
    />
  );
}

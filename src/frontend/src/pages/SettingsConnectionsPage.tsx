import { useConnectors } from '@/hooks/useSettings';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export default function SettingsConnectionsPage() {
  const { data: connectors, isLoading, error } = useConnectors();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <h1 className="text-2xl font-semibold text-white tracking-tight">
          Connected Services
        </h1>

        <Card className="bg-[#111] border-white/[0.08]">
          <CardHeader>
            <CardTitle className="text-white text-lg">Connections</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32 bg-white/[0.06]" />
                    <Skeleton className="h-5 w-20 bg-white/[0.06]" />
                  </div>
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-red-400">
                Failed to load connections.
              </p>
            )}

            {connectors && connectors.length === 0 && (
              <p className="text-sm text-white/40">
                No services connected yet.
              </p>
            )}

            {connectors && connectors.length > 0 && (
              <div className="space-y-3">
                {connectors.map((connector, index) => (
                  <div key={connector.id}>
                    <div className="flex items-center justify-between py-1">
                      <div>
                        <p className="text-sm text-white">{connector.name}</p>
                        <p className="text-xs text-white/40 mt-0.5">
                          {connector.provider}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          connector.connected
                            ? 'border-emerald-500/30 text-emerald-400 text-xs'
                            : 'border-white/[0.12] text-white/40 text-xs'
                        }
                      >
                        {connector.connected ? 'Connected' : 'Disconnected'}
                      </Badge>
                    </div>
                    {index < connectors.length - 1 && (
                      <Separator className="bg-white/[0.08] mt-3" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

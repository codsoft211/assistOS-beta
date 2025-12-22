import type { ComponentType } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface OAuthConnectorCardProps {
  name: string;
  description: string;
  icon?: ComponentType<{ className?: string }>;
  connected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  lastSyncAt?: Date;
}

export function OAuthConnectorCard({
  name,
  description,
  icon: Icon,
  connected,
  onConnect,
  onDisconnect,
  lastSyncAt,
}: OAuthConnectorCardProps) {
  return (
    <Card data-testid={`connector-card-${name.toLowerCase()}`}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {Icon && <Icon className="size-8" data-testid={`connector-icon-${name.toLowerCase()}`} />}
            <div>
              <CardTitle data-testid={`connector-name-${name.toLowerCase()}`}>{name}</CardTitle>
              <CardDescription data-testid={`connector-description-${name.toLowerCase()}`}>
                {description}
              </CardDescription>
            </div>
          </div>
          <Badge 
            variant={connected ? 'default' : 'secondary'}
            data-testid={`connector-status-${name.toLowerCase()}`}
          >
            {connected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          {lastSyncAt && connected && (
            <p className="text-sm text-muted-foreground" data-testid={`connector-sync-${name.toLowerCase()}`}>
              Última sincronização: {lastSyncAt.toLocaleString('pt-PT')}
            </p>
          )}
          <Button
            variant={connected ? 'destructive' : 'outline'}
            onClick={connected ? onDisconnect : onConnect}
            data-testid={`button-connector-${connected ? 'disconnect' : 'connect'}-${name.toLowerCase()}`}
          >
            {connected ? 'Desconectar' : 'Conectar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

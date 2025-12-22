import { useQuery } from '@tanstack/react-query';
import { Server, Shield, Users, Globe, DollarSign, Clock, Info, AlertCircle, Calendar } from 'lucide-react';

import { SectionHeader } from '@/components/settings/common/SectionHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

interface Tenant {
  id: string;
  name: string;
  slug: string;
  tier: string;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  fiscalYearStart: string | null;
  accountingStandard: string | null;
  logo: string | null;
  status: string;
}

interface TenantListItem {
  id: string;
  name: string;
  slug: string;
  tier: string;
  role: "owner" | "admin" | "member";
  joinedAt: string;
  country: string | null;
  currency: string | null;
  timezone: string | null;
  status: string;
}

interface ContextData {
  tenant: Tenant;
  user: {
    id: string;
    activeTenantId: string;
  };
}

interface TenantsListData {
  tenants: TenantListItem[];
}

const roleLabel = (role: string) => {
  const labels: Record<string, string> = {
    owner: 'Proprietário',
    admin: 'Administrador',
    member: 'Membro'
  };
  return labels[role] || role;
};

const tierLabel = (tier: string) => {
  const labels: Record<string, string> = {
    starter: 'Starter',
    premium: 'Premium',
    enterprise: 'Enterprise'
  };
  return labels[tier] || tier;
};

const statusLabel = (status: string) => {
  const labels: Record<string, string> = {
    active: 'Ativo',
    suspended: 'Suspenso',
    trial: 'Trial'
  };
  return labels[status] || status;
};

const formatJoinedDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-PT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export function OrganizacaoSettings() {
  // Fetch current tenant context
  const contextQuery = useQuery<ContextData>({
    queryKey: ['/api/context'],
  });
  
  // Fetch all linked tenants
  const tenantsQuery = useQuery<TenantsListData>({
    queryKey: ['/api/context/tenants/list'],
  });
  
  const context = contextQuery.data;
  const tenantsData = tenantsQuery.data;
  const contextError = contextQuery.error;
  const tenantsError = tenantsQuery.error;
  
  const isLoading = contextQuery.isLoading || tenantsQuery.isLoading;
  const currentTenantId = context?.tenant?.id;
  const tenants = tenantsData?.tenants || [];

  // Error handling for context query
  if (contextError) {
    return (
      <div className="space-y-6" data-testid="error-context">
        <SectionHeader title="Organização" description="Erro ao carregar" icon={Server} />
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <AlertCircle className="size-8 text-destructive" data-testid="icon-error" />
              <p className="font-medium" data-testid="text-error-title">Erro ao carregar informações do tenant</p>
              <p className="text-sm text-muted-foreground" data-testid="text-error-message">
                {contextError.message || 'Ocorreu um erro ao carregar os dados'}
              </p>
              <Button 
                variant="outline" 
                onClick={() => contextQuery.refetch()}
                data-testid="button-retry-context"
              >
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="organizacao-settings-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!context || !context.tenant) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Erro ao carregar informações da organização
      </div>
    );
  }

  const currentTenant = context.tenant;

  // Error handling for tenants query - show current tenant but error for list
  if (tenantsError) {
    return (
      <div className="space-y-6" data-testid="error-tenants">
        <SectionHeader 
          title="Organização" 
          description="Informações sobre o tenant e tenants ligados"
          icon={Server}
        />

        <div className="rounded-lg bg-muted/50 p-6 text-sm" data-testid="organization-info">
          <p className="flex items-center gap-2 text-muted-foreground">
            <Info className="size-4" />
            Neste sistema, a organização corresponde ao tenant ativo. Cada tenant representa uma organização independente.
          </p>
        </div>

        <Card className="hover-elevate" data-testid="card-current-tenant">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Server className="size-5" />
                {currentTenant.name}
              </CardTitle>
              <Badge variant="default" data-testid="badge-tenant-tier">
                {tierLabel(currentTenant.tier)}
              </Badge>
            </div>
            <CardDescription>
              Tenant ativo: {currentTenant.slug}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentTenant.country && (
              <div className="flex items-center gap-2 text-sm" data-testid="tenant-country">
                <Globe className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">País:</span>
                <span>{currentTenant.country}</span>
              </div>
            )}
            
            {currentTenant.currency && (
              <div className="flex items-center gap-2 text-sm" data-testid="tenant-currency">
                <DollarSign className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Moeda:</span>
                <span>{currentTenant.currency}</span>
              </div>
            )}
            
            {currentTenant.timezone && (
              <div className="flex items-center gap-2 text-sm" data-testid="tenant-timezone">
                <Clock className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Fuso horário:</span>
                <span>{currentTenant.timezone}</span>
              </div>
            )}
            
            <div className="flex items-center gap-2 text-sm" data-testid="tenant-status">
              <Shield className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Estado:</span>
              <Badge variant={currentTenant.status === 'active' ? 'default' : 'secondary'}>
                {statusLabel(currentTenant.status)}
              </Badge>
            </div>

            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <Shield className="size-3" />
                Este sistema utiliza tiers (Starter/Premium/Enterprise) em vez de ambientes sandbox/produção
              </p>
            </div>
          </CardContent>
        </Card>

        <Separator />

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <AlertCircle className="size-8 text-destructive" />
              <p className="font-medium">Erro ao carregar lista de tenants</p>
              <p className="text-sm text-muted-foreground">
                {tenantsError.message || 'Não foi possível carregar os tenants ligados'}
              </p>
              <Button 
                variant="outline" 
                onClick={() => tenantsQuery.refetch()}
                data-testid="button-retry-tenants"
              >
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="organizacao-settings">
      <SectionHeader 
        title="Organização" 
        description="Informações sobre o tenant e tenants ligados"
        icon={Server}
      />

      {/* Organization Clarification */}
      <div className="rounded-lg bg-muted/50 p-6 text-sm" data-testid="organization-info">
        <p className="flex items-center gap-2 text-muted-foreground">
          <Info className="size-4" />
          Neste sistema, a organização corresponde ao tenant ativo. Cada tenant representa uma organização independente.
        </p>
      </div>

      {/* SECTION 1: Current Tenant Card */}
      <Card className="hover-elevate" data-testid="card-current-tenant">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Server className="size-5" />
              {currentTenant.name}
            </CardTitle>
            <Badge variant="default" data-testid="badge-tenant-tier">
              {tierLabel(currentTenant.tier)}
            </Badge>
          </div>
          <CardDescription>
            Tenant ativo: {currentTenant.slug}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {currentTenant.country && (
            <div className="flex items-center gap-2 text-sm" data-testid="tenant-country">
              <Globe className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">País:</span>
              <span>{currentTenant.country}</span>
            </div>
          )}
          
          {currentTenant.currency && (
            <div className="flex items-center gap-2 text-sm" data-testid="tenant-currency">
              <DollarSign className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Moeda:</span>
              <span>{currentTenant.currency}</span>
            </div>
          )}
          
          {currentTenant.timezone && (
            <div className="flex items-center gap-2 text-sm" data-testid="tenant-timezone">
              <Clock className="size-4 text-muted-foreground" />
              <span className="text-muted-foreground">Fuso horário:</span>
              <span>{currentTenant.timezone}</span>
            </div>
          )}
          
          <div className="flex items-center gap-2 text-sm" data-testid="tenant-status">
            <Shield className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Estado:</span>
            <Badge variant={currentTenant.status === 'active' ? 'default' : 'secondary'}>
              {statusLabel(currentTenant.status)}
            </Badge>
          </div>

          {/* Environment/Tier Clarification */}
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Shield className="size-3" />
              Este sistema utiliza tiers (Starter/Premium/Enterprise) em vez de ambientes sandbox/produção
            </p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* SECTION 2: Linked Tenants List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <Users className="size-5" />
            Tenants Ligados
          </h3>
          <Badge variant="outline" data-testid="badge-tenants-count">
            {tenants.length} {tenants.length === 1 ? 'tenant' : 'tenants'}
          </Badge>
        </div>
        
        {tenants.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground rounded-lg border border-dashed">
            Sem tenants adicionais
          </div>
        ) : (
          <div className="space-y-2" data-testid="tenants-list">
            {tenants.map((tenant) => (
              <Card 
                key={tenant.id} 
                className={`hover-elevate ${tenant.id === currentTenantId ? 'border-primary' : ''}`}
                data-testid={`tenant-card-${tenant.id}`}
              >
                <CardContent className="flex items-center justify-between p-6">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium" data-testid={`tenant-name-${tenant.id}`}>
                        {tenant.name}
                      </p>
                      {tenant.id === currentTenantId && (
                        <Badge variant="outline" className="text-xs" data-testid="badge-active-tenant">
                          Ativo
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs" data-testid={`tenant-tier-${tenant.id}`}>
                        {tierLabel(tenant.tier)}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1" data-testid={`tenant-role-${tenant.id}`}>
                        <Shield className="size-3" />
                        {roleLabel(tenant.role)}
                      </span>
                      <span className="flex items-center gap-1" data-testid={`tenant-joined-${tenant.id}`}>
                        <Calendar className="size-3" />
                        Entrou em {formatJoinedDate(tenant.joinedAt)}
                      </span>
                      {tenant.country && (
                        <span className="flex items-center gap-1">
                          <Globe className="size-3" />
                          {tenant.country}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {/* Future: Switcher button (disabled for MVP) */}
                  {tenant.id !== currentTenantId && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled
                      data-testid={`button-switch-tenant-${tenant.id}`}
                    >
                      Em breve
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        
        {/* Future Functionality Message */}
        {tenants.length > 1 && (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground" data-testid="future-switcher-message">
            <p className="flex items-center gap-2">
              <Info className="size-4" />
              A funcionalidade de mudança entre tenants será disponibilizada em breve
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

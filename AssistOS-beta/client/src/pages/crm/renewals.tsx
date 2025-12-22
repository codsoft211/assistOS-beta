import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, Clock, XCircle, TrendingUp } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { pt } from "date-fns/locale";

const formatCurrency = (value: string | number) => {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(value));
};

export default function RenewalsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/crm/renewals'],
  });

  const { data: upcomingData, isLoading: isLoadingUpcoming } = useQuery({
    queryKey: ['/api/crm/renewals/upcoming'],
  });

  const getRiskBadge = (riskLevel: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive", icon: any }> = {
      low: { variant: 'default', icon: CheckCircle2 },
      medium: { variant: 'secondary', icon: Clock },
      high: { variant: 'destructive', icon: AlertTriangle },
    };
    
    const config = variants[riskLevel] || variants['low'];
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {riskLevel}
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      upcoming: 'default',
      at_risk: 'destructive',
      in_negotiation: 'secondary',
      renewed: 'outline',
      lost: 'destructive',
      cancelled: 'outline',
    };
    
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const getDaysUntilRenewal = (renewalDate: string) => {
    const days = differenceInDays(new Date(renewalDate), new Date());
    
    if (days < 0) return `${Math.abs(days)}d atraso`;
    if (days === 0) return 'Hoje';
    if (days === 1) return 'Amanhã';
    return `${days} dias`;
  };

  const calculateStats = () => {
    if (!data?.renewals) return { total: 0, upcoming: 0, atRisk: 0, totalValue: 0 };
    
    const renewals = data.renewals;
    return {
      total: renewals.length,
      upcoming: renewals.filter((r: any) => r.status === 'upcoming').length,
      atRisk: renewals.filter((r: any) => r.riskLevel === 'high').length,
      totalValue: renewals.reduce((sum: number, r: any) => sum + Number(r.estimatedValue || 0), 0),
    };
  };

  const stats = calculateStats();

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Renovações CRM</h1>
        <p className="text-muted-foreground">Forecast e gestão de renovações</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Renovações</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Próximas (90d)</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.upcoming}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Em Risco</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.atRisk}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Estimado</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalValue)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximas Renovações (90 dias)</CardTitle>
          <CardDescription>
            {upcomingData?.renewals?.length || 0} renovações a acontecer nos próximos 3 meses
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingUpcoming ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Contrato</TableHead>
                  <TableHead>Data Renovação</TableHead>
                  <TableHead>Dias Restantes</TableHead>
                  <TableHead>Valor Estimado</TableHead>
                  <TableHead>Probabilidade</TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingData?.renewals?.map((renewal: any) => {
                  const daysUntil = differenceInDays(new Date(renewal.renewal.renewalDate), new Date());
                  
                  return (
                    <TableRow key={renewal.renewal.id} data-testid={`row-renewal-${renewal.renewal.id}`}>
                      <TableCell className="font-medium">{renewal.client?.name || 'N/A'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {renewal.contract?.contractNumber || 'N/A'}
                      </TableCell>
                      <TableCell>{format(new Date(renewal.renewal.renewalDate), 'dd/MM/yyyy')}</TableCell>
                      <TableCell>
                        <Badge variant={daysUntil <= 7 ? 'destructive' : daysUntil <= 30 ? 'secondary' : 'outline'}>
                          {getDaysUntilRenewal(renewal.renewal.renewalDate)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatCurrency(renewal.renewal.estimatedValue || 0)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={renewal.renewal.probability || 0} className="w-16" />
                          <span className="text-sm text-muted-foreground">{renewal.renewal.probability}%</span>
                        </div>
                      </TableCell>
                      <TableCell>{getRiskBadge(renewal.renewal.riskLevel)}</TableCell>
                      <TableCell>{getStatusBadge(renewal.renewal.status)}</TableCell>
                    </TableRow>
                  );
                })}
                {upcomingData?.renewals?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhuma renovação prevista para os próximos 90 dias
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Todas as Renovações</CardTitle>
          <CardDescription>
            {data?.total || 0} renovações registadas
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data Renovação</TableHead>
                  <TableHead>Valor Estimado</TableHead>
                  <TableHead>Probabilidade</TableHead>
                  <TableHead>Risco</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Alertas Enviados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.renewals?.map((renewal: any) => (
                  <TableRow key={renewal.id} data-testid={`row-all-renewal-${renewal.id}`}>
                    <TableCell className="font-medium">{renewal.client?.name || 'N/A'}</TableCell>
                    <TableCell>{format(new Date(renewal.renewalDate), 'dd/MM/yyyy')}</TableCell>
                    <TableCell>{formatCurrency(renewal.estimatedValue || 0)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={renewal.probability || 0} className="w-16" />
                        <span className="text-sm text-muted-foreground">{renewal.probability}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{getRiskBadge(renewal.riskLevel)}</TableCell>
                    <TableCell>{getStatusBadge(renewal.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {renewal.alert60dSent && <Badge variant="outline" className="text-xs">60d</Badge>}
                        {renewal.alert30dSent && <Badge variant="outline" className="text-xs">30d</Badge>}
                        {renewal.alert7dSent && <Badge variant="outline" className="text-xs">7d</Badge>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {data?.renewals?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhuma renovação registada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

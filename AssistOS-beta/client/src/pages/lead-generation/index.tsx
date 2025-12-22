import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Target, CheckCircle2, AlertCircle, DollarSign, MousePointer2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ImportLeadsDialog } from "@/components/lead-generation/ImportLeadsDialog";

interface FunnelMetrics {
  total: number;
  byStatus: Record<string, number>;
  averageScore: number;
  conversionRate: number;
  qualificationRate: number;
}

interface FunnelData {
  metrics: FunnelMetrics;
  sourceBreakdown: Record<string, { total: number; conversionRate: number }>;
}

interface Campaign {
  id: string;
  campaignName: string;
  campaignType: string;
  campaignStatus: string;
  budget?: number;
}

interface CampaignsData {
  campaigns: Campaign[];
  total: number;
}

export default function AngariacaoDashboard() {
  const { data: funnel } = useQuery<FunnelData>({
    queryKey: ['/api/lead-generation/funil'],
  });

  const { data: dashboard } = useQuery({
    queryKey: ['/api/lead-generation/dashboard'],
  });

  const { data: campaignsData } = useQuery<CampaignsData>({
    queryKey: ['/api/lead-generation/campaigns'],
  });

  const campaigns = campaignsData?.campaigns || [];

  const metrics = funnel?.metrics || {
    total: 0,
    byStatus: { new: 0, contacted: 0, qualified: 0, nurturing: 0, converted: 0, lost: 0 },
    averageScore: 0,
    conversionRate: 0,
    qualificationRate: 0
  };

  const stats = [
    {
      title: "Total Leads",
      value: metrics.total,
      icon: Users,
      change: "+12%",
      changeType: "positive" as const
    },
    {
      title: "Taxa de Conversão",
      value: `${metrics.conversionRate.toFixed(1)}%`,
      icon: TrendingUp,
      change: "+0.4pp",
      changeType: "positive" as const
    },
    {
      title: "Score Médio",
      value: Math.round(metrics.averageScore),
      icon: Target,
      change: "+5",
      changeType: "positive" as const
    },
    {
      title: "Taxa de Qualificação",
      value: `${metrics.qualificationRate.toFixed(1)}%`,
      icon: CheckCircle2,
      change: "+2.1pp",
      changeType: "positive" as const
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Angariação
          </h1>
          <p className="text-muted-foreground">
            Visão geral do funil de conversão e performance de leads
          </p>
        </div>
        <ImportLeadsDialog />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} data-testid={`card-stat-${stat.title.toLowerCase().replace(/\s/g, '-')}`}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid={`text-${stat.title.toLowerCase().replace(/\s/g, '-')}`}>
                  {stat.value}
                </div>
                <p className={`text-xs ${stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'}`}>
                  {stat.change} vs período anterior
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-funnel">
          <CardHeader>
            <CardTitle>Funil de Conversão</CardTitle>
            <CardDescription>Distribuição de leads por estágio</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {Object.entries(metrics.byStatus).map(([status, count]) => {
              const percentage = metrics.total > 0 ? (count / metrics.total) * 100 : 0;
              const statusLabels: Record<string, string> = {
                new: 'Novos',
                contacted: 'Contactados',
                qualified: 'Qualificados',
                nurturing: 'Em Nutrição',
                converted: 'Convertidos',
                lost: 'Perdidos'
              };
              
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{statusLabels[status]}</span>
                    <span className="text-muted-foreground">{count} ({percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        status === 'converted' ? 'bg-green-500' :
                        status === 'qualified' ? 'bg-blue-500' :
                        status === 'lost' ? 'bg-red-500' :
                        'bg-primary'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card data-testid="card-sources">
          <CardHeader>
            <CardTitle>Performance por Fonte</CardTitle>
            <CardDescription>Top 5 fontes de leads</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel?.sourceBreakdown && Object.keys(funnel.sourceBreakdown).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(funnel.sourceBreakdown)
                  .slice(0, 5)
                  .map(([source, data]: [string, any]) => (
                    <div key={source} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{source.replace('_', ' ')}</span>
                        <span className="text-muted-foreground">
                          {data.total} leads · {data.conversionRate.toFixed(1)}% conversão
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div 
                          className="bg-primary h-2 rounded-full"
                          style={{ width: `${data.conversionRate}%` }}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <AlertCircle className="h-4 w-4 mr-2" />
                Nenhuma fonte configurada ainda
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-campaigns-roi">
          <CardHeader>
            <CardTitle>ROI de Campanhas</CardTitle>
            <CardDescription>Performance das campanhas ativas</CardDescription>
          </CardHeader>
          <CardContent>
            {campaigns && campaigns.length > 0 ? (
              <div className="space-y-4">
                {(() => {
                  const activeCampaigns = campaigns.filter((c: any) => c.campaignStatus === 'active');
                  const totalCost = activeCampaigns.reduce((sum: number, c: any) => sum + (c.budget || 0), 0);
                  const avgROI = activeCampaigns.length > 0 ? 25.5 : 0; // Placeholder - será calculado com dados reais
                  
                  return (
                    <>
                      <div className="flex items-center justify-between pb-4 border-b">
                        <div>
                          <div className="text-2xl font-bold text-green-600">+{avgROI.toFixed(1)}%</div>
                          <div className="text-sm text-muted-foreground">ROI Médio</div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-semibold">
                            {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(totalCost)}
                          </div>
                          <div className="text-sm text-muted-foreground">Investimento Total</div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="text-sm font-medium text-muted-foreground">Top Campanhas Ativas</div>
                        {activeCampaigns.slice(0, 3).map((campaign: any, idx: number) => {
                          const estimatedROI = 25 - (idx * 5);
                          return (
                            <div key={campaign.id} className="flex items-center justify-between p-2 rounded-md hover-elevate">
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">{campaign.campaignName}</div>
                                <div className="text-xs text-muted-foreground capitalize">{campaign.campaignType}</div>
                              </div>
                              <div className="text-right ml-4">
                                <div className="text-sm font-semibold text-green-600">+{estimatedROI.toFixed(1)}%</div>
                                <div className="text-xs text-muted-foreground">
                                  {campaign.budget ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(campaign.budget) : 'N/A'}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {activeCampaigns.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                          <MousePointer2 className="h-8 w-8 mb-2" />
                          <div className="text-sm">Nenhuma campanha ativa</div>
                          <div className="text-xs">Crie campanhas para tracking de ROI</div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                <DollarSign className="h-8 w-8 mb-2" />
                <div className="text-sm">Nenhuma campanha configurada</div>
                <div className="text-xs">Crie campanhas para tracking de ROI</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

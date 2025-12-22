import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, TrendingUp, TrendingDown, MousePointer, Eye, Euro, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SelectAdCampaign, SelectAdCampaignPerformance, SelectAngariacaoLead } from "@shared/schema";

export default function CampaignDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();

  const { data: campaign, isLoading: loadingCampaign } = useQuery<SelectAdCampaign>({
    queryKey: ['/api/lead-generation/campaigns', id],
  });

  const { data: performance, isLoading: loadingPerformance } = useQuery<SelectAdCampaignPerformance[]>({
    queryKey: ['/api/lead-generation/campaigns', id, 'performance'],
  });

  const { data: leads, isLoading: loadingLeads } = useQuery<SelectAngariacaoLead[]>({
    queryKey: ['/api/lead-generation/campaigns', id, 'leads'],
  });

  if (loadingCampaign) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">A carregar campanha...</div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="text-muted-foreground">Campanha não encontrada</div>
        <Button onClick={() => setLocation('/lead-generation/campaigns')} data-testid="button-back">
          Back
        </Button>
      </div>
    );
  }

  const formatCurrency = (value: number | null) => {
    if (!value) return "€0,00";
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value);
  };

  const formatNumber = (value: number | null) => {
    if (!value) return "0";
    return new Intl.NumberFormat('pt-PT').format(value);
  };

  const calculateROI = (conversions: number, cost: number) => {
    if (!cost || cost === 0) return 0;
    const revenue = conversions * 100;
    return ((revenue - cost) / cost) * 100;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline", label: string }> = {
      active: { variant: "default", label: "Ativa" },
      paused: { variant: "secondary", label: "Pausada" },
      ended: { variant: "destructive", label: "Terminada" },
      draft: { variant: "outline", label: "Rascunho" },
    };
    const config = variants[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant} data-testid={`badge-status-${status}`}>{config.label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const labels: Record<string, string> = {
      search: "Pesquisa",
      display: "Display",
      shopping: "Shopping",
      video: "Vídeo",
      other: "Outro",
    };
    return <Badge variant="outline" data-testid={`badge-type-${type}`}>{labels[type] || type}</Badge>;
  };

  const totalMetrics = performance?.reduce(
    (acc: any, p: any) => ({
      impressions: acc.impressions + (p.impressions || 0),
      clicks: acc.clicks + (p.clicks || 0),
      conversions: acc.conversions + (p.conversions || 0),
      cost: acc.cost + (p.cost || 0),
    }),
    { impressions: 0, clicks: 0, conversions: 0, cost: 0 }
  ) || { impressions: 0, clicks: 0, conversions: 0, cost: 0 };

  const roi = calculateROI(totalMetrics.conversions, totalMetrics.cost);
  const ctr = totalMetrics.impressions > 0 ? (totalMetrics.clicks / totalMetrics.impressions) * 100 : 0;
  const conversionRate = totalMetrics.clicks > 0 ? (totalMetrics.conversions / totalMetrics.clicks) * 100 : 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none border-b p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setLocation('/lead-generation/campaigns')}
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold" data-testid="text-campaign-name">{campaign.campaignName}</h1>
                {getStatusBadge(campaign.campaignStatus)}
                {getTypeBadge(campaign.campaignType)}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {campaign.adPlatform} {campaign.googleCampaignId && `• ID: ${campaign.googleCampaignId}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="grid gap-6 mb-6 md:grid-cols-2 lg:grid-cols-4">
          <Card data-testid="card-impressions">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Impressões</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-impressions">
                {formatNumber(totalMetrics.impressions)}
              </div>
              <p className="text-xs text-muted-foreground">CTR: {ctr.toFixed(2)}%</p>
            </CardContent>
          </Card>

          <Card data-testid="card-clicks">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cliques</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-clicks">
                {formatNumber(totalMetrics.clicks)}
              </div>
              <p className="text-xs text-muted-foreground">
                Taxa Conv: {conversionRate.toFixed(2)}%
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-conversions">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversões</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-conversions">
                {formatNumber(totalMetrics.conversions)}
              </div>
              <p className="text-xs text-muted-foreground">
                Leads atribuídos: {leads?.length || 0}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-roi">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">ROI</CardTitle>
              {roi >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${roi >= 0 ? 'text-green-500' : 'text-red-500'}`} data-testid="text-roi">
                {roi.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                Custo: {formatCurrency(totalMetrics.cost)}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 mb-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Informação da Campanha</CardTitle>
              <CardDescription>Detalhes e configuração</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Orçamento</div>
                <div className="text-lg" data-testid="text-budget">
                  {campaign.budget ? formatCurrency(campaign.budget) : 'Não definido'} 
                  {campaign.budget && ` (${campaign.budgetPeriod === 'daily' ? 'Diário' : campaign.budgetPeriod === 'monthly' ? 'Mensal' : 'Total'})`}
                </div>
              </div>
              {campaign.targetAudience && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Público-Alvo</div>
                  <div className="text-sm" data-testid="text-target-audience">{campaign.targetAudience}</div>
                </div>
              )}
              {campaign.objectives && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Objetivos</div>
                  <div className="text-sm" data-testid="text-objectives">{campaign.objectives}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Performance ao Longo do Tempo</CardTitle>
              <CardDescription>Últimas {performance?.length || 0} entradas</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPerformance ? (
                <div className="text-sm text-muted-foreground">A carregar...</div>
              ) : performance && performance.length > 0 ? (
                <div className="space-y-2">
                  {performance.slice(0, 5).map((p: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between text-sm border-b pb-2" data-testid={`performance-entry-${idx}`}>
                      <span className="text-muted-foreground">{new Date(p.date).toLocaleDateString('pt-PT')}</span>
                      <div className="flex gap-4">
                        <span>{formatNumber(p.clicks)} cliques</span>
                        <span>{formatNumber(p.conversions)} conv</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Sem dados de performance</div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Leads Atribuídos</CardTitle>
            <CardDescription>
              {leads?.length || 0} leads capturados através desta campanha
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingLeads ? (
              <div className="text-sm text-muted-foreground">A carregar leads...</div>
            ) : leads && leads.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((lead: any) => (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setLocation(`/lead-generation/leads/${lead.id}`)}
                      data-testid={`row-lead-${lead.id}`}
                    >
                      <TableCell className="font-medium" data-testid={`text-lead-name-${lead.id}`}>
                        {lead.name}
                      </TableCell>
                      <TableCell data-testid={`text-lead-email-${lead.id}`}>
                        {lead.email}
                      </TableCell>
                      <TableCell data-testid={`text-lead-phone-${lead.id}`}>
                        {lead.phone || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" data-testid={`badge-lead-score-${lead.id}`}>
                          {lead.score || 0}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={lead.status === 'converted' ? 'default' : 'secondary'}
                          data-testid={`badge-lead-status-${lead.id}`}
                        >
                          {lead.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground" data-testid={`text-lead-date-${lead.id}`}>
                        {new Date(lead.createdAt).toLocaleDateString('pt-PT')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhum lead atribuído a esta campanha
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

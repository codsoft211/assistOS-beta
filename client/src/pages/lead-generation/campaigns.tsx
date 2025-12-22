import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, TrendingUp, MousePointer, Eye, DollarSign, Trash2, BarChart3 } from "lucide-react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CreateCampaignDialog } from "@/components/lead-generation/CreateCampaignDialog";

export default function CampaignsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const { toast } = useToast();

  const { data: campaignsData, isLoading } = useQuery<{ campaigns: any[] }>({
    queryKey: ['/api/lead-generation/campaigns', { 
      status: statusFilter === 'all' ? undefined : statusFilter, 
      campaignType: typeFilter === 'all' ? undefined : typeFilter, 
      limit: 100 
    }],
  });

  const deleteMutation = useMutation({
    mutationFn: (campaignId: string) =>
      apiRequest('DELETE', `/api/lead-generation/campaigns/${campaignId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/campaigns'] });
      toast({ title: "Campanha eliminada" });
    },
  });

  const campaigns = campaignsData?.campaigns || [];
  const filteredCampaigns = campaigns.filter((c: any) =>
    search === "" || 
    c.campaignName.toLowerCase().includes(search.toLowerCase()) ||
    c.googleCampaignId?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    ended: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
    draft: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  };

  const typeColors: Record<string, string> = {
    search: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
    display: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    shopping: 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300',
    video: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    other: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300',
  };

  const formatCurrency = (value: number | string) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(num);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('pt-PT').format(value);
  };

  const calculateROI = (revenue: number, cost: number) => {
    if (cost === 0) return 0;
    return ((revenue - cost) / cost) * 100;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Campanhas</h1>
          <p className="text-muted-foreground">Gestão de campanhas de marketing e atribuição</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-campaign">
          <Plus className="h-4 w-4 mr-2" />
          Nova Campanha
        </Button>
      </div>

      <Card data-testid="card-filters">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="paused">Pausadas</SelectItem>
                <SelectItem value="ended">Terminadas</SelectItem>
                <SelectItem value="draft">Rascunho</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-type">
                <SelectValue placeholder="Todos os tipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="search">Pesquisa</SelectItem>
                <SelectItem value="display">Display</SelectItem>
                <SelectItem value="shopping">Shopping</SelectItem>
                <SelectItem value="video">Vídeo</SelectItem>
                <SelectItem value="other">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-campaigns-table">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campanha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Eye className="h-3 w-3" />
                    Impressões
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <MousePointer className="h-3 w-3" />
                    Cliques
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <TrendingUp className="h-3 w-3" />
                    Conversões
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <DollarSign className="h-3 w-3" />
                    Custo
                  </div>
                </TableHead>
                <TableHead className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <BarChart3 className="h-3 w-3" />
                    ROI
                  </div>
                </TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCampaigns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    Nenhuma campanha encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredCampaigns.map((campaign: any) => {
                  const roi = calculateROI(
                    parseFloat(campaign.totalRevenue || '0'),
                    parseFloat(campaign.totalCost || '0')
                  );
                  const roiColor = roi > 0 ? 'text-green-600' : roi < 0 ? 'text-red-600' : 'text-gray-600';

                  return (
                    <TableRow key={campaign.id} data-testid={`row-campaign-${campaign.id}`}>
                      <TableCell className="font-medium">
                        <Link href={`/lead-generation/campaigns/${campaign.id}`}>
                          <a className="hover:underline" data-testid={`link-campaign-${campaign.id}`}>
                            {campaign.campaignName}
                          </a>
                        </Link>
                        {campaign.googleCampaignId && (
                          <div className="text-xs text-muted-foreground mt-1">
                            ID: {campaign.googleCampaignId}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={typeColors[campaign.campaignType || 'other']} data-testid={`badge-type-${campaign.campaignType}`}>
                          {campaign.campaignType || 'outro'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[campaign.campaignStatus]} data-testid={`badge-status-${campaign.campaignStatus}`}>
                          {campaign.campaignStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-impressions-${campaign.id}`}>
                        {formatNumber(campaign.totalImpressions || 0)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-clicks-${campaign.id}`}>
                        {formatNumber(campaign.totalClicks || 0)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-conversions-${campaign.id}`}>
                        {formatNumber(campaign.totalConversions || 0)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-cost-${campaign.id}`}>
                        {formatCurrency(campaign.totalCost || 0)}
                      </TableCell>
                      <TableCell className={`text-right font-semibold ${roiColor}`} data-testid={`text-roi-${campaign.id}`}>
                        {roi > 0 ? '+' : ''}{roi.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/lead-generation/campaigns/${campaign.id}`}>
                            <Button variant="ghost" size="sm" data-testid={`button-view-${campaign.id}`}>
                              <BarChart3 className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deleteMutation.mutate(campaign.id)}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${campaign.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      {showCreateDialog && (
        <CreateCampaignDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
        />
      )}
    </div>
  );
}

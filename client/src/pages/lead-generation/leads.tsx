import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useInfiniteQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Plus, Search, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CaptureLeadDialog } from "@/components/lead-generation/CaptureLeadDialog";
import { useModuleConfig } from "@/hooks/use-module-config";
import { useDynamicColumns } from "@/hooks/use-dynamic-columns";
import { renderModuleField, getScoreColorClass } from "@/lib/module-field-renderer";

const PAGE_SIZE = 50;

const LEAD_STATUSES = [
  { value: 'new', label: 'Novo' },
  { value: 'contacted', label: 'Contactado' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'nurturing', label: 'Em Nutrição' },
  { value: 'negotiating', label: 'Em Negociação' },
  { value: 'proposal', label: 'Proposta Enviada' },
  { value: 'WIN', label: 'Ganho' },
  { value: 'lost', label: 'Perdido' },
];

const getStatusLabel = (status: string): string => {
  const found = LEAD_STATUSES.find(s => s.value === status);
  if (found) return found.label;
  
  const legacyLabels: Record<string, string> = {
    'Novo': 'Novo',
    'Contactado': 'Contactado', 
    'Qualificado': 'Qualificado',
    'Em Nutrição': 'Em Nutrição',
    'converted': 'Convertido',
    'Convertido': 'Convertido',
  };
  return legacyLabels[status] || status;
};

export default function LeadsPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [showCaptureDialog, setShowCaptureDialog] = useState(false);
  const [sortField, setSortField] = useState<string>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const { toast } = useToast();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleLeadClick = (leadId: string) => {
    setLocation(`/lead-generation/leads/${leadId}`);
  };

  const { 
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['/api/lead-generation/leads', statusFilter, sourceFilter, search, sortField, sortDirection],
    queryFn: async ({ pageParam = 0 }) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(pageParam),
        sortField,
        sortDirection,
      });
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);
      if (sourceFilter && sourceFilter !== 'all') params.set('leadSource', sourceFilter);
      if (search) params.set('search', search);
      
      const res = await fetch(`/api/lead-generation/leads?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch leads');
      return res.json();
    },
    getNextPageParam: (lastPage, allPages) => {
      const totalFetched = allPages.reduce((sum, page) => sum + (page.leads?.length || 0), 0);
      if (totalFetched >= (lastPage.total || 0)) return undefined;
      return totalFetched;
    },
    initialPageParam: 0,
  });

  const { data: sourcesData } = useQuery<{ sources: any[] }>({
    queryKey: ['/api/lead-generation/sources'],
  });

  const { data: moduleConfig } = useModuleConfig('lead-generation');
  const columns = useDynamicColumns(moduleConfig, [
    { fieldKey: 'createdAt', label: 'Data Registo', type: 'date' },
    { fieldKey: 'proposalNumber', label: 'Nº Proposta' },
    { fieldKey: 'contactName', label: 'Nome' },
    { fieldKey: 'status', label: 'Estado' },
    { fieldKey: 'data', label: 'Data Evento' },
    { fieldKey: 'numPax', label: 'Nº Pax', type: 'number' },
    { fieldKey: 'budgetTotal', label: 'Budget Total', type: 'currency' },
    { fieldKey: 'leadSource', label: 'LEAD (Fonte)' },
    { fieldKey: 'owner', label: 'Owner' },
  ]);

  const updateStatusMutation = useMutation({
    mutationFn: ({ leadId, status }: { leadId: string; status: string }) => 
      apiRequest('PATCH', `/api/angariacao/leads/${leadId}`, { status }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects'] });
      
      if (data?._autoConverted && data?._project) {
        toast({ 
          title: "Lead ganho! Projeto criado",
          description: `Projeto "${data._project.projectCode}" criado automaticamente. A redirecionar...`
        });
        setTimeout(() => {
          setLocation(`/projects/${data._project.id}`);
        }, 1500);
      } else {
        toast({ title: "Status atualizado" });
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (leadId: string) =>
      apiRequest('DELETE', `/api/lead-generation/leads/${leadId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/leads'] });
      toast({ title: "Lead eliminado" });
    },
  });

  const leads = data?.pages.flatMap(page => page.leads || []) || [];
  const total = data?.pages[0]?.total || 0;
  const sources = sourcesData?.sources || [];

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 200 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);

  const handleSort = (fieldKey: string) => {
    const dbFieldMap: Record<string, string> = {
      'proposalNumber': 'proposalNumber',
      'contactName': 'contactName',
      'status': 'status',
      'data': 'eventDate',
      'numPax': 'numPax',
      'budgetTotal': 'budgetTotal',
      'leadSource': 'leadSource',
      'owner': 'ownerId',
    };
    const dbField = dbFieldMap[fieldKey] || fieldKey;
    
    if (sortField === dbField) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(dbField);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (fieldKey: string) => {
    const dbFieldMap: Record<string, string> = {
      'proposalNumber': 'proposalNumber',
      'contactName': 'contactName',
      'status': 'status',
      'data': 'eventDate',
      'numPax': 'numPax',
      'budgetTotal': 'budgetTotal',
      'leadSource': 'leadSource',
      'owner': 'ownerId',
    };
    const dbField = dbFieldMap[fieldKey] || fieldKey;
    
    if (sortField !== dbField) {
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden">
      <div className="flex items-center justify-between p-4 pb-2 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Leads</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0 ? `${leads.length} de ${total} leads` : 'Gestão de leads'}
          </p>
        </div>
        <Button onClick={() => setShowCaptureDialog(true)} data-testid="button-add-lead">
          <Plus className="h-4 w-4 mr-2" />
          Capturar Lead
        </Button>
      </div>

      <div className="flex items-center gap-2 px-4 pb-3" data-testid="card-filters">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px] h-9" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="new">Novos</SelectItem>
            <SelectItem value="contacted">Contactados</SelectItem>
            <SelectItem value="qualified">Qualificados</SelectItem>
            <SelectItem value="nurturing">Em Nutrição</SelectItem>
            <SelectItem value="negotiating">Em Negociação</SelectItem>
            <SelectItem value="proposal">Proposta Enviada</SelectItem>
            <SelectItem value="WIN">Ganhos</SelectItem>
            <SelectItem value="converted">Convertidos</SelectItem>
            <SelectItem value="lost">Perdidos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[140px] h-9" data-testid="select-source">
            <SelectValue placeholder="Fonte" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {sources.map((source: any) => (
              <SelectItem key={source.id} value={source.id}>
                {source.sourceName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card data-testid="card-leads-table" className="flex-1 mx-4 mb-4 overflow-hidden flex flex-col">
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-auto"
        >
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                {columns.map((col: any) => (
                  <TableHead 
                    key={col.fieldKey}
                    className="cursor-pointer select-none hover:bg-muted/50 transition-colors whitespace-nowrap"
                    onClick={() => handleSort(col.fieldKey)}
                  >
                    <div className="flex items-center">
                      {col.label}
                      {getSortIcon(col.fieldKey)}
                    </div>
                  </TableHead>
                ))}
                <TableHead className="text-right sticky right-0 bg-card">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : leads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground py-8">
                    Nenhum lead encontrado
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {leads.map((lead: any) => (
                    <TableRow 
                      key={lead.id} 
                      data-testid={`row-lead-${lead.id}`}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleLeadClick(lead.id)}
                    >
                      {columns.map((col: any) => {
                        const isNumeric = col.type === 'currency' || col.fieldKey.includes('budget');
                        const isScore = col.fieldKey === 'score';
                        const cellClass = isNumeric ? 'text-right' : isScore ? getScoreColorClass(lead.score || 0) : '';
                        
                        return (
                          <TableCell 
                            key={col.fieldKey}
                            className={`${cellClass} whitespace-nowrap`}
                            data-testid={`cell-leads-${col.fieldKey}-${lead.id}`}
                          >
                            {renderModuleField(lead, col.fieldKey, col.type, {
                              detailPath: '/lead-generation/leads',
                            })}
                          </TableCell>
                        );
                      })}
                      <TableCell 
                        className="text-right whitespace-nowrap sticky right-0 bg-card"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {lead.status !== 'converted' && lead.status !== 'Convertido' && !lead.convertedToClientId && (
                          <Select
                            value={lead.status}
                            onValueChange={(value) => updateStatusMutation.mutate({ leadId: lead.id, status: value })}
                            disabled={updateStatusMutation.isPending}
                          >
                            <SelectTrigger className="w-[140px] h-8" data-testid={`select-status-${lead.id}`}>
                              <SelectValue placeholder="Status">
                                {getStatusLabel(lead.status)}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {LEAD_STATUSES.map((status) => (
                                <SelectItem key={status.value} value={status.value}>
                                  {status.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(lead.id)}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${lead.id}`}
                          className="ml-1"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {isFetchingNextPage && (
                    <TableRow>
                      <TableCell colSpan={columns.length + 1} className="text-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <CaptureLeadDialog
        open={showCaptureDialog}
        onOpenChange={setShowCaptureDialog}
      />
    </div>
  );
}

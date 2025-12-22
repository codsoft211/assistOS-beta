import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, CheckCircle2, Target, Clock, FolderKanban, User, Building2, Phone, Mail, FileText, ExternalLink, Plus, Send, CalendarDays, MessageSquare, PhoneCall, UserPlus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Link } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { pt } from "date-fns/locale";

interface Lead {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  contactName?: string | null;
  phone?: string | null;
  company?: string | null;
  nif?: string | null;
  status: string;
  score?: number | null;
  leadSource?: string | null;
  convertedToClientId?: string | null;
  convertedProject?: { id: string; projectCode?: string; name?: string } | null;
  notes?: string | null;
  description?: string | null;
  proposalNumber?: string | null;
  customFields?: Record<string, any> | null;
  createdAt?: string;
  updatedAt?: string;
  isCommercialLead?: boolean;
  assignee?: { id: string; name: string; email: string } | null;
}

interface Activity {
  id: string;
  activityType: string;
  description: string;
  metadata?: Record<string, any>;
  createdAt?: string;
  userId?: string;
}

interface ConvertResponse {
  success: boolean;
  message: string;
  client?: { id: string; name: string };
  project?: { id: string; name: string; projectCode: string };
}

const ACTIVITY_TYPES = [
  { value: 'call', label: 'Chamada', icon: PhoneCall },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'meeting', label: 'Reunião', icon: CalendarDays },
  { value: 'note', label: 'Nota', icon: MessageSquare },
  { value: 'follow_up', label: 'Follow-up', icon: UserPlus },
  { value: 'other', label: 'Outro', icon: FileText },
];

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
    'Em Negociação': 'Em Negociação',
    'Proposta Enviada': 'Proposta Enviada',
    'Ganho': 'Ganho',
    'Perdido': 'Perdido',
    'converted': 'Convertido',
    'Convertido': 'Convertido',
  };
  return legacyLabels[status] || status;
};

export default function LeadDetailPage() {
  const { id } = useParams();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activityType, setActivityType] = useState<string>('note');
  const [activityDescription, setActivityDescription] = useState<string>('');
  const [showActivityForm, setShowActivityForm] = useState(false);

  const { data: leadData, isLoading } = useQuery<{ lead: Lead }>({
    queryKey: [`/api/lead-generation/leads/${id}`],
    enabled: !!id,
  });

  const { data: activitiesData } = useQuery<{ activities: Activity[] }>({
    queryKey: [`/api/lead-generation/leads/${id}/activities`],
    enabled: !!id,
  });

  const addActivityMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/lead-generation/leads/${id}/activities`, {
      activityType,
      description: activityDescription,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/lead-generation/leads/${id}/activities`] });
      setActivityDescription('');
      setShowActivityForm(false);
      toast({ title: "Atividade registada com sucesso" });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao registar atividade",
        description: error?.message || "Ocorreu um erro",
        variant: "destructive"
      });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: (newStatus: string) => apiRequest('PATCH', `/api/angariacao/leads/${id}`, { status: newStatus }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/lead-generation/leads/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/lead-generation/leads/${id}/activities`] });
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/funil'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects'] });
      
      if (data?._autoConverted && data?._project) {
        toast({ 
          title: "Lead ganho! Projeto criado automaticamente",
          description: `Cliente e projeto "${data._project.projectCode}" criados com sucesso`
        });
        setTimeout(() => {
          setLocation(`/projects/${data._project.id}`);
        }, 1500);
      } else {
        const statusLabel = LEAD_STATUSES.find(s => s.value === data?.status)?.label || data?.status;
        toast({ title: `Status alterado para "${statusLabel}"` });
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao alterar status",
        description: error?.message || "Ocorreu um erro",
        variant: "destructive"
      });
    }
  });

  const convertMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/lead-generation/leads/${id}/convert`);
      return response as unknown as ConvertResponse;
    },
    onSuccess: (data: ConvertResponse) => {
      queryClient.invalidateQueries({ queryKey: [`/api/lead-generation/leads/${id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/lead-generation/leads/${id}/activities`] });
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/funil'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects'] });
      
      if (data?.project) {
        toast({ 
          title: "Lead convertido com sucesso!",
          description: `Cliente e projeto "${data.project.projectCode}" criados`
        });
        setTimeout(() => {
          setLocation(`/projects/${data.project!.id}`);
        }, 1500);
      } else {
        toast({ title: "Lead convertido em cliente" });
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao converter lead",
        description: error?.message || "Ocorreu um erro",
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (!leadData?.lead) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground">Lead não encontrado</p>
            <Link href="/lead-generation/leads">
              <Button variant="ghost" className="mt-2">Voltar à lista</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const lead = leadData.lead;
  const activities = activitiesData?.activities || [];
  const customFields = lead.customFields || {};
  const isConverted = lead.status === 'converted' || lead.status === 'Convertido' || !!lead.convertedToClientId;
  const isQualified = lead.status === 'qualified' || (lead.score && lead.score >= 70);

  const statusColors: Record<string, string> = {
    new: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
    contacted: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    negotiating: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    proposal: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
    WIN: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    converted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    Convertido: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
    lost: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };

  const statusLabels: Record<string, string> = {
    new: 'Novo',
    contacted: 'Contactado',
    negotiating: 'Em Negociação',
    proposal: 'Proposta Enviada',
    WIN: 'Ganho',
    converted: 'Convertido',
    Convertido: 'Convertido',
    lost: 'Perdido',
  };

  const displayName = lead.contactName || lead.company || 
    (lead.firstName || lead.lastName ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() : null) ||
    lead.email || `Lead #${lead.proposalNumber || lead.id.slice(0, 8)}`;
  
  const displaySubtitle = [
    lead.proposalNumber && `#${lead.proposalNumber}`,
    lead.email && lead.email !== displayName && lead.email,
    lead.assignee?.name && `Responsável: ${lead.assignee.name}`
  ].filter(Boolean).join(' · ');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link href="/lead-generation/leads">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold truncate" data-testid="text-lead-title">{displayName}</h1>
          {displaySubtitle && (
            <p className="text-muted-foreground text-sm">{displaySubtitle}</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {!isConverted && (
            <Select
              value={lead.status}
              onValueChange={(value) => updateStatusMutation.mutate(value)}
              disabled={updateStatusMutation.isPending}
            >
              <SelectTrigger className="w-[180px]" data-testid="select-status">
                <SelectValue placeholder="Alterar status">
                  {getStatusLabel(lead.status)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map((status) => (
                  <SelectItem key={status.value} value={status.value} data-testid={`select-status-${status.value}`}>
                    {status.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {isConverted && (lead.convertedProject || lead.convertedToClientId) && (
            <Link href={lead.convertedProject?.id ? `/projects/${lead.convertedProject.id}` : `/projects?clientId=${lead.convertedToClientId}`}>
              <Button variant="outline" data-testid="button-view-project">
                <FolderKanban className="h-4 w-4 mr-2" />
                Ver Projeto {lead.convertedProject?.projectCode && `(${lead.convertedProject.projectCode})`}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {isConverted && (
        <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800" data-testid="card-converted">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <div className="flex-1">
              <p className="font-medium text-emerald-800 dark:text-emerald-200">
                Este lead foi convertido em cliente
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400">
                {lead.convertedProject?.projectCode 
                  ? `Projeto ${lead.convertedProject.projectCode} criado automaticamente`
                  : 'Cliente e projeto criados automaticamente'}
              </p>
            </div>
            {(lead.convertedProject || lead.convertedToClientId) && (
              <Link href={lead.convertedProject?.id ? `/projects/${lead.convertedProject.id}` : `/projects?clientId=${lead.convertedToClientId}`}>
                <Button size="sm" variant="outline" className="gap-1">
                  <ExternalLink className="h-3 w-3" />
                  Abrir Projeto
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="card-status">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Status</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge className={statusColors[lead.status] || statusColors.new}>
              {statusLabels[lead.status] || lead.status}
            </Badge>
          </CardContent>
        </Card>

        <Card data-testid="card-score">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Score</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-2xl font-bold" data-testid="text-score">
              {lead.score || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              {(lead.score || 0) >= 70 ? 'Altamente qualificado' : 
               (lead.score || 0) >= 40 ? 'Médio potencial' : 'Baixo potencial'}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-source">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Fonte</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm font-semibold capitalize" data-testid="text-source">
              {lead.leadSource?.replace('_', ' ') || 'Manual'}
            </div>
            {customFields.campaign && (
              <p className="text-xs text-muted-foreground truncate">
                Campanha: {customFields.campaign}
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-date">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Data de Criação</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-sm font-semibold">
              {lead.createdAt ? format(new Date(lead.createdAt), 'dd MMM yyyy', { locale: pt }) : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {lead.createdAt ? format(new Date(lead.createdAt), 'HH:mm') : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="event">Evento</TabsTrigger>
          <TabsTrigger value="activities">Atividades ({activities.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {(lead.description || customFields.description) && (
            <Card data-testid="card-description">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Descrição
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{lead.description || customFields.description}</p>
              </CardContent>
            </Card>
          )}

          <Card data-testid="card-contact">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Informações de Contacto
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {lead.contactName && (
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Nome</label>
                    <p className="text-sm font-medium">{lead.contactName}</p>
                  </div>
                </div>
              )}
              {lead.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Email</label>
                    <p className="text-sm">{lead.email}</p>
                  </div>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Telefone</label>
                    <p className="text-sm">{lead.phone}</p>
                  </div>
                </div>
              )}
              {lead.company && lead.company !== lead.contactName && (
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Empresa</label>
                    <p className="text-sm">{lead.company}</p>
                  </div>
                </div>
              )}
              {lead.nif && (
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">NIF</label>
                    <p className="text-sm">{lead.nif}</p>
                  </div>
                </div>
              )}
              {!lead.contactName && !lead.email && !lead.phone && !lead.company && (
                <p className="text-sm text-muted-foreground col-span-2">
                  Nenhuma informação de contacto disponível
                </p>
              )}
            </CardContent>
          </Card>

          {lead.notes && (
            <Card data-testid="card-notes">
              <CardHeader>
                <CardTitle>Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{lead.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="event" className="space-y-4">
          <Card data-testid="card-event">
            <CardHeader>
              <CardTitle>Detalhes do Evento</CardTitle>
              <CardDescription>Informações sobre o evento/pedido do lead</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              {(customFields.eventDate || customFields.data_evento) && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Data do Evento</label>
                  <p className="text-sm font-medium">
                    {format(new Date(customFields.eventDate || customFields.data_evento), 'dd/MM/yyyy', { locale: pt })}
                  </p>
                </div>
              )}
              {(customFields.eventType || customFields.tipo_evento) && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tipo de Evento</label>
                  <p className="text-sm font-medium capitalize">{customFields.eventType || customFields.tipo_evento}</p>
                </div>
              )}
              {(customFields.numPax || customFields.num_pax) && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Número de Pax</label>
                  <p className="text-sm font-medium">{customFields.numPax || customFields.num_pax}</p>
                </div>
              )}
              {(customFields.valuePerPax || customFields.valor_pax) && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Valor por Pax</label>
                  <p className="text-sm font-medium">{customFields.valuePerPax || customFields.valor_pax}€</p>
                </div>
              )}
              {(customFields.budgetTotal || customFields.budget_total) && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Budget Total</label>
                  <p className="text-sm font-medium">{customFields.budgetTotal || customFields.budget_total}€</p>
                </div>
              )}
              {(customFields.location || customFields.localizacao) && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Localização</label>
                  <p className="text-sm font-medium">{customFields.location || customFields.localizacao}</p>
                </div>
              )}
              {!customFields.eventDate && !customFields.data_evento && 
               !customFields.numPax && !customFields.num_pax &&
               !customFields.budgetTotal && !customFields.budget_total && (
                <p className="text-sm text-muted-foreground col-span-2">
                  Nenhuma informação de evento disponível
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activities" className="space-y-4">
          <Card data-testid="card-add-activity">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Registar Atividade
                </CardTitle>
                {!showActivityForm && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowActivityForm(true)}
                    data-testid="button-show-activity-form"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Nova Atividade
                  </Button>
                )}
              </div>
            </CardHeader>
            {showActivityForm && (
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_TYPES.map((type) => {
                    const Icon = type.icon;
                    return (
                      <Button
                        key={type.value}
                        variant={activityType === type.value ? "default" : "outline"}
                        size="sm"
                        onClick={() => setActivityType(type.value)}
                        data-testid={`button-activity-type-${type.value}`}
                      >
                        <Icon className="h-4 w-4 mr-1" />
                        {type.label}
                      </Button>
                    );
                  })}
                </div>
                <Textarea
                  placeholder="Descreva a atividade..."
                  value={activityDescription}
                  onChange={(e) => setActivityDescription(e.target.value)}
                  className="min-h-[100px]"
                  data-testid="input-activity-description"
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowActivityForm(false);
                      setActivityDescription('');
                    }}
                    data-testid="button-cancel-activity"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => addActivityMutation.mutate()}
                    disabled={!activityDescription.trim() || addActivityMutation.isPending}
                    data-testid="button-save-activity"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    {addActivityMutation.isPending ? 'A guardar...' : 'Guardar'}
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

          <Card data-testid="card-activities">
            <CardHeader>
              <CardTitle>Histórico de Atividades</CardTitle>
              <CardDescription>Todas as interações com este lead</CardDescription>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-3 opacity-50" />
                  <p className="text-muted-foreground">Nenhuma atividade registada ainda</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Utilize o formulário acima para registar a primeira atividade
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => {
                    const activityTypeInfo = ACTIVITY_TYPES.find(t => t.value === activity.activityType) || ACTIVITY_TYPES[5];
                    const ActivityIcon = activityTypeInfo.icon;
                    return (
                      <div key={activity.id} className="flex gap-4 border-l-2 border-muted pl-4 pb-4" data-testid={`activity-${activity.id}`}>
                        <ActivityIcon className="h-4 w-4 text-muted-foreground mt-1 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <p className="font-medium text-sm">{activity.description}</p>
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {activity.createdAt && format(new Date(activity.createdAt), 'dd/MM/yyyy HH:mm')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground capitalize">
                            {activityTypeInfo.label}
                          </p>
                          {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {activity.metadata.newScore !== undefined && (
                                <span>Score: {activity.metadata.previousScore} → {activity.metadata.newScore}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

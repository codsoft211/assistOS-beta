import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { useModuleConfig } from "@/hooks/use-module-config";
import { useDynamicColumns } from "@/hooks/use-dynamic-columns";
import { renderModuleField } from "@/lib/module-field-renderer";
import { 
  Plus, 
  Eye,
  Edit,
  Target,
  TrendingUp,
  Users,
  Zap,
  CheckCircle,
  XCircle,
  X,
  Euro,
  Calendar as CalendarIcon,
  Bot,
  AlertCircle,
  ShoppingCart,
  Building,
  Phone,
  Mail,
  Clock
} from "lucide-react";

// ==================== VALIDATION SCHEMAS ====================

const oportunidadeSchema = z.object({
  clientId: z.string().min(1, "Cliente obrigatório"),
  title: z.string().min(3, "Título obrigatório (mín. 3 caracteres)"),
  description: z.string().optional(),
  type: z.enum(["reactivation", "cross_sell", "upsell", "churn_prevention"]),
  estimatedValue: z.coerce.number().min(0, "Valor deve ser positivo"),
  probability: z.coerce.number().min(0).max(100, "Probabilidade entre 0-100"),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  status: z.enum(["open", "in_progress", "won", "lost", "cancelled"]).default("open"),
  source: z.enum(["manual", "ai_generated"]).default("manual"),
  expectedCloseDate: z.date().optional(),
  trigger: z.string().optional()
});

type OportunidadeFormData = z.infer<typeof oportunidadeSchema>;

// ==================== TYPES ====================

interface Opportunity {
  id: string;
  title: string;
  description?: string;
  type: string;
  estimatedValue: number;
  probability: number;
  priority: string;
  status: string;
  source: string;
  trigger?: string;
  clientId: string;
  clientName: string;
  expectedCloseDate?: string;
  salesOrderId?: string;
  salesOrderCode?: string;
  createdAt: string;
  convertedAt?: string;
}

interface OpportunityStats {
  total: number;
  pipelineValue: number;
  conversionRate: number;
  aiGenerated: number;
  won: number;
}

interface Cliente {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  totalOrders?: number;
  lifetimeValue?: number;
  daysSinceLastOrder?: number;
}

interface SuggestedProduct {
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface HistoryEvent {
  date: string;
  action: string;
  user?: string;
}

interface OpportunityDetailsData {
  opportunity: Opportunity;
  client: Cliente;
  suggestedProducts: SuggestedProduct[];
  history: HistoryEvent[];
}

// ==================== UTILITY FUNCTIONS ====================

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
};

const formatDate = (dateString: string) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pt-PT").format(date);
};

const getTypeBadgeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (type) {
    case "reactivation":
      return "default";
    case "cross_sell":
      return "secondary";
    case "upsell":
      return "outline";
    case "churn_prevention":
      return "destructive";
    default:
      return "outline";
  }
};

const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    reactivation: "Reativação",
    cross_sell: "Cross-sell",
    upsell: "Upsell",
    churn_prevention: "Churn Prevention"
  };
  return labels[type] || type;
};

const getPriorityBadgeVariant = (priority: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (priority) {
    case "high":
      return "destructive";
    case "medium":
      return "default";
    case "low":
      return "secondary";
    default:
      return "outline";
  }
};

const getPriorityLabel = (priority: string) => {
  const labels: Record<string, string> = {
    high: "Alta",
    medium: "Média",
    low: "Baixa"
  };
  return labels[priority] || priority;
};

const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "won":
      return "default";
    case "in_progress":
      return "secondary";
    case "lost":
    case "cancelled":
      return "destructive";
    default:
      return "outline";
  }
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    open: "Open",
    in_progress: "In Progress",
    won: "Won",
    lost: "Lost",
    cancelled: "Cancelled"
  };
  return labels[status] || status;
};

const renderSourceBadge = (source: string) => {
  if (source === "ai_generated") {
    return (
      <Badge variant="default" className="gap-1" data-testid="badge-fonte-ai">
        <Bot className="h-3 w-3" />
        AI
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" data-testid="badge-fonte-manual">
      Manual
    </Badge>
  );
};

// ==================== OPPORTUNITY 360° VIEW ====================

function Oportunidade360View({ opportunityId, onClose }: { opportunityId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: oppDetails, isLoading } = useQuery<OpportunityDetailsData>({
    queryKey: ["/api/crm/oportunidades", opportunityId],
    queryFn: async () => {
      const response = await fetch(`/api/crm/oportunidades/${opportunityId}`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch opportunity data");
      return response.json();
    }
  });

  const convertToOrderMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/crm/oportunidades/${opportunityId}/converter`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/oportunidades"] });
      toast({
        title: "Encomenda criada!",
        description: `Encomenda ${data.orderCode} criada com sucesso.`
      });
      navigate(`/comercial/encomendas/${data.orderId}`);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível converter oportunidade.",
        variant: "destructive"
      });
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return await apiRequest("PATCH", `/api/crm/oportunidades/${opportunityId}`, {
        status: newStatus
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/oportunidades"] });
      toast({
        title: "Status atualizado",
        description: "Status da oportunidade foi alterado com sucesso."
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar status.",
        variant: "destructive"
      });
    }
  });

  const handleConvertToOrder = () => {
    if (confirm("Deseja converter esta oportunidade em encomenda?")) {
      convertToOrderMutation.mutate();
    }
  };

  const handleMarkAsLost = () => {
    if (confirm("Deseja marcar esta oportunidade como perdida?")) {
      updateStatusMutation.mutate("lost");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="dialog-detalhes-oportunidade">
        <div className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!oppDetails) {
    return (
      <div className="text-center py-8" data-testid="dialog-detalhes-oportunidade">
        <p className="text-muted-foreground">Oportunidade não encontrada</p>
      </div>
    );
  }

  const { opportunity, client, suggestedProducts, history } = oppDetails;
  const canConvert = opportunity.status === "won" && !opportunity.salesOrderId;

  return (
    <div className="space-y-6" data-testid="dialog-detalhes-oportunidade">
      {/* Header com dados principais */}
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold" data-testid="text-oportunidade-titulo">{opportunity.title}</h2>
            <Badge 
              variant={getTypeBadgeVariant(opportunity.type)} 
              data-testid={`badge-tipo-${opportunity.type}`}
            >
              {getTypeLabel(opportunity.type)}
            </Badge>
            <Badge 
              variant={getPriorityBadgeVariant(opportunity.priority)}
              data-testid={`badge-prioridade-${opportunity.priority}`}
            >
              {getPriorityLabel(opportunity.priority)}
            </Badge>
            <Badge 
              variant={getStatusBadgeVariant(opportunity.status)}
              data-testid="badge-status"
            >
              {getStatusLabel(opportunity.status)}
            </Badge>
            {renderSourceBadge(opportunity.source)}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span data-testid="text-valor-estimado">{formatCurrency(opportunity.estimatedValue)}</span>
            <span data-testid="text-probabilidade">{opportunity.probability}% probabilidade</span>
            <span data-testid="text-data-criacao">{formatDate(opportunity.createdAt)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {canConvert && (
            <Button
              onClick={handleConvertToOrder}
              disabled={convertToOrderMutation.isPending}
              data-testid="button-converter-encomenda"
            >
              <ShoppingCart className="h-4 w-4 mr-2" />
              Converter em Encomenda
            </Button>
          )}
          {opportunity.status !== "lost" && opportunity.status !== "cancelled" && (
            <Button
              variant="destructive"
              onClick={handleMarkAsLost}
              disabled={updateStatusMutation.isPending}
              data-testid="button-marcar-perdida"
            >
              Marcar como Perdida
            </Button>
          )}
          <Button variant="outline" onClick={onClose} data-testid="button-fechar">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Secção 1 - Informação Cliente */}
      <Card data-testid="card-info-cliente">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Informação Cliente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Nome</p>
              <p className="text-sm text-muted-foreground" data-testid="text-cliente-nome">{client.name}</p>
            </div>
            {client.company && (
              <div>
                <p className="text-sm font-medium">Empresa</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building className="h-4 w-4" />
                  <span data-testid="text-cliente-empresa">{client.company}</span>
                </div>
              </div>
            )}
            {client.email && (
              <div>
                <p className="text-sm font-medium">Email</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  <span data-testid="text-cliente-email">{client.email}</span>
                </div>
              </div>
            )}
            {client.phone && (
              <div>
                <p className="text-sm font-medium">Telefone</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="h-4 w-4" />
                  <span data-testid="text-cliente-telefone">{client.phone}</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold" data-testid="text-total-encomendas">{client.totalOrders || 0}</p>
                <p className="text-xs text-muted-foreground">Total Encomendas</p>
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-lifetime-value">
                  {formatCurrency(client.lifetimeValue || 0)}
                </p>
                <p className="text-xs text-muted-foreground">Lifetime Value</p>
              </div>
              <div>
                <p className="text-2xl font-bold" data-testid="text-dias-ultima-compra">{client.daysSinceLastOrder || 0}</p>
                <p className="text-xs text-muted-foreground">Dias Última Compra</p>
              </div>
            </div>
          </div>

          <Button 
            variant="outline" 
            className="w-full"
            onClick={() => navigate(`/comercial/clientes/${client.id}`)}
            data-testid="button-ver-cliente"
          >
            Ver Ficha 360° do Cliente
          </Button>
        </CardContent>
      </Card>

      {/* Secção 2 - Detalhes Oportunidade */}
      <Card data-testid="card-detalhes-oportunidade">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Detalhes Oportunidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">Descrição</p>
            <p className="text-sm text-muted-foreground" data-testid="text-descricao">
              {opportunity.description || "Sem descrição"}
            </p>
          </div>

          {opportunity.trigger && (
            <div>
              <p className="text-sm font-medium">Motivo/Gatilho</p>
              <p className="text-sm text-muted-foreground" data-testid="text-trigger">
                {opportunity.trigger}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium">Valor Estimado</p>
              <p className="text-lg font-bold">{formatCurrency(opportunity.estimatedValue)}</p>
            </div>
            <div>
              <p className="text-sm font-medium">Probabilidade</p>
              <p className="text-lg font-bold">{opportunity.probability}%</p>
            </div>
            {opportunity.expectedCloseDate && (
              <div>
                <p className="text-sm font-medium">Data Esperada Fecho</p>
                <p className="text-sm text-muted-foreground">{formatDate(opportunity.expectedCloseDate)}</p>
              </div>
            )}
          </div>

          {opportunity.salesOrderId && (
            <div className="pt-4 border-t">
              <Badge variant="default" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Convertida em Encomenda {opportunity.salesOrderCode}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Secção 3 - Produtos/Serviços Sugeridos */}
      {suggestedProducts && suggestedProducts.length > 0 && (
        <Card data-testid="card-produtos-sugeridos">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Produtos/Serviços Sugeridos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table data-testid="table-produtos-sugeridos">
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Preço Unit.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestedProducts.map((product, index) => (
                  <TableRow key={index} data-testid={`row-produto-${index}`}>
                    <TableCell>{product.productName}</TableCell>
                    <TableCell className="text-right">{product.quantity}</TableCell>
                    <TableCell className="text-right">{formatCurrency(product.unitPrice)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(product.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Secção 4 - Notas e Histórico */}
      <Card data-testid="card-historico">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Histórico
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history && history.length > 0 ? (
            <div className="space-y-4">
              {history.map((event, index) => (
                <div key={index} className="flex gap-4 items-start" data-testid={`history-event-${index}`}>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{event.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(event.date)}
                      {event.user && ` - ${event.user}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sem histórico disponível</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== CREATE OPPORTUNITY DIALOG ====================

function CreateOpportunityDialog({ onSuccess }: { onSuccess: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const form = useForm<OportunidadeFormData>({
    resolver: zodResolver(oportunidadeSchema),
    defaultValues: {
      clientId: "",
      title: "",
      description: "",
      type: "reactivation",
      estimatedValue: 0,
      probability: 50,
      priority: "medium",
      status: "open",
      source: "manual",
      trigger: ""
    }
  });

  const { data: clientes } = useQuery<{ clients: Cliente[] }>({
    queryKey: ["/api/crm/clientes"],
    queryFn: async () => {
      const response = await fetch("/api/crm/clientes?limit=1000", {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: OportunidadeFormData) => {
      return await apiRequest("POST", "/api/crm/oportunidades", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/oportunidades"] });
      toast({
        title: "Oportunidade criada!",
        description: "Nova oportunidade foi criada com sucesso."
      });
      setOpen(false);
      form.reset();
      onSuccess();
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível criar oportunidade.",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: OportunidadeFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-nova-oportunidade">
          <Plus className="h-4 w-4 mr-2" />
          Nova Oportunidade
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Nova Oportunidade</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-cliente-form">
                        <SelectValue placeholder="Selecione o cliente" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clientes?.clients?.map((cliente) => (
                        <SelectItem key={cliente.id} value={cliente.id}>
                          {cliente.name} {cliente.company && `(${cliente.company})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Ex: Reativação Cliente VIP" data-testid="input-titulo-form" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Descreva a oportunidade..."
                      data-testid="textarea-descricao-form"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-tipo-form">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="reactivation">Reativação</SelectItem>
                        <SelectItem value="cross_sell">Cross-sell</SelectItem>
                        <SelectItem value="upsell">Upsell</SelectItem>
                        <SelectItem value="churn_prevention">Churn Prevention</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-prioridade-form">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="medium">Média</SelectItem>
                        <SelectItem value="low">Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="estimatedValue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valor Estimado (€) *</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step="0.01"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        data-testid="input-valor-form"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="probability"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Probabilidade (%) *</FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        min="0"
                        max="100"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value))}
                        data-testid="input-probabilidade-form"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="expectedCloseDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data Esperada de Fecho</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className="w-full justify-start text-left font-normal"
                          data-testid="button-data-fecho"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value ? format(field.value, "PPP") : <span>Selecione a data</span>}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancelar-form"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-criar-form"
              >
                {createMutation.isPending ? "Criando..." : "Criar Oportunidade"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ==================== MAIN COMPONENT ====================

export default function CrmOpportunities() {
  const [match, params] = useRoute("/crm/opportunities/:id");
  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selectedOpportunityId, setSelectedOpportunityId] = useState<string | null>(null);

  // ✅ Universal dynamic columns system (opportunities-specific config)
  const { data: moduleConfig, isLoading: configLoading } = useModuleConfig('opportunities');
  const columns = useDynamicColumns(moduleConfig, [
    { fieldKey: 'title', label: 'Título', type: 'text' },
    { fieldKey: 'clientName', label: 'Cliente', type: 'text' },
    { fieldKey: 'type', label: 'Tipo', type: 'select' },
    { fieldKey: 'estimatedValue', label: 'Valor Estimado', type: 'currency' },
    { fieldKey: 'probability', label: 'Probabilidade', type: 'number' },
    { fieldKey: 'priority', label: 'Prioridade', type: 'select' },
    { fieldKey: 'status', label: 'Status', type: 'status' },
    { fieldKey: 'source', label: 'Fonte', type: 'select' },
    { fieldKey: 'createdAt', label: 'Data Criação', type: 'date' },
  ]);

  const buildQueryString = () => {
    const queryParams = new URLSearchParams();
    if (search) queryParams.append("search", search);
    if (clientFilter !== "all") queryParams.append("clientId", clientFilter);
    if (typeFilter !== "all") queryParams.append("type", typeFilter);
    if (priorityFilter !== "all") queryParams.append("priority", priorityFilter);
    if (statusFilter !== "all") queryParams.append("status", statusFilter);
    if (sourceFilter !== "all") queryParams.append("source", sourceFilter);
    const qs = queryParams.toString();
    return qs ? `?${qs}` : "";
  };

  const { data, isLoading } = useQuery<{ opportunities: Opportunity[]; stats: OpportunityStats }>({
    queryKey: ["/api/crm/oportunidades", search, clientFilter, typeFilter, priorityFilter, statusFilter, sourceFilter],
    queryFn: async () => {
      const response = await fetch(`/api/crm/oportunidades${buildQueryString()}`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch opportunities");
      return response.json();
    }
  });

  const { data: clientesData } = useQuery<{ clients: Cliente[] }>({
    queryKey: ["/api/crm/clientes"],
    queryFn: async () => {
      const response = await fetch("/api/crm/clientes?limit=1000", {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    }
  });

  const opportunities = data?.opportunities || [];
  const stats = data?.stats || { total: 0, pipelineValue: 0, conversionRate: 0, aiGenerated: 0, won: 0 };

  const conversionRate = stats.total > 0 
    ? ((stats.won / stats.total) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Oportunidades</h1>
          <p className="text-muted-foreground">Gestão de oportunidades comerciais</p>
        </div>
        <CreateOpportunityDialog onSuccess={() => {}} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="card-stats">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Oportunidades</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
            <p className="text-xs text-muted-foreground">Oportunidades ativas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Pipeline</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-pipeline">
              {formatCurrency(stats.pipelineValue)}
            </div>
            <p className="text-xs text-muted-foreground">Valor total estimado</p>
          </CardContent>
        </Card>

        <Card data-testid="card-stats-conversao">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa Conversão</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-conversao">{conversionRate}%</div>
            <p className="text-xs text-muted-foreground">
              {stats.won} ganhas de {stats.total} totais
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Oportunidades AI</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-ai">{stats.aiGenerated}</div>
            <p className="text-xs text-muted-foreground">Geradas automaticamente</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Input
              placeholder="Buscar por título..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-busca"
            />

            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger data-testid="select-cliente">
                <SelectValue placeholder="Cliente" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Clientes</SelectItem>
                {clientesData?.clients?.map((cliente) => (
                  <SelectItem key={cliente.id} value={cliente.id}>
                    {cliente.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-tipo">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Tipos</SelectItem>
                <SelectItem value="reactivation">Reativação</SelectItem>
                <SelectItem value="cross_sell">Cross-sell</SelectItem>
                <SelectItem value="upsell">Upsell</SelectItem>
                <SelectItem value="churn_prevention">Churn Prevention</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger data-testid="select-prioridade">
                <SelectValue placeholder="Prioridade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Prioridades</SelectItem>
                <SelectItem value="high">Alta</SelectItem>
                <SelectItem value="medium">Média</SelectItem>
                <SelectItem value="low">Baixa</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="won">Won</SelectItem>
                <SelectItem value="lost">Lost</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger data-testid="select-fonte">
                <SelectValue placeholder="Fonte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Fontes</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="ai_generated">AI Generated</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Opportunities Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Oportunidades</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : opportunities.length === 0 ? (
            <div className="text-center py-12">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma oportunidade encontrada</p>
            </div>
          ) : (
            <Table data-testid="table-oportunidades">
              <TableHeader>
                <TableRow>
                  {columns.map((col: any) => (
                    <TableHead key={col.fieldKey}>{col.label}</TableHead>
                  ))}
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunities.map((opp) => (
                  <TableRow key={opp.id} data-testid={`row-oportunidade-${opp.id}`}>
                    {columns.map((col: any) => {
                      // Determine alignment based on field type
                      const isNumeric = col.type === 'currency' || col.type === 'percentage' || 
                                       col.fieldKey.includes('value') || col.fieldKey.includes('probability');
                      const cellClass = isNumeric ? 'text-right' : '';
                      
                      return (
                        <TableCell 
                          key={col.fieldKey} 
                          className={cellClass}
                          data-testid={`cell-opportunities-${col.fieldKey}-${opp.id}`}
                        >
                          {renderModuleField(opp, col.fieldKey, col.type, {
                            customBadgeVariants: {
                              // Opportunity types
                              reactivation: 'default',
                              cross_sell: 'secondary',
                              upsell: 'outline',
                              churn_prevention: 'destructive',
                              // Priorities
                              high: 'destructive',
                              medium: 'default',
                              low: 'secondary',
                              // Statuses
                              open: 'default',
                              in_progress: 'secondary',
                              won: 'default',
                              lost: 'destructive',
                              cancelled: 'outline',
                              // Sources
                              manual: 'outline',
                              ai_generated: 'default',
                            }
                          })}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedOpportunityId(opp.id)}
                        data-testid={`button-ver-${opp.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      {selectedOpportunityId && (
        <Dialog open={!!selectedOpportunityId} onOpenChange={(open) => !open && setSelectedOpportunityId(null)}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <Oportunidade360View 
              opportunityId={selectedOpportunityId} 
              onClose={() => setSelectedOpportunityId(null)} 
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

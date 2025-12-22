import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useModuleConfig } from "@/hooks/use-module-config";
import { useDynamicColumns } from "@/hooks/use-dynamic-columns";
import { renderModuleField } from "@/lib/module-field-renderer";
import { 
  Plus, 
  Eye, 
  Edit, 
  Users, 
  UserCheck, 
  Euro, 
  TrendingUp,
  Mail,
  Target,
  ShoppingCart,
  FileText,
  CheckCircle,
  X,
  Building,
  Phone,
  MapPin
} from "lucide-react";

// ==================== VALIDATION SCHEMAS ====================

const clienteSchema = z.object({
  name: z.string().min(2, "Nome obrigatório"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  company: z.string().optional(),
  nif: z.string().refine((val) => !val || val.length === 9, {
    message: "NIF deve ter 9 dígitos"
  }).optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().default("Portugal"),
  status: z.enum(["Ativo", "Inativo"]).default("Ativo")
});

type ClienteFormData = z.infer<typeof clienteSchema>;

// ==================== TYPES ====================

interface Cliente {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  nif?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  status: "Ativo" | "Inativo";
  createdAt: string;
}

interface ClientStats {
  total: number;
  active: number;
  lifetimeValue: number;
  avgTicket: number;
}

interface Client360Stats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  daysSinceLastOrder: number;
  lifetimeValue: number;
}

interface TimelineEvent {
  type: "lead" | "opportunity" | "order" | "invoice" | "payment";
  date: string;
  data: any;
}

interface Client360Data {
  client: Cliente;
  stats: Client360Stats;
  timeline: TimelineEvent[];
  opportunities: any[];
  orders: any[];
  invoices: any[];
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

const getTimelineIcon = (type: string) => {
  const iconClass = "h-5 w-5";
  switch (type) {
    case "lead":
      return <Mail className={iconClass} />;
    case "opportunity":
      return <Target className={iconClass} />;
    case "order":
      return <ShoppingCart className={iconClass} />;
    case "invoice":
      return <FileText className={iconClass} />;
    case "payment":
      return <CheckCircle className={iconClass} />;
    default:
      return <FileText className={iconClass} />;
  }
};

const getTimelineDescription = (event: TimelineEvent) => {
  switch (event.type) {
    case "lead":
      return `Lead capturado - Origem: ${event.data.source || "Manual"}`;
    case "opportunity":
      return `Oportunidade criada: ${event.data.title || "Sem título"}`;
    case "order":
      return `Encomenda ${event.data.code} - ${formatCurrency(event.data.totalAmount)}`;
    case "invoice":
      return `Fatura ${event.data.invoiceNumber} gerada - ${formatCurrency(event.data.totalAmount)}`;
    case "payment":
      return `Recebimento ${formatCurrency(event.data.amount)} - ${event.data.paymentMethod || "N/A"}`;
    default:
      return "Evento desconhecido";
  }
};

const getTimelineBadgeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (type) {
    case "payment":
      return "default";
    case "invoice":
      return "secondary";
    case "order":
      return "outline";
    default:
      return "outline";
  }
};

// ==================== CLIENT 360° VIEW ====================

function Cliente360View({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { toast } = useToast();

  const { data: client360, isLoading } = useQuery<Client360Data>({
    queryKey: ["/api/crm/clientes", clientId],
    queryFn: async ({ queryKey }) => {
      const [, id] = queryKey;
      const response = await fetch(`/api/crm/clientes/${id}`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch client data");
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="dialog-cliente-360">
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

  if (!client360) {
    return (
      <div className="text-center py-8" data-testid="dialog-cliente-360">
        <p className="text-muted-foreground">Cliente não encontrado</p>
      </div>
    );
  }

  const { client, stats, timeline, opportunities, orders, invoices } = client360;

  return (
    <div className="space-y-6" data-testid="dialog-cliente-360">
      {/* Header com dados principais */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold" data-testid="text-cliente-nome">{client.name}</h2>
            <Badge variant={client.status === "Ativo" ? "default" : "secondary"} data-testid="badge-cliente-status">
              {client.status}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {client.company && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building className="h-4 w-4" />
                <span data-testid="text-cliente-empresa">{client.company}</span>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-4 w-4" />
                <span data-testid="text-cliente-email">{client.email}</span>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                <span data-testid="text-cliente-telefone">{client.phone}</span>
              </div>
            )}
            {client.nif && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="font-medium">NIF:</span>
                <span data-testid="text-cliente-nif">{client.nif}</span>
              </div>
            )}
            {(client.address || client.city) && (
              <div className="flex items-center gap-2 text-muted-foreground col-span-2">
                <MapPin className="h-4 w-4" />
                <span data-testid="text-cliente-morada">
                  {[client.address, client.city, client.postalCode].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" data-testid="button-editar-cliente">
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button variant="outline" size="sm" data-testid="button-criar-oportunidade">
            <Target className="h-4 w-4 mr-2" />
            Criar Oportunidade
          </Button>
          <Button size="sm" data-testid="button-criar-encomenda">
            <Plus className="h-4 w-4 mr-2" />
            Criar Encomenda
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-fechar-360">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card data-testid="card-stat-encomendas">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Encomendas</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stat-encomendas">{stats.totalOrders || 0}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-lifetime">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Lifetime</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stat-lifetime">
              {formatCurrency(stats.lifetimeValue || 0)}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-ticket-medio">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stat-ticket-medio">
              {formatCurrency(stats.avgOrderValue || 0)}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-ultima-compra">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dias Última Compra</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stat-ultima-compra">
              {stats.daysSinceLastOrder >= 0 ? stats.daysSinceLastOrder : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="timeline" data-testid="tabs-cliente">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline</TabsTrigger>
          <TabsTrigger value="oportunidades" data-testid="tab-oportunidades">Oportunidades</TabsTrigger>
          <TabsTrigger value="encomendas" data-testid="tab-encomendas">Encomendas</TabsTrigger>
          <TabsTrigger value="faturas" data-testid="tab-faturas">Faturas</TabsTrigger>
          <TabsTrigger value="atividades" data-testid="tab-atividades">Atividades</TabsTrigger>
        </TabsList>

        {/* TAB 1 - Timeline */}
        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Histórico Completo</CardTitle>
            </CardHeader>
            <CardContent>
              {timeline && timeline.length > 0 ? (
                <div className="space-y-6">
                  {timeline.map((event, idx) => (
                    <div key={idx} className="flex gap-4" data-testid={`timeline-item-${idx}`}>
                      <div className="flex flex-col items-center">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border bg-background">
                          {getTimelineIcon(event.type)}
                        </div>
                        {idx < timeline.length - 1 && (
                          <div className="h-full w-px bg-border mt-2 flex-1 min-h-8" />
                        )}
                      </div>
                      <div className="flex-1 pb-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getTimelineBadgeVariant(event.type)} data-testid={`timeline-badge-${idx}`}>
                            {event.type}
                          </Badge>
                          <span className="text-sm text-muted-foreground" data-testid={`timeline-date-${idx}`}>
                            {formatDate(event.date)}
                          </span>
                        </div>
                        <p className="text-sm" data-testid={`timeline-description-${idx}`}>
                          {getTimelineDescription(event)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  Sem eventos registados
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2 - Oportunidades */}
        <TabsContent value="oportunidades" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" data-testid="button-nova-oportunidade">
              <Plus className="h-4 w-4 mr-2" />
              Nova Oportunidade
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table data-testid="table-oportunidades">
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="text-right">Valor Estimado</TableHead>
                    <TableHead className="text-right">Probabilidade</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities && opportunities.length > 0 ? (
                    opportunities.map((opp: any) => (
                      <TableRow key={opp.id} data-testid={`row-oportunidade-${opp.id}`}>
                        <TableCell className="font-medium">{opp.title}</TableCell>
                        <TableCell>{opp.type}</TableCell>
                        <TableCell className="text-right">{formatCurrency(opp.estimatedValue || 0)}</TableCell>
                        <TableCell className="text-right">{opp.probability}%</TableCell>
                        <TableCell>
                          <Badge variant="outline">{opp.status}</Badge>
                        </TableCell>
                        <TableCell>{formatDate(opp.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Sem oportunidades registadas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3 - Encomendas */}
        <TabsContent value="encomendas" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" data-testid="button-nova-encomenda">
              <Plus className="h-4 w-4 mr-2" />
              Nova Encomenda
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <Table data-testid="table-encomendas">
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Total €</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Fatura</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders && orders.length > 0 ? (
                    orders.map((order: any) => (
                      <TableRow key={order.id} data-testid={`row-encomenda-${order.id}`}>
                        <TableCell className="font-medium">{order.code}</TableCell>
                        <TableCell>{formatDate(order.orderDate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(order.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{order.status}</Badge>
                        </TableCell>
                        <TableCell>
                          {order.invoiceId ? (
                            <Badge variant="default">Gerada</Badge>
                          ) : (
                            <Badge variant="secondary">Pendente</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" data-testid={`button-ver-encomenda-${order.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Sem encomendas registadas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 4 - Faturas */}
        <TabsContent value="faturas" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table data-testid="table-faturas">
                <TableHeader>
                  <TableRow>
                    <TableHead>Número</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">Total €</TableHead>
                    <TableHead>Estado Pagamento</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices && invoices.length > 0 ? (
                    invoices.map((invoice: any) => (
                      <TableRow key={invoice.id} data-testid={`row-fatura-${invoice.id}`}>
                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                        <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(invoice.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={invoice.paymentStatus === "paid" ? "default" : "secondary"}
                          >
                            {invoice.paymentStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" data-testid={`button-ver-fatura-${invoice.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Sem faturas registadas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 5 - Atividades (stub) */}
        <TabsContent value="atividades">
          <Card>
            <CardContent className="py-12">
              <div className="text-center text-muted-foreground">
                <p className="text-lg font-medium mb-2">Em Desenvolvimento</p>
                <p className="text-sm">Histórico de atividades, notas e interações será disponibilizado em breve</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

export default function CrmClients() {
  const { toast } = useToast();
  const [, params] = useRoute("/crm/clients/:id");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cliente360Id, setCliente360Id] = useState<string | null>(params?.id || null);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // ✅ Universal dynamic columns system (clients-specific config)
  const { data: moduleConfig, isLoading: configLoading } = useModuleConfig('crm');
  const columns = useDynamicColumns(moduleConfig, [
    { fieldKey: 'name', label: 'Nome', type: 'text' },
    { fieldKey: 'company', label: 'Empresa', type: 'text' },
    { fieldKey: 'nif', label: 'NIF', type: 'text' },
    { fieldKey: 'email', label: 'Email', type: 'email' },
    { fieldKey: 'phone', label: 'Telefone', type: 'text' },
    { fieldKey: 'status', label: 'Estado', type: 'status' },
  ]);

  const { data: clientsData, isLoading } = useQuery<{ clients: Cliente[]; total: number; stats?: ClientStats }>({
    queryKey: ["/api/crm/clientes", { search: searchFilter, status: statusFilter !== "all" ? statusFilter : undefined }],
    queryFn: async ({ queryKey }) => {
      const [, filters] = queryKey;
      const params = new URLSearchParams();
      if (filters && typeof filters === "object" && "search" in filters && filters.search) {
        params.append("search", String(filters.search));
      }
      if (filters && typeof filters === "object" && "status" in filters && filters.status) {
        params.append("status", String(filters.status));
      }
      const url = `/api/crm/clientes${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch clients");
      return response.json();
    }
  });

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      company: "",
      nif: "",
      address: "",
      city: "",
      postalCode: "",
      country: "Portugal",
      status: "Ativo"
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ClienteFormData) => {
      return await apiRequest("POST", "/api/crm/clientes", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clientes"] });
      toast({ title: "Cliente criado com sucesso" });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar cliente", variant: "destructive" });
    },
  });

  const onSubmit = (data: ClienteFormData) => {
    createMutation.mutate(data);
  };

  const handleViewClient360 = (clientId: string) => {
    setCliente360Id(clientId);
  };

  const clients = clientsData?.clients || [];
  const stats: ClientStats = clientsData?.stats || {
    total: clients.length,
    active: clients.filter(c => c.status === "Ativo").length,
    lifetimeValue: 0,
    avgTicket: 0
  };

  // If viewing 360° view
  if (cliente360Id) {
    return (
      <div className="p-6">
        <Cliente360View 
          clientId={cliente360Id} 
          onClose={() => setCliente360Id(null)} 
        />
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Clientes 360°</h1>
          <p className="text-muted-foreground">Gestão completa de clientes CRM</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-novo-cliente">
              <Plus className="h-4 w-4 mr-2" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="dialog-novo-cliente">
            <DialogHeader>
              <DialogTitle>Novo Cliente</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome *</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome completo" {...field} data-testid="input-nome" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="company"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Empresa</FormLabel>
                        <FormControl>
                          <Input placeholder="Nome da empresa" {...field} data-testid="input-empresa" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="email@exemplo.com" {...field} data-testid="input-email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone</FormLabel>
                        <FormControl>
                          <Input placeholder="+351 912 345 678" {...field} data-testid="input-telefone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nif"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>NIF</FormLabel>
                        <FormControl>
                          <Input placeholder="123456789" {...field} data-testid="input-nif" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Estado</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-estado-form">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Ativo">Ativo</SelectItem>
                            <SelectItem value="Inativo">Inativo</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="address"
                    render={({ field }) => (
                      <FormItem className="col-span-2">
                        <FormLabel>Morada</FormLabel>
                        <FormControl>
                          <Input placeholder="Rua, número, andar" {...field} data-testid="input-morada" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="city"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade</FormLabel>
                        <FormControl>
                          <Input placeholder="Lisboa" {...field} data-testid="input-cidade" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="postalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Código Postal</FormLabel>
                        <FormControl>
                          <Input placeholder="1000-001" {...field} data-testid="input-codigo-postal" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setDialogOpen(false)} 
                    data-testid="button-cancelar"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending} 
                    data-testid="button-guardar-cliente"
                  >
                    {createMutation.isPending ? "A guardar..." : "Guardar Cliente"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card data-testid="card-stats-total">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stats-total">{stats.total}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-stats-ativos">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Ativos</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stats-ativos">{stats.active}</div>
          </CardContent>
        </Card>

        <Card data-testid="card-stats-lifetime">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Lifetime Total</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stats-lifetime-total">
              {formatCurrency(stats.lifetimeValue)}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stats-ticket">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-stats-ticket-medio">
              {formatCurrency(stats.avgTicket)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card data-testid="card-filtros">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Busca</label>
              <Input
                placeholder="Nome, email, NIF..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                data-testid="input-busca"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Estado</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Ativo">Ativo</SelectItem>
                  <SelectItem value="Inativo">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Clientes */}
      <Card data-testid="card-lista-clientes">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table data-testid="table-clientes">
              <TableHeader>
                <TableRow>
                  {columns.map((col: any) => (
                    <TableHead key={col.fieldKey}>{col.label}</TableHead>
                  ))}
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients && clients.length > 0 ? (
                  clients.map((cliente) => (
                    <TableRow key={cliente.id} data-testid={`row-cliente-${cliente.id}`}>
                      {columns.map((col: any) => {
                        const cellClass = col.type === 'currency' || col.fieldKey.includes('value') ? 'text-right' : '';
                        
                        return (
                          <TableCell 
                            key={col.fieldKey}
                            className={cellClass}
                            data-testid={`cell-clients-${col.fieldKey}-${cliente.id}`}
                          >
                            {renderModuleField(cliente, col.fieldKey, col.type, {
                              customBadgeVariants: {
                                Ativo: 'default',
                                Inativo: 'secondary',
                              }
                            })}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleViewClient360(cliente.id)}
                            data-testid={`button-ver-360-${cliente.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            data-testid={`button-editar-${cliente.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length + 1} className="text-center text-muted-foreground">
                      Sem clientes registados
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

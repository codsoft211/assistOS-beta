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
import { useForm, useFieldArray } from "react-hook-form";
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
  ShoppingCart,
  FileText,
  Truck,
  CheckCircle,
  XCircle,
  X,
  Euro,
  Calendar as CalendarIcon,
  Trash2,
  Package,
  AlertCircle,
  Ban
} from "lucide-react";

// ==================== VALIDATION SCHEMAS ====================

const linhaSchema = z.object({
  description: z.string().min(2, "Descrição obrigatória"),
  quantity: z.coerce.number().min(0.001, "Quantidade inválida"),
  unitPrice: z.coerce.number().min(0, "Preço inválido"),
  taxRate: z.coerce.number().min(0).max(100),
  uom: z.string().default("unidade")
});

const encomendaSchema = z.object({
  clientId: z.string().min(1, "Cliente obrigatório"),
  orderDate: z.date(),
  expectedDeliveryDate: z.date().optional(),
  lines: z.array(linhaSchema).min(1, "Adicione pelo menos uma linha"),
  deliveryAddress: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional()
});

type EncomendaFormData = z.infer<typeof encomendaSchema>;
type LinhaFormData = z.infer<typeof linhaSchema>;

// ==================== TYPES ====================

interface SalesOrder {
  id: string;
  code: string;
  orderDate: string;
  expectedDeliveryDate?: string;
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  shippingCost?: number;
  totalAmount: number;
  deliveryAddress?: string;
  notes?: string;
  internalNotes?: string;
  invoiceId?: string;
  invoiceGeneratedAt?: string;
  createdAt: string;
}

interface SalesOrderLine {
  id: string;
  description: string;
  quantity: number;
  uom: string;
  unitPrice: number;
  lineTotal: number;
  taxRate: number;
  taxAmount: number;
}

interface Cliente {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  nif?: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  issueDate: string;
}

interface OrderStats {
  total: number;
  totalValue: number;
  pending: number;
  invoicedRate: number;
}

interface OrderDetailsData {
  order: SalesOrder;
  client: Cliente;
  lines: SalesOrderLine[];
  invoice?: Invoice;
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

const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "Confirmed":
    case "Shipped":
    case "Delivered":
      return "default";
    case "Draft":
    case "Pending":
      return "secondary";
    case "Cancelled":
      return "destructive";
    default:
      return "outline";
  }
};

const getStatusIcon = (status: string) => {
  const iconClass = "h-4 w-4";
  switch (status) {
    case "Confirmed":
      return <CheckCircle className={iconClass} />;
    case "Shipped":
      return <Truck className={iconClass} />;
    case "Delivered":
      return <Package className={iconClass} />;
    case "Cancelled":
      return <Ban className={iconClass} />;
    case "Draft":
      return <Edit className={iconClass} />;
    default:
      return <AlertCircle className={iconClass} />;
  }
};

// ==================== ENCOMENDA 360° VIEW ====================

function Encomenda360View({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: orderDetails, isLoading } = useQuery<OrderDetailsData>({
    queryKey: ["/api/crm/encomendas", orderId],
    queryFn: async () => {
      const response = await fetch(`/api/crm/encomendas/${orderId}`, {
        credentials: "include"
      });
      if (!response.ok) throw new Error("Failed to fetch order data");
      return response.json();
    }
  });

  const generateInvoiceMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/crm/encomendas/${orderId}/gerar-fatura`, {});
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/encomendas"] });
      toast({
        title: "Fatura gerada!",
        description: `Fatura ${data.invoiceNumber} criada com sucesso.`
      });
      navigate(`/financeiro/faturacao/${data.invoiceId}`);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível gerar fatura.",
        variant: "destructive"
      });
    }
  });

  const handleGenerateInvoice = () => {
    generateInvoiceMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="dialog-detalhes-encomenda">
        <div className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-96 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!orderDetails) {
    return (
      <div className="text-center py-8" data-testid="dialog-detalhes-encomenda">
        <p className="text-muted-foreground">Encomenda não encontrada</p>
      </div>
    );
  }

  const { order, client, lines, invoice } = orderDetails;
  const canGenerateInvoice = (order.status === "Confirmed" || order.status === "Shipped") && !order.invoiceId;

  return (
    <div className="space-y-6" data-testid="dialog-detalhes-encomenda">
      {/* Header com dados principais */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold" data-testid="text-encomenda-codigo">{order.code}</h2>
            <Badge variant={getStatusBadgeVariant(order.status)} data-testid="badge-encomenda-status">
              {getStatusIcon(order.status)}
              <span className="ml-1">{order.status}</span>
            </Badge>
            {order.invoiceId ? (
              <Badge variant="default" data-testid="badge-fatura-gerada">
                <CheckCircle className="h-3 w-3 mr-1" />
                Fatura Gerada
              </Badge>
            ) : (
              <Badge variant="secondary" data-testid="badge-sem-fatura">
                <XCircle className="h-3 w-3 mr-1" />
                Sem Fatura
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span data-testid="text-encomenda-data">Data: {formatDate(order.orderDate)}</span>
            <span data-testid="text-encomenda-cliente">Cliente: {order.clientName}</span>
          </div>
        </div>
        <div className="flex gap-2">
          {canGenerateInvoice && (
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleGenerateInvoice}
              disabled={generateInvoiceMutation.isPending}
              data-testid="button-gerar-fatura"
            >
              <FileText className="h-4 w-4 mr-2" />
              {generateInvoiceMutation.isPending ? "Gerando..." : "Gerar Fatura"}
            </Button>
          )}
          <Button variant="outline" size="sm" data-testid="button-editar-encomenda">
            <Edit className="h-4 w-4 mr-2" />
            Editar
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-fechar-360">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Coluna Principal - Linhas e Dados Cliente */}
        <div className="col-span-2 space-y-6">
          {/* Secção 1 - Dados Cliente */}
          <Card data-testid="card-dados-cliente">
            <CardHeader>
              <CardTitle>Dados do Cliente</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Nome:</span>
                  <p className="font-medium" data-testid="text-cliente-nome">{client.name}</p>
                </div>
                {client.company && (
                  <div>
                    <span className="text-muted-foreground">Empresa:</span>
                    <p className="font-medium" data-testid="text-cliente-empresa">{client.company}</p>
                  </div>
                )}
                {client.nif && (
                  <div>
                    <span className="text-muted-foreground">NIF:</span>
                    <p className="font-medium" data-testid="text-cliente-nif">{client.nif}</p>
                  </div>
                )}
                {client.email && (
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-medium" data-testid="text-cliente-email">{client.email}</p>
                  </div>
                )}
                {client.phone && (
                  <div>
                    <span className="text-muted-foreground">Telefone:</span>
                    <p className="font-medium" data-testid="text-cliente-telefone">{client.phone}</p>
                  </div>
                )}
                {order.deliveryAddress && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Morada Entrega:</span>
                    <p className="font-medium" data-testid="text-morada-entrega">{order.deliveryAddress}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Secção 2 - Linhas da Encomenda */}
          <Card data-testid="card-linhas-encomenda">
            <CardHeader>
              <CardTitle>Linhas da Encomenda</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table data-testid="table-linhas">
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead className="text-right">Preço Unit. €</TableHead>
                    <TableHead className="text-right">Total Linha €</TableHead>
                    <TableHead className="text-right">Taxa IVA %</TableHead>
                    <TableHead className="text-right">IVA €</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines && lines.length > 0 ? (
                    lines.map((line, idx) => (
                      <TableRow key={line.id} data-testid={`row-linha-${idx}`}>
                        <TableCell className="font-medium">{line.description}</TableCell>
                        <TableCell className="text-right">{line.quantity}</TableCell>
                        <TableCell>{line.uom}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.unitPrice)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.lineTotal)}</TableCell>
                        <TableCell className="text-right">{line.taxRate}%</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.taxAmount)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Sem linhas registadas
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Secção 5 - Notas */}
          <Card data-testid="card-notas">
            <CardHeader>
              <CardTitle>Notas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {order.notes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Notas Externas</label>
                  <p className="mt-1 text-sm" data-testid="text-notas-externas">{order.notes}</p>
                </div>
              )}
              {order.internalNotes && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Notas Internas</label>
                  <p className="mt-1 text-sm" data-testid="text-notas-internas">{order.internalNotes}</p>
                </div>
              )}
              {!order.notes && !order.internalNotes && (
                <p className="text-sm text-muted-foreground">Sem notas registadas</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Coluna Lateral - Totais e Fatura */}
        <div className="space-y-6">
          {/* Secção 3 - Totais */}
          <Card data-testid="card-totais">
            <CardHeader>
              <CardTitle>Totais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal (sem IVA):</span>
                <span className="font-medium" data-testid="text-subtotal">{formatCurrency(order.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total IVA:</span>
                <span className="font-medium" data-testid="text-total-iva">{formatCurrency(order.taxTotal)}</span>
              </div>
              {order.shippingCost && order.shippingCost > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Custo Envio:</span>
                  <span className="font-medium" data-testid="text-custo-envio">{formatCurrency(order.shippingCost)}</span>
                </div>
              )}
              <div className="border-t pt-3 flex justify-between">
                <span className="font-bold text-lg">TOTAL:</span>
                <span className="font-bold text-lg" data-testid="text-total-amount">{formatCurrency(order.totalAmount)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Secção 4 - Fatura Gerada (se existe) */}
          {order.invoiceId && invoice && (
            <Card data-testid="card-fatura-gerada">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Fatura Gerada
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium" data-testid="text-fatura-numero">
                    {invoice.invoiceNumber}
                  </p>
                  <p className="text-xs text-muted-foreground" data-testid="text-fatura-data">
                    Gerada em {formatDate(order.invoiceGeneratedAt || invoice.issueDate)}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant={invoice.paymentStatus === "paid" ? "default" : "secondary"} data-testid="badge-pagamento-status">
                      {invoice.paymentStatus === "paid" ? "Pago" : "Pendente"}
                    </Badge>
                  </div>
                  <div className="text-sm mt-3">
                    <span className="text-muted-foreground">Valor:</span>
                    <p className="font-medium" data-testid="text-fatura-valor">{formatCurrency(invoice.totalAmount)}</p>
                  </div>
                  {invoice.paidAmount > 0 && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Pago:</span>
                      <p className="font-medium" data-testid="text-fatura-pago">{formatCurrency(invoice.paidAmount)}</p>
                    </div>
                  )}
                </div>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => navigate(`/financeiro/faturacao/${invoice.id}`)}
                  data-testid="button-ver-fatura"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Ver Detalhes Fatura
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== MAIN COMPONENT ====================

export default function CrmOrders() {
  const { toast } = useToast();
  const [, params] = useRoute("/crm/orders/:id");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [encomenda360Id, setEncomenda360Id] = useState<string | null>(params?.id || null);
  const [searchFilter, setSearchFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  // ✅ Universal dynamic columns system (orders-specific config)
  const { data: moduleConfig, isLoading: configLoading } = useModuleConfig('orders');
  const columns = useDynamicColumns(moduleConfig, [
    { fieldKey: 'code', label: 'Código', type: 'auto_number' },
    { fieldKey: 'orderDate', label: 'Data', type: 'date' },
    { fieldKey: 'clientName', label: 'Cliente', type: 'text' },
    { fieldKey: 'totalAmount', label: 'Total €', type: 'currency' },
    { fieldKey: 'status', label: 'Estado', type: 'status' },
    { fieldKey: 'invoiceId', label: 'Fatura Gerada?', type: 'boolean' },
  ]);

  const { data: ordersData, isLoading } = useQuery<{ 
    orders: (SalesOrder & { client?: Cliente })[];
    total: number;
    stats?: OrderStats;
  }>({
    queryKey: [
      "/api/crm/encomendas", 
      { 
        search: searchFilter, 
        status: statusFilter !== "all" ? statusFilter : undefined,
        clientId: clientFilter !== "all" ? clientFilter : undefined,
        startDate: dateFrom ? format(dateFrom, "yyyy-MM-dd") : undefined,
        endDate: dateTo ? format(dateTo, "yyyy-MM-dd") : undefined
      }
    ],
  });

  const { data: clientsData } = useQuery<{ clients: Cliente[] }>({
    queryKey: ["/api/crm/clientes"],
  });

  const form = useForm<EncomendaFormData>({
    resolver: zodResolver(encomendaSchema),
    defaultValues: {
      clientId: "",
      orderDate: new Date(),
      lines: [
        { description: "", quantity: 1, unitPrice: 0, taxRate: 23, uom: "unidade" }
      ],
      deliveryAddress: "",
      notes: "",
      internalNotes: ""
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines"
  });

  const createMutation = useMutation({
    mutationFn: async (data: EncomendaFormData) => {
      // Calculate totals for each line
      const linesWithTotals = data.lines.map(line => ({
        ...line,
        lineTotal: line.quantity * line.unitPrice,
        taxAmount: (line.quantity * line.unitPrice) * (line.taxRate / 100)
      }));

      const subtotal = linesWithTotals.reduce((acc, line) => acc + line.lineTotal, 0);
      const taxTotal = linesWithTotals.reduce((acc, line) => acc + line.taxAmount, 0);
      const totalAmount = subtotal + taxTotal;

      return await apiRequest("POST", "/api/crm/encomendas", {
        ...data,
        lines: linesWithTotals,
        status: "Draft",
        subtotal,
        taxTotal,
        totalAmount
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/encomendas"] });
      toast({ title: "Encomenda criada com sucesso" });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar encomenda", variant: "destructive" });
    },
  });

  const onSubmit = (data: EncomendaFormData) => {
    createMutation.mutate(data);
  };

  const handleViewOrder360 = (orderId: string) => {
    setEncomenda360Id(orderId);
  };

  const orders = ordersData?.orders || [];
  const stats = ordersData?.stats;

  return (
    <div className="space-y-6 p-6">
      {/* Breadcrumb / Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="title-encomendas">Encomendas</h1>
          <p className="text-muted-foreground">Gestão de encomendas de vendas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-nova-encomenda">
              <Plus className="h-4 w-4 mr-2" />
              Nova Encomenda
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Nova Encomenda</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="clientId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cliente *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-form-cliente">
                              <SelectValue placeholder="Selecionar cliente" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {clientsData?.clients?.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.name}
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
                    name="orderDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Data Encomenda *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className="w-full justify-start text-left font-normal"
                                data-testid="select-form-data"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "dd/MM/yyyy") : "Selecionar data"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
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
                </div>

                <FormField
                  control={form.control}
                  name="deliveryAddress"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Morada de Entrega</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Morada completa" data-testid="input-form-morada" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Linhas da Encomenda */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Linhas da Encomenda *</label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ description: "", quantity: 1, unitPrice: 0, taxRate: 23, uom: "unidade" })}
                      data-testid="button-add-linha"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Linha
                    </Button>
                  </div>

                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Descrição *</TableHead>
                          <TableHead className="w-24">Qtd *</TableHead>
                          <TableHead className="w-24">Unidade</TableHead>
                          <TableHead className="w-32">Preço Unit. € *</TableHead>
                          <TableHead className="w-24">IVA %</TableHead>
                          <TableHead className="w-20"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.map((field, index) => (
                          <TableRow key={field.id} data-testid={`row-form-linha-${index}`}>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`lines.${index}.description`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input {...field} placeholder="Descrição do produto/serviço" />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`lines.${index}.quantity`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input type="number" step="0.01" {...field} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`lines.${index}.uom`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input {...field} placeholder="un" />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`lines.${index}.unitPrice`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input type="number" step="0.01" {...field} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              <FormField
                                control={form.control}
                                name={`lines.${index}.taxRate`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormControl>
                                      <Input type="number" step="1" {...field} />
                                    </FormControl>
                                  </FormItem>
                                )}
                              />
                            </TableCell>
                            <TableCell>
                              {fields.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => remove(index)}
                                  data-testid={`button-remove-linha-${index}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas Externas</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Notas visíveis ao cliente" rows={3} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="internalNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas Internas</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Notas internas (não visíveis ao cliente)" rows={3} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-encomenda">
                    {createMutation.isPending ? "Criando..." : "Criar Encomenda"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Dialog 360° View */}
      {encomenda360Id && (
        <Dialog open={!!encomenda360Id} onOpenChange={(open) => !open && setEncomenda360Id(null)}>
          <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
            <Encomenda360View orderId={encomenda360Id} onClose={() => setEncomenda360Id(null)} />
          </DialogContent>
        </Dialog>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-4 gap-4" data-testid="card-stats">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Encomendas</CardTitle>
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total">{stats.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-valor-total">{formatCurrency(stats.totalValue)}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Encomendas Pendentes</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-pendentes">{stats.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa Faturação</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-taxa-faturacao">{stats.invoicedRate.toFixed(0)}%</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <Input
              placeholder="Buscar por código ou cliente..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              data-testid="input-busca"
            />

            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger data-testid="select-cliente">
                <SelectValue placeholder="Todos os clientes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os clientes</SelectItem>
                {clientsData?.clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-estado">
                <SelectValue placeholder="Todos os estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Confirmed">Confirmed</SelectItem>
                <SelectItem value="Shipped">Shipped</SelectItem>
                <SelectItem value="Delivered">Delivered</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start" data-testid="date-range-picker">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? (
                    dateTo ? (
                      `${format(dateFrom, "dd/MM/yy")} - ${format(dateTo, "dd/MM/yy")}`
                    ) : (
                      format(dateFrom, "dd/MM/yyyy")
                    )
                  ) : (
                    "Filtrar por data"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                />
                <div className="p-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setDateFrom(undefined);
                      setDateTo(undefined);
                    }}
                  >
                    Limpar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de Encomendas */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <Table data-testid="table-encomendas">
              <TableHeader>
                <TableRow>
                  {columns.map((col: any) => (
                    <TableHead key={col.fieldKey}>{col.label}</TableHead>
                  ))}
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders && orders.length > 0 ? (
                  orders.map((order) => (
                    <TableRow key={order.id} data-testid={`row-encomenda-${order.id}`}>
                      {columns.map((col: any) => {
                        const isNumeric = col.type === 'currency' || col.fieldKey.includes('total') || col.fieldKey.includes('value');
                        const cellClass = isNumeric ? 'text-right' : '';
                        
                        return (
                          <TableCell 
                            key={col.fieldKey}
                            className={cellClass}
                            data-testid={`cell-orders-${col.fieldKey}-${order.id}`}
                          >
                            {renderModuleField(order, col.fieldKey, col.type, {
                              customBadgeVariants: {
                                Draft: 'secondary',
                                Pending: 'outline',
                                Confirmed: 'default',
                                Shipped: 'default',
                                Delivered: 'default',
                                Cancelled: 'destructive',
                              }
                            })}
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewOrder360(order.id)}
                          data-testid={`button-ver-encomenda-${order.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma encomenda encontrada
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

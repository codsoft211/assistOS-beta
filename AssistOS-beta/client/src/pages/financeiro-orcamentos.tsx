import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, FileText, Eye } from "lucide-react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const formatCurrency = (value: number | string) => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(numValue || 0);
};

const formatDate = (dateString: string) => {
  return new Intl.DateTimeFormat("pt-PT").format(new Date(dateString));
};

const getStatusColor = (status: string) => {
  const colors: Record<string, string> = {
    draft: "bg-gray-500",
    review: "bg-blue-500",
    approved: "bg-green-500",
    sent: "bg-purple-500",
    accepted: "bg-emerald-500",
    rejected: "bg-red-500",
    expired: "bg-orange-500",
  };
  return colors[status] || "bg-gray-500";
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    draft: "Rascunho",
    review: "Em Revisão",
    approved: "Aprovado",
    sent: "Enviado",
    accepted: "Aceite",
    rejected: "Rejeitado",
    expired: "Expirado",
  };
  return labels[status] || status;
};

// Validation schema for quote items
const quoteItemSchema = z.object({
  description: z.string().min(1, "Descrição é obrigatória"),
  type: z.enum(["labor", "material"]),
  roleId: z.string().optional(),
  hours: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  unit: z.string().optional(),
  unitCost: z.number().min(0).optional(),
});

// Validation schema for quote creation
const createQuoteSchema = z.object({
  templateId: z.string().min(1, "Template é obrigatório"),
  clientId: z.string().optional(),
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  urgency: z.enum(["normal", "urgent", "critical"]).default("normal"),
  items: z.array(quoteItemSchema).min(1, "Adicione pelo menos um item"),
});

type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export default function FinanceiroOrcamentos() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState("1");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  // Fetch quotes
  const { data: quotes, isLoading: quotesLoading } = useQuery<any[]>({
    queryKey: ["/api/financeiro/quotes", { status: statusFilter !== "all" ? statusFilter : undefined, clientId: clientFilter !== "all" ? clientFilter : undefined }],
  });

  // Fetch templates
  const { data: templates } = useQuery<any[]>({
    queryKey: ["/api/financeiro/templates"],
  });

  // Fetch rate cards
  const { data: rateCardsData } = useQuery<any>({
    queryKey: ["/api/financeiro/rate-cards"],
  });

  // Fetch clients
  const { data: clients } = useQuery<any[]>({
    queryKey: ["/api/comercial/clients"],
  });

  const rateCards = rateCardsData?.cards || [];

  // Form for quote creation
  const form = useForm<CreateQuoteInput>({
    resolver: zodResolver(createQuoteSchema),
    defaultValues: {
      templateId: "",
      clientId: "",
      title: "",
      description: "",
      urgency: "normal",
      items: [],
    },
  });

  // Watch form values for real-time calculations
  const watchedItems = form.watch("items");
  const watchedTemplateId = form.watch("templateId");

  // Calculate preview
  const calculatePreview = () => {
    const items = watchedItems || [];
    const selectedTemplate = templates?.find(t => t.id === watchedTemplateId);
    
    if (!selectedTemplate || items.length === 0) {
      return {
        laborCosts: 0,
        materialCosts: 0,
        overheadCosts: 0,
        totalCost: 0,
        totalPrice: 0,
        margin: 0,
        marginPercentage: 0,
      };
    }

    const defaultMarkup = parseFloat(selectedTemplate.defaultMarkup || '1.50');
    const defaultOverhead = parseFloat(selectedTemplate.defaultOverhead || '0.15');

    let laborCosts = 0;
    let materialCosts = 0;
    let overheadCosts = 0;
    let totalCost = 0;
    let totalPrice = 0;

    items.forEach(item => {
      if (item.type === "labor" && item.roleId && item.hours) {
        const rateCard = rateCards.find((r: any) => r.id === item.roleId);
        if (rateCard) {
          const unitCost = parseFloat(rateCard.costRate) * item.hours;
          const unitPrice = parseFloat(rateCard.billRate) * item.hours;
          const overhead = unitCost * defaultOverhead;
          
          laborCosts += unitCost;
          overheadCosts += overhead;
          totalCost += unitCost + overhead;
          totalPrice += unitPrice;
        }
      } else if (item.type === "material" && item.unitCost && item.quantity) {
        const unitCost = item.unitCost * item.quantity;
        const unitPrice = unitCost * defaultMarkup;
        const overhead = unitCost * defaultOverhead;
        
        materialCosts += unitCost;
        overheadCosts += overhead;
        totalCost += unitCost + overhead;
        totalPrice += unitPrice;
      }
    });

    const margin = totalPrice - totalCost;
    const marginPercentage = totalCost > 0 ? (margin / totalCost) * 100 : 0;

    return {
      laborCosts,
      materialCosts,
      overheadCosts,
      totalCost,
      totalPrice,
      margin,
      marginPercentage,
    };
  };

  const preview = calculatePreview();

  // Create quote mutation
  const createQuoteMutation = useMutation({
    mutationFn: async (data: CreateQuoteInput) => {
      const payload = {
        templateId: data.templateId,
        clientId: data.clientId || undefined,
        requirements: {
          title: data.title,
          description: data.description || "",
          urgency: data.urgency,
          items: data.items.map(item => ({
            description: item.description,
            roleId: item.type === "labor" ? item.roleId : undefined,
            hours: item.type === "labor" ? item.hours : undefined,
            quantity: item.type === "material" ? item.quantity : undefined,
            unit: item.type === "material" ? item.unit : undefined,
            unitCost: item.type === "material" ? item.unitCost : undefined,
          })),
        },
      };

      return await apiRequest("POST", "/api/financeiro/quotes", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/quotes"] });
      toast({
        title: "Orçamento criado",
        description: "O orçamento foi criado com sucesso",
      });
      setDialogOpen(false);
      form.reset();
      setCurrentStep("1");
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar orçamento",
        description: error.message || "Ocorreu um erro ao criar o orçamento",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateQuoteInput) => {
    createQuoteMutation.mutate(data);
  };

  const addItem = () => {
    const currentItems = form.getValues("items") || [];
    form.setValue("items", [
      ...currentItems,
      {
        description: "",
        type: "labor" as const,
        roleId: "",
        hours: 1,
        quantity: 1,
        unit: "unit",
        unitCost: 0,
      },
    ]);
  };

  const removeItem = (index: number) => {
    const currentItems = form.getValues("items") || [];
    form.setValue("items", currentItems.filter((_, i) => i !== index));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Orçamentos
          </h1>
          <p className="text-muted-foreground">
            Geração e gestão de orçamentos com cálculo automático
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-novo-orcamento">
              <Plus className="h-4 w-4 mr-2" />
              Novo Orçamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Orçamento</DialogTitle>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Tabs value={currentStep} onValueChange={setCurrentStep}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="1">Informações Básicas</TabsTrigger>
                    <TabsTrigger value="2">Itens</TabsTrigger>
                    <TabsTrigger value="3">Preview & Criar</TabsTrigger>
                  </TabsList>

                  {/* Step 1: Basic Information */}
                  <TabsContent value="1" className="space-y-4">
                    <FormField
                      control={form.control}
                      name="templateId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Template *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-template">
                                <SelectValue placeholder="Selecionar template" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {templates?.map((template) => (
                                <SelectItem key={template.id} value={template.id}>
                                  {template.name}
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
                      name="clientId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Cliente (opcional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-cliente">
                                <SelectValue placeholder="Selecionar cliente" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="">Nenhum</SelectItem>
                              {clients?.map((client) => (
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
                      name="title"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Título *</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Ex: Desenvolvimento Website" data-testid="input-titulo" />
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
                              placeholder="Detalhes adicionais sobre o orçamento"
                              rows={3}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="urgency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Urgência</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="urgent">Urgente</SelectItem>
                              <SelectItem value="critical">Crítico</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="button"
                      onClick={() => setCurrentStep("2")}
                      className="w-full"
                    >
                      Próximo: Adicionar Itens
                    </Button>
                  </TabsContent>

                  {/* Step 2: Items */}
                  <TabsContent value="2" className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">Itens do Orçamento</h3>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addItem}
                        data-testid="button-adicionar-item"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar Item
                      </Button>
                    </div>

                    {watchedItems && watchedItems.length > 0 ? (
                      <div className="space-y-4">
                        {watchedItems.map((_, index) => (
                          <Card key={index}>
                            <CardContent className="pt-6 space-y-4">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-medium">Item {index + 1}</h4>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeItem(index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>

                              <FormField
                                control={form.control}
                                name={`items.${index}.description`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Descrição *</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Ex: Desenvolvimento Frontend" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              <FormField
                                control={form.control}
                                name={`items.${index}.type`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Tipo *</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                      <FormControl>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                      </FormControl>
                                      <SelectContent>
                                        <SelectItem value="labor">Labor (Horas)</SelectItem>
                                        <SelectItem value="material">Material</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />

                              {watchedItems[index]?.type === "labor" ? (
                                <>
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.roleId`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Role *</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                          <FormControl>
                                            <SelectTrigger>
                                              <SelectValue placeholder="Selecionar role" />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            {rateCards.map((card: any) => (
                                              <SelectItem key={card.id} value={card.id}>
                                                {card.roleName} - {formatCurrency(card.billRate)}/h
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
                                    name={`items.${index}.hours`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Horas *</FormLabel>
                                        <FormControl>
                                          <Input
                                            type="number"
                                            {...field}
                                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                            min="0"
                                            step="0.5"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </>
                              ) : (
                                <>
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.quantity`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Quantidade *</FormLabel>
                                        <FormControl>
                                          <Input
                                            type="number"
                                            {...field}
                                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                            min="0"
                                            step="1"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />

                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.unit`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Unidade</FormLabel>
                                        <FormControl>
                                          <Input {...field} placeholder="Ex: un, kg, m2" />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />

                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.unitCost`}
                                    render={({ field }) => (
                                      <FormItem>
                                        <FormLabel>Custo Unitário *</FormLabel>
                                        <FormControl>
                                          <Input
                                            type="number"
                                            {...field}
                                            onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                            min="0"
                                            step="0.01"
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>Nenhum item adicionado</p>
                        <p className="text-sm">Clique em "Adicionar Item" para começar</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCurrentStep("1")}
                        className="flex-1"
                      >
                        Voltar
                      </Button>
                      <Button
                        type="button"
                        onClick={() => setCurrentStep("3")}
                        className="flex-1"
                        disabled={!watchedItems || watchedItems.length === 0}
                      >
                        Próximo: Preview
                      </Button>
                    </div>
                  </TabsContent>

                  {/* Step 3: Preview */}
                  <TabsContent value="3" className="space-y-4">
                    <h3 className="font-semibold">Preview do Orçamento</h3>

                    <Card>
                      <CardContent className="pt-6 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Custos Labor</p>
                            <p className="text-lg font-semibold">{formatCurrency(preview.laborCosts)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Custos Materiais</p>
                            <p className="text-lg font-semibold">{formatCurrency(preview.materialCosts)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Overheads</p>
                            <p className="text-lg font-semibold">{formatCurrency(preview.overheadCosts)}</p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Custo Total</p>
                            <p className="text-lg font-semibold" data-testid="text-custo-total">
                              {formatCurrency(preview.totalCost)}
                            </p>
                          </div>
                        </div>

                        <div className="border-t pt-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Preço Total</p>
                              <p className="text-2xl font-bold text-primary" data-testid="text-preco-total">
                                {formatCurrency(preview.totalPrice)}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Margem</p>
                              <p className="text-2xl font-bold text-green-600" data-testid="text-margem">
                                {formatCurrency(preview.margin)} ({preview.marginPercentage.toFixed(1)}%)
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setCurrentStep("2")}
                        className="flex-1"
                      >
                        Voltar
                      </Button>
                      <Button
                        type="submit"
                        className="flex-1"
                        disabled={createQuoteMutation.isPending}
                        data-testid="button-criar-orcamento"
                      >
                        {createQuoteMutation.isPending ? "A criar..." : "Criar Orçamento"}
                      </Button>
                    </div>
                  </TabsContent>
                </Tabs>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="review">Em Revisão</SelectItem>
                  <SelectItem value="approved">Aprovado</SelectItem>
                  <SelectItem value="sent">Enviado</SelectItem>
                  <SelectItem value="accepted">Aceite</SelectItem>
                  <SelectItem value="rejected">Rejeitado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Cliente</Label>
              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quotes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Orçamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {quotesLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table data-testid="table-orcamentos">
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">Margem (%)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-24">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes && quotes.length > 0 ? (
                  quotes.map((quote) => (
                    <TableRow key={quote.id} data-testid={`row-quote-${quote.id}`}>
                      <TableCell className="font-medium">{quote.quoteNumber}</TableCell>
                      <TableCell>{quote.title}</TableCell>
                      <TableCell>{quote.clientId || "-"}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(quote.totalPrice)}
                      </TableCell>
                      <TableCell className="text-right">
                        {parseFloat(quote.marginPercentage || '0').toFixed(1)}%
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(quote.status)}>
                          {getStatusLabel(quote.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(quote.createdAt)}</TableCell>
                      <TableCell>
                        <Link href={`/financeiro/orcamentos/${quote.id}`}>
                          <Button variant="ghost" size="sm" data-testid={`button-editar-${quote.id}`}>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver/Editar
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Nenhum orçamento encontrado
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

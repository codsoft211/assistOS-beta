import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, Euro } from "lucide-react";

// Schema de validação
const rateCardFormSchema = z.object({
  roleName: z.string().min(1, "Role é obrigatório"),
  department: z.string().optional(),
  seniorityLevel: z.string().optional(),
  costRate: z.string().min(1, "Custo é obrigatório"),
  billRate: z.string().min(1, "Taxa de cobrança é obrigatória"),
  effectiveFrom: z.string().min(1, "Data de início é obrigatória"),
  effectiveTo: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

type RateCardFormData = z.infer<typeof rateCardFormSchema>;

interface RateCard {
  id: string;
  roleName: string;
  department: string | null;
  seniorityLevel: string | null;
  costRate: string;
  billRate: string;
  marginPercentage: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RateCardsResponse {
  cards: RateCard[];
  kpis: {
    averageMargin: number;
    highestRate: number;
    lowestRate: number;
  };
}

const formatCurrency = (value: number | string) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(typeof value === "string" ? parseFloat(value) : value);
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return "-";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pt-PT").format(date);
};

export default function FinanceiroRateCards() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRateCard, setEditingRateCard] = useState<RateCard | null>(null);
  const [filterActive, setFilterActive] = useState<string>("all");
  const [filterDepartment, setFilterDepartment] = useState<string>("all");
  const [previewMargin, setPreviewMargin] = useState<number | null>(null);

  const { data, isLoading } = useQuery<RateCardsResponse>({
    queryKey: ["/api/financeiro/rate-cards", filterActive, filterDepartment],
    queryFn: async ({ queryKey }) => {
      const [url, active, dept] = queryKey;
      const params = new URLSearchParams();
      if (active !== "all") params.append("isActive", active);
      if (dept !== "all") params.append("department", dept);
      const response = await fetch(`${url}?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch");
      return response.json();
    },
  });

  const form = useForm<RateCardFormData>({
    resolver: zodResolver(rateCardFormSchema),
    defaultValues: {
      roleName: "",
      department: "",
      seniorityLevel: "",
      costRate: "",
      billRate: "",
      effectiveFrom: new Date().toISOString().split("T")[0],
      effectiveTo: "",
      notes: "",
      isActive: true,
    },
  });

  // Watch form values to calculate margin preview
  const costRate = form.watch("costRate");
  const billRate = form.watch("billRate");

  useEffect(() => {
    if (costRate && billRate) {
      const cost = parseFloat(costRate);
      const bill = parseFloat(billRate);
      if (cost > 0 && bill > 0) {
        const margin = ((bill - cost) / cost) * 100;
        setPreviewMargin(margin);
      } else {
        setPreviewMargin(null);
      }
    } else {
      setPreviewMargin(null);
    }
  }, [costRate, billRate]);

  const createMutation = useMutation({
    mutationFn: async (data: RateCardFormData) => {
      return apiRequest("POST", "/api/financeiro/rate-cards", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/rate-cards"] });
      toast({
        title: "Sucesso",
        description: "Taxa criada com sucesso",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao criar taxa",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: RateCardFormData }) => {
      return apiRequest("PATCH", `/api/financeiro/rate-cards/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/rate-cards"] });
      toast({
        title: "Sucesso",
        description: "Taxa atualizada com sucesso",
      });
      setIsDialogOpen(false);
      setEditingRateCard(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao atualizar taxa",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/financeiro/rate-cards/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/rate-cards"] });
      toast({
        title: "Sucesso",
        description: "Taxa eliminada com sucesso",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Erro ao eliminar taxa",
        variant: "destructive",
      });
    },
  });

  const handleOpenDialog = (rateCard?: RateCard) => {
    if (rateCard) {
      setEditingRateCard(rateCard);
      form.reset({
        roleName: rateCard.roleName,
        department: rateCard.department || "",
        seniorityLevel: rateCard.seniorityLevel || "",
        costRate: rateCard.costRate,
        billRate: rateCard.billRate,
        effectiveFrom: rateCard.effectiveFrom ? new Date(rateCard.effectiveFrom).toISOString().split("T")[0] : "",
        effectiveTo: rateCard.effectiveTo ? new Date(rateCard.effectiveTo).toISOString().split("T")[0] : "",
        notes: rateCard.notes || "",
        isActive: rateCard.isActive,
      });
    } else {
      setEditingRateCard(null);
      form.reset();
    }
    setIsDialogOpen(true);
  };

  const handleSubmit = (data: RateCardFormData) => {
    if (editingRateCard) {
      updateMutation.mutate({ id: editingRateCard.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  // Get unique departments for filter
  const departments = data?.cards
    ? Array.from(new Set(data.cards.map(c => c.department).filter(Boolean)))
    : [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const kpis = data?.kpis || { averageMargin: 0, highestRate: 0, lowestRate: 0 };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-1">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Tabela de Taxas Horárias</h1>
          <p className="text-muted-foreground">Gerir taxas de custo e cobrança por role</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleOpenDialog()} data-testid="button-new-rate-card">
              <Plus className="h-4 w-4 mr-2" />
              Nova Taxa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="dialog-rate-card-form">
            <DialogHeader>
              <DialogTitle>
                {editingRateCard ? "Editar Taxa" : "Nova Taxa"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="roleName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role / Função</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-role-name" placeholder="Ex: Developer, Designer, PM" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Departamento (opcional)</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-department" placeholder="Ex: Engineering, Design" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="seniorityLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senioridade (opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-seniority">
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">-</SelectItem>
                            <SelectItem value="Junior">Junior</SelectItem>
                            <SelectItem value="Mid">Mid</SelectItem>
                            <SelectItem value="Senior">Senior</SelectItem>
                            <SelectItem value="Lead">Lead</SelectItem>
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
                    name="costRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custo Interno (€/h)</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-cost-rate" type="number" step="0.01" placeholder="25.00" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="billRate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Taxa de Cobrança (€/h)</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-bill-rate" type="number" step="0.01" placeholder="60.00" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {previewMargin !== null && (
                  <Card className="border-dashed">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-2">
                          {previewMargin >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                          <span className="text-sm font-medium">Margem Prevista:</span>
                        </div>
                        <span className={`text-lg font-bold ${previewMargin >= 0 ? 'text-green-600' : 'text-red-600'}`} data-testid="text-margin-preview">
                          {previewMargin.toFixed(2)}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="effectiveFrom"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vigência Desde</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-effective-from" type="date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="effectiveTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vigência Até (opcional)</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-effective-to" type="date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas (opcional)</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-notes" placeholder="Notas adicionais" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="isActive"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between gap-1 rounded-lg border p-4">
                      <div>
                        <FormLabel>Ativa</FormLabel>
                        <p className="text-sm text-muted-foreground">
                          Taxa disponível para uso
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="switch-active"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsDialogOpen(false);
                      setEditingRateCard(null);
                      form.reset();
                    }}
                    data-testid="button-cancel"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-submit"
                  >
                    {editingRateCard ? "Atualizar" : "Criar"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="card-kpi-avg-margin">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margem Média</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-avg-margin">
              {kpis.averageMargin.toFixed(2)}%
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-kpi-highest-rate">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa Mais Alta</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-highest-rate">
              {formatCurrency(kpis.highestRate)}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-kpi-lowest-rate">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Taxa Mais Baixa</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-lowest-rate">
              {formatCurrency(kpis.lowestRate)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <div className="w-48">
              <Select value={filterActive} onValueChange={setFilterActive}>
                <SelectTrigger data-testid="select-filter-active">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Ativas</SelectItem>
                  <SelectItem value="false">Inativas</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {departments.length > 0 && (
              <div className="w-48">
                <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                  <SelectTrigger data-testid="select-filter-department">
                    <SelectValue placeholder="Departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept} value={dept as string}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card data-testid="card-rate-cards-list">
        <CardHeader>
          <CardTitle>Lista de Taxas</CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="table-rate-cards">
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Departamento</TableHead>
                <TableHead>Senioridade</TableHead>
                <TableHead className="text-right">Custo (€/h)</TableHead>
                <TableHead className="text-right">Cobrança (€/h)</TableHead>
                <TableHead className="text-right">Margem (%)</TableHead>
                <TableHead>Vigência</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.cards && data.cards.length > 0 ? (
                data.cards.map((rateCard) => {
                  const margin = rateCard.marginPercentage ? parseFloat(rateCard.marginPercentage) : 0;
                  return (
                    <TableRow key={rateCard.id} data-testid={`row-rate-card-${rateCard.id}`}>
                      <TableCell className="font-medium" data-testid={`text-role-${rateCard.id}`}>
                        {rateCard.roleName}
                      </TableCell>
                      <TableCell data-testid={`text-department-${rateCard.id}`}>
                        {rateCard.department || "-"}
                      </TableCell>
                      <TableCell data-testid={`text-seniority-${rateCard.id}`}>
                        {rateCard.seniorityLevel || "-"}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-cost-${rateCard.id}`}>
                        {formatCurrency(rateCard.costRate)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-bill-${rateCard.id}`}>
                        {formatCurrency(rateCard.billRate)}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={`font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}
                          data-testid={`text-margin-${rateCard.id}`}
                        >
                          {margin.toFixed(2)}%
                        </span>
                      </TableCell>
                      <TableCell data-testid={`text-effective-${rateCard.id}`}>
                        <div className="text-sm">
                          <div>{formatDate(rateCard.effectiveFrom)}</div>
                          {rateCard.effectiveTo && (
                            <div className="text-muted-foreground">até {formatDate(rateCard.effectiveTo)}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={rateCard.isActive ? "default" : "secondary"} data-testid={`badge-active-${rateCard.id}`}>
                          {rateCard.isActive ? "Ativa" : "Inativa"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenDialog(rateCard)}
                            data-testid={`button-edit-${rateCard.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                data-testid={`button-delete-${rateCard.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Confirmar eliminação</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem a certeza que deseja eliminar a taxa "{rateCard.roleName}"?
                                  Esta ação não pode ser revertida.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid={`button-cancel-delete-${rateCard.id}`}>
                                  Cancelar
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(rateCard.id)}
                                  data-testid={`button-confirm-delete-${rateCard.id}`}
                                >
                                  Eliminar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Nenhuma taxa encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

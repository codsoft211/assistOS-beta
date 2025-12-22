import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Power, PowerOff } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RuleConditionsEditor } from "@/components/RuleConditionsEditor";
import { RuleActionsEditor } from "@/components/RuleActionsEditor";

const clientInactiveConditionsSchema = z.object({
  daysInactive: z.number().min(1, "Dias de inatividade deve ser maior que 0"),
  minLifetimeValue: z.number().min(0, "Valor deve ser maior ou igual a 0"),
});

const productRecurringConditionsSchema = z.object({
  productName: z.string().min(1, "Nome do produto é obrigatório"),
  expectedFrequencyDays: z.number().min(1, "Frequência deve ser maior que 0"),
  gracePeriodDays: z.number().min(1, "Período de tolerância deve ser maior que 0"),
});

const crossSellConditionsSchema = z.object({
  boughtProduct: z.string().min(1, "Produto comprado é obrigatório"),
  suggestedProduct: z.string().min(1, "Produto sugerido é obrigatório"),
  minOrders: z.number().min(1, "Número mínimo de compras deve ser maior que 0"),
});

const upsellConditionsSchema = z.object({
  minLifetimeValue: z.number().min(0, "Valor mínimo deve ser maior ou igual a 0"),
  maxLifetimeValue: z.number().min(0, "Valor máximo deve ser maior ou igual a 0"),
  minOrders: z.number().min(1, "Número mínimo de encomendas deve ser maior que 0"),
});

const churnRiskConditionsSchema = z.object({
  comparisonMonths: z.number().min(1, "Meses para comparação deve ser maior que 0"),
  minDecreasePercent: z.number().min(1, "Percentagem deve ser entre 1 e 100").max(100, "Percentagem deve ser entre 1 e 100"),
});

const ruleSchema = z.object({
  name: z.string().min(1, "Nome obrigatório"),
  description: z.string().optional(),
  trigger: z.enum(['client_inactive', 'product_recurring', 'cross_sell', 'upsell', 'churn_risk']),
  conditions: z.union([
    clientInactiveConditionsSchema,
    productRecurringConditionsSchema,
    crossSellConditionsSchema,
    upsellConditionsSchema,
    churnRiskConditionsSchema,
  ]),
  action: z.object({
    opportunityType: z.string().min(1, "Tipo de oportunidade é obrigatório"),
    opportunityPriority: z.enum(['low', 'medium', 'high'])
  }),
  isActive: z.boolean().default(true),
});

const getDefaultConditions = (triggerType: string): any => {
  switch (triggerType) {
    case 'client_inactive':
      return { daysInactive: 90, minLifetimeValue: 1000 };
    case 'product_recurring':
      return { productName: '', expectedFrequencyDays: 30, gracePeriodDays: 45 };
    case 'cross_sell':
      return { boughtProduct: '', suggestedProduct: '', minOrders: 3 };
    case 'upsell':
      return { minLifetimeValue: 5000, maxLifetimeValue: 20000, minOrders: 5 };
    case 'churn_risk':
      return { comparisonMonths: 3, minDecreasePercent: 30 };
    default:
      return {};
  }
};

type RuleFormData = z.infer<typeof ruleSchema>;

interface OpportunityRule {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  isActive: boolean;
  conditions: any;
  actions: any;
  createdAt: string;
  updatedAt: string;
}

const triggerLabels: Record<string, string> = {
  'client_inactive': 'Cliente Inativo (30+ dias)',
  'product_recurring': 'Produto Recorrente',
  'cross_sell': 'Cross-Sell',
  'upsell': 'Upselling',
  'churn_risk': 'Risco de Churn'
};

const triggerDescriptions: Record<string, string> = {
  'client_inactive': 'Cria oportunidade para clientes sem atividade há mais de 30 dias',
  'product_recurring': 'Identifica produtos recorrentes que precisam renovação',
  'cross_sell': 'Sugere produtos complementares baseado no histórico de compras',
  'upsell': 'Identifica oportunidades de upgrade para clientes elegíveis',
  'churn_risk': 'Detecta clientes com risco de churn (valor decrescente)'
};

export default function CrmRules() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<OpportunityRule | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<string | null>(null);

  // Fetch rules
  const { data, isLoading } = useQuery<{ rules: OpportunityRule[]; total: number }>({
    queryKey: ['/api/crm/rules'],
  });

  // Form
  const form = useForm<RuleFormData>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: "",
      description: "",
      trigger: "client_inactive",
      conditions: getDefaultConditions("client_inactive"),
      action: {
        opportunityType: "",
        opportunityPriority: "medium"
      },
      isActive: true,
    },
  });

  // Watch trigger changes and update conditions defaults
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === 'trigger' && value.trigger) {
        const newDefaults = getDefaultConditions(value.trigger);
        form.setValue('conditions', newDefaults);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: RuleFormData) =>
      apiRequest('/api/crm/rules', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/rules'] });
      toast({
        title: "Regra criada!",
        description: "A regra foi criada com sucesso.",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar regra",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RuleFormData> }) =>
      apiRequest(`/api/crm/rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/rules'] });
      toast({
        title: "Regra atualizada!",
        description: "A regra foi atualizada com sucesso.",
      });
      setIsDialogOpen(false);
      setEditingRule(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar regra",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest(`/api/crm/rules/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/rules'] });
      toast({
        title: "Regra removida!",
        description: "A regra foi removida com sucesso.",
      });
      setDeleteDialogOpen(false);
      setRuleToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao remover regra",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest(`/api/crm/rules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/rules'] });
      toast({
        title: "Status atualizado!",
        description: "O status da regra foi atualizado.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreate = () => {
    setEditingRule(null);
    form.reset({
      name: "",
      description: "",
      trigger: "client_inactive",
      conditions: getDefaultConditions("client_inactive"),
      action: {
        opportunityType: "",
        opportunityPriority: "medium"
      },
      isActive: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (rule: OpportunityRule) => {
    setEditingRule(rule);
    form.reset({
      name: rule.name,
      description: rule.description || "",
      trigger: rule.trigger as any,
      conditions: rule.conditions || {},
      action: rule.actions || { opportunityType: "", opportunityPriority: "medium" },
      isActive: rule.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setRuleToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (ruleToDelete) {
      deleteMutation.mutate(ruleToDelete);
    }
  };

  const onSubmit = (data: RuleFormData) => {
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const toggleActive = (id: string, currentStatus: boolean) => {
    toggleActiveMutation.mutate({ id, isActive: !currentStatus });
  };

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="page-comercial-regras">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">
            Regras de Oportunidades
          </h1>
          <p className="text-muted-foreground mt-1" data-testid="text-page-description">
            Configure regras automáticas para criar oportunidades baseadas em comportamento
          </p>
        </div>
        <Button onClick={handleCreate} data-testid="button-nova-regra">
          <Plus className="mr-2 h-4 w-4" />
          Nova Regra
        </Button>
      </div>

      {/* Rules Table */}
      <Card>
        <CardHeader>
          <CardTitle data-testid="text-card-title">Regras Configuradas</CardTitle>
          <CardDescription data-testid="text-card-description">
            {data?.total || 0} regra(s) configurada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" data-testid="skeleton-table-row" />
              <Skeleton className="h-10 w-full" data-testid="skeleton-table-row" />
              <Skeleton className="h-10 w-full" data-testid="skeleton-table-row" />
            </div>
          ) : data?.rules.length === 0 ? (
            <div className="text-center py-12" data-testid="empty-state">
              <p className="text-muted-foreground">Nenhuma regra configurada</p>
              <Button variant="outline" className="mt-4" onClick={handleCreate} data-testid="button-criar-primeira-regra">
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeira Regra
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="header-nome">Nome</TableHead>
                  <TableHead data-testid="header-trigger">Trigger</TableHead>
                  <TableHead data-testid="header-status">Status</TableHead>
                  <TableHead className="text-right" data-testid="header-acoes">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rules.map((rule) => (
                  <TableRow key={rule.id} data-testid={`row-regra-${rule.id}`}>
                    <TableCell data-testid={`cell-nome-${rule.id}`}>
                      <div>
                        <div className="font-medium">{rule.name}</div>
                        {rule.description && (
                          <div className="text-sm text-muted-foreground">{rule.description}</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell data-testid={`cell-trigger-${rule.id}`}>
                      <div>
                        <div className="font-medium">{triggerLabels[rule.trigger] || rule.trigger}</div>
                        <div className="text-xs text-muted-foreground">
                          {triggerDescriptions[rule.trigger]}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell data-testid={`cell-status-${rule.id}`}>
                      <Badge
                        variant={rule.isActive ? "default" : "secondary"}
                        data-testid={`badge-status-${rule.id}`}
                      >
                        {rule.isActive ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => toggleActive(rule.id, rule.isActive)}
                          data-testid={`button-toggle-${rule.id}`}
                        >
                          {rule.isActive ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(rule)}
                          data-testid={`button-editar-${rule.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(rule.id)}
                          data-testid={`button-deletar-${rule.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-regra">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">
              {editingRule ? 'Editar Regra' : 'Nova Regra'}
            </DialogTitle>
            <DialogDescription data-testid="text-dialog-description">
              Configure uma regra automática para criar oportunidades
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Regra</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ex: Reativação de Clientes Inativos"
                        {...field}
                        data-testid="input-nome"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="trigger"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Trigger</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-trigger">
                          <SelectValue placeholder="Selecione o trigger" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(triggerLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value} data-testid={`option-trigger-${value}`}>
                            <div>
                              <div className="font-medium">{label}</div>
                              <div className="text-xs text-muted-foreground">
                                {triggerDescriptions[value]}
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Define quando a regra será executada
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Descreva o objetivo desta regra..."
                        {...field}
                        data-testid="textarea-descricao"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <h3 className="text-lg font-medium">Condições da Regra</h3>
                <p className="text-sm text-muted-foreground">
                  Configure as condições específicas para este tipo de regra
                </p>
                <div className="border rounded-lg p-4">
                  <FormField
                    control={form.control}
                    name="conditions"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RuleConditionsEditor
                            triggerType={form.watch("trigger")}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-medium">Ação da Regra</h3>
                <p className="text-sm text-muted-foreground">
                  Configure o que acontece quando a regra é ativada
                </p>
                <div className="border rounded-lg p-4">
                  <FormField
                    control={form.control}
                    name="action"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <RuleActionsEditor
                            value={field.value}
                            onChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Regra Ativa</FormLabel>
                      <FormDescription>
                        Ative ou desative a execução desta regra
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-ativa"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                  data-testid="button-cancelar"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-salvar"
                >
                  {editingRule ? 'Atualizar' : 'Criar'} Regra
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent data-testid="dialog-confirmar-delete">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-alert-title">Confirmar Remoção</AlertDialogTitle>
            <AlertDialogDescription data-testid="text-alert-description">
              Tem certeza que deseja remover esta regra? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancelar-delete">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              data-testid="button-confirmar-delete"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

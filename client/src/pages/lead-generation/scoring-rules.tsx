import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Play, Pause } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";

const ruleSchema = z.object({
  ruleName: z.string().min(1, "Nome obrigatório"),
  ruleType: z.enum(['demographic', 'behavior', 'engagement', 'firmographic']),
  condition: z.object({
    field: z.string().min(1),
    operator: z.enum(['equals', 'contains', 'exists', 'greater_than', 'less_than']),
    value: z.any().optional(),
  }),
  scoreValue: z.coerce.number().min(-100).max(100),
  isActive: z.boolean().optional(),
  priority: z.coerce.number().optional(),
  description: z.string().optional(),
});

type RuleForm = z.infer<typeof ruleSchema>;

export default function ScoringRulesPage() {
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const { toast } = useToast();

  const { data: rulesData } = useQuery({
    queryKey: ['/api/lead-generation/scoring-rules'],
  });

  const form = useForm<RuleForm>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      ruleName: '',
      ruleType: 'demographic',
      condition: {
        field: 'company',
        operator: 'exists',
        value: '',
      },
      scoreValue: 10,
      isActive: true,
      priority: 0,
      description: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: RuleForm) =>
      apiRequest('POST', '/api/lead-generation/scoring-rules', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/scoring-rules'] });
      toast({ title: "Regra criada com sucesso" });
      form.reset();
      setShowDialog(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<RuleForm> }) =>
      apiRequest('PATCH', `/api/lead-generation/scoring-rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/scoring-rules'] });
      toast({ title: "Regra atualizada" });
      setEditingRule(null);
      setShowDialog(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest('DELETE', `/api/lead-generation/scoring-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/scoring-rules'] });
      toast({ title: "Regra eliminada" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest('PATCH', `/api/lead-generation/scoring-rules/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/scoring-rules'] });
    },
  });

  const rules = rulesData?.rules || [];

  const onSubmit = (data: RuleForm) => {
    if (editingRule) {
      updateMutation.mutate({ id: editingRule.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (rule: any) => {
    setEditingRule(rule);
    form.reset({
      ruleName: rule.ruleName,
      ruleType: rule.ruleType,
      condition: rule.condition || { field: 'company', operator: 'exists', value: '' },
      scoreValue: rule.scoreValue,
      isActive: rule.isActive,
      priority: rule.priority || 0,
      description: rule.description || '',
    });
    setShowDialog(true);
  };

  const handleNew = () => {
    setEditingRule(null);
    form.reset();
    setShowDialog(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Regras de Scoring</h1>
          <p className="text-muted-foreground">Configure regras automáticas de pontuação de leads</p>
        </div>
        <Button onClick={handleNew} data-testid="button-add-rule">
          <Plus className="h-4 w-4 mr-2" />
          Nova Regra
        </Button>
      </div>

      <Card data-testid="card-rules-table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Regra</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Condição</TableHead>
              <TableHead>Pontos</TableHead>
              <TableHead>Prioridade</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Nenhuma regra configurada
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule: any) => (
                <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                  <TableCell className="font-medium">
                    {rule.ruleName}
                    {rule.description && (
                      <p className="text-xs text-muted-foreground mt-1">{rule.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="capitalize">
                    {rule.ruleType}
                  </TableCell>
                  <TableCell className="text-sm">
                    {rule.condition && (
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {rule.condition.field} {rule.condition.operator} {rule.condition.value || ''}
                      </code>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={rule.scoreValue > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {rule.scoreValue > 0 ? '+' : ''}{rule.scoreValue}
                    </span>
                  </TableCell>
                  <TableCell>{rule.priority || 0}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleActiveMutation.mutate({ id: rule.id, isActive: !rule.isActive })}
                      data-testid={`button-toggle-${rule.id}`}
                    >
                      {rule.isActive ? (
                        <Badge variant="default" className="gap-1">
                          <Play className="h-3 w-3" />
                          Ativa
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Pause className="h-3 w-3" />
                          Inativa
                        </Badge>
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(rule)}
                      data-testid={`button-edit-${rule.id}`}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(rule.id)}
                      disabled={deleteMutation.isPending}
                      data-testid={`button-delete-${rule.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl" data-testid="dialog-rule-form">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Editar Regra' : 'Nova Regra'}</DialogTitle>
            <DialogDescription>
              Configure uma regra automática de pontuação
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="ruleName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da Regra *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Ex: Empresa preenchida" data-testid="input-ruleName" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="ruleType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-ruleType">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="demographic">Demográfico</SelectItem>
                          <SelectItem value="behavior">Comportamento</SelectItem>
                          <SelectItem value="engagement">Envolvimento</SelectItem>
                          <SelectItem value="firmographic">Firmográfico</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scoreValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pontos *</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="+10 ou -5" data-testid="input-scoreValue" />
                      </FormControl>
                      <FormDescription>
                        Entre -100 e +100
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Condição *</label>
                <div className="grid gap-2 md:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="condition.field"
                    render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-condition-field">
                              <SelectValue placeholder="Campo" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="company">Empresa</SelectItem>
                            <SelectItem value="phone">Telefone</SelectItem>
                            <SelectItem value="nif">NIF</SelectItem>
                            <SelectItem value="leadSource">Fonte</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="condition.operator"
                    render={({ field }) => (
                      <FormItem>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-condition-operator">
                              <SelectValue placeholder="Operador" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="exists">Existe</SelectItem>
                            <SelectItem value="equals">Igual a</SelectItem>
                            <SelectItem value="contains">Contém</SelectItem>
                            <SelectItem value="greater_than">Maior que</SelectItem>
                            <SelectItem value="less_than">Menor que</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="condition.value"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input {...field} placeholder="Valor (opcional)" data-testid="input-condition-value" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prioridade</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" placeholder="0" data-testid="input-priority" />
                    </FormControl>
                    <FormDescription>
                      Ordem de execução (maior = executada primeiro)
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
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} data-testid="textarea-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Ativa</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Regra será aplicada automaticamente
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-isActive"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDialog(false)}
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-submit"
                >
                  {editingRule ? 'Atualizar' : 'Criar'}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const contaBancariaSchema = z.object({
  nomeConta: z.string().min(1, "Nome da conta obrigatório"),
  nomeBanco: z.string().min(1, "Nome do banco obrigatório"),
  numeroConta: z.string().min(1, "Número da conta obrigatório"),
  iban: z.string().regex(/^PT50[0-9]{21}$/, "IBAN inválido (formato: PT50 seguido de 21 dígitos)"),
  swift: z.string().optional(),
  moeda: z.string().default("EUR"),
  tipoConta: z.enum(["Ordem", "Poupança"]),
  saldoInicial: z.number().min(0, "Saldo deve ser positivo"),
  ativa: z.boolean().default(true),
});

type ContaBancariaFormData = z.infer<typeof contaBancariaSchema>;

interface ContaBancaria {
  id: string;
  nomeConta: string;
  nomeBanco: string;
  iban: string;
  saldoAtual: number;
  moeda: string;
  ativa: boolean;
  tipoConta: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
};

const ocultarIBAN = (iban: string) => {
  if (iban.length < 8) return iban;
  return iban.substring(0, 4) + "****" + "****" + "****" + iban.substring(iban.length - 4);
};

export default function FinanceiroContasBancarias() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editandoConta, setEditandoConta] = useState<ContaBancaria | null>(null);
  const [mostrarIBANs, setMostrarIBANs] = useState<Record<string, boolean>>({});

  const { data: contas, isLoading } = useQuery<ContaBancaria[]>({
    queryKey: ["/api/financeiro/contas-bancarias"],
  });

  const form = useForm<ContaBancariaFormData>({
    resolver: zodResolver(contaBancariaSchema),
    defaultValues: {
      nomeConta: "",
      nomeBanco: "",
      numeroConta: "",
      iban: "",
      swift: "",
      moeda: "EUR",
      tipoConta: "Ordem",
      saldoInicial: 0,
      ativa: true,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ContaBancariaFormData) => {
      return await apiRequest("POST", "/api/financeiro/contas-bancarias", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/contas-bancarias"] });
      toast({ title: "Conta bancária criada com sucesso" });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar conta bancária", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ContaBancariaFormData }) => {
      return await apiRequest("PATCH", `/api/financeiro/contas-bancarias/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/contas-bancarias"] });
      toast({ title: "Conta bancária atualizada" });
      setDialogOpen(false);
      setEditandoConta(null);
      form.reset();
    },
  });

  const toggleAtivaMutation = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      return await apiRequest("PATCH", `/api/financeiro/contas-bancarias/${id}/toggle`, { ativa });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/contas-bancarias"] });
      toast({ title: "Estado da conta atualizado" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/financeiro/contas-bancarias/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/contas-bancarias"] });
      toast({ title: "Conta bancária eliminada" });
    },
  });

  const onSubmit = (data: ContaBancariaFormData) => {
    if (editandoConta) {
      updateMutation.mutate({ id: editandoConta.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (conta: ContaBancaria) => {
    setEditandoConta(conta);
    form.reset({
      nomeConta: conta.nomeConta,
      nomeBanco: conta.nomeBanco,
      numeroConta: "",
      iban: conta.iban,
      swift: "",
      moeda: conta.moeda,
      tipoConta: conta.tipoConta as "Ordem" | "Poupança",
      saldoInicial: conta.saldoAtual,
      ativa: conta.ativa,
    });
    setDialogOpen(true);
  };

  const handleNovaConta = () => {
    setEditandoConta(null);
    form.reset();
    setDialogOpen(true);
  };

  const toggleMostrarIBAN = (id: string) => {
    setMostrarIBANs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Contas Bancárias</h1>
          <p className="text-muted-foreground">Gestão de contas e movimentos bancários</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNovaConta} data-testid="button-nova-conta">
              <Plus className="h-4 w-4 mr-2" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="dialog-conta-bancaria">
            <DialogHeader>
              <DialogTitle>{editandoConta ? "Editar Conta" : "Nova Conta Bancária"}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="nomeConta"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome da Conta</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Conta Principal" {...field} data-testid="input-nome-conta" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nomeBanco"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Banco</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: Millennium BCP" {...field} data-testid="input-nome-banco" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="numeroConta"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número da Conta</FormLabel>
                        <FormControl>
                          <Input placeholder="00000000000" {...field} data-testid="input-numero-conta" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="iban"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>IBAN</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="PT50000000000000000000000"
                            {...field}
                            data-testid="input-iban"
                            maxLength={25}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="swift"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>SWIFT/BIC (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="BCOMPTPL" {...field} data-testid="input-swift" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="moeda"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Moeda</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-moeda">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="EUR">EUR (€)</SelectItem>
                            <SelectItem value="USD">USD ($)</SelectItem>
                            <SelectItem value="GBP">GBP (£)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="tipoConta"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Conta</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-tipo-conta">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Ordem">Conta à Ordem</SelectItem>
                            <SelectItem value="Poupança">Conta Poupança</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="saldoInicial"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Saldo Inicial (€)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            data-testid="input-saldo-inicial"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="ativa"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Conta Ativa</FormLabel>
                        <div className="text-sm text-muted-foreground">
                          Permite movimentos e operações nesta conta
                        </div>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-ativa" />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setDialogOpen(false);
                      setEditandoConta(null);
                    }}
                    data-testid="button-cancelar"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-guardar"
                  >
                    {createMutation.isPending || updateMutation.isPending ? "A guardar..." : "Guardar Conta"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {contas && contas.length > 0 ? (
            contas.map((conta) => (
              <Card key={conta.id} data-testid={`card-conta-${conta.id}`} className={!conta.ativa ? "opacity-60" : ""}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-1">
                    <span>{conta.nomeConta}</span>
                    <span
                      className={`text-xs px-2 py-1 rounded-md ${
                        conta.ativa ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                      }`}
                    >
                      {conta.ativa ? "Ativa" : "Inativa"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Banco</p>
                    <p className="font-medium" data-testid={`text-banco-${conta.id}`}>{conta.nomeBanco}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">IBAN</p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm" data-testid={`text-iban-${conta.id}`}>
                        {mostrarIBANs[conta.id] ? conta.iban : ocultarIBAN(conta.iban)}
                      </p>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => toggleMostrarIBAN(conta.id)}
                        data-testid={`button-toggle-iban-${conta.id}`}
                      >
                        {mostrarIBANs[conta.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Saldo Atual</p>
                    <p className="text-2xl font-bold" data-testid={`text-saldo-${conta.id}`}>{formatCurrency(conta.saldoAtual)}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Moeda</p>
                      <p className="font-medium" data-testid={`text-moeda-${conta.id}`}>{conta.moeda}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Tipo</p>
                      <p className="font-medium" data-testid={`text-tipo-${conta.id}`}>{conta.tipoConta}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleEdit(conta)}
                      data-testid={`button-editar-${conta.id}`}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => toggleAtivaMutation.mutate({ id: conta.id, ativa: !conta.ativa })}
                      data-testid={`button-toggle-ativa-${conta.id}`}
                    >
                      {conta.ativa ? "Desativar" : "Ativar"}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => deleteMutation.mutate(conta.id)}
                      data-testid={`button-eliminar-${conta.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="col-span-full">
              <CardContent className="py-12 text-center text-muted-foreground">
                Sem contas bancárias registadas
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Eye, Edit, Mail, Check, Trash2, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const linhaFaturaSchema = z.object({
  descricao: z.string().min(1, "Descrição obrigatória"),
  quantidade: z.number().min(0.01, "Quantidade deve ser maior que 0"),
  precoUnitario: z.number().min(0, "Preço deve ser positivo"),
  taxaIVA: z.number().min(0).max(100),
});

const faturaSchema = z.object({
  clienteId: z.string().min(1, "Cliente obrigatório"),
  dataEmissao: z.string().min(1, "Data emissão obrigatória"),
  dataVencimento: z.string().min(1, "Data vencimento obrigatória"),
  linhas: z.array(linhaFaturaSchema).min(1, "Adicione pelo menos uma linha"),
  notas: z.string().optional(),
});

type FaturaFormData = z.infer<typeof faturaSchema>;

interface Fatura {
  id: string;
  numero: string;
  cliente: string;
  clienteId: string;
  dataEmissao: string;
  dataVencimento: string;
  valorTotal: number;
  iva: number;
  estado: "Rascunho" | "Emitida" | "Paga" | "Vencida";
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pt-PT").format(date);
};

export default function FinanceiroFaturacao() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clienteFilter, setClienteFilter] = useState<string>("");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");

  const { data: faturas, isLoading } = useQuery<Fatura[]>({
    queryKey: ["/api/financeiro/faturas", { status: statusFilter, cliente: clienteFilter, dataInicio, dataFim }],
  });

  const { data: clientes } = useQuery<Array<{ id: string; nome: string }>>({
    queryKey: ["/api/financeiro/clientes"],
  });

  const form = useForm<FaturaFormData>({
    resolver: zodResolver(faturaSchema),
    defaultValues: {
      clienteId: "",
      dataEmissao: new Date().toISOString().split("T")[0],
      dataVencimento: "",
      linhas: [{ descricao: "", quantidade: 1, precoUnitario: 0, taxaIVA: 23 }],
      notas: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "linhas",
  });

  const createMutation = useMutation({
    mutationFn: async (data: FaturaFormData) => {
      return await apiRequest("POST", "/api/financeiro/faturas", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/faturas"] });
      toast({ title: "Fatura criada com sucesso" });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar fatura", variant: "destructive" });
    },
  });

  const marcarPagaMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/financeiro/faturas/${id}/marcar-paga`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/faturas"] });
      toast({ title: "Fatura marcada como paga" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/financeiro/faturas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/faturas"] });
      toast({ title: "Fatura eliminada" });
    },
  });

  const calcularTotais = () => {
    const linhas = form.watch("linhas");
    const subtotal = linhas.reduce((acc, linha) => acc + (linha.quantidade * linha.precoUnitario), 0);
    const totalIVA = linhas.reduce((acc, linha) => {
      const valorLinha = linha.quantidade * linha.precoUnitario;
      return acc + (valorLinha * linha.taxaIVA / 100);
    }, 0);
    const total = subtotal + totalIVA;
    return { subtotal, totalIVA, total };
  };

  const onSubmit = (data: FaturaFormData) => {
    createMutation.mutate(data);
  };

  const totais = calcularTotais();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Faturação</h1>
          <p className="text-muted-foreground">Gestão de faturas e documentos fiscais</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-nova-fatura">
              <Plus className="h-4 w-4 mr-2" />
              Nova Fatura
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-nova-fatura">
            <DialogHeader>
              <DialogTitle>Nova Fatura</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="clienteId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cliente</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-cliente">
                              <SelectValue placeholder="Selecionar cliente" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {clientes?.map((cliente) => (
                              <SelectItem key={cliente.id} value={cliente.id}>
                                {cliente.nome}
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
                    name="dataEmissao"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Emissão</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-data-emissao" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dataVencimento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Vencimento</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-data-vencimento" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <FormLabel>Linhas da Fatura</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ descricao: "", quantidade: 1, precoUnitario: 0, taxaIVA: 23 })}
                      data-testid="button-adicionar-linha"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar Linha
                    </Button>
                  </div>
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-start border p-2 rounded-md">
                      <div className="col-span-5">
                        <FormField
                          control={form.control}
                          name={`linhas.${index}.descricao`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input placeholder="Descrição" {...field} data-testid={`input-linha-descricao-${index}`} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name={`linhas.${index}.quantidade`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="Qtd"
                                  {...field}
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  data-testid={`input-linha-quantidade-${index}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name={`linhas.${index}.precoUnitario`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  placeholder="Preço"
                                  {...field}
                                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                  data-testid={`input-linha-preco-${index}`}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-2">
                        <FormField
                          control={form.control}
                          name={`linhas.${index}.taxaIVA`}
                          render={({ field }) => (
                            <FormItem>
                              <Select onValueChange={(v) => field.onChange(parseFloat(v))} value={field.value.toString()}>
                                <FormControl>
                                  <SelectTrigger data-testid={`select-linha-iva-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="6">6%</SelectItem>
                                  <SelectItem value="13">13%</SelectItem>
                                  <SelectItem value="23">23%</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-1 flex items-center justify-center">
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            data-testid={`button-remover-linha-${index}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-muted p-4 rounded-md space-y-2">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-medium" data-testid="text-subtotal">{formatCurrency(totais.subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>IVA:</span>
                    <span className="font-medium" data-testid="text-iva">{formatCurrency(totais.totalIVA)}</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span data-testid="text-total">{formatCurrency(totais.total)}</span>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="notas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Observações adicionais..." {...field} data-testid="input-notas" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancelar">
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-guardar-fatura">
                    {createMutation.isPending ? "A guardar..." : "Guardar Fatura"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card data-testid="card-filtros">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium">Estado</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Rascunho">Rascunho</SelectItem>
                  <SelectItem value="Emitida">Emitida</SelectItem>
                  <SelectItem value="Paga">Paga</SelectItem>
                  <SelectItem value="Vencida">Vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Cliente</label>
              <Input
                placeholder="Nome do cliente..."
                value={clienteFilter}
                onChange={(e) => setClienteFilter(e.target.value)}
                data-testid="filter-cliente"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Data Início</label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                data-testid="filter-data-inicio"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Data Fim</label>
              <Input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                data-testid="filter-data-fim"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-lista-faturas">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table data-testid="table-faturas">
              <TableHeader>
                <TableRow>
                  <TableHead>Nº Fatura</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Data Emissão</TableHead>
                  <TableHead>Data Vencimento</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">IVA</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {faturas && faturas.length > 0 ? (
                  faturas.map((fatura) => (
                    <TableRow key={fatura.id} data-testid={`row-fatura-${fatura.id}`}>
                      <TableCell className="font-medium" data-testid={`text-numero-${fatura.id}`}>{fatura.numero}</TableCell>
                      <TableCell data-testid={`text-cliente-${fatura.id}`}>{fatura.cliente}</TableCell>
                      <TableCell data-testid={`text-data-emissao-${fatura.id}`}>{formatDate(fatura.dataEmissao)}</TableCell>
                      <TableCell data-testid={`text-data-vencimento-${fatura.id}`}>{formatDate(fatura.dataVencimento)}</TableCell>
                      <TableCell className="text-right" data-testid={`text-valor-total-${fatura.id}`}>{formatCurrency(fatura.valorTotal)}</TableCell>
                      <TableCell className="text-right" data-testid={`text-iva-${fatura.id}`}>{formatCurrency(fatura.iva)}</TableCell>
                      <TableCell>
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${
                            fatura.estado === "Paga"
                              ? "bg-green-500/10 text-green-500"
                              : fatura.estado === "Vencida"
                              ? "bg-red-500/10 text-red-500"
                              : fatura.estado === "Emitida"
                              ? "bg-blue-500/10 text-blue-500"
                              : "bg-yellow-500/10 text-yellow-500"
                          }`}
                          data-testid={`text-estado-${fatura.id}`}
                        >
                          {fatura.estado}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" data-testid={`button-ver-${fatura.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" data-testid={`button-editar-${fatura.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" data-testid={`button-enviar-${fatura.id}`}>
                            <Mail className="h-4 w-4" />
                          </Button>
                          {fatura.estado !== "Paga" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => marcarPagaMutation.mutate(fatura.id)}
                              data-testid={`button-pagar-${fatura.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteMutation.mutate(fatura.id)}
                            data-testid={`button-eliminar-${fatura.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Sem faturas registadas
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

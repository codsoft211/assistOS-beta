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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const recebimentoSchema = z.object({
  clienteId: z.string().min(1, "Cliente obrigatório"),
  faturaId: z.string().optional(),
  dataRecebimento: z.string().min(1, "Data obrigatória"),
  valor: z.number().min(0.01, "Valor deve ser maior que 0"),
  metodoPagamento: z.enum(["MB", "Transferência", "Cheque", "Dinheiro", "MB Way"]),
  referencia: z.string().optional(),
  notas: z.string().optional(),
});

type RecebimentoFormData = z.infer<typeof recebimentoSchema>;

interface Recebimento {
  id: string;
  data: string;
  cliente: string;
  faturaAssociada: string | null;
  valor: number;
  metodoPagamento: string;
  referencia: string | null;
  notas: string | null;
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

export default function FinanceiroRecebimentos() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");
  const [metodoFilter, setMetodoFilter] = useState<string>("all");
  const [clienteFilter, setClienteFilter] = useState<string>("");

  const { data: recebimentos, isLoading } = useQuery<Recebimento[]>({
    queryKey: ["/api/financeiro/recebimentos", { dataInicio, dataFim, metodo: metodoFilter, cliente: clienteFilter }],
  });

  const { data: clientes } = useQuery<Array<{ id: string; nome: string }>>({
    queryKey: ["/api/financeiro/clientes"],
  });

  const { data: faturasAbertas } = useQuery<Array<{ id: string; numero: string; valor: number }>>({
    queryKey: ["/api/financeiro/faturas/abertas"],
  });

  const form = useForm<RecebimentoFormData>({
    resolver: zodResolver(recebimentoSchema),
    defaultValues: {
      clienteId: "",
      faturaId: "",
      dataRecebimento: new Date().toISOString().split("T")[0],
      valor: 0,
      metodoPagamento: "Transferência",
      referencia: "",
      notas: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: RecebimentoFormData) => {
      return await apiRequest("POST", "/api/financeiro/recebimentos", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/recebimentos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/faturas"] });
      toast({ title: "Recebimento registado com sucesso" });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao registar recebimento", variant: "destructive" });
    },
  });

  const onSubmit = (data: RecebimentoFormData) => {
    createMutation.mutate(data);
  };

  const clienteSelecionado = form.watch("clienteId");
  const faturasDoCliente = faturasAbertas?.filter(f => {
    return true;
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Recebimentos</h1>
          <p className="text-muted-foreground">Gestão de pagamentos recebidos</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-registar-recebimento">
              <Plus className="h-4 w-4 mr-2" />
              Registar Recebimento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl" data-testid="dialog-novo-recebimento">
            <DialogHeader>
              <DialogTitle>Novo Recebimento</DialogTitle>
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
                    name="faturaId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fatura Associada (opcional)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={!clienteSelecionado}>
                          <FormControl>
                            <SelectTrigger data-testid="select-fatura">
                              <SelectValue placeholder="Selecionar fatura" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {faturasDoCliente?.map((fatura) => (
                              <SelectItem key={fatura.id} value={fatura.id}>
                                {fatura.numero} - {formatCurrency(fatura.valor)}
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
                    name="dataRecebimento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data Recebimento</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-data-recebimento" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="valor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor (€)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                            data-testid="input-valor"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="metodoPagamento"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Método Pagamento</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-metodo-pagamento">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="MB">Multibanco (MB)</SelectItem>
                            <SelectItem value="Transferência">Transferência Bancária</SelectItem>
                            <SelectItem value="Cheque">Cheque</SelectItem>
                            <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                            <SelectItem value="MB Way">MB Way</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="referencia"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Referência</FormLabel>
                        <FormControl>
                          <Input placeholder="Nº cheque, referência MB..." {...field} data-testid="input-referencia" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-guardar">
                    {createMutation.isPending ? "A guardar..." : "Guardar Recebimento"}
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
            <div>
              <label className="text-sm font-medium">Método Pagamento</label>
              <Select value={metodoFilter} onValueChange={setMetodoFilter}>
                <SelectTrigger data-testid="filter-metodo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="MB">Multibanco</SelectItem>
                  <SelectItem value="Transferência">Transferência</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                  <SelectItem value="Dinheiro">Dinheiro</SelectItem>
                  <SelectItem value="MB Way">MB Way</SelectItem>
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
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-lista-recebimentos">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table data-testid="table-recebimentos">
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Fatura Associada</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Método Pagamento</TableHead>
                  <TableHead>Referência</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recebimentos && recebimentos.length > 0 ? (
                  recebimentos.map((recebimento) => (
                    <TableRow key={recebimento.id} data-testid={`row-recebimento-${recebimento.id}`}>
                      <TableCell data-testid={`text-data-${recebimento.id}`}>{formatDate(recebimento.data)}</TableCell>
                      <TableCell data-testid={`text-cliente-${recebimento.id}`}>{recebimento.cliente}</TableCell>
                      <TableCell data-testid={`text-fatura-${recebimento.id}`}>{recebimento.faturaAssociada || "-"}</TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-valor-${recebimento.id}`}>{formatCurrency(recebimento.valor)}</TableCell>
                      <TableCell data-testid={`text-metodo-${recebimento.id}`}>{recebimento.metodoPagamento}</TableCell>
                      <TableCell data-testid={`text-referencia-${recebimento.id}`}>{recebimento.referencia || "-"}</TableCell>
                      <TableCell className="max-w-xs truncate" data-testid={`text-notas-${recebimento.id}`}>{recebimento.notas || "-"}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Sem recebimentos registados
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

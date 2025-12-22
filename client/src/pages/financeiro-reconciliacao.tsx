import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface TransacaoBancaria {
  id: string;
  data: string;
  descricao: string;
  debito: number | null;
  credito: number | null;
  saldo: number;
  status: "matched" | "pending" | "manual";
  recebimentoId?: string;
}

interface Reconciliacao {
  id: string;
  data: string;
  conta: string;
  transacoesReconciliadas: number;
  saldoFinal: number;
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

export default function FinanceiroReconciliacao() {
  const { toast } = useToast();
  const [contaSelecionada, setContaSelecionada] = useState<string>("");
  const [arquivo, setArquivo] = useState<File | null>(null);

  const { data: contas } = useQuery<Array<{ id: string; nome: string }>>({
    queryKey: ["/api/financeiro/contas-bancarias"],
  });

  const { data: transacoes, isLoading: loadingTransacoes } = useQuery<TransacaoBancaria[]>({
    queryKey: ["/api/financeiro/reconciliacoes/transacoes", contaSelecionada],
    enabled: !!contaSelecionada,
  });

  const { data: historico } = useQuery<Reconciliacao[]>({
    queryKey: ["/api/financeiro/reconciliacoes/historico"],
  });

  const { data: recebimentosPendentes } = useQuery<Array<{ id: string; cliente: string; valor: number; data: string }>>({
    queryKey: ["/api/financeiro/recebimentos/pendentes"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/financeiro/reconciliacoes/upload", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        throw new Error(`${res.status}: ${await res.text()}`);
      }
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/reconciliacoes/transacoes"] });
      toast({ title: "Extrato carregado com sucesso" });
      setArquivo(null);
    },
    onError: () => {
      toast({ title: "Erro ao carregar extrato", variant: "destructive" });
    },
  });

  const matchingAutomaticoMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/financeiro/reconciliacoes/matching-automatico", { contaId: contaSelecionada });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/reconciliacoes/transacoes"] });
      toast({ title: "Matching automático concluído" });
    },
  });

  const confirmarReconciliacaoMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/financeiro/reconciliacoes/confirmar", { contaId: contaSelecionada });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/reconciliacoes"] });
      toast({ title: "Reconciliação confirmada com sucesso" });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setArquivo(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!arquivo || !contaSelecionada) {
      toast({ title: "Selecione uma conta e um arquivo", variant: "destructive" });
      return;
    }
    const formData = new FormData();
    formData.append("file", arquivo);
    formData.append("contaId", contaSelecionada);
    uploadMutation.mutate(formData);
  };

  const associarRecebimento = async (transacaoId: string, recebimentoId: string) => {
    try {
      await apiRequest("POST", "/api/financeiro/reconciliacoes/associar", { transacaoId, recebimentoId });
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/reconciliacoes/transacoes"] });
      toast({ title: "Associação realizada" });
    } catch {
      toast({ title: "Erro ao associar", variant: "destructive" });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Reconciliação Bancária</h1>
        <p className="text-muted-foreground">Conciliação de extratos bancários com recebimentos</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-upload-extrato">
          <CardHeader>
            <CardTitle>Carregar Extrato Bancário</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium">Conta Bancária</label>
              <Select value={contaSelecionada} onValueChange={setContaSelecionada}>
                <SelectTrigger data-testid="select-conta">
                  <SelectValue placeholder="Selecionar conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas?.map((conta) => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Arquivo (CSV/OFX)</label>
              <div className="flex gap-2 mt-2">
                <input
                  type="file"
                  accept=".csv,.ofx"
                  onChange={handleFileChange}
                  className="flex-1 text-sm"
                  data-testid="input-arquivo"
                />
                <Button
                  onClick={handleUpload}
                  disabled={!arquivo || !contaSelecionada || uploadMutation.isPending}
                  data-testid="button-upload"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploadMutation.isPending ? "A carregar..." : "Carregar"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-acoes">
          <CardHeader>
            <CardTitle>Ações de Reconciliação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              className="w-full"
              variant="outline"
              onClick={() => matchingAutomaticoMutation.mutate()}
              disabled={!contaSelecionada || matchingAutomaticoMutation.isPending}
              data-testid="button-matching-automatico"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              {matchingAutomaticoMutation.isPending ? "A processar..." : "Executar Matching Automático"}
            </Button>
            <Button
              className="w-full"
              onClick={() => confirmarReconciliacaoMutation.mutate()}
              disabled={!contaSelecionada || confirmarReconciliacaoMutation.isPending}
              data-testid="button-confirmar-reconciliacao"
            >
              {confirmarReconciliacaoMutation.isPending ? "A confirmar..." : "Confirmar Reconciliação"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {contaSelecionada && (
        <Card data-testid="card-transacoes">
          <CardHeader>
            <CardTitle>Transações Bancárias</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingTransacoes ? (
              <div className="p-6 space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <Table data-testid="table-transacoes">
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="text-right">Débito</TableHead>
                    <TableHead className="text-right">Crédito</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transacoes && transacoes.length > 0 ? (
                    transacoes.map((transacao) => (
                      <TableRow
                        key={transacao.id}
                        className={
                          transacao.status === "matched"
                            ? "bg-green-500/10"
                            : transacao.status === "manual"
                            ? "bg-yellow-500/10"
                            : "bg-red-500/10"
                        }
                        data-testid={`row-transacao-${transacao.id}`}
                      >
                        <TableCell data-testid={`text-data-${transacao.id}`}>{formatDate(transacao.data)}</TableCell>
                        <TableCell data-testid={`text-descricao-${transacao.id}`}>{transacao.descricao}</TableCell>
                        <TableCell className="text-right" data-testid={`text-debito-${transacao.id}`}>
                          {transacao.debito ? formatCurrency(transacao.debito) : "-"}
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-credito-${transacao.id}`}>
                          {transacao.credito ? formatCurrency(transacao.credito) : "-"}
                        </TableCell>
                        <TableCell className="text-right font-medium" data-testid={`text-saldo-${transacao.id}`}>{formatCurrency(transacao.saldo)}</TableCell>
                        <TableCell>
                          {transacao.status === "matched" && (
                            <span className="text-green-500 flex items-center gap-1" data-testid={`text-status-${transacao.id}`}>
                              <CheckCircle2 className="h-4 w-4" />
                              Reconciliado
                            </span>
                          )}
                          {transacao.status === "manual" && (
                            <span className="text-yellow-500 flex items-center gap-1" data-testid={`text-status-${transacao.id}`}>
                              <AlertCircle className="h-4 w-4" />
                              Manual
                            </span>
                          )}
                          {transacao.status === "pending" && (
                            <span className="text-red-500 flex items-center gap-1" data-testid={`text-status-${transacao.id}`}>
                              <AlertCircle className="h-4 w-4" />
                              Pendente
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {transacao.status === "pending" && (
                            <Select
                              onValueChange={(recebimentoId) => associarRecebimento(transacao.id, recebimentoId)}
                            >
                              <SelectTrigger className="w-40" data-testid={`select-recebimento-${transacao.id}`}>
                                <SelectValue placeholder="Associar..." />
                              </SelectTrigger>
                              <SelectContent>
                                {recebimentosPendentes?.map((recebimento) => (
                                  <SelectItem key={recebimento.id} value={recebimento.id}>
                                    {recebimento.cliente} - {formatCurrency(recebimento.valor)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        Carregue um extrato para visualizar transações
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card data-testid="card-historico">
        <CardHeader>
          <CardTitle>Histórico de Reconciliações</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table data-testid="table-historico">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead className="text-center">Transações Reconciliadas</TableHead>
                <TableHead className="text-right">Saldo Final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historico && historico.length > 0 ? (
                historico.map((rec) => (
                  <TableRow key={rec.id} data-testid={`row-historico-${rec.id}`}>
                    <TableCell data-testid={`text-data-${rec.id}`}>{formatDate(rec.data)}</TableCell>
                    <TableCell data-testid={`text-conta-${rec.id}`}>{rec.conta}</TableCell>
                    <TableCell className="text-center" data-testid={`text-transacoes-${rec.id}`}>{rec.transacoesReconciliadas}</TableCell>
                    <TableCell className="text-right font-medium" data-testid={`text-saldo-final-${rec.id}`}>{formatCurrency(rec.saldoFinal)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Sem histórico de reconciliações
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

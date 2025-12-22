import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronDown, ChevronRight, Eye } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface TaxaIVA {
  id: string;
  nome: string;
  taxa: number;
  ativa: boolean;
  default: boolean;
}

interface ContaPOC {
  codigo: string;
  nome: string;
  subcontas?: ContaPOC[];
}

interface ConfiguracaoLembretes {
  diasAntes: number[];
  emailTemplate: string;
  autoEnvio: boolean;
}

const planoContasPOC: ContaPOC[] = [
  {
    codigo: "1",
    nome: "Meios Financeiros Líquidos",
    subcontas: [
      { codigo: "11", nome: "Caixa" },
      { codigo: "12", nome: "Depósitos à Ordem" },
      { codigo: "13", nome: "Depósitos a Prazo" },
    ],
  },
  {
    codigo: "2",
    nome: "Terceiros",
    subcontas: [
      { codigo: "21", nome: "Clientes" },
      { codigo: "22", nome: "Fornecedores" },
      { codigo: "24", nome: "Estado e Outros Entes Públicos" },
    ],
  },
  {
    codigo: "3",
    nome: "Inventários e Ativos Biológicos",
    subcontas: [
      { codigo: "31", nome: "Compras" },
      { codigo: "32", nome: "Mercadorias" },
      { codigo: "33", nome: "Matérias-Primas" },
    ],
  },
  {
    codigo: "4",
    nome: "Imobilizações",
    subcontas: [
      { codigo: "42", nome: "Ativos Fixos Tangíveis" },
      { codigo: "43", nome: "Ativos Intangíveis" },
      { codigo: "44", nome: "Ativos de Investimento" },
    ],
  },
  {
    codigo: "5",
    nome: "Capital, Reservas e Resultados Transitados",
    subcontas: [
      { codigo: "51", nome: "Capital" },
      { codigo: "55", nome: "Reservas" },
      { codigo: "56", nome: "Resultados Transitados" },
    ],
  },
  {
    codigo: "6",
    nome: "Gastos",
    subcontas: [
      { codigo: "61", nome: "Custo das Mercadorias Vendidas" },
      { codigo: "62", nome: "Fornecimentos e Serviços Externos" },
      { codigo: "63", nome: "Gastos com Pessoal" },
    ],
  },
  {
    codigo: "7",
    nome: "Rendimentos",
    subcontas: [
      { codigo: "71", nome: "Vendas" },
      { codigo: "72", nome: "Prestações de Serviços" },
      { codigo: "79", nome: "Juros e Rendimentos Similares" },
    ],
  },
  {
    codigo: "8",
    nome: "Resultados",
    subcontas: [
      { codigo: "81", nome: "Resultado Líquido do Período" },
      { codigo: "89", nome: "Dividendos Antecipados" },
    ],
  },
];

function ContaPOCItem({ conta }: { conta: ContaPOC }) {
  const [aberto, setAberto] = useState(false);
  const temSubcontas = conta.subcontas && conta.subcontas.length > 0;

  return (
    <div className="border-l-2 border-muted pl-4 py-1">
      <div className="flex items-center gap-2">
        {temSubcontas && (
          <button
            onClick={() => setAberto(!aberto)}
            className="hover-elevate p-1 rounded-sm"
            data-testid={`button-toggle-${conta.codigo}`}
          >
            {aberto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        )}
        <span className="font-mono text-sm font-medium">{conta.codigo}</span>
        <span className="text-sm">{conta.nome}</span>
      </div>
      {aberto && temSubcontas && (
        <div className="ml-6 mt-1">
          {conta.subcontas!.map((subconta) => (
            <ContaPOCItem key={subconta.codigo} conta={subconta} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FinanceiroConfiguracoes() {
  const { toast } = useToast();
  const [dialogPreview, setDialogPreview] = useState(false);
  const [novaTaxa, setNovaTaxa] = useState({ nome: "", taxa: 0 });

  const { data: taxasIVA, isLoading: loadingTaxas } = useQuery<TaxaIVA[]>({
    queryKey: ["/api/financeiro/configuracoes/taxas-iva"],
  });

  const { data: configLembretes, isLoading: loadingLembretes } = useQuery<ConfiguracaoLembretes>({
    queryKey: ["/api/financeiro/configuracoes/lembretes"],
  });

  const adicionarTaxaMutation = useMutation({
    mutationFn: async (taxa: { nome: string; taxa: number }) => {
      return await apiRequest("POST", "/api/financeiro/configuracoes/taxas-iva", taxa);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/configuracoes/taxas-iva"] });
      toast({ title: "Taxa IVA adicionada" });
      setNovaTaxa({ nome: "", taxa: 0 });
    },
  });

  const toggleTaxaMutation = useMutation({
    mutationFn: async ({ id, ativa }: { id: string; ativa: boolean }) => {
      return await apiRequest("PATCH", `/api/financeiro/configuracoes/taxas-iva/${id}/toggle`, { ativa });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/configuracoes/taxas-iva"] });
    },
  });

  const setDefaultTaxaMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("PATCH", `/api/financeiro/configuracoes/taxas-iva/${id}/default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/configuracoes/taxas-iva"] });
      toast({ title: "Taxa padrão atualizada" });
    },
  });

  const deleteTaxaMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/financeiro/configuracoes/taxas-iva/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/configuracoes/taxas-iva"] });
      toast({ title: "Taxa eliminada" });
    },
  });

  const atualizarLembretesMutation = useMutation({
    mutationFn: async (config: Partial<ConfiguracaoLembretes>) => {
      return await apiRequest("PATCH", "/api/financeiro/configuracoes/lembretes", config);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/configuracoes/lembretes"] });
      toast({ title: "Configurações atualizadas" });
    },
  });

  const handleAdicionarTaxa = () => {
    if (!novaTaxa.nome || novaTaxa.taxa < 0) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    adicionarTaxaMutation.mutate(novaTaxa);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">Configurações Financeiras</h1>
        <p className="text-muted-foreground">Definições contabilísticas e fiscais</p>
      </div>

      <Tabs defaultValue="taxas-iva" className="space-y-4" data-testid="tabs-configuracoes">
        <TabsList>
          <TabsTrigger value="taxas-iva" data-testid="tab-taxas-iva">
            Taxas IVA
          </TabsTrigger>
          <TabsTrigger value="plano-contas" data-testid="tab-plano-contas">
            Plano de Contas
          </TabsTrigger>
          <TabsTrigger value="lembretes" data-testid="tab-lembretes">
            Lembretes Pagamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="taxas-iva" className="space-y-4">
          <Card data-testid="card-taxas-iva">
            <CardHeader>
              <CardTitle>Taxas de IVA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingTaxas ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  {taxasIVA?.map((taxa) => (
                    <div
                      key={taxa.id}
                      className="flex items-center justify-between gap-1 p-4 border rounded-md"
                      data-testid={`row-taxa-${taxa.id}`}
                    >
                      <div className="flex-1">
                        <p className="font-medium" data-testid={`text-taxa-nome-${taxa.id}`}>{taxa.nome}</p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-taxa-percentagem-${taxa.id}`}>{taxa.taxa}%</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {taxa.default && (
                          <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md">Padrão</span>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{taxa.ativa ? "Ativa" : "Inativa"}</span>
                          <Switch
                            checked={taxa.ativa}
                            onCheckedChange={(ativa) => toggleTaxaMutation.mutate({ id: taxa.id, ativa })}
                            data-testid={`switch-ativa-${taxa.id}`}
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDefaultTaxaMutation.mutate(taxa.id)}
                          disabled={taxa.default}
                          data-testid={`button-default-${taxa.id}`}
                        >
                          Definir Padrão
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => deleteTaxaMutation.mutate(taxa.id)}
                          data-testid={`button-eliminar-${taxa.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Input
                  placeholder="Nome da taxa (ex: Reduzida Especial)"
                  value={novaTaxa.nome}
                  onChange={(e) => setNovaTaxa({ ...novaTaxa, nome: e.target.value })}
                  data-testid="input-nova-taxa-nome"
                />
                <Input
                  type="number"
                  placeholder="Taxa %"
                  className="w-32"
                  value={novaTaxa.taxa}
                  onChange={(e) => setNovaTaxa({ ...novaTaxa, taxa: parseFloat(e.target.value) || 0 })}
                  data-testid="input-nova-taxa-percentagem"
                />
                <Button onClick={handleAdicionarTaxa} data-testid="button-adicionar-taxa">
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="plano-contas" className="space-y-4">
          <Card data-testid="card-plano-contas">
            <CardHeader>
              <CardTitle>Plano Oficial de Contabilidade (POC)</CardTitle>
              <p className="text-sm text-muted-foreground">Classes e subcontas contabilísticas</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {planoContasPOC.map((conta) => (
                  <ContaPOCItem key={conta.codigo} conta={conta} />
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lembretes" className="space-y-4">
          <Card data-testid="card-lembretes">
            <CardHeader>
              <CardTitle>Configuração de Lembretes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {loadingLembretes ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium">Dias antes do vencimento</label>
                    <div className="flex gap-2 mt-2">
                      {[5, 10, 15].map((dias) => {
                        const ativo = configLembretes?.diasAntes?.includes(dias) || false;
                        return (
                          <Button
                            key={dias}
                            variant={ativo ? "default" : "outline"}
                            onClick={() => {
                              const novosAsias = ativo
                                ? configLembretes.diasAntes.filter((d) => d !== dias)
                                : [...(configLembretes?.diasAntes || []), dias];
                              atualizarLembretesMutation.mutate({ diasAntes: novosAsias });
                            }}
                            data-testid={`button-dias-${dias}`}
                          >
                            {dias} dias
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Template de Email</label>
                    <Textarea
                      className="mt-2 font-mono text-sm"
                      rows={8}
                      placeholder="Assunto: Lembrete de Pagamento&#10;&#10;Caro Cliente,&#10;&#10;A fatura {NUMERO_FATURA} vence em {DIAS} dias..."
                      value={configLembretes?.emailTemplate || ""}
                      onChange={(e) => atualizarLembretesMutation.mutate({ emailTemplate: e.target.value })}
                      data-testid="input-email-template"
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-lg border p-4">
                    <div>
                      <p className="font-medium">Envio Automático</p>
                      <p className="text-sm text-muted-foreground">
                        Enviar lembretes automaticamente sem aprovação manual
                      </p>
                    </div>
                    <Switch
                      checked={configLembretes?.autoEnvio || false}
                      onCheckedChange={(autoEnvio) => atualizarLembretesMutation.mutate({ autoEnvio })}
                      data-testid="switch-auto-envio"
                    />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setDialogPreview(true)}
                    data-testid="button-preview-email"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Pré-visualizar Email
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogPreview} onOpenChange={setDialogPreview}>
        <DialogContent className="max-w-2xl" data-testid="dialog-preview-email">
          <DialogHeader>
            <DialogTitle>Pré-visualização de Email</DialogTitle>
          </DialogHeader>
          <div className="bg-muted p-6 rounded-md font-mono text-sm whitespace-pre-wrap" data-testid="text-preview-conteudo">
            {configLembretes?.emailTemplate
              ?.replace("{NUMERO_FATURA}", "FT 2025/001")
              .replace("{DIAS}", "5")
              .replace("{VALOR}", "1.250,00€")
              .replace("{CLIENTE}", "Exemplo Cliente Lda") || "Sem template definido"}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

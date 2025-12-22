import { useState, useEffect } from "react";
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
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { 
  Plus, Trash2, Save, Send, CheckCircle, Loader2, AlertTriangle, 
  TrendingUp, DollarSign, BarChart3, Edit2 
} from "lucide-react";
import { cn } from "@/lib/utils";

const formatCurrency = (value: number | string) => {
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(numValue || 0);
};

const formatDate = (dateString: string | Date | null | undefined) => {
  if (!dateString) return "N/A";
  return new Intl.DateTimeFormat("pt-PT", {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(dateString));
};

const formatDateOnly = (dateString: string | Date | null | undefined) => {
  if (!dateString) return "N/A";
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

const getMarginColor = (marginPct: number) => {
  if (marginPct >= 20) return "text-green-600";
  if (marginPct >= 10) return "text-yellow-600";
  return "text-red-600";
};

const getMarginBgColor = (marginPct: number) => {
  if (marginPct >= 20) return "bg-green-50 dark:bg-green-950";
  if (marginPct >= 10) return "bg-yellow-50 dark:bg-yellow-950";
  if (marginPct < 0) return "bg-red-100 dark:bg-red-950";
  return "bg-red-50 dark:bg-red-900";
};

interface EditableFieldProps {
  value: string | number;
  onSave: (newValue: string | number) => void;
  type?: "text" | "number";
  isSaving?: boolean;
}

function EditableField({ value, onSave, type = "text", isSaving }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const handleBlur = () => {
    setIsEditing(false);
    if (editValue !== value) {
      onSave(type === "number" ? parseFloat(editValue as string) : editValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleBlur();
    } else if (e.key === "Escape") {
      setEditValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoFocus
        className="h-8 text-sm"
        data-testid="input-editable-field"
      />
    );
  }

  return (
    <div 
      className="flex items-center gap-2 cursor-pointer hover-elevate p-2 rounded"
      onClick={() => setIsEditing(true)}
      data-testid="editable-field"
    >
      <span>{type === "number" ? formatCurrency(value) : value}</span>
      {isSaving ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Edit2 className="h-3 w-3 opacity-50" />
      )}
    </div>
  );
}

export default function FinanceiroOrcamentoDetalhe({ quoteId }: { quoteId: string }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [discountType, setDiscountType] = useState<string>("none");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Form state for new line
  const [newLine, setNewLine] = useState({
    description: "",
    category: "",
    quantity: 1,
    unit: "unit",
    unitCost: 0,
    unitPrice: 0,
  });

  // Fetch quote details
  const { data: quoteData, isLoading: quoteLoading, refetch } = useQuery<any>({
    queryKey: ["/api/financeiro/quotes", quoteId],
  });

  const quote = quoteData;
  const lines = quote?.lines || [];

  // Update discount state when quote loads
  useEffect(() => {
    if (quote?.discountType) {
      setDiscountType(quote.discountType);
      setDiscountValue(parseFloat(quote.appliedDiscount || '0'));
    }
  }, [quote]);

  // Update line mutation
  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, data }: { lineId: string; data: any }) => {
      return await apiRequest("PATCH", `/api/financeiro/quotes/${quoteId}/lines/${lineId}`, data);
    },
    onMutate: async ({ lineId, data }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ["/api/financeiro/quotes", quoteId] });
      const previous = queryClient.getQueryData(["/api/financeiro/quotes", quoteId]);

      queryClient.setQueryData(["/api/financeiro/quotes", quoteId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          lines: old.lines.map((line: any) =>
            line.id === lineId ? { ...line, ...data } : line
          ),
        };
      });

      return { previous };
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/financeiro/quotes", quoteId], context.previous);
      }
      toast({
        title: "Erro ao atualizar linha",
        description: "Ocorreu um erro ao atualizar a linha. Por favor, tente novamente.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      refetch();
      setEditingLineId(null);
    },
  });

  // Add line mutation
  const addLineMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", `/api/financeiro/quotes/${quoteId}/lines`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/quotes", quoteId] });
      toast({
        title: "Linha adicionada",
        description: "A linha foi adicionada com sucesso",
      });
      setDialogOpen(false);
      setNewLine({
        description: "",
        category: "",
        quantity: 1,
        unit: "unit",
        unitCost: 0,
        unitPrice: 0,
      });
    },
    onError: () => {
      toast({
        title: "Erro ao adicionar linha",
        description: "Ocorreu um erro ao adicionar a linha",
        variant: "destructive",
      });
    },
  });

  // Delete line mutation
  const deleteLineMutation = useMutation({
    mutationFn: async (lineId: string) => {
      return await apiRequest("DELETE", `/api/financeiro/quotes/${quoteId}/lines/${lineId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/quotes", quoteId] });
      toast({
        title: "Linha removida",
        description: "A linha foi removida com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao remover linha",
        description: "Ocorreu um erro ao remover a linha",
        variant: "destructive",
      });
    },
  });

  // Apply discount mutation
  const applyDiscountMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/financeiro/quotes/${quoteId}/discount`, {
        discountType: discountType === "none" ? null : discountType,
        appliedDiscount: discountType === "none" ? null : discountValue,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/quotes", quoteId] });
      toast({
        title: "Desconto aplicado",
        description: "O desconto foi aplicado com sucesso",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao aplicar desconto",
        description: "Ocorreu um erro ao aplicar o desconto",
        variant: "destructive",
      });
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      return await apiRequest("PATCH", `/api/financeiro/quotes/${quoteId}/status`, { status: newStatus });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/quotes", quoteId] });
      toast({
        title: "Status atualizado",
        description: "O status do orçamento foi atualizado",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar status",
        description: "Ocorreu um erro ao atualizar o status",
        variant: "destructive",
      });
    },
  });

  const handleUpdateLine = (lineId: string, field: string, value: any) => {
    setEditingLineId(lineId);
    updateLineMutation.mutate({ lineId, data: { [field]: value } });
  };

  const handleAddLine = () => {
    if (!newLine.description || !newLine.unitPrice || !newLine.quantity) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha a descrição, quantidade e preço unitário",
        variant: "destructive",
      });
      return;
    }
    addLineMutation.mutate(newLine);
  };

  const handleDeleteLine = (lineId: string) => {
    if (window.confirm("Tem certeza que deseja remover esta linha?")) {
      deleteLineMutation.mutate(lineId);
    }
  };

  // Generate Proposal function
  const generateProposal = async () => {
    try {
      setIsGenerating(true);
      const response = await apiRequest('POST', `/api/financeiro/quotes/${quoteId}/generate-proposal`);
      
      toast({
        title: "Proposta Gerada!",
        description: "PDF gerado com sucesso. Fazendo download..."
      });
      
      // Fazer download automático
      window.open(`/api/financeiro/proposals/${response.proposalId}/download`, '_blank');
      
      // Refetch to get updated status
      await refetch();
    } catch (error: any) {
      toast({
        title: "Erro ao gerar proposta",
        description: error.message || "Ocorreu um erro ao gerar a proposta",
        variant: "destructive"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Change Status function
  const changeStatus = async (newStatus: string) => {
    updateStatusMutation.mutate(newStatus);
  };

  const calculatePreviewDiscount = () => {
    const subtotal = parseFloat(quote?.totalPrice || '0');
    let discountAmount = 0;

    if (discountType === "percentage") {
      discountAmount = subtotal * (discountValue / 100);
    } else if (discountType === "fixed") {
      discountAmount = discountValue;
    }

    const total = subtotal - discountAmount;
    return { subtotal, discountAmount, total };
  };

  const previewDiscount = calculatePreviewDiscount();

  // Calculate breakdown by category
  const calculateBreakdown = () => {
    let laborCosts = 0;
    let materialCosts = 0;

    lines.forEach((line: any) => {
      const cost = parseFloat(line.totalCost || '0');
      if (line.category?.toLowerCase().includes('mão') || line.category?.toLowerCase().includes('labor')) {
        laborCosts += cost;
      } else {
        materialCosts += cost;
      }
    });

    return { laborCosts, materialCosts };
  };

  const breakdown = calculateBreakdown();
  const calculations = quote?.calculations || {};

  if (quoteLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Orçamento não encontrado</p>
      </div>
    );
  }

  const marginPct = parseFloat(quote.marginPercentage || '0');
  const canEdit = quote.status === 'draft' || quote.status === 'review';

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold" data-testid="text-quote-number">{quote.quoteNumber}</h1>
          <p className="text-muted-foreground">{quote.title}</p>
          <div className="flex items-center gap-2">
            <Badge className={getStatusColor(quote.status)}>
              {getStatusLabel(quote.status)}
            </Badge>
            {quote.clientName && (
              <span className="text-sm text-muted-foreground">Cliente: {quote.clientName}</span>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={quoteLoading}
            data-testid="button-salvar"
          >
            <Save className="h-4 w-4 mr-2" />
            Atualizar
          </Button>

          {/* Workflow Status Buttons */}
          {quote.status === 'draft' && (
            <>
              <Button
                variant="default"
                onClick={() => changeStatus('review')}
                disabled={updateStatusMutation.isPending}
                data-testid="button-review"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Enviar para Revisão
              </Button>
              <Button
                variant="default"
                onClick={() => changeStatus('approved')}
                disabled={updateStatusMutation.isPending}
                data-testid="button-approved"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Aprovar Direto
              </Button>
            </>
          )}

          {quote.status === 'review' && (
            <>
              <Button
                variant="outline"
                onClick={() => changeStatus('draft')}
                disabled={updateStatusMutation.isPending}
                data-testid="button-draft"
              >
                Voltar para Rascunho
              </Button>
              <Button
                variant="default"
                onClick={() => changeStatus('approved')}
                disabled={updateStatusMutation.isPending}
                data-testid="button-approved"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Aprovar
              </Button>
            </>
          )}

          {quote.status === 'approved' && (
            <Button
              variant="default"
              onClick={async () => {
                await generateProposal();
              }}
              disabled={isGenerating || updateStatusMutation.isPending}
              data-testid="button-sent"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Gerar Proposta & Enviar
                </>
              )}
            </Button>
          )}

          {quote.status === 'sent' && (
            <>
              <Button
                variant="default"
                onClick={() => changeStatus('accepted')}
                disabled={updateStatusMutation.isPending}
                data-testid="button-accepted"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Marcar como Aceite
              </Button>
              <Button
                variant="destructive"
                onClick={() => changeStatus('rejected')}
                disabled={updateStatusMutation.isPending}
                data-testid="button-rejected"
              >
                <AlertTriangle className="h-4 w-4 mr-2" />
                Marcar como Rejeitado
              </Button>
            </>
          )}

          {(quote.status === 'accepted' || quote.status === 'rejected') && (
            <Badge variant="outline" className="px-4 py-2">
              {quote.status === 'accepted' ? 'Orçamento Aceite' : 'Orçamento Rejeitado'}
            </Badge>
          )}
        </div>
      </div>

      {/* 2 Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN (70%) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quote Lines Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Linhas do Orçamento</CardTitle>
                {canEdit && (
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" data-testid="button-adicionar-linha">
                        <Plus className="h-4 w-4 mr-2" />
                        Adicionar Linha
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Adicionar Nova Linha</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>Descrição *</Label>
                          <Textarea
                            value={newLine.description}
                            onChange={(e) => setNewLine({ ...newLine, description: e.target.value })}
                            placeholder="Descrição do item..."
                            data-testid="input-new-line-description"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <Label>Categoria</Label>
                            <Input
                              value={newLine.category}
                              onChange={(e) => setNewLine({ ...newLine, category: e.target.value })}
                              placeholder="Ex: Mão de Obra, Material"
                            />
                          </div>

                          <div>
                            <Label>Unidade</Label>
                            <Select value={newLine.unit} onValueChange={(v) => setNewLine({ ...newLine, unit: v })}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unit">Unidade</SelectItem>
                                <SelectItem value="hour">Hora</SelectItem>
                                <SelectItem value="day">Dia</SelectItem>
                                <SelectItem value="kg">Kg</SelectItem>
                                <SelectItem value="m2">m²</SelectItem>
                                <SelectItem value="m3">m³</SelectItem>
                                <SelectItem value="ml">ml</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <Label>Quantidade *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={newLine.quantity}
                              onChange={(e) => setNewLine({ ...newLine, quantity: parseFloat(e.target.value) || 0 })}
                            />
                          </div>

                          <div>
                            <Label>Custo Unitário (€)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={newLine.unitCost}
                              onChange={(e) => setNewLine({ ...newLine, unitCost: parseFloat(e.target.value) || 0 })}
                            />
                          </div>

                          <div>
                            <Label>Preço Unitário (€) *</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={newLine.unitPrice}
                              onChange={(e) => setNewLine({ ...newLine, unitPrice: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                        </div>

                        <Separator />

                        <div className="bg-muted p-4 rounded space-y-2">
                          <h4 className="font-medium">Preview</h4>
                          <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Total Custo</p>
                              <p className="font-bold">{formatCurrency(newLine.quantity * newLine.unitCost)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Total Preço</p>
                              <p className="font-bold">{formatCurrency(newLine.quantity * newLine.unitPrice)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Margem</p>
                              <p className="font-bold">
                                {formatCurrency(newLine.quantity * (newLine.unitPrice - newLine.unitCost))}
                              </p>
                            </div>
                          </div>
                        </div>

                        <Button 
                          onClick={handleAddLine} 
                          disabled={addLineMutation.isPending}
                          className="w-full"
                        >
                          {addLineMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adicionando...</>
                          ) : (
                            <><Plus className="h-4 w-4 mr-2" /> Adicionar</>
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table data-testid="table-quote-lines">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead className="min-w-[200px]">Descrição</TableHead>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead>Un.</TableHead>
                      <TableHead className="text-right">Custo Unit.</TableHead>
                      <TableHead className="text-right">Preço Unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Margem %</TableHead>
                      {canEdit && <TableHead className="w-12"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line: any) => {
                      const lineMarginPct = parseFloat(line.marginPercentage || '0');
                      const isSaving = editingLineId === line.id && updateLineMutation.isPending;

                      return (
                        <TableRow 
                          key={line.id}
                          className={cn(
                            "hover-elevate",
                            getMarginBgColor(lineMarginPct)
                          )}
                        >
                          <TableCell>{line.lineNumber}</TableCell>
                          <TableCell>
                            {canEdit ? (
                              <EditableField
                                value={line.description}
                                onSave={(v) => handleUpdateLine(line.id, 'description', v)}
                                isSaving={isSaving}
                              />
                            ) : (
                              line.description
                            )}
                          </TableCell>
                          <TableCell>{line.category || '-'}</TableCell>
                          <TableCell className="text-right">
                            {canEdit ? (
                              <EditableField
                                value={parseFloat(line.quantity)}
                                onSave={(v) => handleUpdateLine(line.id, 'quantity', v)}
                                type="number"
                                isSaving={isSaving}
                              />
                            ) : (
                              parseFloat(line.quantity).toFixed(2)
                            )}
                          </TableCell>
                          <TableCell>{line.unit || '-'}</TableCell>
                          <TableCell className="text-right">{formatCurrency(line.unitCost || 0)}</TableCell>
                          <TableCell className="text-right">
                            {canEdit ? (
                              <EditableField
                                value={parseFloat(line.unitPrice)}
                                onSave={(v) => handleUpdateLine(line.id, 'unitPrice', v)}
                                type="number"
                                isSaving={isSaving}
                              />
                            ) : (
                              formatCurrency(line.unitPrice)
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(line.totalPrice)}
                          </TableCell>
                          <TableCell className={cn("text-right font-bold", getMarginColor(lineMarginPct))}>
                            {lineMarginPct.toFixed(1)}%
                          </TableCell>
                          {canEdit && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteLine(line.id)}
                                disabled={deleteLineMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Discount Section */}
          {canEdit && (
            <Card>
              <CardHeader>
                <CardTitle>Desconto Global</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <RadioGroup value={discountType} onValueChange={setDiscountType}>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="none" id="none" />
                    <Label htmlFor="none">Sem desconto</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="percentage" id="percentage" />
                    <Label htmlFor="percentage">Desconto Percentual</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="fixed" id="fixed" />
                    <Label htmlFor="fixed">Desconto Fixo</Label>
                  </div>
                </RadioGroup>

                {discountType === "percentage" && (
                  <div className="space-y-2">
                    <Label>Percentual de Desconto (%)</Label>
                    <div className="flex gap-4 items-center">
                      <Slider
                        value={[discountValue]}
                        onValueChange={(v) => setDiscountValue(v[0])}
                        max={100}
                        step={0.5}
                        className="flex-1"
                      />
                      <Input
                        type="number"
                        value={discountValue}
                        onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                        className="w-24"
                        data-testid="input-desconto"
                      />
                      <span>%</span>
                    </div>
                  </div>
                )}

                {discountType === "fixed" && (
                  <div className="space-y-2">
                    <Label>Valor do Desconto (€)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={discountValue}
                      onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                      data-testid="input-desconto"
                    />
                  </div>
                )}

                {discountType !== "none" && (
                  <div className="bg-muted p-4 rounded space-y-2">
                    <p className="font-medium">Preview do Desconto:</p>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span className="font-bold">{formatCurrency(previewDiscount.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-destructive">
                        <span>Desconto:</span>
                        <span className="font-bold">-{formatCurrency(previewDiscount.discountAmount)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-lg">
                        <span className="font-bold">Total Final:</span>
                        <span className="font-bold">{formatCurrency(previewDiscount.total)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Economiza {formatCurrency(previewDiscount.discountAmount)}
                      </p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => applyDiscountMutation.mutate()}
                  disabled={applyDiscountMutation.isPending}
                  className="w-full"
                  data-testid="button-aplicar-desconto"
                >
                  {applyDiscountMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Aplicando...</>
                  ) : (
                    <>Aplicar Desconto</>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN (30%) */}
        <div className="space-y-6">
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Resumo do Orçamento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Visual Breakdown */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-blue-500" />
                    <span className="text-sm">Custo Total</span>
                  </div>
                  <span className="font-bold text-blue-600" data-testid="text-total-cost">
                    {formatCurrency(quote.totalCost)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Preço Total</span>
                  </div>
                  <span className="font-bold text-green-600" data-testid="text-total-price">
                    {formatCurrency(quote.totalPrice)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm">Margem</span>
                  </div>
                  <span className="font-bold text-yellow-600">
                    {formatCurrency(quote.margin)}
                  </span>
                </div>

                <Separator />

                <div className="flex items-center justify-between p-3 bg-muted rounded">
                  <span className="font-bold">Margem %</span>
                  <span 
                    className={cn("text-2xl font-bold", getMarginColor(marginPct))}
                    data-testid="text-margin-percentage"
                  >
                    {marginPct.toFixed(1)}%
                  </span>
                </div>
              </div>

              <Separator />

              {/* Detailed Breakdown */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Breakdown Detalhado</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mão de Obra:</span>
                    <span>{formatCurrency(breakdown.laborCosts)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Materiais:</span>
                    <span>{formatCurrency(breakdown.materialCosts)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Overheads:</span>
                    <span>{formatCurrency(calculations.overheadCosts || 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold">
                    <span>Total Custos:</span>
                    <span>{formatCurrency(quote.totalCost)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Pricing */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Pricing</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal (sem desconto):</span>
                    <span>{formatCurrency(previewDiscount.subtotal)}</span>
                  </div>
                  {quote.discountType && quote.appliedDiscount && (
                    <div className="flex justify-between text-destructive">
                      <span>Desconto:</span>
                      <span>-{formatCurrency(previewDiscount.discountAmount)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between text-lg">
                    <span className="font-bold">Total Final:</span>
                    <span className="font-bold">{formatCurrency(quote.totalPrice)}</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Metadata */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Metadados</h4>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>Criado em:</span>
                    <span>{formatDateOnly(quote.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Atualizado em:</span>
                    <span>{formatDate(quote.updatedAt)}</span>
                  </div>
                  {quote.validUntil && (
                    <div className="flex justify-between">
                      <span>Válido até:</span>
                      <span>{formatDateOnly(quote.validUntil)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Status:</span>
                    <Badge className={getStatusColor(quote.status)} variant="outline">
                      {getStatusLabel(quote.status)}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risk Analysis Card */}
          {marginPct < 15 && (
            <Card className="border-yellow-500">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  Análise de Risco
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {marginPct < 10 && (
                  <div className="flex items-start gap-2 p-2 bg-red-50 dark:bg-red-950 rounded">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-red-700 dark:text-red-300">Margem Crítica</p>
                      <p className="text-red-600 dark:text-red-400">Margem abaixo de 10% - Alto risco!</p>
                    </div>
                  </div>
                )}
                {marginPct >= 10 && marginPct < 15 && (
                  <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded">
                    <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-yellow-700 dark:text-yellow-300">Margem Baixa</p>
                      <p className="text-yellow-600 dark:text-yellow-400">Margem abaixo de 15% - Atenção necessária</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

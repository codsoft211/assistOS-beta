import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowLeft,
  Check,
  XCircle,
  Trash2,
  MoreVertical,
  FileText,
  Download,
  Eye,
  Building2,
  Calendar,
  CreditCard,
  Hash,
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface BillLine {
  id: string;
  description: string;
  quantity: string;
  uom?: string;
  unitPrice: string;
  lineTotal: string;
  taxRate: string;
  taxAmount: string;
}

interface Bill {
  id: string;
  code: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  scheduledPaymentDate?: string;
  supplierId: string;
  supplierName?: string;
  supplierNif?: string;
  supplierAddress?: string;
  supplierIban?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  receiverNif?: string;
  receiverName?: string;
  subtotal: string;
  taxTotal: string;
  shippingCost?: string;
  otherCharges?: string;
  totalAmount: string;
  currency: string;
  paymentTerms?: string;
  status: string;
  threeWayMatchStatus: string;
  paidAmount: string;
  remainingAmount?: string;
  documentUrl?: string;
  documentType?: string;
  documentHash?: string;
  documentSize?: number;
  documentUploadedAt?: string;
  atcud?: string;
  hash?: string;
  hashControl?: string;
  series?: string;
  fiscalYear?: number;
  retentionUntil?: string;
  ocrExtracted?: boolean;
  ocrConfidence?: string;
  notes?: string;
  createdAt: string;
  lines: BillLine[];
}

export default function BillDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const { t, i18n } = useTranslation('financeiro');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("details");
  
  const currentLang = i18n.language || 'pt';
  
  const formatCurrency = (value: string | number | null | undefined) => {
    if (value === null || value === undefined) return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(0);
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(isNaN(numValue) ? 0 : numValue);
  };
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'pt-PT').format(date);
  };

  const formatDateTime = (dateString?: string) => {
    if (!dateString) return "—";
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };
  
  const getStatusBadge = (status: string) => {
    const configs: Record<string, { className: string; label: string }> = {
      draft: { className: "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20", label: "Rascunho" },
      approved: { className: "bg-green-500/10 text-green-500 hover:bg-green-500/20", label: "Aprovada" },
      scheduled: { className: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20", label: "Agendada" },
      overdue: { className: "bg-red-500/10 text-red-500 hover:bg-red-500/20", label: "Vencida" },
      partially_paid: { className: "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20", label: "Parcialmente Paga" },
      paid: { className: "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20", label: "Paga" },
    };
    const config = configs[status] || configs.draft;
    return (
      <Badge className={config.className} data-testid="badge-bill-status">
        {config.label}
      </Badge>
    );
  };

  const getMatchStatusBadge = (status: string) => {
    const configs: Record<string, { className: string; label: string; icon: any }> = {
      pending: { className: "bg-yellow-500/10 text-yellow-500", label: "Pendente", icon: Clock },
      matched: { className: "bg-green-500/10 text-green-500", label: "Conferido", icon: CheckCircle2 },
      discrepancy: { className: "bg-red-500/10 text-red-500", label: "Discrepância", icon: AlertTriangle },
      override: { className: "bg-purple-500/10 text-purple-500", label: "Aprovado Manual", icon: Shield },
    };
    const config = configs[status] || configs.pending;
    const Icon = config.icon;
    return (
      <Badge className={config.className} data-testid="badge-match-status">
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const { data: bill, isLoading, error } = useQuery<Bill>({
    queryKey: [`/api/financeiro/ap/bills/${id}`],
    enabled: !!id
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/financeiro/ap/bills/${id}`, {
        status: 'approved',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financeiro/ap/bills/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/faturas-fornecedor'] });
      toast({
        title: "Fatura aprovada",
        description: "A fatura foi aprovada com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao aprovar",
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: async (scheduledDate: string) => {
      return await apiRequest("PATCH", `/api/financeiro/ap/bills/${id}`, {
        status: 'scheduled',
        scheduledPaymentDate: scheduledDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financeiro/ap/bills/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/faturas-fornecedor'] });
      toast({
        title: "Pagamento agendado",
        description: "O pagamento foi agendado com sucesso.",
      });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("PATCH", `/api/financeiro/ap/bills/${id}`, {
        status: 'paid',
        paidAmount: bill?.totalAmount,
        remainingAmount: '0',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/financeiro/ap/bills/${id}`] });
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/faturas-fornecedor'] });
      toast({
        title: "Pagamento registado",
        description: "A fatura foi marcada como paga.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/financeiro/ap/bills/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/faturas-fornecedor'] });
      toast({
        title: "Fatura eliminada",
        description: "A fatura foi eliminada com sucesso.",
      });
      setLocation('/financeiro/ap/bills');
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao eliminar",
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-bill-detail-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !bill) {
    return (
      <div className="p-6" data-testid="page-bill-detail-error">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertTriangle className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Fatura não encontrada</p>
            <p className="text-sm text-muted-foreground mb-4">
              A fatura solicitada não existe ou não tem permissão para a visualizar.
            </p>
            <Button onClick={() => setLocation('/financeiro/ap/bills')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar à lista
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-bill-detail">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/financeiro/ap/bills')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-bill-number">
              Fatura {bill.invoiceNumber || bill.code}
            </h1>
            <p className="text-sm text-muted-foreground">
              {bill.supplierName || "Fornecedor não identificado"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {getStatusBadge(bill.status)}
          {getMatchStatusBadge(bill.threeWayMatchStatus)}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {bill.status === 'draft' && (
                <>
                  <DropdownMenuItem 
                    onClick={() => approveMutation.mutate()}
                    data-testid="action-approve"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Aprovar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {bill.status === 'approved' && (
                <>
                  <DropdownMenuItem 
                    onClick={() => scheduleMutation.mutate(bill.dueDate || new Date().toISOString().split('T')[0])}
                    data-testid="action-schedule"
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    Agendar Pagamento
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {(bill.status === 'approved' || bill.status === 'scheduled' || bill.status === 'overdue') && (
                <>
                  <DropdownMenuItem 
                    onClick={() => markPaidMutation.mutate()}
                    data-testid="action-mark-paid"
                  >
                    <CreditCard className="mr-2 h-4 w-4" />
                    Marcar como Paga
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {bill.documentUrl && (
                <>
                  <DropdownMenuItem 
                    onClick={() => window.open(bill.documentUrl, '_blank')}
                    data-testid="action-view-document"
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Ver Documento
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = bill.documentUrl!;
                      link.download = `fatura-${bill.invoiceNumber}.${bill.documentType || 'pdf'}`;
                      link.click();
                    }}
                    data-testid="action-download"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {bill.status === 'draft' && (
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-destructive"
                  data-testid="action-delete"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="details" data-testid="tab-details">
            <FileText className="w-4 h-4 mr-2" />
            Detalhes
          </TabsTrigger>
          <TabsTrigger value="fiscal" data-testid="tab-fiscal">
            <Shield className="w-4 h-4 mr-2" />
            Dados Fiscais
          </TabsTrigger>
          <TabsTrigger value="document" data-testid="tab-document">
            <FileText className="w-4 h-4 mr-2" />
            Documento
          </TabsTrigger>
        </TabsList>

        {/* Details Tab */}
        <TabsContent value="details" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Supplier Info */}
            <Card data-testid="card-supplier">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Fornecedor
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Nome</Label>
                  <p className="font-medium" data-testid="text-supplier-name">
                    {bill.supplierName || "—"}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">NIF</Label>
                  <p className="font-medium font-mono" data-testid="text-supplier-nif">
                    {bill.supplierNif || "—"}
                  </p>
                </div>
                {bill.supplierAddress && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Morada</Label>
                    <p className="text-sm">{bill.supplierAddress}</p>
                  </div>
                )}
                {bill.supplierIban && (
                  <div>
                    <Label className="text-xs text-muted-foreground">IBAN</Label>
                    <p className="font-mono text-sm">{bill.supplierIban}</p>
                  </div>
                )}
                {bill.supplierEmail && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="text-sm">{bill.supplierEmail}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Dates & Payment */}
            <Card data-testid="card-dates">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Datas e Pagamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Data de Emissão</Label>
                  <p className="font-medium" data-testid="text-issue-date">
                    {formatDate(bill.invoiceDate)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data de Vencimento</Label>
                  <p className="font-medium" data-testid="text-due-date">
                    {formatDate(bill.dueDate)}
                  </p>
                </div>
                {bill.paymentTerms && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Condições de Pagamento</Label>
                    <p className="text-sm">{bill.paymentTerms}</p>
                  </div>
                )}
                <Separator />
                <div>
                  <Label className="text-xs text-muted-foreground">Valor Pago</Label>
                  <p className="font-medium text-green-600">
                    {formatCurrency(bill.paidAmount)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Valor em Aberto</Label>
                  <p className="font-medium text-orange-600">
                    {formatCurrency(bill.remainingAmount || ((parseFloat(bill.totalAmount || '0') || 0) - (parseFloat(bill.paidAmount || '0') || 0)))}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Totals */}
            <Card data-testid="card-totals">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Valores
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <Label className="text-sm text-muted-foreground">Subtotal</Label>
                  <p className="font-medium">{formatCurrency(bill.subtotal)}</p>
                </div>
                <div className="flex justify-between">
                  <Label className="text-sm text-muted-foreground">IVA</Label>
                  <p className="font-medium">{formatCurrency(bill.taxTotal)}</p>
                </div>
                {bill.shippingCost && parseFloat(bill.shippingCost) > 0 && (
                  <div className="flex justify-between">
                    <Label className="text-sm text-muted-foreground">Portes</Label>
                    <p className="font-medium">{formatCurrency(bill.shippingCost)}</p>
                  </div>
                )}
                {bill.otherCharges && parseFloat(bill.otherCharges) > 0 && (
                  <div className="flex justify-between">
                    <Label className="text-sm text-muted-foreground">Outros Encargos</Label>
                    <p className="font-medium">{formatCurrency(bill.otherCharges)}</p>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between items-center">
                  <Label className="text-base font-semibold">Total</Label>
                  <p className="text-2xl font-bold" data-testid="text-total">
                    {formatCurrency(bill.totalAmount)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Lines */}
          <Card data-testid="card-lines">
            <CardHeader>
              <CardTitle className="text-base">Linhas da Fatura</CardTitle>
              <CardDescription>
                {bill.lines?.length || 0} artigos/serviços
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bill.lines && bill.lines.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="text-right">Qtd.</TableHead>
                      <TableHead>Un.</TableHead>
                      <TableHead className="text-right">Preço Unit.</TableHead>
                      <TableHead className="text-right">IVA</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bill.lines.map((line, index) => (
                      <TableRow key={line.id || index} data-testid={`row-line-${index}`}>
                        <TableCell className="font-medium">{line.description || '—'}</TableCell>
                        <TableCell className="text-right">{(parseFloat(line.quantity || '0') || 0).toFixed(2)}</TableCell>
                        <TableCell>{line.uom || 'un'}</TableCell>
                        <TableCell className="text-right">{formatCurrency(line.unitPrice)}</TableCell>
                        <TableCell className="text-right">{(parseFloat(line.taxRate || '0') || 0).toFixed(0)}%</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(line.lineTotal)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  Sem linhas de detalhe disponíveis
                </p>
              )}
            </CardContent>
          </Card>

          {/* Notes */}
          {bill.notes && (
            <Card data-testid="card-notes">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notas</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{bill.notes}</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Fiscal Tab - Portuguese Legal Requirements */}
        <TabsContent value="fiscal" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Issuer (Supplier) */}
            <Card data-testid="card-issuer">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Emitente (Fornecedor)
                </CardTitle>
                <CardDescription>
                  Dados fiscais do emissor da fatura
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Nome/Designação</Label>
                  <p className="font-medium">{bill.supplierName || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">NIF (Contribuinte)</Label>
                  <p className="font-mono font-medium">{bill.supplierNif || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Morada</Label>
                  <p className="text-sm">{bill.supplierAddress || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">IBAN</Label>
                  <p className="font-mono text-sm">{bill.supplierIban || "—"}</p>
                </div>
              </CardContent>
            </Card>

            {/* Receiver (Our Company) */}
            <Card data-testid="card-receiver">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Adquirente (Destinatário)
                </CardTitle>
                <CardDescription>
                  Dados fiscais do destinatário
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Nome/Designação</Label>
                  <p className="font-medium">{bill.receiverName || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">NIF (Contribuinte)</Label>
                  <p className="font-mono font-medium">{bill.receiverNif || "—"}</p>
                </div>
              </CardContent>
            </Card>

            {/* AT Codes */}
            <Card data-testid="card-at-codes">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Códigos AT (Autoridade Tributária)
                </CardTitle>
                <CardDescription>
                  Identificadores fiscais obrigatórios
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">ATCUD</Label>
                  <p className="font-mono font-medium">{bill.atcud || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Hash</Label>
                  <p className="font-mono text-xs break-all">{bill.hash || "—"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Hash Control</Label>
                  <p className="font-mono">{bill.hashControl || "—"}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Série</Label>
                    <p className="font-mono">{bill.series || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Ano Fiscal</Label>
                    <p className="font-mono">{bill.fiscalYear || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Retention */}
            <Card data-testid="card-retention">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Retenção Legal
                </CardTitle>
                <CardDescription>
                  Prazo de arquivo obrigatório (10 anos - DL 28/2019)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Data de Emissão</Label>
                  <p className="font-medium">{formatDate(bill.invoiceDate)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Reter até</Label>
                  <p className="font-medium">
                    {bill.retentionUntil 
                      ? formatDate(bill.retentionUntil) 
                      : bill.invoiceDate 
                        ? formatDate(new Date(new Date(bill.invoiceDate).setFullYear(new Date(bill.invoiceDate).getFullYear() + 10)).toISOString())
                        : "—"
                    }
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Data de Registo</Label>
                  <p className="text-sm">{formatDateTime(bill.createdAt)}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Document Tab */}
        <TabsContent value="document" className="space-y-6">
          <Card data-testid="card-document">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documento Original
              </CardTitle>
              <CardDescription>
                Arquivo digital da fatura (PDF ou imagem)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {bill.documentUrl ? (
                <div className="space-y-4">
                  {/* Document Preview */}
                  <div className="border rounded-lg p-4 bg-muted/30">
                    {bill.documentType === 'pdf' ? (
                      <div className="flex items-center justify-center py-8">
                        <FileText className="h-16 w-16 text-muted-foreground" />
                      </div>
                    ) : (
                      <img 
                        src={bill.documentUrl} 
                        alt="Documento da fatura"
                        className="max-w-full h-auto rounded"
                      />
                    )}
                  </div>

                  {/* Document Info */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Tipo</Label>
                      <p className="font-medium uppercase">{bill.documentType || 'pdf'}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Tamanho</Label>
                      <p className="font-medium">{formatFileSize(bill.documentSize)}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Upload</Label>
                      <p className="font-medium">{formatDateTime(bill.documentUploadedAt)}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Hash (Integridade)</Label>
                      <p className="font-mono text-xs truncate" title={bill.documentHash}>
                        {bill.documentHash ? `${bill.documentHash.substring(0, 16)}...` : "—"}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      onClick={() => window.open(bill.documentUrl, '_blank')}
                      data-testid="button-view-document"
                    >
                      <Eye className="mr-2 h-4 w-4" />
                      Ver Documento
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = bill.documentUrl!;
                        link.download = `fatura-${bill.invoiceNumber}.${bill.documentType || 'pdf'}`;
                        link.click();
                      }}
                      data-testid="button-download-document"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download
                    </Button>
                  </div>

                  {/* OCR Info */}
                  {bill.ocrExtracted && (
                    <div className="border-t pt-4 mt-4">
                      <Label className="text-xs text-muted-foreground">Extração OCR</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant={parseFloat(bill.ocrConfidence || '0') > 80 ? "default" : "secondary"}>
                          {bill.ocrConfidence ? `${parseFloat(bill.ocrConfidence).toFixed(0)}% confiança` : "Extraído"}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          Dados extraídos automaticamente por OCR
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <FileText className="h-16 w-16 mb-4 opacity-50" />
                  <p className="text-lg font-medium">Documento não disponível</p>
                  <p className="text-sm">
                    Esta fatura não tem documento digital associado.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar fatura?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser revertida. A fatura {bill.invoiceNumber} será
              permanentemente eliminada do sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, FileText, Download, Loader2, Upload, Eye, X } from "lucide-react";
import { InvoiceValidationModal } from "@/components/financeiro/InvoiceValidationModal";

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  supplierName?: string;
  clientName?: string;
  issueDate: string;
  dueDate?: string;
  status: string;
  paymentStatus: string;
  subtotal?: string;
  taxAmount?: string;
  totalAmount: string;
  currency: string;
  pdfUrl?: string;
  pngUrl?: string;
}

export default function ComprasFaturas() {
  const { toast } = useToast();
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const [detailsSheetOpen, setDetailsSheetOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationModalOpen, setValidationModalOpen] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>("");

  // Helper to safely format dates
  const formatDate = (dateString?: string | null): string => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Data inválida';
      return date.toLocaleDateString('pt-PT');
    } catch {
      return 'Data inválida';
    }
  };

  // Helper to format currency
  const formatCurrency = (amount?: string | number, currency = "EUR"): string => {
    if (amount === undefined || amount === null) return "—";
    const numAmount = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(numAmount)) return "—";
    return new Intl.NumberFormat("pt-PT", {
      style: "currency",
      currency,
    }).format(numAmount);
  };

  // Helper to get confidence badge variant
  const getConfidenceBadgeVariant = (confidence?: number): "default" | "secondary" | "destructive" => {
    if (!confidence) return "secondary";
    if (confidence >= 90) return "default";
    if (confidence >= 70) return "secondary";
    return "destructive";
  };

  const { data: invoicesData, isLoading } = useQuery<{ invoices: Invoice[] }>({
    queryKey: ["/api/compras/invoices"],
  });

  const { data: pendingData, refetch: refetchPending } = useQuery<{ invoices: any[] }>({
    queryKey: ["/api/compras/invoices/pending-validation"],
  });
  const pendingInvoices = pendingData?.invoices || [];

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      
      const response = await fetch("/api/compras/invoices/ocr", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Erro ao processar fatura");
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "✅ Fatura processada",
        description: "A fatura foi extraída e guardada com sucesso",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/compras/invoices"] });
      setUploadSheetOpen(false);
      setSelectedFile(null);
    },
    onError: (error: any) => {
      toast({
        title: "❌ Erro ao processar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;
    uploadMutation.mutate(selectedFile);
  };

  const handleDownload = (url: string, invoiceNumber: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = `fatura-${invoiceNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleInvoiceClick = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setDetailsSheetOpen(true);
  };

  const getStatusColor = (status?: string): "default" | "destructive" | "outline" | "secondary" => {
    if (!status) return "outline";
    const colors: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
      draft: "secondary",
      pending: "outline",
      approved: "default",
      paid: "default",
      overdue: "destructive",
      cancelled: "secondary",
    };
    return colors[status.toLowerCase()] || "outline";
  };

  const getPaymentStatusColor = (status?: string): "default" | "destructive" | "outline" | "secondary" => {
    if (!status) return "outline";
    const colors: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
      pending: "outline",
      partial: "outline",
      paid: "default",
      overdue: "destructive",
    };
    return colors[status.toLowerCase()] || "outline";
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header - Mobile Optimized */}
      <div className="p-4 md:p-6 border-b sticky top-0 bg-background z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-3xl font-bold truncate" data-testid="text-page-title">
              Faturas
            </h1>
            <p className="text-sm text-muted-foreground hidden md:block">
              Gestão de faturas de fornecedores
            </p>
          </div>
          
          <Sheet open={uploadSheetOpen} onOpenChange={setUploadSheetOpen}>
            <SheetTrigger asChild>
              <Button size="default" className="gap-2" data-testid="button-add-invoice">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nova Fatura</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Adicionar Fatura</SheetTitle>
                <SheetDescription>
                  Upload do PDF da fatura para extração automática
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* File Upload Area */}
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <div className="flex flex-col items-center gap-3">
                    {selectedFile ? (
                      <>
                        <FileText className="h-12 w-12 text-primary" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium" data-testid="text-filename">
                            {selectedFile.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedFile(null)}
                          className="gap-2"
                        >
                          <X className="h-4 w-4" />
                          Remover
                        </Button>
                      </>
                    ) : (
                      <>
                        <Upload className="h-12 w-12 text-muted-foreground" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">Escolha um ficheiro</p>
                          <p className="text-xs text-muted-foreground">
                            PDF, PNG ou JPG (máx. 10MB)
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* File Input Button */}
                <div>
                  <Label htmlFor="file-upload" className="cursor-pointer">
                    <Input
                      id="file-upload"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      onChange={handleFileChange}
                      className="hidden"
                      data-testid="input-file"
                    />
                    <Button variant="outline" asChild className="w-full">
                      <span className="gap-2">
                        <Upload className="h-4 w-4" />
                        {selectedFile ? "Escolher Outro" : "Escolher Ficheiro"}
                      </span>
                    </Button>
                  </Label>
                </div>

                {/* Upload Button */}
                <Button
                  onClick={handleUpload}
                  disabled={!selectedFile || uploadMutation.isPending}
                  className="w-full gap-2"
                  data-testid="button-upload"
                >
                  {uploadMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Processar Fatura
                    </>
                  )}
                </Button>

                {uploadMutation.isPending && (
                  <div className="text-sm text-muted-foreground text-center space-y-2">
                    <p>⏳ A analisar documento com IA...</p>
                    <p className="text-xs">Isto pode demorar 20-30 segundos</p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 space-y-6">
          {/* Pending Validation Section */}
          <Card data-testid="card-pending-validation">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <CardTitle>Faturas Pendentes Validação</CardTitle>
                  <CardDescription>
                    Documentos extraídos aguardando confirmação humana
                  </CardDescription>
                </div>
                <Badge variant="secondary" data-testid="badge-pending-count">
                  {pendingInvoices.length} pendentes
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {pendingInvoices.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  Nenhuma fatura pendente de validação
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fornecedor</TableHead>
                        <TableHead>Número</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Confidence</TableHead>
                        <TableHead>Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingInvoices.map((invoice) => (
                        <TableRow key={invoice.id} data-testid={`row-pending-invoice-${invoice.id}`}>
                          <TableCell>{invoice.supplierName || "—"}</TableCell>
                          <TableCell>{invoice.invoiceNumber || "—"}</TableCell>
                          <TableCell>{formatDate(invoice.invoiceDate)}</TableCell>
                          <TableCell>{formatCurrency(invoice.totalAmount, invoice.currency)}</TableCell>
                          <TableCell>
                            <Badge variant={getConfidenceBadgeVariant(invoice.extractionConfidence)}>
                              {invoice.extractionConfidence || 0}%
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedInvoiceId(invoice.id);
                                setValidationModalOpen(true);
                              }}
                              data-testid={`button-validate-${invoice.id}`}
                            >
                              Validar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoices List */}
          <Card data-testid="card-invoices-list">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Faturas Recebidas</CardTitle>
              <CardDescription>
                {invoicesData?.invoices.length || 0} faturas registadas
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-full">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : !invoicesData || invoicesData.invoices.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Nenhuma fatura encontrada</p>
                    <p className="text-xs mt-1">Clique em "Nova Fatura" para começar</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {invoicesData.invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        onClick={() => handleInvoiceClick(invoice)}
                        className="p-4 hover-elevate active-elevate-2 cursor-pointer transition-colors"
                        data-testid={`row-invoice-${invoice.id}`}
                      >
                        {/* Desktop View */}
                        <div className="hidden md:grid md:grid-cols-5 md:gap-4 md:items-center">
                          <div>
                            <p className="font-medium text-sm">{invoice.invoiceNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {invoice.invoiceType === 'payable' ? 'Recebida' : 'Emitida'}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm">{invoice.supplierName || invoice.clientName || '—'}</p>
                          </div>
                          <div>
                            <p className="text-sm">
                              {formatDate(invoice.issueDate)}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant={getStatusColor(invoice.status)} className="text-xs">
                              {invoice.status}
                            </Badge>
                            <Badge variant={getPaymentStatusColor(invoice.paymentStatus)} className="text-xs">
                              {invoice.paymentStatus}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              {Number(invoice.totalAmount).toFixed(2)}€
                            </p>
                          </div>
                        </div>

                        {/* Mobile View */}
                        <div className="md:hidden space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{invoice.invoiceNumber}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {invoice.supplierName || invoice.clientName || '—'}
                              </p>
                            </div>
                            <p className="font-semibold text-sm whitespace-nowrap">
                              {Number(invoice.totalAmount).toFixed(2)}€
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{formatDate(invoice.issueDate)}</span>
                            <span>•</span>
                            <Badge variant={getPaymentStatusColor(invoice.paymentStatus)} className="text-xs">
                              {invoice.paymentStatus}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invoice Details Sheet */}
      <Sheet open={detailsSheetOpen} onOpenChange={setDetailsSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          {selectedInvoice && (
            <>
              <SheetHeader>
                <SheetTitle>Fatura {selectedInvoice.invoiceNumber}</SheetTitle>
                <SheetDescription>
                  {selectedInvoice.invoiceType === 'payable' ? 'Fatura Recebida' : 'Fatura Emitida'}
                </SheetDescription>
              </SheetHeader>

              <ScrollArea className="h-full mt-6">
                <div className="space-y-6 pr-4">
                  {/* Status Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={getStatusColor(selectedInvoice.status)}>
                      {selectedInvoice.status}
                    </Badge>
                    <Badge variant={getPaymentStatusColor(selectedInvoice.paymentStatus)}>
                      {selectedInvoice.paymentStatus}
                    </Badge>
                  </div>

                  <Separator />

                  {/* Invoice Details */}
                  <div className="space-y-4">
                    <div>
                      <Label className="text-xs text-muted-foreground">Número</Label>
                      <p className="font-medium">{selectedInvoice.invoiceNumber}</p>
                    </div>

                    {selectedInvoice.supplierName && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Fornecedor</Label>
                        <p className="font-medium">{selectedInvoice.supplierName}</p>
                      </div>
                    )}

                    {selectedInvoice.clientName && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Cliente</Label>
                        <p className="font-medium">{selectedInvoice.clientName}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground">Data Emissão</Label>
                        <p className="font-medium">
                          {formatDate(selectedInvoice.issueDate)}
                        </p>
                      </div>
                      {selectedInvoice.dueDate && (
                        <div>
                          <Label className="text-xs text-muted-foreground">Data Vencimento</Label>
                          <p className="font-medium">
                            {formatDate(selectedInvoice.dueDate)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Financial Breakdown */}
                    <div className="space-y-2 bg-muted/30 p-4 rounded-lg">
                      {selectedInvoice.subtotal && (
                        <div className="flex justify-between">
                          <Label className="text-sm text-muted-foreground">Subtotal (sem IVA)</Label>
                          <p className="font-medium">{Number(selectedInvoice.subtotal).toFixed(2)}€</p>
                        </div>
                      )}
                      {selectedInvoice.taxAmount && (
                        <div className="flex justify-between">
                          <Label className="text-sm text-muted-foreground">IVA</Label>
                          <p className="font-medium">{Number(selectedInvoice.taxAmount).toFixed(2)}€</p>
                        </div>
                      )}
                      <Separator className="my-2" />
                      <div className="flex justify-between items-center">
                        <Label className="text-sm font-semibold">Total</Label>
                        <p className="text-2xl font-bold">
                          {Number(selectedInvoice.totalAmount).toFixed(2)}€
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Actions */}
                  <div className="space-y-3">
                    {selectedInvoice.pdfUrl && (
                      <Button
                        onClick={() => handleDownload(selectedInvoice.pdfUrl!, selectedInvoice.invoiceNumber)}
                        variant="outline"
                        className="w-full gap-2"
                        data-testid="button-download-pdf"
                      >
                        <Download className="h-4 w-4" />
                        Download PDF
                      </Button>
                    )}

                    {selectedInvoice.pdfUrl && (
                      <Button
                        onClick={() => window.open(selectedInvoice.pdfUrl, '_blank')}
                        variant="outline"
                        className="w-full gap-2"
                        data-testid="button-view-pdf"
                      >
                        <Eye className="h-4 w-4" />
                        Ver Documento
                      </Button>
                    )}

                    {!selectedInvoice.pdfUrl && !selectedInvoice.pngUrl && (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Documento não disponível</p>
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Invoice Validation Modal */}
      <InvoiceValidationModal
        open={validationModalOpen}
        onOpenChange={setValidationModalOpen}
        invoiceId={selectedInvoiceId}
        onValidationComplete={() => {
          refetchPending();
          setValidationModalOpen(false);
        }}
      />
    </div>
  );
}

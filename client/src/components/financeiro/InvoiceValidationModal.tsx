import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, AlertCircle, FileText, X, Check, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

const optionalNumber = z
  .union([z.number(), z.string(), z.undefined()])
  .transform((val) => {
    if (val === undefined || val === null || val === '') return undefined;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? undefined : num;
  })
  .optional();

const validateInvoiceSchema = z.object({
  supplierName: z.string().optional(),
  nif: z.string().optional(),
  receiverTaxId: z.string().optional(),
  invoiceNumber: z.string().optional(),
  invoiceType: z.string().optional(),
  invoiceDate: z.string().optional(),
  dueDate: z.string().optional(),
  paymentStatus: z.string().optional(),
  paymentDate: z.string().optional(),
  totalAmount: optionalNumber,
  taxAmount: optionalNumber,
  netAmount: optionalNumber,
  currency: z.string().optional(),
  description: z.string().optional(),
  paymentTerms: z.string().optional(),
  paymentMethod: z.string().optional(),
});

type ValidationFormData = z.infer<typeof validateInvoiceSchema>;

interface InvoiceValidationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  onValidationComplete?: () => void;
}

function getConfidenceBadgeVariant(confidence?: number): "default" | "secondary" | "destructive" {
  if (!confidence) return "secondary";
  if (confidence >= 75) return "default"; // Verde > 75%
  if (confidence >= 50) return "secondary"; // Amarelo 50-75%
  return "destructive"; // Vermelho < 50%
}

function getConfidenceColor(confidence?: number): string {
  if (!confidence) return "text-muted-foreground";
  if (confidence >= 75) return "text-green-500"; // Verde > 75%
  if (confidence >= 50) return "text-yellow-500"; // Amarelo 50-75%
  return "text-red-500"; // Vermelho < 50%
}

function FieldConfidenceBadge({ confidence }: { confidence?: number }) {
  if (!confidence) return null;
  
  const variant = getConfidenceBadgeVariant(confidence);
  const bgClass = confidence >= 75 ? "bg-green-500/10 text-green-500 border-green-500/20" :
                  confidence >= 50 ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                  "bg-red-500/10 text-red-500 border-red-500/20";
  
  return (
    <Badge variant="outline" className={`text-xs ${bgClass}`}>
      {confidence}%
    </Badge>
  );
}

function formatDateForInput(dateString?: string | null): string {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "";
    return date.toISOString().split('T')[0];
  } catch {
    return "";
  }
}

export function InvoiceValidationModal({
  open,
  onOpenChange,
  invoiceId,
  onValidationComplete,
}: InvoiceValidationModalProps) {
  const { t } = useTranslation(['compras', 'common']);
  const { toast } = useToast();
  const [showRejectionField, setShowRejectionField] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const { data: invoice, isLoading } = useQuery<any>({
    queryKey: [`/api/compras/invoices/${invoiceId}`],
    enabled: open && !!invoiceId,
  });

  const form = useForm<ValidationFormData>({
    resolver: zodResolver(validateInvoiceSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (invoice) {
      form.reset({
        supplierName: invoice.supplierName || "",
        nif: invoice.nif || "",
        receiverTaxId: invoice.receiverTaxId || "",
        invoiceNumber: invoice.invoiceNumber || "",
        invoiceType: invoice.invoiceType || "",
        invoiceDate: formatDateForInput(invoice.invoiceDate),
        dueDate: formatDateForInput(invoice.dueDate),
        paymentStatus: invoice.paymentStatus || "pending",
        paymentDate: formatDateForInput(invoice.paymentDate),
        totalAmount: invoice.totalAmount ? parseFloat(invoice.totalAmount) : undefined,
        taxAmount: invoice.taxAmount ? parseFloat(invoice.taxAmount) : undefined,
        netAmount: invoice.netAmount ? parseFloat(invoice.netAmount) : undefined,
        currency: invoice.currency || "EUR",
        description: invoice.description || "",
        paymentTerms: invoice.paymentTerms || "",
        paymentMethod: invoice.paymentMethod || "",
      });
    }
  }, [invoice, form]);

  const validateMutation = useMutation({
    mutationFn: async (data: { action: 'approve' | 'reject'; corrections?: any }) => {
      return apiRequest("PATCH", `/api/compras/invoices/${invoiceId}/validate`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/compras/invoices/${invoiceId}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/compras/invoices/pending-validation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/compras/invoices"] });
      
      if (variables.action === 'approve') {
        toast({
          title: t('common:success'),
          description: t('compras:invoices.validation.messages.approveSuccess'),
        });
      } else {
        toast({
          title: t('common:warning'),
          description: t('compras:invoices.validation.messages.rejectSuccess'),
          variant: "destructive",
        });
      }
      
      onOpenChange(false);
      onValidationComplete?.();
    },
    onError: (error: any) => {
      toast({
        title: t('common:error'),
        description: error.message || t('compras:invoices.validation.messages.approveError'),
        variant: "destructive",
      });
    },
  });

  const handleApprove = () => {
    const formData = form.getValues();
    validateMutation.mutate({ action: 'approve', corrections: formData });
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast({
        title: t('common:required'),
        description: t('compras:invoices.validation.messages.rejectionReasonRequired'),
        variant: "destructive",
      });
      return;
    }
    validateMutation.mutate({ action: 'reject', corrections: { rejectionReason } });
  };

  const pdfViewUrl = invoice?.fileId ? `/api/files/${invoice.fileId}/view` : null;
  const pdfDownloadUrl = invoice?.fileId ? `/api/files/${invoice.fileId}/download` : null;

  const handleDownload = () => {
    if (pdfDownloadUrl) {
      window.open(pdfDownloadUrl, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] p-0 gap-0" data-testid="dialog-invoice-validation">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin" data-testid="loader-invoice" />
          </div>
        ) : invoice ? (
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <DialogTitle data-testid="text-modal-title">
                  {t('compras:invoices.validation.title')} {invoice.invoiceNumber || "—"}
                </DialogTitle>
                <DialogDescription className="mt-1">
                  {invoice.supplierName || t('compras:invoices.validation.fields.supplierName')}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  variant={getConfidenceBadgeVariant(invoice.extractionConfidence)}
                  data-testid="badge-confidence"
                >
                  {t('compras:invoices.validation.confidence')}: {invoice.extractionConfidence || 0}%
                </Badge>
                {pdfDownloadUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleDownload}
                    data-testid="button-download-pdf"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t('common:actions.download')}
                  </Button>
                )}
              </div>
            </div>

            {/* Split Screen: PDF + Form */}
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* Left: PDF Viewer with native controls (50%) */}
              <div className="w-1/2 border-r flex flex-col bg-muted/20">
                <div className="p-3 border-b bg-muted/40 flex-shrink-0">
                  <h3 className="font-medium text-sm">{t('compras:invoices.validation.originalDocument')}</h3>
                </div>
                <div className="flex-1 min-h-0 relative">
                  {pdfViewUrl ? (
                    <embed
                      src={pdfViewUrl}
                      type="application/pdf"
                      className="absolute inset-0 w-full h-full"
                      data-testid="pdf-viewer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-8">
                      <FileText className="h-16 w-16 mb-4 opacity-50" />
                      <p className="text-sm text-center">{t('compras:invoices.validation.pdfNotAvailable')}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Form with independent scroll (50%) */}
              <div className="w-1/2 flex flex-col min-h-0">
                <Form {...form}>
                  <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
                    <div className="space-y-6 max-w-2xl">
                      {/* Informação Básica */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">{t('compras:invoices.validation.sections.basicInfo')}</h3>
                        
                        <FormField
                          control={form.control}
                          name="invoiceNumber"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>{t('compras:invoices.validation.fields.invoiceNumber')}</FormLabel>
                                <FieldConfidenceBadge confidence={invoice?.extractionConfidence} />
                              </div>
                              <FormControl>
                                <Input {...field} data-testid="input-invoice-number" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="invoiceType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('compras:invoices.validation.fields.invoiceType')}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-invoice-type">
                                    <SelectValue placeholder={t('compras:invoices.validation.fields.invoiceType')} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="invoice">{t('compras:invoices.validation.types.invoice')}</SelectItem>
                                  <SelectItem value="credit_note">{t('compras:invoices.validation.types.creditNote')}</SelectItem>
                                  <SelectItem value="receipt">{t('compras:invoices.validation.types.receipt')}</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="invoiceDate"
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex items-center justify-between">
                                  <FormLabel>{t('compras:invoices.validation.fields.invoiceDate')}</FormLabel>
                                  <FieldConfidenceBadge confidence={invoice?.extractionConfidence} />
                                </div>
                                <FormControl>
                                  <Input type="date" {...field} data-testid="input-invoice-date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="dueDate"
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex items-center justify-between">
                                  <FormLabel>{t('compras:invoices.validation.fields.dueDate')}</FormLabel>
                                  <FieldConfidenceBadge confidence={invoice?.extractionConfidence} />
                                </div>
                                <FormControl>
                                  <Input type="date" {...field} data-testid="input-due-date" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      <Separator />

                      {/* Fornecedor */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">{t('compras:invoices.validation.sections.supplier')}</h3>
                        
                        <FormField
                          control={form.control}
                          name="supplierName"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>{t('compras:invoices.validation.fields.supplierName')}</FormLabel>
                                <FieldConfidenceBadge confidence={invoice?.extractionConfidence} />
                              </div>
                              <FormControl>
                                <Input {...field} data-testid="input-supplier-name" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="nif"
                          render={({ field }) => (
                            <FormItem>
                              <div className="flex items-center justify-between">
                                <FormLabel>{t('compras:invoices.validation.fields.nif')}</FormLabel>
                                <FieldConfidenceBadge confidence={invoice?.extractionConfidence} />
                              </div>
                              <FormControl>
                                <Input {...field} maxLength={9} data-testid="input-nif" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <Separator />

                      {/* Valores */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">{t('compras:invoices.validation.sections.amounts')}</h3>
                        
                        <div className="grid grid-cols-3 gap-4">
                          <FormField
                            control={form.control}
                            name="totalAmount"
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex items-center justify-between">
                                  <FormLabel>{t('compras:invoices.validation.fields.total')}</FormLabel>
                                  <FieldConfidenceBadge confidence={invoice?.extractionConfidence} />
                                </div>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    value={field.value ?? ""}
                                    data-testid="input-total-amount"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="taxAmount"
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex items-center justify-between">
                                  <FormLabel>{t('compras:invoices.validation.fields.tax')}</FormLabel>
                                  <FieldConfidenceBadge confidence={invoice?.extractionConfidence} />
                                </div>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    value={field.value ?? ""}
                                    data-testid="input-tax-amount"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="netAmount"
                            render={({ field }) => (
                              <FormItem>
                                <div className="flex items-center justify-between">
                                  <FormLabel>{t('compras:invoices.validation.fields.net')}</FormLabel>
                                  <FieldConfidenceBadge confidence={invoice?.extractionConfidence} />
                                </div>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    value={field.value ?? ""}
                                    data-testid="input-net-amount"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="currency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('compras:invoices.validation.fields.currency')}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-currency">
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
                      </div>

                      <Separator />

                      {/* Pagamento */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">{t('compras:invoices.validation.sections.payment')}</h3>
                        
                        <FormField
                          control={form.control}
                          name="paymentTerms"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('compras:invoices.validation.fields.paymentTerms')}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="ex: 30 dias" data-testid="input-payment-terms" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="paymentMethod"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('compras:invoices.validation.fields.paymentMethod')}</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="ex: Transferência Bancária" data-testid="input-payment-method" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="paymentStatus"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{t('compras:invoices.validation.fields.paymentStatus')}</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid="select-payment-status">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="pending">{t('compras:invoices.validation.paymentStatus.pending')}</SelectItem>
                                  <SelectItem value="paid">{t('compras:invoices.validation.paymentStatus.paid')}</SelectItem>
                                  <SelectItem value="overdue">{t('compras:invoices.validation.paymentStatus.overdue')}</SelectItem>
                                  <SelectItem value="cancelled">{t('compras:invoices.validation.paymentStatus.cancelled')}</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="paymentDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Data Pagamento</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} data-testid="input-payment-date" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <Separator />

                      {/* Descrição/Notas */}
                      <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-foreground">Notas</h3>
                        
                        <FormField
                          control={form.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Descrição</FormLabel>
                              <FormControl>
                                <Textarea 
                                  {...field} 
                                  rows={3}
                                  placeholder="Notas adicionais..."
                                  data-testid="input-description" 
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Rejection Field */}
                      {showRejectionField && (
                        <div className="space-y-4">
                          <Separator />
                          <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                              <div className="space-y-2">
                                <p className="font-medium">{t('compras:invoices.validation.actions.rejectionReason')}</p>
                                <Textarea
                                  value={rejectionReason}
                                  onChange={(e) => setRejectionReason(e.target.value)}
                                  placeholder={t('compras:invoices.validation.actions.rejectionPlaceholder')}
                                  rows={3}
                                  data-testid="input-rejection-reason"
                                />
                              </div>
                            </AlertDescription>
                          </Alert>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Footer - Fixed at bottom */}
                  <div className="border-t px-6 py-4 bg-muted/20">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex gap-2">
                        {!showRejectionField ? (
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => setShowRejectionField(true)}
                            disabled={validateMutation.isPending}
                            data-testid="button-reject"
                          >
                            <X className="h-4 w-4 mr-2" />
                            {t('common:actions.reject')}
                          </Button>
                        ) : (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setShowRejectionField(false);
                                setRejectionReason("");
                              }}
                              disabled={validateMutation.isPending}
                              data-testid="button-cancel-reject"
                            >
                              {t('common:actions.cancel')}
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              onClick={handleReject}
                              disabled={validateMutation.isPending || !rejectionReason.trim()}
                              data-testid="button-confirm-reject"
                            >
                              {validateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              {t('compras:invoices.validation.actions.rejectInvoice')}
                            </Button>
                          </>
                        )}
                      </div>

                      <Button
                        type="button"
                        onClick={handleApprove}
                        disabled={validateMutation.isPending || showRejectionField}
                        data-testid="button-approve"
                      >
                        {validateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        <Check className="h-4 w-4 mr-2" />
                        {t('compras:invoices.validation.actions.approveAndCreate')}
                      </Button>
                    </div>
                  </div>
                </Form>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Fatura não encontrada</AlertDescription>
            </Alert>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

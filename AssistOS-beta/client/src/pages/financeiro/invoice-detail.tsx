import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
  ArrowLeft,
  Pencil,
  Send,
  Check,
  XCircle,
  Trash2,
  MoreVertical,
  FileText,
} from "lucide-react";

interface LineItem {
  lineNumber: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId?: string;
  clientName?: string;
  issueDate: Date;
  dueDate: Date;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  items: LineItem[];
  notes?: string;
  createdAt?: Date;
}

export default function InvoiceDetail() {
  const [, setLocation] = useLocation();
  const params = useParams();
  const id = params.id as string;
  const { toast } = useToast();
  const { t, i18n } = useTranslation('financeiro');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  
  const currentLang = i18n.language || 'pt';
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };
  
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'pt-PT').format(date);
  };
  
  const getStatusBadge = (status: string) => {
    const configs = {
      draft: { className: "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20", label: t('ar.invoices.status.draft') },
      sent: { className: "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20", label: t('ar.invoices.status.sent') },
      paid: { className: "bg-green-500/10 text-green-500 hover:bg-green-500/20", label: t('ar.invoices.status.paid') },
      overdue: { className: "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20", label: t('ar.invoices.status.overdue') },
      cancelled: { className: "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20", label: t('ar.invoices.status.cancelled') },
    };
    const config = configs[status as keyof typeof configs] || configs.draft;
    return (
      <Badge className={config.className} data-testid="badge-invoice-status">
        {config.label}
      </Badge>
    );
  };

  // Fetch invoice data
  const { data: invoice, isLoading, error } = useQuery<Invoice>({
    queryKey: ['/api/financeiro/invoices/' + id],
    queryFn: async () => {
      const data = await apiRequest(`/api/financeiro/invoices/${id}`, 'GET') as any;
      return {
        ...data,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
      } as Invoice;
    },
    enabled: !!id
  });

  // Send mutation (draft -> sent)
  const sendMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/financeiro/invoices/${id}`, 'PATCH', {
        status: 'sent',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices/' + id] });
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices'] });
      toast({
        title: t('ar.invoiceDetail.sendSuccess'),
        description: t('ar.invoiceDetail.sendSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ar.invoiceDetail.sendError'),
        description: error.message || t('ar.invoiceDetail.sendError'),
        variant: 'destructive',
      });
    },
  });

  // Mark paid mutation
  const markPaidMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/financeiro/invoices/${id}`, 'PATCH', {
        status: 'paid',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices/' + id] });
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices'] });
      toast({
        title: t('ar.invoiceDetail.markPaidSuccess'),
        description: t('ar.invoiceDetail.markPaidSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ar.invoiceDetail.markPaidError'),
        description: error.message || t('ar.invoiceDetail.markPaidError'),
        variant: 'destructive',
      });
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/financeiro/invoices/${id}`, 'PATCH', {
        status: 'cancelled',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices/' + id] });
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices'] });
      toast({
        title: t('ar.invoiceDetail.cancelSuccess'),
        description: t('ar.invoiceDetail.cancelSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ar.invoiceDetail.cancelError'),
        description: error.message || t('ar.invoiceDetail.cancelError'),
        variant: 'destructive',
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/financeiro/invoices/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices'] });
      toast({
        title: t('ar.invoiceDetail.deleteSuccess'),
        description: t('ar.invoiceDetail.deleteSuccess'),
      });
      setLocation('/financeiro/invoices');
    },
    onError: (error: Error) => {
      toast({
        title: t('ar.invoiceDetail.deleteError'),
        description: error.message || t('ar.invoiceDetail.deleteError'),
        variant: 'destructive',
      });
    },
  });

  const handleDelete = () => {
    setShowDeleteDialog(false);
    deleteMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6" data-testid="page-invoice-detail-loading">
        <Skeleton className="h-12 w-96" />
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-6" data-testid="page-invoice-detail-error">
        <Card>
          <CardContent className="p-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-lg font-medium mb-2" data-testid="text-error-title">
              {t('ar.invoiceDetail.notFound')}
            </p>
            <p className="text-muted-foreground mb-6" data-testid="text-error-description">
              {t('ar.invoiceDetail.notFoundDescription')}
            </p>
            <Button
              onClick={() => setLocation('/financeiro/invoices')}
              data-testid="button-back-to-list"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t('ar.invoiceDetail.backToList')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canEdit = invoice.status !== 'paid' && invoice.status !== 'cancelled';
  const canSend = invoice.status === 'draft';
  const canMarkPaid = invoice.status === 'sent' || invoice.status === 'overdue';
  const canCancel = invoice.status !== 'paid' && invoice.status !== 'cancelled';

  return (
    <div className="p-6 space-y-6" data-testid="page-invoice-detail">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation('/financeiro/invoices')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-3xl font-bold" data-testid="text-page-title">
                {t('ar.invoiceDetail.invoiceNumber', { number: invoice.invoiceNumber })}
              </h1>
              {getStatusBadge(invoice.status)}
            </div>
            <p className="text-muted-foreground mt-1" data-testid="text-page-description">
              {t('ar.invoiceDetail.details')}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={() => setLocation(`/financeiro/invoices/${id}/edit`)}
            disabled={!canEdit}
            data-testid="button-edit-invoice"
          >
            <Pencil className="h-4 w-4 mr-2" />
            {t('ar.invoiceDetail.edit')}
          </Button>

          {canSend && (
            <Button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending}
              data-testid="button-send-invoice"
            >
              <Send className="h-4 w-4 mr-2" />
              {sendMutation.isPending ? t('ar.invoiceDetail.sending') : t('ar.invoiceDetail.send')}
            </Button>
          )}

          {canMarkPaid && (
            <Button
              onClick={() => markPaidMutation.mutate()}
              disabled={markPaidMutation.isPending}
              className="bg-green-500/10 text-green-500 hover:bg-green-500/20"
              data-testid="button-mark-paid"
            >
              <Check className="h-4 w-4 mr-2" />
              {markPaidMutation.isPending ? t('ar.invoiceDetail.processing') : t('ar.invoiceDetail.markPaid')}
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="button-more-actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canCancel && (
                <DropdownMenuItem
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  data-testid="button-cancel-invoice"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  {cancelMutation.isPending ? t('ar.invoiceDetail.cancelling') : t('ar.invoiceDetail.cancel')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className="text-destructive"
                data-testid="button-delete-invoice"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('ar.invoiceDetail.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Invoice Information */}
      <Card data-testid="card-invoice-info">
        <CardHeader>
          <CardTitle>{t('ar.invoiceDetail.information')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground" data-testid="label-invoice-number">
                {t('ar.invoiceDetail.number')}
              </p>
              <p className="font-medium" data-testid="text-invoice-number">
                {invoice.invoiceNumber}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground" data-testid="label-client">
                {t('ar.invoiceDetail.client')}
              </p>
              <p className="font-medium" data-testid="text-client">
                {invoice.clientName || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground" data-testid="label-issue-date">
                {t('ar.invoiceDetail.issueDate')}
              </p>
              <p className="font-medium" data-testid="text-issue-date">
                {formatDate(invoice.issueDate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground" data-testid="label-due-date">
                {t('ar.invoiceDetail.dueDate')}
              </p>
              <p className="font-medium" data-testid="text-due-date">
                {formatDate(invoice.dueDate)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground" data-testid="label-status">
                {t('ar.invoiceDetail.status')}
              </p>
              <div className="mt-1">{getStatusBadge(invoice.status)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Line Items */}
      <Card data-testid="card-line-items">
        <CardHeader>
          <CardTitle>{t('ar.invoiceDetail.items')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table data-testid="table-line-items">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>{t('ar.invoiceDetail.description')}</TableHead>
                  <TableHead className="text-right">{t('ar.invoiceDetail.quantity')}</TableHead>
                  <TableHead>{t('ar.invoiceDetail.unit')}</TableHead>
                  <TableHead className="text-right">{t('ar.invoiceDetail.unitPrice')}</TableHead>
                  <TableHead className="text-right">{t('ar.invoiceDetail.total')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item) => (
                    <TableRow key={item.lineNumber} data-testid={`row-item-${item.lineNumber}`}>
                      <TableCell data-testid={`text-line-number-${item.lineNumber}`}>
                        {item.lineNumber}
                      </TableCell>
                      <TableCell data-testid={`text-description-${item.lineNumber}`}>
                        {item.description}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-quantity-${item.lineNumber}`}>
                        {item.quantity}
                      </TableCell>
                      <TableCell data-testid={`text-unit-${item.lineNumber}`}>
                        {item.unit}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-unit-price-${item.lineNumber}`}>
                        {formatCurrency(item.unitPrice)}
                      </TableCell>
                      <TableCell className="text-right font-medium" data-testid={`text-total-price-${item.lineNumber}`}>
                        {formatCurrency(item.totalPrice)}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      {t('ar.invoiceDetail.noItems')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Totals */}
      <Card data-testid="card-totals">
        <CardContent className="pt-6">
          <div className="space-y-2 max-w-md ml-auto">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground" data-testid="label-subtotal">
                {t('ar.invoiceDetail.subtotal')}
              </span>
              <span data-testid="text-subtotal">
                {formatCurrency(invoice.subtotal)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground" data-testid="label-tax">
                {t('ar.invoiceDetail.tax', { rate: 23 })}
              </span>
              <span data-testid="text-tax">
                {formatCurrency(invoice.taxAmount)}
              </span>
            </div>
            <Separator />
            <div className="flex justify-between gap-4 text-lg font-bold">
              <span data-testid="label-total">{t('ar.invoiceDetail.totalAmount')}</span>
              <span data-testid="text-total">
                {formatCurrency(invoice.totalAmount)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {invoice.notes && (
        <Card data-testid="card-notes">
          <CardHeader>
            <CardTitle>{t('ar.invoiceDetail.notes')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm" data-testid="text-notes">
              {invoice.notes}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent data-testid="dialog-delete-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="text-dialog-title">
              {t('ar.invoiceDetail.deleteTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription data-testid="text-dialog-description">
              {t('ar.invoiceDetail.deleteConfirm', { number: invoice.invoiceNumber })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              {t('ar.invoiceDetail.cancelDelete')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {t('ar.invoiceDetail.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

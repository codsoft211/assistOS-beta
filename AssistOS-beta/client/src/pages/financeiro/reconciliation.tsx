import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { pt, enUS } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface Payment {
  id: string;
  data: string;
  valor: number;
  metodoPagamento: string;
  referencia?: string;
  notas?: string;
  faturaId?: string;
  faturaAssociada?: string;
  cliente?: string;
  reconciledAt?: string | null;
}

interface ReconciliationStats {
  totalPending: number;
  totalPendingAmount: number;
  totalReconciled: number;
  totalReconciledAmount: number;
}

export default function Reconciliation() {
  const { t, i18n } = useTranslation('financeiro');
  const currentLang = i18n.language || 'pt';
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const { toast } = useToast();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const formatDate = (dateString: string | Date) => {
    try {
      const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
      return format(date, "PPP", { locale: currentLang === 'en' ? enUS : pt });
    } catch {
      return String(dateString);
    }
  };

  const getMethodLabel = (method: string) => {
    const methodKey = method.replace(' ', '_');
    const translationKey = `treasury.reconciliation.paymentMethod.${methodKey}`;
    const translated = t(translationKey);
    return translated !== translationKey ? translated : t(`treasury.reconciliation.paymentMethod.${method}`, method);
  };

  const { data: allPayments = [], isLoading: isLoadingPayments } = useQuery<Payment[]>({
    queryKey: ["/api/financeiro/recebimentos"],
    queryFn: async () => {
      const response = await fetch("/api/financeiro/recebimentos", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch payments");
      }
      return response.json();
    },
  });

  const pendingPayments = allPayments.filter(p => !p.reconciledAt);
  const reconciledPayments = allPayments.filter(p => p.reconciledAt);

  const stats: ReconciliationStats = {
    totalPending: pendingPayments.length,
    totalPendingAmount: pendingPayments.reduce((sum, p) => sum + p.valor, 0),
    totalReconciled: reconciledPayments.length,
    totalReconciledAmount: reconciledPayments.reduce((sum, p) => sum + p.valor, 0),
  };

  const reconciliationRate = stats.totalPending + stats.totalReconciled > 0
    ? Math.round((stats.totalReconciled / (stats.totalPending + stats.totalReconciled)) * 100)
    : 0;

  const handleSelectPayment = (paymentId: string) => {
    setSelectedPayments(prev =>
      prev.includes(paymentId)
        ? prev.filter(id => id !== paymentId)
        : [...prev, paymentId]
    );
  };

  const handleSelectAll = () => {
    if (selectedPayments.length === pendingPayments.length && pendingPayments.length > 0) {
      setSelectedPayments([]);
    } else {
      setSelectedPayments(pendingPayments.map(p => p.id));
    }
  };

  const reconcileMutation = useMutation({
    mutationFn: async (paymentIds: string[]) => {
      const promises = paymentIds.map(id =>
        apiRequest(`/api/financeiro/recebimentos/${id}`, 'PATCH', {
          reconciledAt: new Date().toISOString()
        })
      );
      return await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/recebimentos'] });
      toast({
        title: t('treasury.reconciliation.reconcileSuccess'),
        description: t('treasury.reconciliation.reconcileSuccessDesc', { count: selectedPayments.length }),
      });
      setSelectedPayments([]);
    },
    onError: (error: Error) => {
      toast({
        title: t('treasury.reconciliation.reconcileError'),
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  const handleReconcile = () => {
    if (selectedPayments.length === 0) {
      toast({
        title: t('treasury.reconciliation.noSelection'),
        description: t('treasury.reconciliation.noSelectionDesc'),
        variant: 'destructive',
      });
      return;
    }

    reconcileMutation.mutate(selectedPayments);
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-reconciliation">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          {t('treasury.reconciliation.title')}
        </h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          {t('treasury.reconciliation.description')}
        </p>
      </div>

      {/* Future Enhancement Alert */}
      <Alert data-testid="alert-future-feature">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>{t('treasury.reconciliation.alert.title')}</AlertTitle>
        <AlertDescription>
          {t('treasury.reconciliation.alert.description')}
        </AlertDescription>
      </Alert>

      {/* Stats Cards */}
      {isLoadingPayments ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" data-testid="skeleton-stat-1" />
          <Skeleton className="h-32" data-testid="skeleton-stat-2" />
          <Skeleton className="h-32" data-testid="skeleton-stat-3" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-pending-stats">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('treasury.reconciliation.stats.pending')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-pending-count">
                {stats.totalPending}
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-pending-amount">
                {formatCurrency(stats.totalPendingAmount)}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-reconciled-stats">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('treasury.reconciliation.stats.reconciled')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600" data-testid="text-reconciled-count">
                {stats.totalReconciled}
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-reconciled-amount">
                {formatCurrency(stats.totalReconciledAmount)}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-rate-stats">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {t('treasury.reconciliation.stats.rate')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600" data-testid="text-reconciliation-rate">
                {reconciliationRate}%
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-rate-description">
                {t('treasury.reconciliation.stats.rateDesc')}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Unreconciled Payments Section */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center flex-wrap gap-4">
            <div>
              <CardTitle data-testid="text-section-title">
                {t('treasury.reconciliation.unreconciled.title')}
              </CardTitle>
              <CardDescription data-testid="text-selection-count">
                {selectedPayments.length > 0
                  ? t('treasury.reconciliation.unreconciled.selectedCount', { count: selectedPayments.length })
                  : t('treasury.reconciliation.unreconciled.selectToReconcile')}
              </CardDescription>
            </div>

            {pendingPayments.length > 0 && (
              <Button
                onClick={handleReconcile}
                disabled={selectedPayments.length === 0 || reconcileMutation.isPending}
                data-testid="button-reconcile-selected"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                {reconcileMutation.isPending
                  ? t('treasury.reconciliation.unreconciled.reconciling')
                  : t('treasury.reconciliation.unreconciled.reconcile', { count: selectedPayments.length })}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingPayments ? (
            <div className="p-6 space-y-4" data-testid="loading-skeleton">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : pendingPayments.length === 0 ? (
            <div className="text-center py-12" data-testid="empty-state-pending">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-medium mb-2" data-testid="text-empty-title">
                {t('treasury.reconciliation.unreconciled.emptyTitle')}
              </p>
              <p className="text-muted-foreground" data-testid="text-empty-description">
                {t('treasury.reconciliation.unreconciled.emptyDesc')}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" data-testid="table-head-select">
                    <Checkbox
                      checked={selectedPayments.length === pendingPayments.length && pendingPayments.length > 0}
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead data-testid="table-head-date">{t('treasury.reconciliation.table.date')}</TableHead>
                  <TableHead data-testid="table-head-invoice">{t('treasury.reconciliation.table.invoice')}</TableHead>
                  <TableHead data-testid="table-head-method">{t('treasury.reconciliation.table.method')}</TableHead>
                  <TableHead data-testid="table-head-reference">{t('treasury.reconciliation.table.reference')}</TableHead>
                  <TableHead className="text-right" data-testid="table-head-amount">{t('treasury.reconciliation.table.amount')}</TableHead>
                  <TableHead data-testid="table-head-status">{t('treasury.reconciliation.table.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingPayments.map((payment) => (
                  <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedPayments.includes(payment.id)}
                        onCheckedChange={() => handleSelectPayment(payment.id)}
                        data-testid={`checkbox-payment-${payment.id}`}
                      />
                    </TableCell>
                    <TableCell data-testid={`cell-date-${payment.id}`}>
                      {formatDate(payment.data)}
                    </TableCell>
                    <TableCell data-testid={`cell-invoice-${payment.id}`}>
                      {payment.faturaId && payment.faturaAssociada ? (
                        <Link href={`/financeiro/invoices/${payment.faturaId}`}>
                          <span
                            className="text-blue-500 hover:underline cursor-pointer"
                            data-testid={`link-invoice-${payment.id}`}
                          >
                            #{payment.faturaAssociada}
                          </span>
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell data-testid={`cell-method-${payment.id}`}>
                      {getMethodLabel(payment.metodoPagamento)}
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid={`cell-reference-${payment.id}`}>
                      {payment.referencia || '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium" data-testid={`cell-amount-${payment.id}`}>
                      {formatCurrency(payment.valor)}
                    </TableCell>
                    <TableCell data-testid={`cell-status-${payment.id}`}>
                      <Badge className="bg-yellow-500/10 text-yellow-500" data-testid={`badge-pending-${payment.id}`}>
                        {t('treasury.reconciliation.status.pending')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reconciliation History */}
      {reconciledPayments.length > 0 && (
        <Card data-testid="card-reconciliation-history">
          <CardHeader>
            <CardTitle data-testid="text-history-title">
              {t('treasury.reconciliation.history.title')}
            </CardTitle>
            <CardDescription data-testid="text-history-description">
              {t('treasury.reconciliation.history.description')}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingPayments ? (
              <div className="p-6 space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="table-head-payment-date">{t('treasury.reconciliation.history.paymentDate')}</TableHead>
                    <TableHead data-testid="table-head-reconciliation-date">{t('treasury.reconciliation.history.reconciliationDate')}</TableHead>
                    <TableHead data-testid="table-head-history-invoice">{t('treasury.reconciliation.history.invoice')}</TableHead>
                    <TableHead className="text-right" data-testid="table-head-history-amount">{t('treasury.reconciliation.history.amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciledPayments.slice(0, 10).map((payment) => (
                    <TableRow key={payment.id} data-testid={`row-history-${payment.id}`}>
                      <TableCell data-testid={`cell-payment-date-${payment.id}`}>
                        {formatDate(payment.data)}
                      </TableCell>
                      <TableCell className="text-muted-foreground" data-testid={`cell-reconciled-date-${payment.id}`}>
                        {payment.reconciledAt ? formatDate(new Date(payment.reconciledAt)) : '-'}
                      </TableCell>
                      <TableCell data-testid={`cell-history-invoice-${payment.id}`}>
                        {payment.faturaId && payment.faturaAssociada ? (
                          <Link href={`/financeiro/invoices/${payment.faturaId}`}>
                            <span className="text-blue-500 hover:underline cursor-pointer">
                              #{payment.faturaAssociada}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`cell-history-amount-${payment.id}`}>
                        {formatCurrency(payment.valor)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

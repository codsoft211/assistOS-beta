import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CheckCircle, XCircle } from "lucide-react";

interface ThreeWayMatch {
  id: string;
  poNumber: string;
  invoiceNumber: string;
  receiptNumber: string;
  confidenceScore: number;
  varianceAmount: number;
  status: 'pending' | 'approved' | 'rejected' | 'review_required';
  poAmount: number;
  invoiceAmount: number;
  receiptAmount: number;
}

function getConfidenceColor(score: number): string {
  if (score >= 90) return "text-green-600 dark:text-green-400";
  if (score >= 70) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function getConfidenceBgColor(score: number): string {
  if (score >= 90) return "bg-green-500/10 text-green-600 dark:text-green-400";
  if (score >= 70) return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400";
  return "bg-red-500/10 text-red-600 dark:text-red-400";
}

export default function ThreeWayMatchingPage() {
  const { t, i18n } = useTranslation('financeiro');
  const currentLang = i18n.language || 'pt';
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { toast } = useToast();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const getStatusLabel = (status: string) => {
    return t(`ap.threeWayMatching.status.${status}`);
  };

  const queryKey = [
    '/api/financeiro/ap/3-way-matching',
    searchQuery ? { search: searchQuery } : {},
  ].filter(item => typeof item === 'string' || Object.keys(item).length > 0);

  const { data: matches, isLoading, error } = useQuery<ThreeWayMatch[]>({
    queryKey,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/financeiro/ap/3-way-matching/${id}/approve`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/3-way-matching'] });
      toast({
        title: t('ap.threeWayMatching.approveSuccess'),
        description: t('ap.threeWayMatching.approveSuccessDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ap.threeWayMatching.approveError'),
        description: error.message || t('ap.threeWayMatching.approveErrorDesc'),
        variant: 'destructive',
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/financeiro/ap/3-way-matching/${id}/reject`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/3-way-matching'] });
      toast({
        title: t('ap.threeWayMatching.rejectSuccess'),
        description: t('ap.threeWayMatching.rejectSuccessDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ap.threeWayMatching.rejectError'),
        description: error.message || t('ap.threeWayMatching.rejectErrorDesc'),
        variant: 'destructive',
      });
    },
  });

  const handleApprove = (id: string, poNumber: string) => {
    if (window.confirm(t('ap.threeWayMatching.confirmApprove', { poNumber }))) {
      approveMutation.mutate(id);
    }
  };

  const handleReject = (id: string, poNumber: string) => {
    if (window.confirm(t('ap.threeWayMatching.confirmReject', { poNumber }))) {
      rejectMutation.mutate(id);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-three-way-matching">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {t('ap.threeWayMatching.title')}
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            {t('ap.threeWayMatching.description')}
          </p>
        </div>
      </div>

      {/* Search Filter */}
      <Card data-testid="card-filters">
        <CardContent className="pt-6">
          <Input
            placeholder={t('ap.threeWayMatching.search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
            data-testid="input-search"
          />
        </CardContent>
      </Card>

      {/* Matches Table */}
      <Card data-testid="card-matches">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" data-testid={`skeleton-row-${i}`} />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-error">
              {t('ap.threeWayMatching.loadError')}
            </div>
          ) : matches && matches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-data">
              {t('ap.threeWayMatching.noMatches')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-matches">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('ap.threeWayMatching.table.po')}</TableHead>
                    <TableHead>{t('ap.threeWayMatching.table.invoice')}</TableHead>
                    <TableHead>{t('ap.threeWayMatching.table.receipt')}</TableHead>
                    <TableHead>{t('ap.threeWayMatching.table.poAmount')}</TableHead>
                    <TableHead>{t('ap.threeWayMatching.table.invoiceAmount')}</TableHead>
                    <TableHead>{t('ap.threeWayMatching.table.variance')}</TableHead>
                    <TableHead>{t('ap.threeWayMatching.table.confidence')}</TableHead>
                    <TableHead>{t('ap.threeWayMatching.table.status')}</TableHead>
                    <TableHead className="text-right">{t('ap.threeWayMatching.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matches?.map((match) => (
                    <TableRow key={match.id} data-testid={`row-match-${match.id}`}>
                      <TableCell className="font-medium" data-testid={`text-po-${match.id}`}>
                        {match.poNumber}
                      </TableCell>
                      <TableCell data-testid={`text-invoice-${match.id}`}>
                        {match.invoiceNumber}
                      </TableCell>
                      <TableCell data-testid={`text-receipt-${match.id}`}>
                        {match.receiptNumber}
                      </TableCell>
                      <TableCell data-testid={`text-po-amount-${match.id}`}>
                        {formatCurrency(match.poAmount)}
                      </TableCell>
                      <TableCell data-testid={`text-invoice-amount-${match.id}`}>
                        {formatCurrency(match.invoiceAmount)}
                      </TableCell>
                      <TableCell data-testid={`text-variance-${match.id}`}>
                        <span className={match.varianceAmount !== 0 ? "text-orange-600" : ""}>
                          {formatCurrency(Math.abs(match.varianceAmount))}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={getConfidenceBgColor(match.confidenceScore)}
                          data-testid={`badge-confidence-${match.id}`}
                        >
                          {match.confidenceScore}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" data-testid={`badge-status-${match.id}`}>
                          {getStatusLabel(match.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprove(match.id, match.poNumber)}
                            disabled={approveMutation.isPending || match.status === 'approved'}
                            className="text-green-600 hover:text-green-700 border-green-600 hover:border-green-700"
                            data-testid={`button-approve-${match.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {t('ap.threeWayMatching.approve')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleReject(match.id, match.poNumber)}
                            disabled={rejectMutation.isPending || match.status === 'rejected'}
                            className="text-red-600 hover:text-red-700 border-red-600 hover:border-red-700"
                            data-testid={`button-reject-${match.id}`}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            {t('ap.threeWayMatching.reject')}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

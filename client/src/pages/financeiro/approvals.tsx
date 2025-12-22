import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CheckCircle, XCircle, MessageSquare, Clock } from "lucide-react";

interface Approval {
  id: string;
  billNumber: string;
  billAmount: number;
  supplierName: string;
  requesterName: string;
  slaTimer: number; // days remaining
  status: 'pending' | 'in_review' | 'approved' | 'rejected';
  dueDate: string;
}

function getSLAColor(days: number): string {
  if (days <= 1) return "text-red-600 dark:text-red-400";
  if (days <= 3) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

export default function ApprovalsPage() {
  const { t, i18n } = useTranslation('financeiro');
  const currentLang = i18n.language || 'pt';
  const { toast } = useToast();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const getStatusLabel = (status: string) => {
    return t(`ap.approvals.status.${status}`);
  };

  const { data, isLoading } = useQuery<{ workflows: Approval[]; total: number }>({
    queryKey: ['/api/financeiro/ap/approvals'],
  });
  
  const approvals = data?.workflows || [];

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/financeiro/ap/approvals/${id}/approve`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/approvals'] });
      toast({
        title: t('ap.approvals.approveSuccess'),
        description: t('ap.approvals.approveSuccessDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ap.approvals.approveError'),
        description: error.message || t('ap.approvals.approveErrorDesc'),
        variant: 'destructive',
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/financeiro/ap/approvals/${id}/reject`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/approvals'] });
      toast({
        title: t('ap.approvals.rejectSuccess'),
        description: t('ap.approvals.rejectSuccessDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ap.approvals.rejectError'),
        description: error.message || t('ap.approvals.rejectErrorDesc'),
        variant: 'destructive',
      });
    },
  });

  const handleApprove = (id: string, billNumber: string) => {
    if (window.confirm(t('ap.approvals.confirmApprove', { billNumber }))) {
      approveMutation.mutate(id);
    }
  };

  const handleReject = (id: string, billNumber: string) => {
    if (window.confirm(t('ap.approvals.confirmReject', { billNumber }))) {
      rejectMutation.mutate(id);
    }
  };

  // Group approvals by status
  const groupedApprovals = {
    pending: approvals?.filter(a => a.status === 'pending') || [],
    in_review: approvals?.filter(a => a.status === 'in_review') || [],
    approved: approvals?.filter(a => a.status === 'approved') || [],
    rejected: approvals?.filter(a => a.status === 'rejected') || [],
  };

  const renderApprovalCard = (approval: Approval) => (
    <Card key={approval.id} className="mb-4" data-testid={`card-approval-${approval.id}`}>
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg">{approval.billNumber}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">{approval.supplierName}</p>
          </div>
          <Badge variant="outline" className={getSLAColor(approval.slaTimer)}>
            <Clock className="h-3 w-3 mr-1" />
            {approval.slaTimer} {t('ap.approvals.days')}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">{t('ap.approvals.value')}</span>
            <span className="font-bold">{formatCurrency(approval.billAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">{t('ap.approvals.requester')}</span>
            <span className="text-sm">{approval.requesterName}</span>
          </div>

          {approval.status === 'pending' || approval.status === 'in_review' ? (
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-green-600 hover:text-green-700 border-green-600 hover:border-green-700"
                onClick={() => handleApprove(approval.id, approval.billNumber)}
                disabled={approveMutation.isPending}
                data-testid={`button-approve-${approval.id}`}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                {t('ap.approvals.approve')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-red-600 hover:text-red-700 border-red-600 hover:border-red-700"
                onClick={() => handleReject(approval.id, approval.billNumber)}
                disabled={rejectMutation.isPending}
                data-testid={`button-reject-${approval.id}`}
              >
                <XCircle className="h-4 w-4 mr-1" />
                {t('ap.approvals.reject')}
              </Button>
            </div>
          ) : (
            <Badge variant={approval.status === 'approved' ? 'default' : 'destructive'}>
              {getStatusLabel(approval.status)}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-6 space-y-6" data-testid="page-approvals">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          {t('ap.approvals.title')}
        </h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          {t('ap.approvals.description')}
        </p>
      </div>

      {/* Kanban Board */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Pending Column */}
          <div>
            <Card className="bg-muted/50 mb-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('ap.approvals.columns.pending')}
                  <Badge variant="secondary" className="ml-2">
                    {groupedApprovals.pending.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
            </Card>
            <div className="space-y-3">
              {groupedApprovals.pending.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('ap.approvals.empty.pending')}
                </p>
              ) : (
                groupedApprovals.pending.map(renderApprovalCard)
              )}
            </div>
          </div>

          {/* In Review Column */}
          <div>
            <Card className="bg-muted/50 mb-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('ap.approvals.columns.in_review')}
                  <Badge variant="secondary" className="ml-2">
                    {groupedApprovals.in_review.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
            </Card>
            <div className="space-y-3">
              {groupedApprovals.in_review.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('ap.approvals.empty.in_review')}
                </p>
              ) : (
                groupedApprovals.in_review.map(renderApprovalCard)
              )}
            </div>
          </div>

          {/* Approved Column */}
          <div>
            <Card className="bg-green-500/10 mb-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('ap.approvals.columns.approved')}
                  <Badge variant="default" className="ml-2">
                    {groupedApprovals.approved.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
            </Card>
            <div className="space-y-3">
              {groupedApprovals.approved.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('ap.approvals.empty.approved')}
                </p>
              ) : (
                groupedApprovals.approved.map(renderApprovalCard)
              )}
            </div>
          </div>

          {/* Rejected Column */}
          <div>
            <Card className="bg-red-500/10 mb-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  {t('ap.approvals.columns.rejected')}
                  <Badge variant="destructive" className="ml-2">
                    {groupedApprovals.rejected.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
            </Card>
            <div className="space-y-3">
              {groupedApprovals.rejected.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('ap.approvals.empty.rejected')}
                </p>
              ) : (
                groupedApprovals.rejected.map(renderApprovalCard)
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

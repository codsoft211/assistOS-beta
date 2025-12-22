import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Send, RefreshCw } from "lucide-react";

interface DunningRun {
  id: string;
  campaignName: string;
  invoiceNumber: string;
  invoiceId: string;
  stage: string;
  lastSentDate: string | null;
  nextReminderDate: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  reminderCount: number;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toLowerCase()) {
    case 'completed':
      return 'default';
    case 'in_progress':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'pending':
      return 'secondary';
    default:
      return 'secondary';
  }
}

export default function DunningPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { toast } = useToast();
  const { t, i18n } = useTranslation('financeiro');
  
  const currentLang = i18n.language || 'pt';
  
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'pt-PT').format(date);
  };
  
  const getStatusLabel = (status: string) => {
    const key = `ar.dunning.status.${status.toLowerCase()}`;
    return t(key);
  };
  
  const getStageLabel = (stage: string) => {
    const key = `ar.dunning.stage.${stage}`;
    return t(key);
  };

  // Query key with filters
  const queryKey = [
    '/api/financeiro/ar/dunning',
    statusFilter !== 'all' ? { status: statusFilter } : {},
    searchQuery ? { search: searchQuery } : {},
  ].filter(item => typeof item === 'string' || Object.keys(item).length > 0);

  const { data, isLoading, error } = useQuery<{ runs: DunningRun[]; total: number }>({
    queryKey,
  });
  
  const dunningRuns = data?.runs || [];

  const sendReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/financeiro/ar/dunning/${id}/send`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ar/dunning'] });
      toast({
        title: t('ar.dunning.sendSuccess'),
        description: t('ar.dunning.sendSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ar.dunning.sendError'),
        description: error.message || t('ar.dunning.sendError'),
        variant: 'destructive',
      });
    },
  });

  const handleSendReminder = (id: string, invoiceNumber: string) => {
    if (window.confirm(t('ar.dunning.sendConfirm', { number: invoiceNumber }))) {
      sendReminderMutation.mutate(id);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-dunning">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {t('ar.dunning.title')}
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            {t('ar.dunning.description')}
          </p>
        </div>
      </div>

      {/* Filters Toolbar */}
      <Card data-testid="card-filters">
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <Input
              placeholder={t('ar.dunning.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
              data-testid="input-search"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-status-filter">
                <SelectValue placeholder={t('ar.dunning.filterStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ar.dunning.all')}</SelectItem>
                <SelectItem value="pending">{t('ar.dunning.status.pending')}</SelectItem>
                <SelectItem value="in_progress">{t('ar.dunning.status.in_progress')}</SelectItem>
                <SelectItem value="completed">{t('ar.dunning.status.completed')}</SelectItem>
                <SelectItem value="failed">{t('ar.dunning.status.failed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Dunning Runs Table */}
      <Card data-testid="card-dunning-runs">
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" data-testid={`skeleton-row-${i}`} />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-error">
              {t('ar.dunning.loadError')}
            </div>
          ) : dunningRuns && dunningRuns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground" data-testid="text-no-data">
              {t('ar.dunning.noCampaigns')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-dunning-runs">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('ar.dunning.table.campaign')}</TableHead>
                    <TableHead>{t('ar.dunning.table.invoice')}</TableHead>
                    <TableHead>{t('ar.dunning.table.stage')}</TableHead>
                    <TableHead>{t('ar.dunning.table.lastSent')}</TableHead>
                    <TableHead>{t('ar.dunning.table.nextReminder')}</TableHead>
                    <TableHead>{t('ar.dunning.table.reminders')}</TableHead>
                    <TableHead>{t('ar.dunning.table.status')}</TableHead>
                    <TableHead className="text-right">{t('ar.dunning.table.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dunningRuns?.map((run) => (
                    <TableRow key={run.id} data-testid={`row-dunning-${run.id}`}>
                      <TableCell className="font-medium" data-testid={`text-campaign-${run.id}`}>
                        {run.campaignName}
                      </TableCell>
                      <TableCell data-testid={`text-invoice-${run.id}`}>
                        {run.invoiceNumber}
                      </TableCell>
                      <TableCell data-testid={`text-stage-${run.id}`}>
                        {getStageLabel(run.stage)}
                      </TableCell>
                      <TableCell data-testid={`text-last-sent-${run.id}`}>
                        {formatDate(run.lastSentDate)}
                      </TableCell>
                      <TableCell data-testid={`text-next-reminder-${run.id}`}>
                        {formatDate(run.nextReminderDate)}
                      </TableCell>
                      <TableCell data-testid={`text-reminder-count-${run.id}`}>
                        {run.reminderCount}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={getStatusVariant(run.status)}
                          data-testid={`badge-status-${run.id}`}
                        >
                          {getStatusLabel(run.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendReminder(run.id, run.invoiceNumber)}
                          disabled={sendReminderMutation.isPending || run.status === 'completed'}
                          data-testid={`button-send-reminder-${run.id}`}
                        >
                          <Send className="h-4 w-4 mr-2" />
                          {t('ar.dunning.sendNow')}
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
    </div>
  );
}

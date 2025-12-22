import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Plus,
  FileText,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
} from "lucide-react";

interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId: string | null;
  clientName: string | null;
  issueDate: string;
  dueDate: string;
  totalAmount: number;
  status: string;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toLowerCase()) {
    case 'paid':
      return 'default';
    case 'sent':
      return 'default';
    case 'overdue':
      return 'destructive';
    case 'draft':
      return 'secondary';
    case 'cancelled':
      return 'outline';
    default:
      return 'secondary';
  }
}

function getStatusBadgeColor(status: string) {
  switch (status.toLowerCase()) {
    case 'paid':
      return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
    case 'sent':
      return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20";
    case 'overdue':
      return "bg-orange-500/10 text-orange-500 hover:bg-orange-500/20";
    case 'draft':
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
    case 'cancelled':
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
    case 'partial':
      return "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20";
    default:
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
  }
}

export default function InvoicesList() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const { toast } = useToast();
  const { t, i18n } = useTranslation('financeiro');
  
  const currentLang = i18n.language || 'pt';
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'pt-PT').format(date);
  };

  const getStatusLabel = (status: string) => {
    const statusKey = status.toLowerCase();
    return t(`ar.invoices.status.${statusKey}`, { defaultValue: status });
  };

  // Query key with filters
  const queryKey = [
    '/api/financeiro/invoices',
    statusFilter !== 'all' ? { status: statusFilter } : {},
    searchQuery ? { search: searchQuery } : {},
  ].filter(item => typeof item === 'string' || Object.keys(item).length > 0);

  const { data: invoices, isLoading, error } = useQuery<Invoice[]>({
    queryKey,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('/api/financeiro/invoices/' + id, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices'] });
      toast({
        title: t('ar.invoices.deleteSuccess'),
        description: t('ar.invoices.deleteDescription'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('ar.invoices.deleteError'),
        description: error.message || t('ar.invoices.deleteError'),
        variant: 'destructive',
      });
    },
  });

  const handleDelete = (id: string, invoiceNumber: string) => {
    if (window.confirm(t('ar.invoices.deleteConfirm', { number: invoiceNumber }))) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-invoices-list">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {t('ar.invoices.title')}
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            {t('ar.invoices.description')}
          </p>
        </div>
        <Button asChild data-testid="button-nova-fatura">
          <Link href="/financeiro/invoices/new">
            <Plus className="h-4 w-4 mr-2" />
            {t('ar.invoices.new')}
          </Link>
        </Button>
      </div>

      {/* Filters Toolbar */}
      <Card data-testid="card-filters">
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <Input
              placeholder={t('ar.invoices.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
              data-testid="input-search"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-status-filter">
                <SelectValue placeholder={t('ar.invoices.filterStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ar.invoices.status.all')}</SelectItem>
                <SelectItem value="draft">{t('ar.invoices.status.draft')}</SelectItem>
                <SelectItem value="sent">{t('ar.invoices.status.sent')}</SelectItem>
                <SelectItem value="paid">{t('ar.invoices.status.paid')}</SelectItem>
                <SelectItem value="overdue">{t('ar.invoices.status.overdue')}</SelectItem>
                <SelectItem value="cancelled">{t('ar.invoices.status.cancelled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card data-testid="card-invoices-table">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4" data-testid="loading-skeleton">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : error ? (
            <div className="p-12 text-center" data-testid="error-state">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                {t('ar.invoices.loadError')}
              </p>
            </div>
          ) : !invoices || invoices.length === 0 ? (
            <div className="p-12 text-center" data-testid="empty-state">
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">{t('ar.invoices.noInvoices')}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {searchQuery || statusFilter !== 'all'
                  ? t('ar.invoices.tryAdjustFilters')
                  : t('ar.invoices.createFirst')}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="table-invoices">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('ar.invoices.table.number')}</TableHead>
                    <TableHead>{t('ar.invoices.table.client')}</TableHead>
                    <TableHead>{t('ar.invoices.table.issueDate')}</TableHead>
                    <TableHead>{t('ar.invoices.table.dueDate')}</TableHead>
                    <TableHead className="text-right">{t('ar.invoices.table.amount')}</TableHead>
                    <TableHead>{t('ar.invoices.table.status')}</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id} data-testid={`row-invoice-${invoice.id}`}>
                      <TableCell className="font-medium" data-testid={`text-number-${invoice.id}`}>
                        {invoice.invoiceNumber}
                      </TableCell>
                      <TableCell data-testid={`text-client-${invoice.id}`}>
                        {invoice.clientName || '-'}
                      </TableCell>
                      <TableCell data-testid={`text-issue-date-${invoice.id}`}>
                        {formatDate(invoice.issueDate)}
                      </TableCell>
                      <TableCell data-testid={`text-due-date-${invoice.id}`}>
                        {formatDate(invoice.dueDate)}
                      </TableCell>
                      <TableCell className="text-right" data-testid={`text-amount-${invoice.id}`}>
                        {formatCurrency(invoice.totalAmount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={getStatusBadgeColor(invoice.status)}
                          data-testid={`badge-status-${invoice.id}`}
                        >
                          {getStatusLabel(invoice.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid={`button-actions-${invoice.id}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/financeiro/invoices/${invoice.id}`}>
                                <Eye className="h-4 w-4 mr-2" />
                                {t('ar.invoices.table.view')}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/financeiro/invoices/${invoice.id}/edit`}>
                                <Edit className="h-4 w-4 mr-2" />
                                {t('ar.invoices.table.edit')}
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(invoice.id, invoice.invoiceNumber)}
                              data-testid={`button-delete-${invoice.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              {t('ar.invoices.table.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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

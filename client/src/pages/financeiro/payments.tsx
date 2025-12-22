import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, CreditCard } from "lucide-react";
import { PaymentFormDialog } from "@/components/financeiro/payment-form-dialog";

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
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
};

const formatDate = (dateString: string) => {
  try {
    return format(new Date(dateString), "PPP", { locale: pt });
  } catch {
    return dateString;
  }
};

function getMethodLabel(method: string) {
  const labels: Record<string, string> = {
    MB: "Multibanco",
    Transferência: "Transferência Bancária",
    Cheque: "Cheque",
    Dinheiro: "Dinheiro",
    "MB Way": "MB Way",
    cash: "Dinheiro",
    bank_transfer: "Transferência",
    credit_card: "Cartão Crédito",
    debit_card: "Cartão Débito",
    check: "Cheque",
    other: "Outro",
  };
  return labels[method] || method;
}

export default function Payments() {
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("all");

  // Build query params
  const queryParams = new URLSearchParams();
  if (methodFilter && methodFilter !== "all") {
    queryParams.append("metodo", methodFilter);
  }
  const queryString = queryParams.toString();

  // Fetch payments
  const { data: payments = [], isLoading } = useQuery<Payment[]>({
    queryKey: ["/api/financeiro/recebimentos", { metodo: methodFilter }],
    queryFn: async () => {
      const url = `/api/financeiro/recebimentos${queryString ? `?${queryString}` : ""}`;
      const response = await fetch(url, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch payments");
      }
      return response.json();
    },
  });

  // Filter payments by search (client-side)
  const filteredPayments = payments.filter((payment) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      payment.faturaAssociada?.toLowerCase().includes(searchLower) ||
      payment.cliente?.toLowerCase().includes(searchLower) ||
      payment.referencia?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="p-6 space-y-6" data-testid="page-payments">
      {/* Header */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              Pagamentos
            </h1>
            <p className="text-muted-foreground" data-testid="text-page-description">
              Gestão de pagamentos recebidos
            </p>
          </div>
          <Button
            onClick={() => setShowPaymentDialog(true)}
            data-testid="button-new-payment"
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Pagamento
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-64">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar por fatura, cliente ou referência..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10"
                    data-testid="input-search"
                  />
                </div>
              </div>
              <Select value={methodFilter} onValueChange={setMethodFilter}>
                <SelectTrigger className="w-64" data-testid="select-method-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" data-testid="select-method-all">
                    Todos os Métodos
                  </SelectItem>
                  <SelectItem value="Dinheiro" data-testid="select-method-cash">
                    Dinheiro
                  </SelectItem>
                  <SelectItem value="Transferência" data-testid="select-method-transfer">
                    Transferência Bancária
                  </SelectItem>
                  <SelectItem value="Cheque" data-testid="select-method-check">
                    Cheque
                  </SelectItem>
                  <SelectItem value="MB" data-testid="select-method-mb">
                    Multibanco
                  </SelectItem>
                  <SelectItem value="MB Way" data-testid="select-method-mbway">
                    MB Way
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4" data-testid="loading-skeleton">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="text-center py-12" data-testid="empty-state">
              <CreditCard className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2" data-testid="text-empty-title">
                Nenhum pagamento encontrado
              </p>
              <p className="text-muted-foreground mb-4" data-testid="text-empty-description">
                Comece por registar o primeiro pagamento
              </p>
              <Button
                onClick={() => setShowPaymentDialog(true)}
                data-testid="button-empty-new-payment"
              >
                <Plus className="h-4 w-4 mr-2" />
                Novo Pagamento
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead data-testid="table-head-date">Data</TableHead>
                  <TableHead data-testid="table-head-invoice">Fatura</TableHead>
                  <TableHead data-testid="table-head-client">Cliente</TableHead>
                  <TableHead className="text-right" data-testid="table-head-amount">
                    Valor
                  </TableHead>
                  <TableHead data-testid="table-head-method">Método</TableHead>
                  <TableHead data-testid="table-head-reference">Referência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPayments.map((payment) => (
                  <TableRow key={payment.id} data-testid={`row-payment-${payment.id}`}>
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
                        <span className="text-muted-foreground" data-testid={`text-no-invoice-${payment.id}`}>
                          N/A
                        </span>
                      )}
                    </TableCell>
                    <TableCell data-testid={`cell-client-${payment.id}`}>
                      {payment.cliente || (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="text-right font-medium"
                      data-testid={`cell-amount-${payment.id}`}
                    >
                      {formatCurrency(payment.valor)}
                    </TableCell>
                    <TableCell data-testid={`cell-method-${payment.id}`}>
                      <Badge
                        variant="outline"
                        className="font-normal"
                        data-testid={`badge-method-${payment.id}`}
                      >
                        {getMethodLabel(payment.metodoPagamento)}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className="text-muted-foreground"
                      data-testid={`cell-reference-${payment.id}`}
                    >
                      {payment.referencia || "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Payment Form Dialog */}
      <PaymentFormDialog
        open={showPaymentDialog}
        onOpenChange={setShowPaymentDialog}
        onSuccess={() => {
          // Dialog will handle cache invalidation
        }}
      />
    </div>
  );
}

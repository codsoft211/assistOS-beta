import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Play, XCircle } from "lucide-react";

const paymentPlanSchema = z.object({
  planName: z.string().min(1, "Nome do plano obrigatório"),
  paymentDate: z.string().min(1, "Data de pagamento obrigatória"),
  billIds: z.array(z.string()).min(1, "Selecione pelo menos uma fatura"),
  notes: z.string().optional(),
});

type PaymentPlanFormData = z.infer<typeof paymentPlanSchema>;

interface PaymentPlan {
  id: string;
  planName: string;
  totalAmount: number;
  billsCount: number;
  paymentDate: string;
  status: 'scheduled' | 'executed' | 'cancelled';
}

interface VendorBill {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  totalAmount: number;
  dueDate: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("pt-PT").format(date);
};

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    scheduled: 'Agendado',
    executed: 'Executado',
    cancelled: 'Cancelado',
  };
  return labels[status] || status;
}

function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case 'executed':
      return 'default';
    case 'scheduled':
      return 'secondary';
    case 'cancelled':
      return 'destructive';
    default:
      return 'outline';
  }
}

export default function PaymentPlanningPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedBills, setSelectedBills] = useState<string[]>([]);

  const { data: plans, isLoading: plansLoading } = useQuery<PaymentPlan[]>({
    queryKey: ['/api/financeiro/ap/payment-planning'],
  });

  const { data: bills } = useQuery<VendorBill[]>({
    queryKey: ['/api/financeiro/ap/faturas-fornecedor', { status: 'approved' }],
  });

  const form = useForm<PaymentPlanFormData>({
    resolver: zodResolver(paymentPlanSchema),
    defaultValues: {
      planName: "",
      paymentDate: "",
      billIds: [],
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: PaymentPlanFormData) => {
      const selectedBillsData = bills?.filter(b => data.billIds.includes(b.id)) || [];
      const totalAmount = selectedBillsData.reduce((sum, bill) => sum + parseFloat(bill.totalAmount.toString()), 0);

      return await apiRequest("/api/financeiro/ap/payment-planning", "POST", {
        planName: data.planName,
        paymentDate: data.paymentDate,
        billIds: data.billIds,
        totalAmount: totalAmount.toFixed(2),
        notes: data.notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/payment-planning'] });
      toast({ title: "Plano de pagamento criado com sucesso" });
      setDialogOpen(false);
      setSelectedBills([]);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar plano de pagamento", variant: "destructive" });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/financeiro/ap/payment-planning/${id}/execute`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/payment-planning'] });
      toast({ title: "Plano executado com sucesso" });
    },
    onError: () => {
      toast({ title: "Erro ao executar plano", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/financeiro/ap/payment-planning/${id}/cancel`, "POST");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ap/payment-planning'] });
      toast({ title: "Plano cancelado" });
    },
  });

  const handleBillToggle = (billId: string) => {
    setSelectedBills(prev =>
      prev.includes(billId)
        ? prev.filter(id => id !== billId)
        : [...prev, billId]
    );
    
    const currentBillIds = form.getValues('billIds');
    if (currentBillIds.includes(billId)) {
      form.setValue('billIds', currentBillIds.filter(id => id !== billId));
    } else {
      form.setValue('billIds', [...currentBillIds, billId]);
    }
  };

  const onSubmit = (data: PaymentPlanFormData) => {
    createMutation.mutate(data);
  };

  const calculateSelectedTotal = () => {
    const selectedBillsData = bills?.filter(b => selectedBills.includes(b.id)) || [];
    return selectedBillsData.reduce((sum, bill) => sum + parseFloat(bill.totalAmount.toString()), 0);
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-payment-planning">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Planeamento de Pagamentos</h1>
          <p className="text-muted-foreground">Agrupar e agendar pagamentos de faturas</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-plan">
              <Plus className="mr-2 h-4 w-4" />
              Novo Plano
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Plano de Pagamento</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="planName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nome do Plano</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Ex: Pagamentos Janeiro 2025" data-testid="input-plan-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paymentDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Pagamento</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-payment-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Bill Selection */}
                <div>
                  <FormLabel>Selecionar Faturas</FormLabel>
                  <Card className="mt-2">
                    <CardContent className="pt-4">
                      <div className="max-h-60 overflow-y-auto">
                        {bills && bills.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            Nenhuma fatura aprovada disponível
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {bills?.map((bill) => (
                              <div
                                key={bill.id}
                                className="flex items-center space-x-2 p-2 hover:bg-muted rounded-lg"
                              >
                                <Checkbox
                                  checked={selectedBills.includes(bill.id)}
                                  onCheckedChange={() => handleBillToggle(bill.id)}
                                  data-testid={`checkbox-bill-${bill.id}`}
                                />
                                <div className="flex-1">
                                  <div className="flex justify-between">
                                    <span className="font-medium">{bill.invoiceNumber}</span>
                                    <span className="font-bold">{formatCurrency(parseFloat(bill.totalAmount.toString()))}</span>
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    {bill.supplierName} • Venc: {formatDate(bill.dueDate)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {selectedBills.length > 0 && (
                        <div className="mt-4 pt-4 border-t flex justify-between items-center">
                          <span className="font-medium">{selectedBills.length} fatura(s) selecionada(s)</span>
                          <span className="text-lg font-bold">{formatCurrency(calculateSelectedTotal())}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  {form.formState.errors.billIds && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.billIds.message}</p>
                  )}
                </div>

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Notas adicionais (opcional)" data-testid="textarea-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-plan">
                    {createMutation.isPending ? "Criando..." : "Criar Plano"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Payment Plans Table */}
      <Card>
        <CardContent className="pt-6">
          {plansLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table data-testid="table-payment-plans">
              <TableHeader>
                <TableRow>
                  <TableHead>Nome do Plano</TableHead>
                  <TableHead>Data de Pagamento</TableHead>
                  <TableHead>Faturas</TableHead>
                  <TableHead>Valor Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plans && plans.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhum plano de pagamento criado
                    </TableCell>
                  </TableRow>
                ) : (
                  plans?.map((plan) => (
                    <TableRow key={plan.id} data-testid={`row-plan-${plan.id}`}>
                      <TableCell className="font-medium">{plan.planName}</TableCell>
                      <TableCell>{formatDate(plan.paymentDate)}</TableCell>
                      <TableCell>{plan.billsCount}</TableCell>
                      <TableCell>{formatCurrency(plan.totalAmount)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusVariant(plan.status)}>
                          {getStatusLabel(plan.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {plan.status === 'scheduled' && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => executeMutation.mutate(plan.id)}
                                disabled={executeMutation.isPending}
                                data-testid={`button-execute-${plan.id}`}
                              >
                                <Play className="h-4 w-4 mr-1" />
                                Executar
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => cancelMutation.mutate(plan.id)}
                                disabled={cancelMutation.isPending}
                                data-testid={`button-cancel-${plan.id}`}
                              >
                                <XCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

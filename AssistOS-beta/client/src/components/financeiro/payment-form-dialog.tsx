import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
};

const paymentFormSchema = z.object({
  faturaId: z.string().optional(),
  valor: z.number().min(0.01, "Valor deve ser maior que 0"),
  dataRecebimento: z.date({
    required_error: "Selecione a data do pagamento",
  }),
  metodoPagamento: z.enum(["MB", "Transferência", "Cheque", "Dinheiro", "MB Way"], {
    required_error: "Selecione o método de pagamento",
  }),
  referencia: z.string().optional(),
  notas: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;

interface PaymentFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId?: string;
  onSuccess?: () => void;
}

export function PaymentFormDialog({
  open,
  onOpenChange,
  invoiceId,
  onSuccess,
}: PaymentFormDialogProps) {
  const { toast } = useToast();

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      faturaId: invoiceId,
      valor: 0,
      dataRecebimento: new Date(),
      metodoPagamento: "Transferência",
      referencia: "",
      notas: "",
    },
  });

  // Fetch invoice data if invoiceId is provided
  const { data: invoice } = useQuery({
    queryKey: ["/api/financeiro/invoices/" + invoiceId],
    queryFn: async () => {
      const data: any = await apiRequest(`/api/financeiro/invoices/${invoiceId}`, "GET");
      return {
        ...data,
        issueDate: new Date(data.issueDate),
        dueDate: new Date(data.dueDate),
      };
    },
    enabled: !!invoiceId,
  });

  // Fetch all invoices for selection (if no invoiceId provided)
  const { data: invoices = [] } = useQuery({
    queryKey: ["/api/financeiro/invoices", { status: "sent" }],
    queryFn: async () => {
      const data: any = await apiRequest("/api/financeiro/invoices?status=sent", "GET");
      return data as any[];
    },
    enabled: !invoiceId,
  });

  // Auto-fill amount with invoice total (can be edited for partial payments)
  useEffect(() => {
    if (invoice && invoice.totalAmount) {
      const remainingAmount = parseFloat(invoice.totalAmount) - parseFloat(invoice.paidAmount || 0);
      if (remainingAmount > 0) {
        form.setValue("valor", remainingAmount);
      }
    }
  }, [invoice, form]);

  // Create payment mutation
  const createMutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      return await apiRequest("/api/financeiro/recebimentos", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/recebimentos"] });
      if (form.getValues("faturaId")) {
        queryClient.invalidateQueries({
          queryKey: ["/api/financeiro/invoices/" + form.getValues("faturaId")],
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/invoices"] });
      toast({
        title: "Pagamento registado com sucesso",
        description: "O pagamento foi adicionado ao sistema.",
      });
      onOpenChange(false);
      form.reset();
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao registar pagamento",
        description: error.message || "Não foi possível registar o pagamento.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PaymentFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="dialog-payment-form">
        <DialogHeader>
          <DialogTitle data-testid="text-dialog-title">Registar Pagamento</DialogTitle>
          <DialogDescription data-testid="text-dialog-description">
            {invoice
              ? `Fatura #${invoice.invoiceNumber} - ${formatCurrency(invoice.totalAmount)}`
              : "Preencha os detalhes do pagamento"}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Invoice Selection (only if no invoiceId provided) */}
            {!invoiceId && (
              <FormField
                control={form.control}
                name="faturaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fatura (Opcional)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-invoice">
                          <SelectValue placeholder="Selecione uma fatura" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {invoices.map((inv: any) => (
                          <SelectItem
                            key={inv.id}
                            value={inv.id}
                            data-testid={`select-invoice-option-${inv.id}`}
                          >
                            #{inv.numero} - {formatCurrency(parseFloat(inv.valorTotal || 0))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Amount */}
            <FormField
              control={form.control}
              name="valor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      data-testid="input-amount"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Payment Date */}
            <FormField
              control={form.control}
              name="dataRecebimento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data do Pagamento *</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          data-testid="button-payment-date"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {field.value
                            ? format(field.value, "PPP", { locale: pt })
                            : "Selecione a data"}
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        locale={pt}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Payment Method */}
            <FormField
              control={form.control}
              name="metodoPagamento"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Método de Pagamento *</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-payment-method">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
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
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Reference */}
            <FormField
              control={form.control}
              name="referencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Referência</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nº do cheque, referência MB, etc."
                      {...field}
                      data-testid="input-reference"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Notes */}
            <FormField
              control={form.control}
              name="notas"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações adicionais"
                      {...field}
                      data-testid="textarea-notes"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending}
                data-testid="button-submit"
              >
                {createMutation.isPending ? "Guardando..." : "Registar Pagamento"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import InvoiceForm from "./invoice-form";

export default function InvoiceNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/financeiro/invoices', 'POST', {
        ...data,
        issueDate: data.issueDate.toISOString(),
        dueDate: data.dueDate.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/invoices'] });
      toast({
        title: 'Fatura criada com sucesso',
        description: 'A fatura foi criada e guardada no sistema.',
      });
      setLocation('/financeiro/invoices');
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao criar fatura',
        description: error.message || 'Não foi possível criar a fatura.',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = async (data: any) => {
    await createMutation.mutateAsync(data);
  };

  const handleCancel = () => {
    setLocation('/financeiro/invoices');
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-invoice-new">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Nova Fatura
        </h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Criar nova fatura
        </p>
      </div>

      <InvoiceForm
        mode="create"
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isSubmitting={createMutation.isPending}
      />
    </div>
  );
}

import { Badge } from "@/components/ui/badge";

interface StatusBadgeProps {
  status: string;
  type?: 'invoice' | 'bill' | 'payment' | 'approval' | 'generic';
}

export function getStatusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status.toLowerCase()) {
    case 'paid':
    case 'approved':
    case 'completed':
      return 'default';
    case 'sent':
    case 'pending':
    case 'in_progress':
    case 'scheduled':
      return 'default';
    case 'overdue':
    case 'rejected':
    case 'failed':
      return 'destructive';
    case 'draft':
      return 'secondary';
    case 'cancelled':
    case 'voided':
      return 'outline';
    case 'partially_paid':
      return 'default';
    default:
      return 'secondary';
  }
}

export function getStatusLabel(status: string, type: string = 'generic'): string {
  const labels: Record<string, Record<string, string>> = {
    invoice: {
      draft: 'Rascunho',
      sent: 'Enviada',
      paid: 'Paga',
      overdue: 'Vencida',
      cancelled: 'Cancelada',
      partial: 'Parcial',
    },
    bill: {
      draft: 'Rascunho',
      approved: 'Aprovada',
      scheduled: 'Agendada',
      overdue: 'Vencida',
      partially_paid: 'Parcialmente Paga',
      paid: 'Paga',
    },
    payment: {
      pending: 'Pendente',
      processing: 'Processando',
      completed: 'Concluído',
      failed: 'Falhado',
      cancelled: 'Cancelado',
    },
    approval: {
      pending: 'Pendente',
      approved: 'Aprovado',
      rejected: 'Rejeitado',
      in_review: 'Em Revisão',
    },
    generic: {
      draft: 'Rascunho',
      pending: 'Pendente',
      approved: 'Aprovado',
      completed: 'Concluído',
      rejected: 'Rejeitado',
      cancelled: 'Cancelado',
    },
  };

  return labels[type]?.[status.toLowerCase()] || status;
}

export function getStatusBadgeColor(status: string): string {
  switch (status.toLowerCase()) {
    case 'paid':
      return "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20";
    case 'approved':
    case 'completed':
      return "bg-green-500/10 text-green-500 hover:bg-green-500/20";
    case 'scheduled':
    case 'sent':
    case 'in_progress':
      return "bg-blue-500/10 text-blue-500 hover:bg-blue-500/20";
    case 'pending':
    case 'in_review':
      return "bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20";
    case 'overdue':
    case 'rejected':
    case 'failed':
      return "bg-red-500/10 text-red-500 hover:bg-red-500/20";
    case 'draft':
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
    case 'cancelled':
    case 'voided':
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
    case 'partial':
    case 'partially_paid':
    case 'processing':
      return "bg-purple-500/10 text-purple-500 hover:bg-purple-500/20";
    default:
      return "bg-gray-500/10 text-gray-500 hover:bg-gray-500/20";
  }
}

export default function StatusBadge({ status, type = 'generic' }: StatusBadgeProps) {
  return (
    <Badge
      className={getStatusBadgeColor(status)}
      data-testid={`badge-status-${status.toLowerCase()}`}
    >
      {getStatusLabel(status, type)}
    </Badge>
  );
}

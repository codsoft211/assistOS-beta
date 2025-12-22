import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { 
  Users, Plus, Mail, MoreVertical, X, Shield, Search, 
  Calendar, AlertCircle, Info, Loader2 
} from 'lucide-react';

import { apiRequest, queryClient } from '@/lib/queryClient';
import { SectionHeader } from '@/components/settings/common/SectionHeader';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { 
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, 
  DropdownMenuSeparator, DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { 
  Dialog, DialogContent, DialogDescription, DialogFooter, 
  DialogHeader, DialogTitle 
} from '@/components/ui/dialog';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { PaymentMethodSelector } from '@/components/billing/PaymentMethodSelector';

interface TeamMember {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  role: "owner" | "admin" | "user";
  status: "active" | "pending";
  joinedAt: string;
  invitedBy: string | null;
  seatType?: "free" | "paid" | "pending-paid";
}

interface TeamData {
  members: TeamMember[];
  pendingInvites: TeamMember[];
  totalCount: number;
  page: number;
  pageSize: number;
  currentUserRole: "owner" | "admin" | "user" | null;
}

interface BillingSummary {
  plan: {
    id: number;
    name: string;
    priceMonthly: string;
    pricePerSeat: string;
    freeSeatsIncluded: number;
    payingSeatsIncluded: number;
    creditsPerPayingUser: number;
  };
  seats: {
    freeSeatsAllocated: number;
    freeSeatsInUse: number;
    freeSeatsAvailable: number;
    payingSeatsActive: number;
    payingSeatsAllocated: number;
    payingSeatsProvisional: number;
    totalPayingSeats: number;
  };
  credits: {
    balance: number;
  };
  pendingInvites: {
    count: number;
    totalAmount: number;
  };
  nextSeatCost: number;
  canAddFreeSeat: boolean;
  defaultPaymentMethod?: {
    id: string;
    card: {
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    } | null;
  } | null;
}

interface ContextData {
  tenant: {
    id: string;
    name: string;
  };
  user: {
    id: string;
    activeTenantId: string;
  };
}

const roleLabel = (role: string) => {
  const labels: Record<string, string> = {
    owner: 'Proprietário',
    admin: 'Administrador',
    user: 'Membro'
  };
  return labels[role] || role;
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('pt-PT', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export function TeamSettings() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [confirmSeatModalOpen, setConfirmSeatModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [isInviteCheckLoading, setInviteCheckLoading] = useState(false);
  const [capacityModalInfo, setCapacityModalInfo] = useState<{
    message: string;
    pendingPaidInvites: number;
    pendingFreeInvites: number;
  } | null>(null);
  const pageSize = 10;
  
  // Fetch current user context for userId
  const { data: context } = useQuery<ContextData>({
    queryKey: ['/api/context'],
  });
  
  const currentUserId = context?.user?.id;
  
  // Fetch billing summary
  const { data: billingSummary } = useQuery<BillingSummary>({
    queryKey: ['/api/team/billing-summary'],
    queryFn: async () => {
      const res = await fetch('/api/team/billing-summary', { 
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error('Failed to fetch billing summary');
      }
      return res.json();
    },
    enabled: !!currentUserId,
  });
  
  // Fetch team members (paginated + search)
  const { data: teamData, isLoading, error } = useQuery<TeamData>({
    queryKey: ['/api/team', { query: searchQuery, page, size: pageSize }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('query', searchQuery);
      params.append('page', page.toString());
      params.append('size', pageSize.toString());
      
      console.log('[TeamSettings] Fetching team data from:', `/api/team?${params}`);
      const res = await fetch(`/api/team?${params}`, { 
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      });
      if (!res.ok) {
        console.error('[TeamSettings] API error:', res.status, res.statusText);
        throw new Error('Failed to fetch team members');
      }
      const data = await res.json();
      console.log('[TeamSettings] Team data received:', {
        membersCount: data.members?.length || 0,
        pendingInvitesCount: data.pendingInvites?.length || 0,
        currentUserRole: data.currentUserRole,
        totalCount: data.totalCount,
        fullData: data,
      });
      return data;
    },
    enabled: !!currentUserId,
  });
  
  const members = teamData?.members || [];
  const totalCount = teamData?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / pageSize);
  
  // CRITICAL FIX: Use currentUserRole from response (NOT from paginated members!)
  const currentUserRole = teamData?.currentUserRole;
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'owner';
  
  // Debug logging
  console.log('[TeamSettings] Debug info:', {
    currentUserId,
    teamDataExists: !!teamData,
    currentUserRole,
    isAdmin,
    membersCount: members.length,
    pendingInvitesCount: teamData?.pendingInvites?.length || 0,
  });
  
  // CRITICAL FIX: Use pendingInvites from response (NOT filtered from members)
  const pendingInvites = teamData?.pendingInvites || [];
  const activeMembers = members;
  const removablePaidSeats = billingSummary
    ? Math.max(
        0,
        billingSummary.seats.payingSeatsAllocated -
          Math.max(
            0,
            billingSummary.seats.payingSeatsActive - billingSummary.plan.payingSeatsIncluded,
          ) -
          billingSummary.seats.payingSeatsProvisional,
      )
    : 0;

  const nextSeatCostValue = (() => {
    if (!billingSummary) return null;
    if (typeof billingSummary.nextSeatCost === 'number' && !Number.isNaN(billingSummary.nextSeatCost) && billingSummary.nextSeatCost > 0) {
      return billingSummary.nextSeatCost;
    }
    if (billingSummary.plan.pricePerSeat) {
      const parsed = parseFloat(billingSummary.plan.pricePerSeat);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  })();
  
  // Reset page when search query changes
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1);
  };
  
  // Invite mutation
  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: 'admin' | 'user' }) => {
      const res = await apiRequest('POST', '/api/team/invite', data);
      return res.json();
    },
    onSuccess: (data: any) => {
      // Close modals first
      setInviteModalOpen(false);
      setConfirmSeatModalOpen(false);
      setInviteEmail('');
      setInviteRole('user');
      setSelectedPaymentMethodId(null);
      
      // Show toast immediately
      if (data.requiresPayment && data.paymentStatus === 'succeeded') {
        toast({ 
          title: 'Convite enviado e lugar pago adicionado',
          description: `Cobrado €${parseFloat(data.paymentAmount).toFixed(2)}. O convite foi enviado para ${data.email}.`,
        });
      } else if (data.seatType === 'free') {
        toast({ 
          title: 'Convite enviado (lugar gratuito)',
          description: `O convite foi enviado para ${data.email}.`,
        });
      } else {
        toast({ 
          title: 'Convite enviado com sucesso',
          description: `O convite foi enviado para ${data.email}.`,
        });
      }
      
      // Defer query invalidation to avoid race conditions with component unmounting
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/team'] });
        queryClient.invalidateQueries({ queryKey: ['/api/team/billing-summary'] });
      }, 0);
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao enviar convite', 
        description: error.message, 
        variant: 'destructive' 
      });
    }
  });

  // Change role mutation
  const changeRoleMutation = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: 'admin' | 'user' }) => {
      const res = await apiRequest('PATCH', `/api/team/${id}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Papel atualizado com sucesso' });
      
      // Defer query invalidation to avoid race conditions with component unmounting
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/team'] });
      }, 0);
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao atualizar papel', 
        description: error.message, 
        variant: 'destructive' 
      });
    }
  });

  // Remove member mutation (also used for revoking invites)
  const removeMemberMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/team/${id}`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      // Show toast first
      if (data.refundIssued) {
        toast({ 
          title: 'Convite revogado e reembolso processado',
          description: `Reembolso de €${parseFloat(data.refundAmount).toFixed(2)} foi processado.`,
        });
      } else {
        toast({ title: 'Membro removido com sucesso' });
      }
      
      // Defer query invalidation to avoid race conditions with component unmounting
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/team'] });
        queryClient.invalidateQueries({ queryKey: ['/api/team/billing-summary'] });
      }, 0);
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Erro ao remover membro', 
        description: error.message, 
        variant: 'destructive' 
      });
    }
  });

  const removeSeatMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/team/seats/remove', { count: 1 });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove seat');
      }
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Lugar pago removido' });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/team'] });
        queryClient.invalidateQueries({ queryKey: ['/api/team/billing-summary'] });
      }, 0);
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao remover lugar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Pre-flight check: validate email availability before showing payment modal
    setInviteCheckLoading(true);
    let checkData: any = null;
    try {
      const checkRes = await fetch('/api/team/invite/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });
      
      // ✅ FIXED: Handle both success (200) and error (400/500) responses
      checkData = await checkRes.json();
      
      if (!checkRes.ok) {
        // Handle actual errors (400 for validation, 500 for server errors)
        const errorData = checkData;
        
        // Check if it's a capacity error with detailed information
        if (errorData.requiresAction && errorData.details) {
          const { pendingPaidInvites, pendingFreeInvites, message } = errorData.details;
          setCapacityModalInfo({
            message,
            pendingPaidInvites,
            pendingFreeInvites,
          });
        } else {
          toast({
            title: 'Não é possível convidar',
            description: errorData.error || 'Falha na validação',
            variant: 'destructive',
          });
        }
        return;
      }
      
      // ✅ FIXED: Handle canInvite: false response (200 status but no capacity)
      if (checkData.canInvite === false) {
        // No capacity available - show capacity modal
        if (checkData.details) {
          const { pendingPaidInvites, pendingFreeInvites, message } = checkData.details;
          setCapacityModalInfo({
            message,
            pendingPaidInvites,
            pendingFreeInvites,
          });
        } else {
          toast({
            title: 'Não é possível convidar',
            description: checkData.message || 'Não há lugares disponíveis',
            variant: 'destructive',
          });
        }
        return;
      }
      
      // ✅ FIXED: Use checkData from above (already parsed)
      console.log('[TeamSettings] Invite check response:', checkData);
    } catch (error: any) {
      toast({
        title: 'Erro',
        description: error.message || 'Falha ao validar convite',
        variant: 'destructive',
      });
      return;
    } finally {
      setInviteCheckLoading(false);
    }
    
    // ✅ FIXED: Use the check response data instead of stale billingSummary
    // Only show payment modal if:
    // 1. Check says we'll use a paid seat AND it's not available (willUsePaidSeat: false)
    // 2. OR if check data is missing, fall back to billingSummary check
    const willUsePaidSeat = checkData?.seatAllocation?.willUsePaidSeat ?? false;
    const willUseFreeSeat = checkData?.seatAllocation?.willUseFreeSeat ?? false;
    const payingSeatsAvailable = checkData?.seatAllocation?.payingSeatsAvailable ?? 0;
    
    // If we have a paying seat available, proceed directly (no payment needed)
    if (willUsePaidSeat && payingSeatsAvailable > 0) {
      console.log('[TeamSettings] ✅ Paying seat available, proceeding without payment');
      inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
      return;
    }
    
    // If we have a free seat available, proceed directly
    if (willUseFreeSeat) {
      console.log('[TeamSettings] ✅ Free seat available, proceeding without payment');
      inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
      return;
    }
    
    // No seats available - show payment modal (fallback to billingSummary if check data missing)
    if (billingSummary && !billingSummary.canAddFreeSeat && billingSummary.nextSeatCost > 0) {
      console.log('[TeamSettings] ⚠️ No seats available, showing payment modal');
      setInviteModalOpen(false);
      setConfirmSeatModalOpen(true);
    } else {
      // Proceed directly (shouldn't happen if check worked correctly)
      inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
    }
  };

  const handleConfirmSeatPurchase = async () => {
    // If a payment method is selected and it's different from default, set it as default first
    if (selectedPaymentMethodId && billingSummary?.defaultPaymentMethod?.id !== selectedPaymentMethodId) {
      try {
        const res = await fetch(`/api/billing/payment-methods/${selectedPaymentMethodId}/set-default`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) {
          throw new Error('Failed to set default payment method');
        }
      } catch (error: any) {
        toast({
          title: 'Error',
          description: error.message || 'Failed to update payment method',
          variant: 'destructive',
        });
        return;
      }
    }

    // Close modal first, then trigger mutation after a brief delay
    setConfirmSeatModalOpen(false);
    
    // Defer mutation to avoid race conditions with modal unmounting
    setTimeout(() => {
      inviteMutation.mutate({ email: inviteEmail, role: inviteRole });
    }, 100);
  };

  const handleCapacityModalClose = () => {
    setCapacityModalInfo(null);
  };

  const handleCapacityProceedToPurchase = () => {
    if (!billingSummary) {
      toast({
        title: 'Informação de faturação indisponível',
        description: 'Não foi possível carregar o custo do lugar. Atualize a página e tente novamente.',
        variant: 'destructive',
      });
      setCapacityModalInfo(null);
      return;
    }
    setCapacityModalInfo(null);
    setInviteModalOpen(false);
    setConfirmSeatModalOpen(true);
  };

  const handleChangeRole = (userId: string, role: 'admin' | 'user') => {
    changeRoleMutation.mutate({ id: userId, role });
  };

  const handleRemoveMember = (id: string) => {
    if (confirm('Tem a certeza que deseja remover este membro da equipa?')) {
      removeMemberMutation.mutate(id);
    }
  };

  const handleRevokeInvite = (id: string) => {
    if (confirm('Tem a certeza que deseja revogar este convite?')) {
      removeMemberMutation.mutate(id);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="team-settings-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6" data-testid="error-team">
        <SectionHeader title="Equipa" description="Erro ao carregar" icon={Users} />
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center gap-2 text-center">
              <AlertCircle className="size-8 text-destructive" data-testid="icon-error" />
              <p className="font-medium" data-testid="text-error-title">Erro ao carregar membros da equipa</p>
              <p className="text-sm text-muted-foreground" data-testid="text-error-message">
                {error.message || 'Ocorreu um erro ao carregar os dados'}
              </p>
              <Button 
                variant="outline" 
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/team'] })}
                data-testid="button-retry-team"
              >
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="team-settings">
      <SectionHeader 
        title="Equipa" 
        description="Gerir membros e convites da equipa"
        icon={Users}
      />

      {/* SECTION 1: Active Members List */}
      <Card data-testid="card-active-members">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" />
                Membros da Equipa
              </CardTitle>
              <Badge variant="outline" data-testid="badge-members-count">
                {activeMembers.length} {activeMembers.length === 1 ? 'membro' : 'membros'}
              </Badge>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input 
                  placeholder="Pesquisar membros..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  className="pl-9"
                  data-testid="input-search-members"
                />
              </div>
              
              {isAdmin && (
                <Button 
                  onClick={() => setInviteModalOpen(true)}
                  data-testid="button-invite-member"
                >
                  <Plus className="size-4 mr-2" />
                  Convidar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {activeMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground rounded-lg border border-dashed" data-testid="empty-members">
              {searchQuery ? 'Nenhum membro encontrado' : 'Sem membros ativos'}
            </div>
          ) : (
            <div className="space-y-2">
            {activeMembers.map((member) => (
              <div 
                key={member.id} 
                className="flex items-center justify-between p-6 rounded-lg border hover-elevate"
                data-testid={`member-card-${member.id}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {member.firstName && member.firstName[0]}{member.lastName && member.lastName[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium" data-testid={`member-name-${member.id}`}>
                      {member.firstName} {member.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground" data-testid={`member-email-${member.id}`}>
                      {member.email}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                      <Calendar className="size-3" />
                      Entrou em {formatDate(member.joinedAt)}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={member.role === 'owner' ? 'default' : 'secondary'}
                    data-testid={`member-role-${member.id}`}
                  >
                    {roleLabel(member.role)}
                  </Badge>
                  
                  {isAdmin && member.role !== 'owner' && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          data-testid={`button-actions-${member.id}`}
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {member.role === 'user' && member.userId && (
                          <DropdownMenuItem 
                            onClick={() => handleChangeRole(member.userId!, 'admin')}
                            data-testid={`action-promote-${member.id}`}
                          >
                            <Shield className="size-4 mr-2" />
                            Promover a Admin
                          </DropdownMenuItem>
                        )}
                        {member.role === 'admin' && member.userId && (
                          <DropdownMenuItem 
                            onClick={() => handleChangeRole(member.userId!, 'user')}
                            data-testid={`action-demote-${member.id}`}
                          >
                            <Shield className="size-4 mr-2" />
                            Despromover a Membro
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleRemoveMember(member.id)}
                          className="text-destructive"
                          data-testid={`action-remove-${member.id}`}
                        >
                          <X className="size-4 mr-2" />
                          Remover da Equipa
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            ))}
            </div>
          )}
        </CardContent>
        
        {/* Pagination */}
        {totalPages > 1 && (
          <CardFooter className="flex items-center justify-between">
            <Button 
              variant="outline" 
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
              data-testid="button-prev-page"
            >
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            <Button 
              variant="outline" 
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage(page + 1)}
              data-testid="button-next-page"
            >
              Próxima
            </Button>
          </CardFooter>
        )}
      </Card>

      {/* SECTION 2: Pending Invites (Admin-only) */}
      {isAdmin && (
        <>
          <Separator />
          
          <Card data-testid="card-pending-invites">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Mail className="size-5" />
                  Convites Pendentes
                </CardTitle>
                <Badge variant="outline" data-testid="badge-invites-count">
                  {pendingInvites.length} {pendingInvites.length === 1 ? 'pendente' : 'pendentes'}
                </Badge>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {pendingInvites.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground rounded-lg border border-dashed" data-testid="empty-invites">
                  Sem convites pendentes
                </div>
              ) : (
                <div className="space-y-2">
                {pendingInvites.map((invite) => (
                  <div 
                    key={invite.id} 
                    className="flex items-center justify-between p-6 rounded-lg border hover-elevate"
                    data-testid={`invite-card-${invite.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="size-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium" data-testid={`invite-email-${invite.id}`}>
                          {invite.email}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Convidado em {formatDate(invite.joinedAt)}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" data-testid={`invite-role-${invite.id}`}>
                        {roleLabel(invite.role)}
                      </Badge>
                      
                      {/* Seat Type Badge */}
                      {invite.seatType && (
                        <Badge 
                          variant="default"
                          className={
                            invite.seatType === 'free' 
                              ? 'bg-gray-900 text-white'
                              : 'bg-primary text-primary-foreground'
                          }
                          data-testid={`invite-seat-type-${invite.id}`}
                        >
                          {invite.seatType === 'free' ? 'Lugar gratuito' : 'Lugar pago'}
                        </Badge>
                      )}
                      
                      {/* Resend button DISABLED (no backend endpoint) */}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm"
                            disabled
                            data-testid={`button-resend-${invite.id}`}
                          >
                            Reenviar
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Funcionalidade disponível em breve</p>
                        </TooltipContent>
                      </Tooltip>
                      
                      {/* Revoke button */}
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleRevokeInvite(invite.id)}
                        data-testid={`button-revoke-${invite.id}`}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* SECTION 3: Billing Info (Admin-only) */}
      {isAdmin && billingSummary && (
        <>
          <Separator />
          <Card data-testid="card-billing-summary">
            <CardHeader>
              <CardTitle className="text-base">Informação de Faturação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Plan Overview */}
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Plano Atual</p>
                <p className="font-semibold text-lg">{billingSummary.plan.name}</p>
                <p className="text-xs text-muted-foreground">
                  €{parseFloat(billingSummary.plan.priceMonthly).toFixed(2)}/mês
                </p>
              </div>

              {/* Total Seats Overview */}
              <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Total Seats</p>
                    <p className="text-xs text-muted-foreground">
                      {billingSummary.seats.payingSeatsActive + billingSummary.seats.freeSeatsInUse} / {billingSummary.plan.payingSeatsIncluded + billingSummary.seats.payingSeatsAllocated + billingSummary.seats.freeSeatsAllocated} seats used
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {Math.max(0, billingSummary.plan.payingSeatsIncluded + billingSummary.seats.payingSeatsAllocated + billingSummary.seats.freeSeatsAllocated - billingSummary.seats.payingSeatsActive - billingSummary.seats.freeSeatsInUse)} available
                    </p>
                  </div>
                </div>
                <Progress 
                  value={((billingSummary.seats.payingSeatsActive + billingSummary.seats.freeSeatsInUse) / (billingSummary.plan.payingSeatsIncluded + billingSummary.seats.payingSeatsAllocated + billingSummary.seats.freeSeatsAllocated)) * 100} 
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {billingSummary.seats.payingSeatsActive} paying + {billingSummary.seats.freeSeatsInUse} free users
                </p>
              </div>

              {/* Paying Seats Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Paying Seats</p>
                    <p className="text-xs text-muted-foreground">
                      {billingSummary.seats.payingSeatsActive} / {billingSummary.plan.payingSeatsIncluded + billingSummary.seats.payingSeatsAllocated} seats used
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {Math.max(0, billingSummary.plan.payingSeatsIncluded + billingSummary.seats.payingSeatsAllocated - billingSummary.seats.payingSeatsActive)} available
                    </p>
                  </div>
                </div>
                <Progress 
                  value={(billingSummary.seats.payingSeatsActive / (billingSummary.plan.payingSeatsIncluded + billingSummary.seats.payingSeatsAllocated)) * 100} 
                  className="h-2"
                />
                <p className="text-xs text-muted-foreground">
                  {billingSummary.plan.payingSeatsIncluded} included in plan
                  {billingSummary.seats.payingSeatsAllocated > 0 && `, ${billingSummary.seats.payingSeatsAllocated} additional purchased`}
                  {billingSummary.seats.payingSeatsProvisional > 0 && ` (${billingSummary.seats.payingSeatsProvisional} pending invite${billingSummary.seats.payingSeatsProvisional > 1 ? 's' : ''})`}
                </p>
              </div>

              {/* Seat removal UI temporarily disabled
              {billingSummary.seats.payingSeatsAllocated > 0 && (
                <div className="rounded-lg border p-3 bg-muted/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Seat Occupancy</p>
                      <p className="text-xs text-muted-foreground">
                        {removablePaidSeats > 0
                          ? `${removablePaidSeats} purchased seat${removablePaidSeats > 1 ? 's' : ''} free to remove`
                          : 'All purchased seats are in use or reserved'}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={removablePaidSeats === 0 || removeSeatMutation.isPending}
                      onClick={() => removeSeatMutation.mutate()}
                    >
                      {removeSeatMutation.isPending ? 'Removing…' : 'Remove Seat'}
                    </Button>
                  </div>
                  {removablePaidSeats === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Remove a member or cancel pending invites before freeing a paid seat.
                    </p>
                  )}
                </div>
              )}
              */}

              {/* Free Seats Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Free Seats</p>
                    <p className="text-xs text-muted-foreground">
                      {billingSummary.seats.freeSeatsInUse} / {billingSummary.seats.freeSeatsAllocated} seats used
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {billingSummary.seats.freeSeatsAvailable} available
                    </p>
                  </div>
                </div>
                <Progress 
                  value={(billingSummary.seats.freeSeatsInUse / billingSummary.seats.freeSeatsAllocated) * 100} 
                  className="h-2"
                />
              </div>

              {/* Credits Section */}
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Créditos</p>
                <p className="font-semibold">{billingSummary.credits.balance.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">
                  +{billingSummary.plan.creditsPerPayingUser} por utilizador pago
                </p>
              </div>
              
              {/* Next Seat Cost */}
              {billingSummary.nextSeatCost > 0 && (
                <div className="rounded-lg bg-muted p-3 space-y-1">
                  <p className="text-sm font-medium">Próximo Lugar</p>
                  <p className="text-xs text-muted-foreground">
                    {billingSummary.canAddFreeSeat 
                      ? 'Gratuito (lugar incluído no plano)'
                      : `€${parseFloat(billingSummary.plan.pricePerSeat).toFixed(2)} (cobrado imediatamente)`
                    }
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* SECTION 4: Invite Modal */}
      <Dialog open={inviteModalOpen} onOpenChange={setInviteModalOpen}>
        <DialogContent data-testid="invite-modal">
          <DialogHeader>
            <DialogTitle>Convidar Novo Membro</DialogTitle>
            <DialogDescription>
              Envie um convite por email para adicionar um membro à equipa
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleInviteSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email"
                  type="email"
                  placeholder="exemplo@empresa.pt"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  data-testid="input-invite-email"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="role">Papel</Label>
                <Select 
                  value={inviteRole} 
                  onValueChange={(value) => setInviteRole(value as 'admin' | 'user')}
                >
                  <SelectTrigger data-testid="select-invite-role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Membro</SelectItem>
                    <SelectItem value="admin">Administrador</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Info className="size-3" />
                  Apenas pode convidar admins ou membros (não proprietários)
                </p>
              </div>
            </div>
            
            <DialogFooter className="mt-6">
              <Button 
                variant="outline" 
                type="button"
                onClick={() => setInviteModalOpen(false)}
                data-testid="button-cancel-invite"
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                disabled={inviteMutation.isPending || isInviteCheckLoading}
                data-testid="button-submit-invite"
              >
                {isInviteCheckLoading ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    A validar...
                  </>
                ) : inviteMutation.isPending ? (
                  'A enviar...'
                ) : (
                  'Enviar Convite'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Capacity Resolution Modal */}
      <Dialog
        open={!!capacityModalInfo}
        onOpenChange={(open) => {
          if (!open) {
            handleCapacityModalClose();
          }
        }}
      >
        <DialogContent data-testid="capacity-modal">
          <DialogHeader>
            <DialogTitle>Capacidade esgotada</DialogTitle>
            <DialogDescription>
              {capacityModalInfo?.message || 'Todos os lugares estão em uso ou reservados por convites pendentes.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-medium">Convites pendentes</p>
              <div className="flex items-center justify-between text-sm">
                <span>Pagos:</span>
                <span className="font-semibold">{capacityModalInfo?.pendingPaidInvites ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Gratuitos:</span>
                <span className="font-semibold">{capacityModalInfo?.pendingFreeInvites ?? 0}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Remova convites pendentes para libertar lugares ou compre um lugar adicional imediatamente.
              </p>
            </div>

            {nextSeatCostValue && (
              <div className="rounded-lg bg-muted/60 p-4 space-y-1">
                <p className="text-sm font-medium">Próximo lugar pago</p>
                <p className="text-lg font-semibold text-foreground">€{nextSeatCostValue.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground">
                  Será cobrado imediatamente e receberá créditos adicionais.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <Button 
              variant="outline" 
              onClick={handleCapacityModalClose}
              className="w-full sm:w-auto"
            >
              Gerir convites pendentes
            </Button>
            <Button 
              onClick={handleCapacityProceedToPurchase}
              className="w-full sm:w-auto"
            >
              {nextSeatCostValue ? `Comprar lugar (€${nextSeatCostValue.toFixed(2)})` : 'Comprar lugar adicional'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SECTION 5: Seat Confirmation Modal (Replit-style) */}
      <Dialog 
        open={confirmSeatModalOpen} 
        onOpenChange={(open) => {
          setConfirmSeatModalOpen(open);
          if (!open) {
            // Reset selected payment method when modal closes
            setSelectedPaymentMethodId(null);
          }
        }}
      >
        <DialogContent data-testid="confirm-seat-modal" className="max-w-md max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Adicionar Lugar Pago</DialogTitle>
            <DialogDescription>
              Confirme a adição de um novo lugar à sua equipa
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
            {/* Member Info */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{inviteEmail}</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">{roleLabel(inviteRole)}</span>
              </div>
            </div>

            {/* Payment Method Selection */}
            {billingSummary && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-2">Payment Method</p>
                  <PaymentMethodSelector
                    onSelect={setSelectedPaymentMethodId}
                    selectedPaymentMethodId={selectedPaymentMethodId}
                    amount={parseFloat(billingSummary.plan.pricePerSeat)}
                    currency="EUR"
                  />
                </div>

                {/* Billing Details */}
                <div className="rounded-lg bg-muted p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="size-5 text-amber-600 mt-0.5" />
                    <div className="space-y-2 flex-1">
                      <p className="text-sm font-medium">Será cobrado imediatamente</p>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Custo por lugar:</span>
                          <span className="font-medium text-foreground">
                            €{parseFloat(billingSummary.plan.pricePerSeat).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Créditos concedidos:</span>
                          <span className="font-medium text-foreground">
                            +{billingSummary.plan.creditsPerPayingUser}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">
                      O convite será enviado para <strong>{inviteEmail}</strong>. 
                      Se o convite for recusado ou expirar, será emitido um reembolso automático.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter className="mt-4 border-t pt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                setConfirmSeatModalOpen(false);
                setInviteModalOpen(true); // Go back to invite modal
              }}
              data-testid="button-cancel-seat"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleConfirmSeatPurchase}
              disabled={inviteMutation.isPending || !selectedPaymentMethodId}
              data-testid="button-confirm-seat"
            >
              {inviteMutation.isPending ? 'A processar...' : 'Confirmar e Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

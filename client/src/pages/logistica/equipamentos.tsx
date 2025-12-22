import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Search, 
  Filter, 
  Eye, 
  LogOut, 
  LogIn, 
  Wrench,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";

// ==================== TYPES ====================

interface Equipment {
  id: string;
  name: string;
  serialNumber: string;
  category: string;
  warehouseId: string;
  warehouseName: string;
  status: 'available' | 'allocated' | 'maintenance' | 'retired';
  condition: string | null;
  lastMaintenanceDate: string | null;
  nextMaintenanceDate: string | null;
  currentAllocation: {
    id: string;
    projectId: string | null;
    userId: string;
    userName: string;
    allocatedAt: string;
  } | null;
}

interface EquipmentDetail {
  equipment: {
    id: string;
    name: string;
    serialNumber: string;
    category: string;
    description: string;
    warehouseId: string;
    status: string;
    condition: string | null;
  };
  currentAllocation: {
    projectId: string | null;
    projectName: string | null;
    userId: string;
    userName: string;
    allocatedAt: string;
    returnBy: string | null;
  } | null;
  allocationHistory: Array<{
    id: string;
    projectName: string;
    userName: string;
    allocatedAt: string;
    returnedAt: string | null;
  }>;
  maintenanceRecords: Array<{
    id: string;
    date: string;
    type: string;
    notes: string;
    condition: string;
  }>;
  conditionHistory: Array<{
    id: string;
    date: string;
    condition: string;
    notes: string;
  }>;
}

interface Warehouse {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
}

interface User {
  id: string;
  name: string;
}

// ==================== VALIDATION SCHEMAS ====================

const checkoutSchema = z.object({
  warehouseId: z.string().min(1, "Warehouse required"),
  projectId: z.string().optional(),
  userId: z.string().min(1, "User required"),
  returnBy: z.date().optional(),
  notes: z.string().optional()
});

type CheckoutFormData = z.infer<typeof checkoutSchema>;

const checkinSchema = z.object({
  condition: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
  notes: z.string().optional()
});

type CheckinFormData = z.infer<typeof checkinSchema>;

const maintenanceSchema = z.object({
  type: z.enum(['preventive', 'corrective']),
  scheduledDate: z.date({ required_error: "Scheduled date required" }),
  notes: z.string().optional()
});

type MaintenanceFormData = z.infer<typeof maintenanceSchema>;

// ==================== HELPER FUNCTIONS ====================

const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" => {
  switch (status) {
    case 'available':
      return 'default';
    case 'allocated':
      return 'secondary';
    case 'maintenance':
      return 'destructive';
    default:
      return 'secondary';
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'available':
      return 'Disponível';
    case 'allocated':
      return 'Alocado';
    case 'maintenance':
      return 'Manutenção';
    case 'retired':
      return 'Inativo';
    default:
      return status;
  }
};

const getConditionBadgeVariant = (condition: string | null): "default" | "secondary" | "destructive" => {
  switch (condition) {
    case 'excellent':
      return 'default';
    case 'good':
      return 'default';
    case 'fair':
      return 'secondary';
    case 'poor':
      return 'destructive';
    default:
      return 'secondary';
  }
};

const getConditionLabel = (condition: string | null): string => {
  if (!condition) return 'N/A';
  switch (condition) {
    case 'excellent':
      return 'Excelente';
    case 'good':
      return 'Bom';
    case 'fair':
      return 'Regular';
    case 'poor':
      return 'Mau';
    default:
      return condition;
  }
};

// ==================== CHECKOUT DIALOG ====================

function CheckoutDialog({ 
  equipment, 
  warehouses, 
  projects,
  users,
  onSuccess 
}: { 
  equipment: Equipment; 
  warehouses: Warehouse[];
  projects: Project[];
  users: User[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CheckoutFormData>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      warehouseId: equipment.warehouseId,
      projectId: "",
      userId: "",
      notes: ""
    }
  });

  const checkoutMutation = useMutation({
    mutationFn: async (data: CheckoutFormData) => {
      return apiRequest(`/api/logistica/equipment/checkout`, {
        method: "POST",
        body: JSON.stringify({
          equipmentId: equipment.id,
          warehouseId: data.warehouseId,
          projectId: data.projectId || undefined,
          userId: data.userId,
          returnBy: data.returnBy?.toISOString(),
          notes: data.notes
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Checkout realizado",
        description: "Equipamento alocado com sucesso"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/logistica/equipment'] });
      setOpen(false);
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Failed to checkout equipment",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: CheckoutFormData) => {
    checkoutMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-checkout">
          <LogOut className="h-4 w-4 mr-2" />
          Checkout
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-checkout">
        <DialogHeader>
          <DialogTitle>Checkout Equipamento</DialogTitle>
          <DialogDescription>
            {equipment.name} - {equipment.serialNumber}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Armazém</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-warehouse-checkout">
                        <SelectValue placeholder="Selecionar armazém" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id} data-testid={`select-item-warehouse-${w.id}`}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Projeto (opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-project-checkout">
                        <SelectValue placeholder="Selecionar projeto" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id} data-testid={`select-item-project-${p.id}`}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Utilizador</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-user-checkout">
                        <SelectValue placeholder="Selecionar utilizador" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id} data-testid={`select-item-user-${u.id}`}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="returnBy"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Retornar Até (opcional)</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-returnby-checkout"
                        >
                          {field.value ? (
                            format(field.value, "PPP", { locale: pt })
                          ) : (
                            <span>Escolher data</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Observações..."
                      {...field}
                      data-testid="textarea-notes-checkout"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                data-testid="button-cancel-checkout"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={checkoutMutation.isPending}
                data-testid="button-submit-checkout"
              >
                {checkoutMutation.isPending ? "A processar..." : "Checkout"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ==================== CHECKIN DIALOG ====================

function CheckinDialog({ 
  equipment, 
  allocationId,
  onSuccess 
}: { 
  equipment: Equipment; 
  allocationId: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CheckinFormData>({
    resolver: zodResolver(checkinSchema),
    defaultValues: {
      notes: ""
    }
  });

  const checkinMutation = useMutation({
    mutationFn: async (data: CheckinFormData) => {
      return apiRequest(`/api/logistica/equipment/checkin`, {
        method: "POST",
        body: JSON.stringify({
          allocationId,
          condition: data.condition,
          notes: data.notes
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Checkin realizado",
        description: "Equipamento devolvido com sucesso"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/logistica/equipment'] });
      setOpen(false);
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Failed to checkin equipment",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: CheckinFormData) => {
    checkinMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-checkin">
          <LogIn className="h-4 w-4 mr-2" />
          Checkin
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-checkin">
        <DialogHeader>
          <DialogTitle>Checkin Equipamento</DialogTitle>
          <DialogDescription>
            {equipment.name} - {equipment.serialNumber}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="condition"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condição</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-condition-checkin">
                        <SelectValue placeholder="Selecionar condição" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="excellent">Excelente</SelectItem>
                      <SelectItem value="good">Bom</SelectItem>
                      <SelectItem value="fair">Regular</SelectItem>
                      <SelectItem value="poor">Mau</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas (opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Observações..."
                      {...field}
                      data-testid="textarea-notes-checkin"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                data-testid="button-cancel-checkin"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={checkinMutation.isPending}
                data-testid="button-submit-checkin"
              >
                {checkinMutation.isPending ? "A processar..." : "Checkin"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ==================== MAINTENANCE DIALOG ====================

function MaintenanceDialog({ 
  equipment, 
  onSuccess 
}: { 
  equipment: Equipment; 
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<MaintenanceFormData>({
    resolver: zodResolver(maintenanceSchema),
    defaultValues: {
      type: 'preventive',
      notes: ""
    }
  });

  const maintenanceMutation = useMutation({
    mutationFn: async (data: MaintenanceFormData) => {
      return apiRequest(`/api/logistica/equipment/maintenance`, {
        method: "POST",
        body: JSON.stringify({
          equipmentId: equipment.id,
          type: data.type,
          scheduledDate: data.scheduledDate.toISOString(),
          notes: data.notes
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Manutenção agendada",
        description: "Manutenção agendada com sucesso"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/logistica/equipment'] });
      setOpen(false);
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Failed to schedule maintenance",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: MaintenanceFormData) => {
    maintenanceMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-maintenance">
          <Wrench className="h-4 w-4 mr-2" />
          Manutenção
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-maintenance">
        <DialogHeader>
          <DialogTitle>Agendar Manutenção</DialogTitle>
          <DialogDescription>
            {equipment.name} - {equipment.serialNumber}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-type-maintenance">
                        <SelectValue placeholder="Selecionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="preventive">Preventiva</SelectItem>
                      <SelectItem value="corrective">Corretiva</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scheduledDate"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Data Agendada</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          className={cn(
                            "pl-3 text-left font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                          data-testid="button-scheduleddate-maintenance"
                        >
                          {field.value ? (
                            format(field.value, "PPP", { locale: pt })
                          ) : (
                            <span>Escolher data</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Descrição da manutenção..."
                      {...field}
                      data-testid="textarea-notes-maintenance"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setOpen(false)}
                data-testid="button-cancel-maintenance"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={maintenanceMutation.isPending}
                data-testid="button-submit-maintenance"
              >
                {maintenanceMutation.isPending ? "A processar..." : "Agendar"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ==================== EQUIPMENT DETAIL DIALOG ====================

function EquipmentDetailDialog({ 
  equipmentId,
  warehouses,
  projects,
  users
}: { 
  equipmentId: string;
  warehouses: Warehouse[];
  projects: Project[];
  users: User[];
}) {
  const [open, setOpen] = useState(false);

  const { data: detail, isLoading } = useQuery<EquipmentDetail>({
    queryKey: ['/api/logistica/equipment', equipmentId],
    enabled: open
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" data-testid={`button-detail-${equipmentId}`}>
          <Eye className="h-4 w-4 mr-2" />
          Ver
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-detail">
        <DialogHeader>
          <DialogTitle>Detalhes do Equipamento</DialogTitle>
          {detail && (
            <DialogDescription>
              {detail.equipment.name} - {detail.equipment.serialNumber}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : detail ? (
          <div className="space-y-6">
            {/* Equipment Info */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Nome</p>
                <p className="font-medium" data-testid="text-equipment-name">{detail.equipment.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Número de Série</p>
                <p className="font-medium" data-testid="text-equipment-serial">{detail.equipment.serialNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Categoria</p>
                <p className="font-medium" data-testid="text-equipment-category">{detail.equipment.category}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge variant={getStatusBadgeVariant(detail.equipment.status)} data-testid="badge-equipment-status">
                  {getStatusLabel(detail.equipment.status)}
                </Badge>
              </div>
              {detail.equipment.description && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Descrição</p>
                  <p data-testid="text-equipment-description">{detail.equipment.description}</p>
                </div>
              )}
            </div>

            {/* Current Allocation */}
            {detail.currentAllocation && (
              <div>
                <h3 className="font-semibold mb-2">Alocação Atual</h3>
                <div className="bg-muted p-4 rounded-lg space-y-2">
                  <p data-testid="text-current-allocation-user">
                    <span className="text-muted-foreground">Utilizador:</span> {detail.currentAllocation.userName}
                  </p>
                  {detail.currentAllocation.projectName && (
                    <p data-testid="text-current-allocation-project">
                      <span className="text-muted-foreground">Projeto:</span> {detail.currentAllocation.projectName}
                    </p>
                  )}
                  <p data-testid="text-current-allocation-date">
                    <span className="text-muted-foreground">Desde:</span>{' '}
                    {format(new Date(detail.currentAllocation.allocatedAt), "PPP", { locale: pt })}
                  </p>
                  {detail.currentAllocation.returnBy && (
                    <p data-testid="text-current-allocation-returnby">
                      <span className="text-muted-foreground">Retornar até:</span>{' '}
                      {format(new Date(detail.currentAllocation.returnBy), "PPP", { locale: pt })}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Allocation History */}
            <div>
              <h3 className="font-semibold mb-2">Histórico de Alocações</h3>
              {detail.allocationHistory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Projeto</TableHead>
                      <TableHead>Utilizador</TableHead>
                      <TableHead>Alocado em</TableHead>
                      <TableHead>Devolvido em</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.allocationHistory.map((alloc) => (
                      <TableRow key={alloc.id} data-testid={`row-allocation-${alloc.id}`}>
                        <TableCell>{alloc.projectName}</TableCell>
                        <TableCell>{alloc.userName}</TableCell>
                        <TableCell>{format(new Date(alloc.allocatedAt), "PP", { locale: pt })}</TableCell>
                        <TableCell>
                          {alloc.returnedAt ? format(new Date(alloc.returnedAt), "PP", { locale: pt }) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">Sem histórico</p>
              )}
            </div>

            {/* Maintenance Records */}
            <div>
              <h3 className="font-semibold mb-2">Registos de Manutenção</h3>
              {detail.maintenanceRecords.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.maintenanceRecords.map((maint) => (
                      <TableRow key={maint.id} data-testid={`row-maintenance-${maint.id}`}>
                        <TableCell>{maint.date ? format(new Date(maint.date), "PP", { locale: pt }) : '-'}</TableCell>
                        <TableCell>{maint.type}</TableCell>
                        <TableCell>{maint.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">Sem registos</p>
              )}
            </div>

            {/* Condition History */}
            <div>
              <h3 className="font-semibold mb-2">Histórico de Condição</h3>
              {detail.conditionHistory.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Condição</TableHead>
                      <TableHead>Notas</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.conditionHistory.map((cond) => (
                      <TableRow key={cond.id} data-testid={`row-condition-${cond.id}`}>
                        <TableCell>{format(new Date(cond.date), "PP", { locale: pt })}</TableCell>
                        <TableCell>
                          <Badge variant={getConditionBadgeVariant(cond.condition)}>
                            {getConditionLabel(cond.condition)}
                          </Badge>
                        </TableCell>
                        <TableCell>{cond.notes || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-sm">Sem histórico</p>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ==================== MAIN PAGE ====================

export default function EquipamentosPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const limit = 50;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch equipment list
  const { data: equipmentData, isLoading } = useQuery({
    queryKey: ['/api/logistica/equipment', { 
      search: debouncedSearch, 
      status: statusFilter, 
      warehouseId: warehouseFilter,
      page,
      limit 
    }],
  });

  // Fetch warehouses for filter
  const { data: warehousesData } = useQuery<{ warehouses: Warehouse[] }>({
    queryKey: ['/api/logistica/warehouses'],
  });

  // Fetch projects for checkout
  const { data: projectsData } = useQuery<{ projects: Project[] }>({
    queryKey: ['/api/modules/projects/projects'],
  });

  // Fetch users for checkout
  const { data: usersData } = useQuery<{ users: User[] }>({
    queryKey: ['/api/team/users'],
  });

  const warehouses = warehousesData?.warehouses || [];
  const projects = projectsData?.projects || [];
  const users = usersData?.users || [];
  const equipment = equipmentData?.equipment || [];
  const total = equipmentData?.total || 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold" data-testid="heading-equipamentos">Gestão de Equipamentos</h1>
        <p className="text-muted-foreground">
          Gerir equipamentos, alocações e manutenção
        </p>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome ou série..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                <SelectItem value="available">Disponível</SelectItem>
                <SelectItem value="allocated">Alocado</SelectItem>
                <SelectItem value="maintenance">Manutenção</SelectItem>
                <SelectItem value="retired">Inativo</SelectItem>
              </SelectContent>
            </Select>

            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger data-testid="select-warehouse-filter">
                <SelectValue placeholder="Todos os armazéns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todos</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("");
                  setWarehouseFilter("");
                  setPage(1);
                }}
                data-testid="button-clear-filters"
              >
                <Filter className="h-4 w-4 mr-2" />
                Limpar
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Equipment Table */}
      <Card>
        <CardHeader>
          <CardTitle>Equipamentos</CardTitle>
          <CardDescription>
            {total} equipamento{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : equipment.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground" data-testid="text-empty-state">
                Nenhum equipamento encontrado
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Série</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Armazém</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Alocado a</TableHead>
                    <TableHead>Última Manutenção</TableHead>
                    <TableHead>Condição</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equipment.map((eq) => (
                    <TableRow key={eq.id} data-testid={`row-equipment-${eq.id}`}>
                      <TableCell className="font-mono" data-testid={`text-serial-${eq.id}`}>
                        {eq.serialNumber}
                      </TableCell>
                      <TableCell data-testid={`text-name-${eq.id}`}>{eq.name}</TableCell>
                      <TableCell data-testid={`text-category-${eq.id}`}>{eq.category}</TableCell>
                      <TableCell data-testid={`text-warehouse-${eq.id}`}>{eq.warehouseName}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(eq.status)} data-testid={`badge-status-${eq.id}`}>
                          {getStatusLabel(eq.status)}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-allocated-${eq.id}`}>
                        {eq.currentAllocation ? eq.currentAllocation.userName : '-'}
                      </TableCell>
                      <TableCell data-testid={`text-lastmaint-${eq.id}`}>
                        {eq.lastMaintenanceDate
                          ? formatDistanceToNow(new Date(eq.lastMaintenanceDate), {
                              addSuffix: true,
                              locale: pt
                            })
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getConditionBadgeVariant(eq.condition)} data-testid={`badge-condition-${eq.id}`}>
                          {getConditionLabel(eq.condition)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <EquipmentDetailDialog 
                            equipmentId={eq.id} 
                            warehouses={warehouses}
                            projects={projects}
                            users={users}
                          />
                          {eq.status === 'available' && (
                            <CheckoutDialog 
                              equipment={eq}
                              warehouses={warehouses}
                              projects={projects}
                              users={users}
                              onSuccess={() => {}}
                            />
                          )}
                          {eq.status === 'allocated' && eq.currentAllocation && (
                            <CheckinDialog
                              equipment={eq}
                              allocationId={eq.currentAllocation.id}
                              onSuccess={() => {}}
                            />
                          )}
                          <MaintenanceDialog 
                            equipment={eq}
                            onSuccess={() => {}}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                    Página {page} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      data-testid="button-next-page"
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

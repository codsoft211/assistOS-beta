import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Search, 
  Filter, 
  Plus,
  Eye, 
  Pencil,
  ChevronLeft,
  ChevronRight,
  Warehouse,
  Package,
  MapPin,
  TrendingUp,
  AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

// ==================== TYPES ====================

interface WarehouseListItem {
  id: string;
  name: string;
  code: string;
  address: string;
  city: string;
  country: string;
  status: 'active' | 'inactive';
  capacity: {
    total: number;
    used: number;
    percentage: number;
  };
  productCount: number;
  locationCount: number;
  recentTransfers: number;
  alerts: {
    lowStock: number;
    overstocked: number;
  };
}

interface WarehouseDetail {
  warehouse: {
    id: string;
    name: string;
    code: string;
    address: string;
    city: string;
    country: string;
    status: string;
    contact: string;
    manager: string | null;
  };
  capacity: {
    total: number;
    used: number;
    available: number;
    percentage: number;
  };
  locations: Array<{
    id: string;
    name: string;
    zone: string;
    aisle: string;
    level: string;
    capacity: number;
    occupied: number;
  }>;
  inventory: Array<{
    productId: string;
    productName: string;
    quantity: number;
    location: string;
  }>;
  recentTransfers: Array<{
    id: string;
    type: 'in' | 'out';
    productName: string;
    quantity: number;
    from: string;
    to: string;
    date: string;
  }>;
  stats: {
    totalProducts: number;
    totalLocations: number;
    utilizationRate: number;
    transfersThisMonth: number;
    lowStockCount: number;
  };
}

interface User {
  id: string;
  name: string;
}

// ==================== VALIDATION SCHEMAS ====================

const createWarehouseSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  code: z.string().min(1, "Código é obrigatório"),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  contact: z.string().optional(),
  manager: z.string().optional()
});

type CreateWarehouseFormData = z.infer<typeof createWarehouseSchema>;

const editWarehouseSchema = createWarehouseSchema.extend({
  status: z.enum(['active', 'inactive']).optional()
});

type EditWarehouseFormData = z.infer<typeof editWarehouseSchema>;

// ==================== HELPER FUNCTIONS ====================

const getStatusBadgeVariant = (status: string): "default" | "secondary" => {
  return status === 'active' ? 'default' : 'secondary';
};

const getStatusLabel = (status: string): string => {
  return status === 'active' ? 'Ativo' : 'Inativo';
};

// ==================== CREATE WAREHOUSE DIALOG ====================

function CreateWarehouseDialog({ 
  users,
  onSuccess 
}: { 
  users: User[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateWarehouseFormData>({
    resolver: zodResolver(createWarehouseSchema),
    defaultValues: {
      name: "",
      code: "",
      address: "",
      city: "",
      country: "PT",
      contact: "",
      manager: ""
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateWarehouseFormData) => {
      return apiRequest("POST", '/api/logistica/warehouses', data);
    },
    onSuccess: () => {
      toast({
        title: "Armazém criado",
        description: "O armazém foi criado com sucesso"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/logistica/warehouses'] });
      setOpen(false);
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao criar armazém",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: CreateWarehouseFormData) => {
    createMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-warehouse">
          <Plus className="h-4 w-4 mr-2" />
          Novo Armazém
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-create-warehouse" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar Novo Armazém</DialogTitle>
          <DialogDescription>
            Preencha os dados do novo armazém
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Nome do armazém"
                        data-testid="input-name-create"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Código único"
                        data-testid="input-code-create"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Morada</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Morada completa"
                      data-testid="input-address-create"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Cidade"
                        data-testid="input-city-create"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>País</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="País"
                        data-testid="input-country-create"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="contact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contacto</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Email ou telefone"
                      data-testid="input-contact-create"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="manager"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gestor</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-manager-create">
                        <SelectValue placeholder="Selecionar gestor" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="" data-testid="select-item-manager-none">
                        Nenhum
                      </SelectItem>
                      {users.map((user) => (
                        <SelectItem 
                          key={user.id} 
                          value={user.id}
                          data-testid={`select-item-manager-${user.id}`}
                        >
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-create"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={createMutation.isPending}
                data-testid="button-submit-create"
              >
                {createMutation.isPending ? "A criar..." : "Criar Armazém"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ==================== EDIT WAREHOUSE DIALOG ====================

function EditWarehouseDialog({ 
  warehouse,
  users,
  onSuccess 
}: { 
  warehouse: WarehouseListItem;
  users: User[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<EditWarehouseFormData>({
    resolver: zodResolver(editWarehouseSchema),
    defaultValues: {
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
      city: warehouse.city,
      country: warehouse.country,
      contact: "",
      manager: "",
      status: warehouse.status
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: EditWarehouseFormData) => {
      return apiRequest("PATCH", `/api/logistica/warehouses/${warehouse.id}`, data);
    },
    onSuccess: () => {
      toast({
        title: "Armazém atualizado",
        description: "As alterações foram guardadas com sucesso"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/logistica/warehouses'] });
      setOpen(false);
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao atualizar armazém",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: EditWarehouseFormData) => {
    updateMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid={`button-edit-${warehouse.id}`}>
          <Pencil className="h-4 w-4 mr-2" />
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-edit-warehouse" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar Armazém</DialogTitle>
          <DialogDescription>
            {warehouse.name}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Nome do armazém"
                        data-testid="input-name-edit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código *</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Código único"
                        data-testid="input-code-edit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Morada</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Morada completa"
                      data-testid="input-address-edit"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="Cidade"
                        data-testid="input-city-edit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>País</FormLabel>
                    <FormControl>
                      <Input 
                        {...field} 
                        placeholder="País"
                        data-testid="input-country-edit"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="contact"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contacto</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Email ou telefone"
                      data-testid="input-contact-edit"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="manager"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gestor</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-manager-edit">
                          <SelectValue placeholder="Selecionar gestor" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="" data-testid="select-item-manager-none">
                          Nenhum
                        </SelectItem>
                        {users.map((user) => (
                          <SelectItem 
                            key={user.id} 
                            value={user.id}
                            data-testid={`select-item-manager-${user.id}`}
                          >
                            {user.name}
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
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status-edit">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active" data-testid="select-item-status-active">
                          Ativo
                        </SelectItem>
                        <SelectItem value="inactive" data-testid="select-item-status-inactive">
                          Inativo
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-edit"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
                data-testid="button-submit-edit"
              >
                {updateMutation.isPending ? "A guardar..." : "Guardar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ==================== WAREHOUSE DETAIL DIALOG ====================

function WarehouseDetailDialog({ 
  warehouseId,
  onClose
}: { 
  warehouseId: string;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/logistica/warehouses', warehouseId],
    enabled: !!warehouseId
  });

  const detail = data as WarehouseDetail | undefined;

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-warehouse-detail">
        <DialogHeader>
          <DialogTitle>
            {isLoading ? "A carregar..." : detail?.warehouse.name}
          </DialogTitle>
          <DialogDescription>
            {!isLoading && detail && (
              <span>
                {detail.warehouse.code} • {detail.warehouse.city}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        ) : detail ? (
          <Tabs defaultValue="overview" data-testid="tabs-warehouse-detail">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview" data-testid="tab-overview">
                Overview
              </TabsTrigger>
              <TabsTrigger value="locations" data-testid="tab-locations">
                Localizações
              </TabsTrigger>
              <TabsTrigger value="inventory" data-testid="tab-inventory">
                Inventário
              </TabsTrigger>
              <TabsTrigger value="transfers" data-testid="tab-transfers">
                Transferências
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4">
              {/* Warehouse Info */}
              <Card data-testid="card-warehouse-info">
                <CardHeader>
                  <CardTitle>Informação do Armazém</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Código</p>
                    <p className="font-medium" data-testid="text-warehouse-code">
                      {detail.warehouse.code}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Estado</p>
                    <Badge variant={getStatusBadgeVariant(detail.warehouse.status)}>
                      {getStatusLabel(detail.warehouse.status)}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Morada</p>
                    <p className="font-medium">{detail.warehouse.address || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Contacto</p>
                    <p className="font-medium">{detail.warehouse.contact || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Gestor</p>
                    <p className="font-medium">{detail.warehouse.manager || 'N/A'}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Capacity */}
              <Card data-testid="card-capacity">
                <CardHeader>
                  <CardTitle>Capacidade</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Utilização</span>
                      <span className="text-sm font-medium" data-testid="text-capacity-percentage">
                        {detail.capacity.percentage}%
                      </span>
                    </div>
                    <Progress value={detail.capacity.percentage} data-testid="progress-capacity" />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Total</p>
                      <p className="text-2xl font-bold" data-testid="text-capacity-total">
                        {detail.capacity.total.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Usado</p>
                      <p className="text-2xl font-bold" data-testid="text-capacity-used">
                        {detail.capacity.used.toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Disponível</p>
                      <p className="text-2xl font-bold" data-testid="text-capacity-available">
                        {detail.capacity.available.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card data-testid="card-stat-products">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Produtos</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" data-testid="text-stat-products">
                      {detail.stats.totalProducts}
                    </p>
                  </CardContent>
                </Card>
                <Card data-testid="card-stat-locations">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Localizações</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" data-testid="text-stat-locations">
                      {detail.stats.totalLocations}
                    </p>
                  </CardContent>
                </Card>
                <Card data-testid="card-stat-transfers">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Transferências (mês)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold" data-testid="text-stat-transfers">
                      {detail.stats.transfersThisMonth}
                    </p>
                  </CardContent>
                </Card>
                <Card data-testid="card-stat-lowstock">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Stock Baixo</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold text-destructive" data-testid="text-stat-lowstock">
                      {detail.stats.lowStockCount}
                    </p>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="locations" className="space-y-4">
              <Table data-testid="table-locations">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead>Corredor</TableHead>
                    <TableHead>Nível</TableHead>
                    <TableHead>Capacidade</TableHead>
                    <TableHead>Ocupado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.locations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Sem localizações
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.locations.map((location) => (
                      <TableRow key={location.id} data-testid={`row-location-${location.id}`}>
                        <TableCell className="font-medium">{location.name}</TableCell>
                        <TableCell>{location.zone || 'N/A'}</TableCell>
                        <TableCell>{location.aisle || 'N/A'}</TableCell>
                        <TableCell>{location.level || 'N/A'}</TableCell>
                        <TableCell>{location.capacity.toLocaleString()}</TableCell>
                        <TableCell>{location.occupied.toLocaleString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="inventory" className="space-y-4">
              <Table data-testid="table-inventory">
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Localização</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.inventory.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground">
                        Sem inventário
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.inventory.map((item) => (
                      <TableRow key={item.productId} data-testid={`row-inventory-${item.productId}`}>
                        <TableCell className="font-medium">{item.productName}</TableCell>
                        <TableCell>{item.quantity.toLocaleString()}</TableCell>
                        <TableCell>{item.location}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>

            <TabsContent value="transfers" className="space-y-4">
              <Table data-testid="table-transfers">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>De</TableHead>
                    <TableHead>Para</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.recentTransfers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Sem transferências
                      </TableCell>
                    </TableRow>
                  ) : (
                    detail.recentTransfers.map((transfer) => (
                      <TableRow key={transfer.id} data-testid={`row-transfer-${transfer.id}`}>
                        <TableCell>
                          <Badge variant={transfer.type === 'in' ? 'default' : 'secondary'}>
                            {transfer.type === 'in' ? 'Entrada' : 'Saída'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{transfer.productName}</TableCell>
                        <TableCell>{transfer.quantity.toLocaleString()}</TableCell>
                        <TableCell>{transfer.from}</TableCell>
                        <TableCell>{transfer.to}</TableCell>
                        <TableCell>
                          {new Date(transfer.date).toLocaleDateString('pt-PT')}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="text-center text-muted-foreground">
            Erro ao carregar detalhes do armazém
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==================== MAIN PAGE ====================

export default function ArmazensPage() {
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null);
  const { toast } = useToast();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1); // Reset page on search
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  // Fetch warehouses
  const { data, isLoading } = useQuery({
    queryKey: ['/api/logistica/warehouses', { search: searchDebounced, status: statusFilter, page }]
  });

  const warehousesData = data as { warehouses: WarehouseListItem[]; total: number; page: number; limit: number } | undefined;

  // Fetch users for manager selection
  const { data: usersData } = useQuery({
    queryKey: ['/api/team/users']
  });

  const users = (usersData as { users: User[] } | undefined)?.users || [];

  const totalPages = warehousesData ? Math.ceil(warehousesData.total / warehousesData.limit) : 1;

  return (
    <div className="p-6 space-y-6" data-testid="page-warehouses">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="title-page">
            Gestão de Armazéns
          </h1>
          <p className="text-muted-foreground">
            Gerir armazéns, localizações e transferências
          </p>
        </div>

        <CreateWarehouseDialog 
          users={users}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['/api/logistica/warehouses'] });
          }}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Pesquisar armazéns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </div>

        <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setPage(1); }}>
          <SelectTrigger className="w-full md:w-[200px]" data-testid="select-status-filter">
            <SelectValue placeholder="Todos os estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="" data-testid="select-item-all">Todos</SelectItem>
            <SelectItem value="active" data-testid="select-item-active">Ativos</SelectItem>
            <SelectItem value="inactive" data-testid="select-item-inactive">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Warehouses Grid/Table */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : warehousesData && warehousesData.warehouses.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="grid-warehouses">
            {warehousesData.warehouses.map((warehouse) => (
              <Card 
                key={warehouse.id} 
                className="hover-elevate"
                data-testid={`card-warehouse-${warehouse.id}`}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="flex items-center gap-2">
                        <Warehouse className="h-5 w-5" />
                        {warehouse.name}
                      </CardTitle>
                      <CardDescription>
                        {warehouse.code} • {warehouse.city}, {warehouse.country}
                      </CardDescription>
                    </div>
                    <Badge variant={getStatusBadgeVariant(warehouse.status)}>
                      {getStatusLabel(warehouse.status)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Capacity Bar */}
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm text-muted-foreground">Capacidade</span>
                      <span className="text-sm font-medium">
                        {warehouse.capacity.percentage}%
                      </span>
                    </div>
                    <Progress value={warehouse.capacity.percentage} />
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span>{warehouse.productCount} produtos</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{warehouse.locationCount} localizações</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span>{warehouse.recentTransfers} transferências</span>
                    </div>
                    {warehouse.alerts.lowStock > 0 && (
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <span>{warehouse.alerts.lowStock} alertas</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setSelectedWarehouseId(warehouse.id)}
                      data-testid={`button-view-${warehouse.id}`}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Detalhes
                    </Button>
                    <EditWarehouseDialog
                      warehouse={warehouse}
                      users={users}
                      onSuccess={() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/logistica/warehouses'] });
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm" data-testid="text-pagination">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12" data-testid="empty-state">
            <Warehouse className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Sem armazéns</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {search || statusFilter ? 
                "Não foram encontrados armazéns com os filtros aplicados." :
                "Comece por criar o seu primeiro armazém."
              }
            </p>
            {!search && !statusFilter && (
              <CreateWarehouseDialog 
                users={users}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/logistica/warehouses'] });
                }}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Warehouse Detail Dialog */}
      {selectedWarehouseId && (
        <WarehouseDetailDialog
          warehouseId={selectedWarehouseId}
          onClose={() => setSelectedWarehouseId(null)}
        />
      )}
    </div>
  );
}

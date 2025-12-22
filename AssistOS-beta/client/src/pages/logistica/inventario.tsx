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
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Search, 
  Filter, 
  Eye, 
  ArrowUpDown, 
  Truck, 
  Package, 
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
  Info
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";

// ==================== TYPES ====================

interface ProductInventory {
  id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  totalStock: number;
  reorderPoint: number;
  stockStatus: 'low' | 'ok' | 'excess';
  warehouses: Array<{
    warehouseId: string;
    warehouseName: string;
    quantity: number;
  }>;
  lastMovementDate: string | null;
  avgCost: number;
}

interface ProductDetail {
  product: {
    id: string;
    name: string;
    sku: string;
    description: string;
    category: string;
    unit: string;
    reorderPoint: number;
  };
  stockByWarehouse: Array<{
    warehouseId: string;
    name: string;
    quantity: number;
    location: string;
  }>;
  recentMovements: Array<{
    id: string;
    type: string;
    quantity: number;
    warehouseName: string;
    date: string;
    reference: string;
    notes: string;
  }>;
  totalStock: number;
  totalValue: number;
  avgCost: number;
}

interface Warehouse {
  id: string;
  name: string;
}

// ==================== VALIDATION SCHEMAS ====================

const adjustmentSchema = z.object({
  warehouseId: z.string().min(1, "Warehouse required"),
  quantity: z.number({ required_error: "Quantity required" }),
  notes: z.string().optional()
});

type AdjustmentFormData = z.infer<typeof adjustmentSchema>;

const transferSchema = z.object({
  fromWarehouseId: z.string().min(1, "From warehouse required"),
  toWarehouseId: z.string().min(1, "To warehouse required"),
  quantity: z.number({ required_error: "Quantity required" }).positive("Must be positive"),
  notes: z.string().optional()
});

type TransferFormData = z.infer<typeof transferSchema>;

// ==================== HELPER FUNCTIONS ====================

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR'
  }).format(value);
};

const getStockBadgeVariant = (status: string): "default" | "secondary" | "destructive" => {
  switch (status) {
    case 'low':
      return 'destructive';
    case 'ok':
      return 'default';
    case 'excess':
      return 'secondary';
    default:
      return 'secondary';
  }
};

const getStockStatusLabel = (status: string): string => {
  switch (status) {
    case 'low':
      return 'Baixo';
    case 'ok':
      return 'OK';
    case 'excess':
      return 'Excesso';
    default:
      return status;
  }
};

const getMovementTypeLabel = (type: string): string => {
  switch (type) {
    case 'in':
      return 'Entrada';
    case 'out':
      return 'Saída';
    case 'adjustment':
      return 'Ajuste';
    case 'transfer':
      return 'Transferência';
    default:
      return type;
  }
};

const getMovementTypeBadgeVariant = (type: string): "default" | "secondary" | "outline" | "destructive" => {
  switch (type) {
    case 'in':
      return 'default';
    case 'out':
      return 'destructive';
    case 'adjustment':
      return 'secondary';
    case 'transfer':
      return 'outline';
    default:
      return 'secondary';
  }
};

// ==================== STOCK ADJUSTMENT DIALOG ====================

function StockAdjustmentDialog({ 
  product, 
  warehouses, 
  onSuccess 
}: { 
  product: ProductInventory; 
  warehouses: Warehouse[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<AdjustmentFormData>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      warehouseId: "",
      quantity: 0,
      notes: ""
    }
  });

  const adjustmentMutation = useMutation({
    mutationFn: async (data: AdjustmentFormData) => {
      return apiRequest(`/api/logistica/inventory/adjustment`, {
        method: "POST",
        body: JSON.stringify({
          productId: product.id,
          warehouseId: data.warehouseId,
          quantity: data.quantity,
          notes: data.notes
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Ajuste criado",
        description: "Ajuste de stock criado com sucesso"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/logistica/inventory'] });
      setOpen(false);
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Failed to create adjustment",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: AdjustmentFormData) => {
    adjustmentMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-ajustar-stock">
          <ArrowUpDown className="h-4 w-4 mr-2" />
          Ajustar Stock
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-ajuste-stock">
        <DialogHeader>
          <DialogTitle>Ajustar Stock - {product.name}</DialogTitle>
          <DialogDescription>
            SKU: {product.sku}
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
                      <SelectTrigger data-testid="select-warehouse-ajuste">
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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="Positivo para adicionar, negativo para remover" 
                      {...field}
                      onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                      data-testid="input-quantidade-ajuste"
                    />
                  </FormControl>
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
                      placeholder="Razão do ajuste..."
                      {...field}
                      data-testid="textarea-notas-ajuste"
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
                data-testid="button-cancelar-ajuste"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={adjustmentMutation.isPending}
                data-testid="button-confirmar-ajuste"
              >
                {adjustmentMutation.isPending ? "A criar..." : "Criar Ajuste"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ==================== STOCK TRANSFER DIALOG ====================

function StockTransferDialog({ 
  product, 
  warehouses, 
  onSuccess 
}: { 
  product: ProductInventory; 
  warehouses: Warehouse[];
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<TransferFormData>({
    resolver: zodResolver(transferSchema),
    defaultValues: {
      fromWarehouseId: "",
      toWarehouseId: "",
      quantity: 0,
      notes: ""
    }
  });

  const transferMutation = useMutation({
    mutationFn: async (data: TransferFormData) => {
      return apiRequest(`/api/logistica/inventory/transfer`, {
        method: "POST",
        body: JSON.stringify({
          productId: product.id,
          fromWarehouseId: data.fromWarehouseId,
          toWarehouseId: data.toWarehouseId,
          quantity: data.quantity,
          notes: data.notes
        })
      });
    },
    onSuccess: () => {
      toast({
        title: "Transferência criada",
        description: "Transferência de stock criada com sucesso"
      });
      queryClient.invalidateQueries({ queryKey: ['/api/logistica/inventory'] });
      setOpen(false);
      form.reset();
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Failed to create transfer",
        variant: "destructive"
      });
    }
  });

  const onSubmit = (data: TransferFormData) => {
    if (data.fromWarehouseId === data.toWarehouseId) {
      toast({
        title: "Erro",
        description: "Armazém de origem e destino devem ser diferentes",
        variant: "destructive"
      });
      return;
    }
    transferMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-transferir-stock">
          <Truck className="h-4 w-4 mr-2" />
          Transferir
        </Button>
      </DialogTrigger>
      <DialogContent data-testid="dialog-transferencia-stock">
        <DialogHeader>
          <DialogTitle>Transferir Stock - {product.name}</DialogTitle>
          <DialogDescription>
            SKU: {product.sku}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="fromWarehouseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>De Armazém</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-de-armazem">
                        <SelectValue placeholder="Selecionar armazém origem" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id} data-testid={`select-item-de-${w.id}`}>
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
              name="toWarehouseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Para Armazém</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-para-armazem">
                        <SelectValue placeholder="Selecionar armazém destino" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {warehouses.map((w) => (
                        <SelectItem key={w.id} value={w.id} data-testid={`select-item-para-${w.id}`}>
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
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      placeholder="Quantidade a transferir" 
                      min="0"
                      {...field}
                      onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                      data-testid="input-quantidade-transferencia"
                    />
                  </FormControl>
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
                      placeholder="Razão da transferência..."
                      {...field}
                      data-testid="textarea-notas-transferencia"
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
                data-testid="button-cancelar-transferencia"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={transferMutation.isPending}
                data-testid="button-confirmar-transferencia"
              >
                {transferMutation.isPending ? "A criar..." : "Criar Transferência"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ==================== PRODUCT DETAIL DIALOG ====================

function ProductDetailDialog({ 
  productId, 
  warehouses,
  onClose 
}: { 
  productId: string; 
  warehouses: Warehouse[];
  onClose: () => void;
}) {
  const { data: detail, isLoading } = useQuery<ProductDetail>({
    queryKey: ['/api/logistica/inventory', productId],
    enabled: !!productId
  });

  if (isLoading) {
    return (
      <DialogContent className="max-w-4xl" data-testid="dialog-produto-detail">
        <div className="space-y-4">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DialogContent>
    );
  }

  if (!detail) {
    return (
      <DialogContent data-testid="dialog-produto-detail">
        <p className="text-center text-muted-foreground py-4">Produto não encontrado</p>
      </DialogContent>
    );
  }

  // Create a minimal product object for the action buttons
  const productForActions: ProductInventory = {
    id: detail.product.id,
    name: detail.product.name,
    sku: detail.product.sku,
    category: detail.product.category,
    unit: detail.product.unit,
    totalStock: detail.totalStock,
    reorderPoint: detail.product.reorderPoint,
    stockStatus: detail.totalStock < detail.product.reorderPoint ? 'low' : 'ok',
    warehouses: detail.stockByWarehouse.map(w => ({
      warehouseId: w.warehouseId,
      warehouseName: w.name,
      quantity: w.quantity
    })),
    lastMovementDate: detail.recentMovements[0]?.date || null,
    avgCost: detail.avgCost
  };

  return (
    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-produto-detail">
      <DialogHeader>
        <div className="flex items-start justify-between">
          <div>
            <DialogTitle className="text-2xl" data-testid="text-produto-nome">{detail.product.name}</DialogTitle>
            <DialogDescription>
              <span className="font-medium">SKU:</span> {detail.product.sku} | 
              <span className="font-medium ml-2">Categoria:</span> {detail.product.category || 'N/A'}
            </DialogDescription>
          </div>
          <div className="flex gap-2">
            <StockAdjustmentDialog 
              product={productForActions} 
              warehouses={warehouses}
              onSuccess={() => queryClient.invalidateQueries({ queryKey: ['/api/logistica/inventory', productId] })}
            />
            <StockTransferDialog 
              product={productForActions} 
              warehouses={warehouses}
              onSuccess={() => queryClient.invalidateQueries({ queryKey: ['/api/logistica/inventory', productId] })}
            />
          </div>
        </div>
      </DialogHeader>

      <div className="space-y-6">
        {/* Product Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informação do Produto</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Descrição</p>
              <p className="font-medium" data-testid="text-produto-descricao">{detail.product.description || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Unidade</p>
              <p className="font-medium" data-testid="text-produto-unidade">{detail.product.unit}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Stock Total</p>
              <p className="text-2xl font-bold" data-testid="text-produto-stock-total">{detail.totalStock}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ponto Reorder</p>
              <p className="text-2xl font-bold" data-testid="text-produto-reorder-point">{detail.product.reorderPoint}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Custo Médio</p>
              <p className="font-medium" data-testid="text-produto-custo-medio">{formatCurrency(detail.avgCost)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Valor Total</p>
              <p className="font-medium" data-testid="text-produto-valor-total">{formatCurrency(detail.totalValue)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Stock by Warehouse */}
        <Card>
          <CardHeader>
            <CardTitle>Stock por Armazém</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.stockByWarehouse.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="table-head-armazem-detail">Armazém</TableHead>
                    <TableHead data-testid="table-head-localizacao">Localização</TableHead>
                    <TableHead data-testid="table-head-quantidade-detail">Quantidade</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.stockByWarehouse.map((warehouse) => (
                    <TableRow key={warehouse.warehouseId} data-testid={`row-warehouse-${warehouse.warehouseId}`}>
                      <TableCell className="font-medium" data-testid={`text-warehouse-nome-${warehouse.warehouseId}`}>
                        {warehouse.name}
                      </TableCell>
                      <TableCell data-testid={`text-warehouse-location-${warehouse.warehouseId}`}>
                        {warehouse.location || 'N/A'}
                      </TableCell>
                      <TableCell data-testid={`text-warehouse-qty-${warehouse.warehouseId}`}>
                        <Badge variant="outline">{warehouse.quantity}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sem stock registado
              </p>
            )}
          </CardContent>
        </Card>

        {/* Recent Movements */}
        <Card>
          <CardHeader>
            <CardTitle>Movimentos Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {detail.recentMovements.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead data-testid="table-head-tipo-movimento">Tipo</TableHead>
                    <TableHead data-testid="table-head-quantidade-movimento">Quantidade</TableHead>
                    <TableHead data-testid="table-head-armazem-movimento">Armazém</TableHead>
                    <TableHead data-testid="table-head-data-movimento">Data</TableHead>
                    <TableHead data-testid="table-head-notas-movimento">Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.recentMovements.map((movement) => (
                    <TableRow key={movement.id} data-testid={`row-movement-${movement.id}`}>
                      <TableCell data-testid={`badge-movement-type-${movement.id}`}>
                        <Badge variant={getMovementTypeBadgeVariant(movement.type)}>
                          {getMovementTypeLabel(movement.type)}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-movement-qty-${movement.id}`}>
                        {movement.quantity}
                      </TableCell>
                      <TableCell data-testid={`text-movement-warehouse-${movement.id}`}>
                        {movement.warehouseName}
                      </TableCell>
                      <TableCell data-testid={`text-movement-date-${movement.id}`}>
                        {formatDistanceToNow(new Date(movement.date), { 
                          addSuffix: true, 
                          locale: pt 
                        })}
                      </TableCell>
                      <TableCell data-testid={`text-movement-notes-${movement.id}`}>
                        {movement.notes || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Sem movimentos registados
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </DialogContent>
  );
}

// ==================== MAIN COMPONENT ====================

export default function InventarioPage() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [stockStatusFilter, setStockStatusFilter] = useState<string>("");
  const [page, setPage] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const limit = 50;

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on search
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  // Get warehouses for filters
  const { data: warehousesData } = useQuery<{ warehouses: Warehouse[] }>({
    queryKey: ['/api/logistica/warehouses'],
  });

  const warehouses = warehousesData?.warehouses || [];

  // Build query params
  const queryParams = new URLSearchParams();
  if (debouncedSearch) queryParams.set('search', debouncedSearch);
  if (warehouseFilter) queryParams.set('warehouseId', warehouseFilter);
  if (categoryFilter) queryParams.set('category', categoryFilter);
  if (stockStatusFilter) queryParams.set('stockStatus', stockStatusFilter);
  queryParams.set('page', page.toString());
  queryParams.set('limit', limit.toString());

  const queryString = queryParams.toString();

  // Fetch inventory
  const { data, isLoading } = useQuery<{
    products: ProductInventory[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ['/api/logistica/inventory', queryString],
  });

  const products = data?.products || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  // Get unique categories from products
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean)));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Controlo de Inventário
          </h1>
          <p className="text-muted-foreground">
            Gestão de stock por produto e armazém
          </p>
        </div>
      </div>

      {/* Filters Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros e Pesquisa
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar por nome ou SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>

            {/* Warehouse Filter */}
            <Select value={warehouseFilter} onValueChange={setWarehouseFilter}>
              <SelectTrigger data-testid="select-filter-warehouse">
                <SelectValue placeholder="Todos os Armazéns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" " data-testid="select-item-all-warehouses">Todos os Armazéns</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id} data-testid={`select-item-filter-warehouse-${w.id}`}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Category Filter */}
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger data-testid="select-filter-category">
                <SelectValue placeholder="Todas as Categorias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" " data-testid="select-item-all-categories">Todas as Categorias</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat} data-testid={`select-item-filter-category-${cat}`}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Stock Status Filter */}
            <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
              <SelectTrigger data-testid="select-filter-stock-status">
                <SelectValue placeholder="Todos os Estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=" " data-testid="select-item-all-status">Todos os Estados</SelectItem>
                <SelectItem value="low" data-testid="select-item-status-low">Stock Baixo</SelectItem>
                <SelectItem value="ok" data-testid="select-item-status-ok">Stock OK</SelectItem>
                <SelectItem value="excess" data-testid="select-item-status-excess">Stock em Excesso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Produtos ({total})
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : products.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead data-testid="table-head-sku">SKU</TableHead>
                      <TableHead data-testid="table-head-nome">Nome do Produto</TableHead>
                      <TableHead data-testid="table-head-categoria">Categoria</TableHead>
                      <TableHead data-testid="table-head-stock-total">Stock Total</TableHead>
                      <TableHead data-testid="table-head-ponto-reorder">Ponto Reorder</TableHead>
                      <TableHead data-testid="table-head-armazens">Armazéns</TableHead>
                      <TableHead data-testid="table-head-ultimo-movimento">Último Movimento</TableHead>
                      <TableHead data-testid="table-head-acoes">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                        <TableCell className="font-mono text-sm" data-testid={`text-sku-${product.id}`}>
                          {product.sku}
                        </TableCell>
                        <TableCell className="font-medium" data-testid={`text-nome-${product.id}`}>
                          {product.name}
                        </TableCell>
                        <TableCell data-testid={`text-categoria-${product.id}`}>
                          {product.category || '-'}
                        </TableCell>
                        <TableCell data-testid={`badge-stock-${product.id}`}>
                          <Badge variant={getStockBadgeVariant(product.stockStatus)}>
                            {product.totalStock} {product.unit}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-reorder-${product.id}`}>
                          {product.reorderPoint}
                        </TableCell>
                        <TableCell data-testid={`text-warehouses-${product.id}`}>
                          <Badge variant="outline">{product.warehouses.length}</Badge>
                        </TableCell>
                        <TableCell data-testid={`text-last-movement-${product.id}`}>
                          {product.lastMovementDate ? (
                            formatDistanceToNow(new Date(product.lastMovementDate), { 
                              addSuffix: true, 
                              locale: pt 
                            })
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedProductId(product.id)}
                            data-testid={`button-view-${product.id}`}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            Ver
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                    Página {page} de {totalPages} ({total} produtos)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4 mr-2" />
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === totalPages}
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      data-testid="button-next-page"
                    >
                      Próxima
                      <ChevronRight className="h-4 w-4 ml-2" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium" data-testid="text-empty-state">
                Nenhum produto encontrado
              </p>
              <p className="text-sm text-muted-foreground">
                Tente ajustar os filtros ou pesquisa
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Product Detail Dialog */}
      {selectedProductId && (
        <Dialog open={!!selectedProductId} onOpenChange={() => setSelectedProductId(null)}>
          <ProductDetailDialog 
            productId={selectedProductId} 
            warehouses={warehouses}
            onClose={() => setSelectedProductId(null)} 
          />
        </Dialog>
      )}
    </div>
  );
}

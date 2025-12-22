import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Package, Plus, Search, Filter, Edit, Trash2, Eye, DollarSign, Tag, ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  itemType: string;
  isSellable: boolean;
  isPurchasable: boolean;
  price: string | null;
  cost: string | null;
  calculatedCost: string | null;
  stock: number;
  category: string | null;
  subcategory: string | null;
  isActive: boolean;
  trackingType: string | null;
  defaultUom?: {
    id: string;
    name: string;
    symbol: string;
  } | null;
}

interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
}

const itemTypes = [
  { value: 'RAW', label: 'Raw Material', color: 'bg-amber-100 text-amber-800' },
  { value: 'SALE', label: 'Finished Product', color: 'bg-green-100 text-green-800' },
  { value: 'SEMI', label: 'Semi-Finished', color: 'bg-blue-100 text-blue-800' },
  { value: 'SERVICE', label: 'Service', color: 'bg-purple-100 text-purple-800' },
  { value: 'PACKAGING', label: 'Packaging', color: 'bg-gray-100 text-gray-800' },
];

const formatCurrency = (value: string | number | null) => {
  if (!value) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(num);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat("pt-PT").format(value);
};

const createItemSchema = z.object({
  code: z.string().min(1, "Code is required"),
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  itemType: z.enum(['RAW', 'SALE', 'SEMI', 'SERVICE', 'PACKAGING']),
  isSellable: z.boolean().default(false),
  isPurchasable: z.boolean().default(true),
  cost: z.string().optional(),
  price: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  trackingType: z.enum(['NONE', 'BATCH', 'LOT', 'SERIAL']).default('NONE'),
});

type CreateItemForm = z.infer<typeof createItemSchema>;

export default function InventarioItems() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const { data, isLoading } = useQuery<ProductsResponse>({
    queryKey: ["/api/inventory/products"],
  });

  const handleViewProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsDetailDialogOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setSelectedProduct(product);
    setIsEditDialogOpen(true);
  };

  const products = data?.products || [];

  const createMutation = useMutation({
    mutationFn: async (data: CreateItemForm) => {
      return apiRequest("POST", "/api/inventory/products", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/products"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Success", description: "Item created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const form = useForm<CreateItemForm>({
    resolver: zodResolver(createItemSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      itemType: "RAW",
      isSellable: false,
      isPurchasable: true,
      cost: "",
      price: "",
      category: "",
      subcategory: "",
      trackingType: "NONE",
    },
  });

  const onSubmit = (data: CreateItemForm) => {
    createMutation.mutate(data);
  };

  const filteredProducts = products.filter((product) => {
    const matchesSearch = !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || product.itemType === filterType;
    return matchesSearch && matchesType;
  });

  const getItemTypeBadge = (type: string) => {
    const itemType = itemTypes.find(t => t.value === type);
    return itemType ? (
      <Badge className={itemType.color}>{itemType.label}</Badge>
    ) : (
      <Badge variant="outline">{type}</Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Items Catalog</h1>
          <p className="text-muted-foreground">Manage your products, materials, and services</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-4 py-3">
                <Skeleton className="h-12 w-12 rounded" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-[250px]" />
                  <Skeleton className="h-4 w-[200px]" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-inventario-items">
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Items Catalog</h1>
          <p className="text-muted-foreground">
            {filteredProducts.length} items in catalog
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-item">
              <Plus className="h-4 w-4 mr-2" />
              New Item
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Item</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Code *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="PROD-001" data-testid="input-item-code" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Product Name" data-testid="input-item-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Item description..." data-testid="input-item-description" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="itemType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Item Type *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-item-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {itemTypes.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                {type.label}
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
                    name="trackingType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tracking Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-tracking-type">
                              <SelectValue placeholder="Select tracking" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="NONE">No Tracking</SelectItem>
                            <SelectItem value="BATCH">Batch</SelectItem>
                            <SelectItem value="LOT">Lot</SelectItem>
                            <SelectItem value="SERIAL">Serial Number</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="category"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Category" data-testid="input-item-category" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subcategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Subcategory</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Subcategory" data-testid="input-item-subcategory" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="cost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost (EUR)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-item-cost" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sale Price (EUR)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" placeholder="0.00" data-testid="input-item-price" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex gap-6">
                  <FormField
                    control={form.control}
                    name="isPurchasable"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 space-y-0">
                        <div className="space-y-0.5">
                          <FormLabel>Purchasable</FormLabel>
                          <FormDescription className="text-xs">Can be bought from suppliers</FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-purchasable"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isSellable"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 space-y-0">
                        <div className="space-y-0.5">
                          <FormLabel>Sellable</FormLabel>
                          <FormDescription className="text-xs">Can be sold to customers</FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            data-testid="switch-sellable"
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-item">
                    {createMutation.isPending ? "Creating..." : "Create Item"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-items"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]" data-testid="select-filter-type">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {itemTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No items found. Create your first item to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => (
                  <TableRow 
                    key={product.id} 
                    data-testid={`row-product-${product.id}`}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleViewProduct(product)}
                  >
                    <TableCell className="font-mono text-sm">{product.code}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{getItemTypeBadge(product.itemType)}</TableCell>
                    <TableCell>{product.category || '-'}</TableCell>
                    <TableCell className="text-right">{formatNumber(product.stock)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(product.cost)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {product.isActive ? (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-50 text-gray-500">Inactive</Badge>
                        )}
                        {product.isSellable && <Badge variant="secondary" className="text-xs">Sell</Badge>}
                        {product.isPurchasable && <Badge variant="secondary" className="text-xs">Buy</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${product.id}`}>
                            <ArrowUpDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleViewProduct(product)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleEditProduct(product)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewProduct(product)}>
                            <DollarSign className="h-4 w-4 mr-2" />
                            View Costing
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-red-600">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Product Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              {selectedProduct?.name}
            </DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground text-sm">Code</Label>
                  <p className="font-mono font-medium">{selectedProduct.code}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Type</Label>
                  <div className="mt-1">{getItemTypeBadge(selectedProduct.itemType)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Category</Label>
                  <p>{selectedProduct.category || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Subcategory</Label>
                  <p>{selectedProduct.subcategory || '-'}</p>
                </div>
              </div>

              {selectedProduct.description && (
                <div>
                  <Label className="text-muted-foreground text-sm">Description</Label>
                  <p className="text-sm">{selectedProduct.description}</p>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div>
                  <Label className="text-muted-foreground text-sm">Current Stock</Label>
                  <p className="text-2xl font-bold">{formatNumber(selectedProduct.stock)}</p>
                  {selectedProduct.defaultUom && (
                    <p className="text-sm text-muted-foreground">{selectedProduct.defaultUom.symbol}</p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Cost</Label>
                  <p className="text-xl font-semibold">{formatCurrency(selectedProduct.cost)}</p>
                  {selectedProduct.calculatedCost && selectedProduct.calculatedCost !== selectedProduct.cost && (
                    <p className="text-sm text-muted-foreground">Calculated: {formatCurrency(selectedProduct.calculatedCost)}</p>
                  )}
                </div>
                <div>
                  <Label className="text-muted-foreground text-sm">Sale Price</Label>
                  <p className="text-xl font-semibold text-green-600">{formatCurrency(selectedProduct.price)}</p>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Badge variant={selectedProduct.isActive ? "default" : "secondary"}>
                  {selectedProduct.isActive ? "Active" : "Inactive"}
                </Badge>
                {selectedProduct.isSellable && <Badge variant="outline">Sellable</Badge>}
                {selectedProduct.isPurchasable && <Badge variant="outline">Purchasable</Badge>}
                {selectedProduct.trackingType && selectedProduct.trackingType !== 'NONE' && (
                  <Badge variant="outline">Tracking: {selectedProduct.trackingType}</Badge>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDetailDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setIsDetailDialogOpen(false);
                  handleEditProduct(selectedProduct);
                }}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Product
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Product Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
          </DialogHeader>
          {selectedProduct && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Editing: <span className="font-medium">{selectedProduct.name}</span> ({selectedProduct.code})
              </p>
              <p className="text-sm text-amber-600">
                Full edit functionality coming soon. For now, use AssistME to update product details.
              </p>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

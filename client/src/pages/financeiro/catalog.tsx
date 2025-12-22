import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Plus,
  Search,
  Filter,
  Package,
  ShoppingCart,
  Utensils,
  Boxes,
  Wrench,
  PackageOpen,
  Eye,
  Edit,
  Trash2,
  MoreVertical,
  ChefHat,
  DollarSign,
  Tag,
  Calculator,
} from "lucide-react";

type ItemType = 'RAW' | 'SALE' | 'SEMI' | 'SERVICE' | 'PACKAGING';

interface CatalogItem {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  itemType: ItemType;
  isSellable: boolean;
  isPurchasable: boolean;
  cost: string | null;
  listPrice: string | null;
  calculatedCost: string | null;
  defaultUomId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Recipe {
  id: string;
  productId: string;
  name: string;
  version: string;
  isDefault: boolean;
  yieldQty: string;
  yieldUomId: string | null;
  totalCost: string | null;
  costPerUnit: string | null;
  isActive: boolean;
}

interface RecipeLine {
  id: string;
  recipeId: string;
  componentId: string | null;
  componentName: string | null;
  qty: string;
  uomId: string | null;
  unitCost: string;
  lineCost: string;
  lossPercent: string | null;
  notes: string | null;
  component?: CatalogItem | null;
  uom?: UOM | null;
}

interface UOM {
  id: string;
  code: string;
  name: string;
  uomType: string;
  symbol: string | null;
  baseMultiplier: string;
}

interface CatalogResponse {
  items: CatalogItem[];
  total: number;
  limit: number;
  offset: number;
}

const itemTypeConfig: Record<ItemType, { icon: typeof Package; label: string; color: string }> = {
  RAW: { icon: Boxes, label: 'Raw Material', color: 'bg-amber-500/10 text-amber-500' },
  SALE: { icon: ShoppingCart, label: 'For Sale', color: 'bg-green-500/10 text-green-500' },
  SEMI: { icon: Utensils, label: 'Semi-finished', color: 'bg-blue-500/10 text-blue-500' },
  SERVICE: { icon: Wrench, label: 'Service', color: 'bg-purple-500/10 text-purple-500' },
  PACKAGING: { icon: PackageOpen, label: 'Packaging', color: 'bg-gray-500/10 text-gray-500' },
};

function ItemTypeIcon({ type }: { type: ItemType }) {
  const config = itemTypeConfig[type] || itemTypeConfig.SALE;
  const Icon = config.icon;
  return (
    <Badge className={`${config.color} gap-1`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

export default function CatalogPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sellableFilter, setSellableFilter] = useState<string>('all');
  const [purchasableFilter, setPurchasableFilter] = useState<string>('all');
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isNewItemOpen, setIsNewItemOpen] = useState(false);
  const { toast } = useToast();
  const { t, i18n } = useTranslation('common');

  const formatCurrency = (value: string | number | null) => {
    if (!value) return '-';
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return new Intl.NumberFormat(i18n.language === 'en' ? 'en-US' : 'pt-PT', {
      style: 'currency',
      currency: 'EUR',
    }).format(num);
  };

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.set('search', searchQuery);
    if (typeFilter !== 'all') params.set('itemType', typeFilter);
    if (sellableFilter !== 'all') params.set('isSellable', sellableFilter);
    if (purchasableFilter !== 'all') params.set('isPurchasable', purchasableFilter);
    return params.toString();
  };

  const { data: catalogData, isLoading } = useQuery<CatalogResponse>({
    queryKey: ['/api/financeiro/catalog/products', { search: searchQuery, type: typeFilter, sellable: sellableFilter, purchasable: purchasableFilter }],
    queryFn: async () => {
      const params = buildQueryParams();
      const response = await fetch(`/api/financeiro/catalog/products?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch catalog');
      return response.json();
    },
  });

  const { data: uoms } = useQuery<UOM[]>({
    queryKey: ['/api/financeiro/catalog/uoms'],
    queryFn: async () => {
      const response = await fetch('/api/financeiro/catalog/uoms', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch UOMs');
      return response.json();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/api/financeiro/catalog/products/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/catalog/products'] });
      toast({
        title: 'Item removed',
        description: 'The item has been deactivated from the catalog.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to remove item',
        variant: 'destructive',
      });
    },
  });

  const handleDelete = (item: CatalogItem) => {
    if (window.confirm(`Are you sure you want to deactivate "${item.name}"?`)) {
      deleteMutation.mutate(item.id);
    }
  };

  const openDetail = (item: CatalogItem) => {
    setSelectedItem(item);
    setIsDetailOpen(true);
  };

  const items = catalogData?.items || [];
  const totalItems = catalogData?.total || 0;

  const stats = {
    total: totalItems,
    raw: items.filter(i => i.itemType === 'RAW').length,
    sale: items.filter(i => i.itemType === 'SALE').length,
    semi: items.filter(i => i.itemType === 'SEMI').length,
    service: items.filter(i => i.itemType === 'SERVICE').length,
    packaging: items.filter(i => i.itemType === 'PACKAGING').length,
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-catalog">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Product Catalog
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Manage items, recipes, and technical specifications
          </p>
        </div>
        <Button onClick={() => setIsNewItemOpen(true)} data-testid="button-new-item">
          <Plus className="h-4 w-4 mr-2" />
          New Item
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="hover-elevate cursor-pointer" onClick={() => setTypeFilter('all')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-xl font-bold" data-testid="text-stat-total">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => setTypeFilter('RAW')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Boxes className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Raw Materials</p>
              <p className="text-xl font-bold" data-testid="text-stat-raw">{stats.raw}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => setTypeFilter('SALE')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/10">
              <ShoppingCart className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">For Sale</p>
              <p className="text-xl font-bold" data-testid="text-stat-sale">{stats.sale}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => setTypeFilter('SEMI')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10">
              <Utensils className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Semi-finished</p>
              <p className="text-xl font-bold" data-testid="text-stat-semi">{stats.semi}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => setTypeFilter('SERVICE')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Wrench className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Services</p>
              <p className="text-xl font-bold" data-testid="text-stat-service">{stats.service}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate cursor-pointer" onClick={() => setTypeFilter('PACKAGING')}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-gray-500/10">
              <PackageOpen className="h-5 w-5 text-gray-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Packaging</p>
              <p className="text-xl font-bold" data-testid="text-stat-packaging">{stats.packaging}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[180px]" data-testid="select-type-filter">
                <SelectValue placeholder="Item Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="RAW">Raw Materials</SelectItem>
                <SelectItem value="SALE">For Sale</SelectItem>
                <SelectItem value="SEMI">Semi-finished</SelectItem>
                <SelectItem value="SERVICE">Services</SelectItem>
                <SelectItem value="PACKAGING">Packaging</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sellableFilter} onValueChange={setSellableFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-sellable-filter">
                <SelectValue placeholder="Sellable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Sellable</SelectItem>
                <SelectItem value="false">Not Sellable</SelectItem>
              </SelectContent>
            </Select>
            <Select value={purchasableFilter} onValueChange={setPurchasableFilter}>
              <SelectTrigger className="w-[150px]" data-testid="select-purchasable-filter">
                <SelectValue placeholder="Purchasable" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Purchasable</SelectItem>
                <SelectItem value="false">Not Purchasable</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No items found</h3>
              <p className="text-muted-foreground">
                {searchQuery || typeFilter !== 'all' 
                  ? 'Try adjusting your filters'
                  : 'Add your first item to the catalog'}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Sellable</TableHead>
                  <TableHead className="text-center">Purchasable</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow 
                    key={item.id} 
                    className="cursor-pointer hover-elevate"
                    onClick={() => openDetail(item)}
                    data-testid={`row-item-${item.id}`}
                  >
                    <TableCell className="font-mono text-sm">{item.code}</TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell>
                      <ItemTypeIcon type={item.itemType} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{item.category || '-'}</TableCell>
                    <TableCell className="text-center">
                      {item.isSellable ? (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-500">Yes</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.isPurchasable ? (
                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-500">Yes</Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {item.calculatedCost 
                        ? formatCurrency(item.calculatedCost)
                        : item.cost 
                          ? formatCurrency(item.cost) 
                          : '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(item.listPrice)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" data-testid={`button-menu-${item.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(item); }}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(item); }}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          {(item.itemType === 'SALE' || item.itemType === 'SEMI') && (
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openDetail(item); }}>
                              <ChefHat className="h-4 w-4 mr-2" />
                              Technical Spec
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ItemDetailDialog
        item={selectedItem}
        isOpen={isDetailOpen}
        onClose={() => { setIsDetailOpen(false); setSelectedItem(null); }}
        uoms={uoms || []}
        formatCurrency={formatCurrency}
      />

      <NewItemDialog
        isOpen={isNewItemOpen}
        onClose={() => setIsNewItemOpen(false)}
        uoms={uoms || []}
      />
    </div>
  );
}

function ItemDetailDialog({ 
  item, 
  isOpen, 
  onClose, 
  uoms,
  formatCurrency,
}: { 
  item: CatalogItem | null; 
  isOpen: boolean; 
  onClose: () => void;
  uoms: UOM[];
  formatCurrency: (value: string | number | null) => string;
}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('general');

  const { data: itemDetail } = useQuery<CatalogItem & { recipes: Recipe[] }>({
    queryKey: ['/api/financeiro/catalog/products', item?.id],
    queryFn: async () => {
      if (!item?.id) throw new Error('No item ID');
      const response = await fetch(`/api/financeiro/catalog/products/${item.id}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch item');
      return response.json();
    },
    enabled: isOpen && !!item?.id,
  });

  const defaultRecipe = itemDetail?.recipes?.find(r => r.isDefault);

  const { data: recipeDetail } = useQuery<Recipe & { lines: RecipeLine[] }>({
    queryKey: ['/api/financeiro/catalog/recipes', defaultRecipe?.id],
    queryFn: async () => {
      if (!defaultRecipe?.id) throw new Error('No recipe ID');
      const response = await fetch(`/api/financeiro/catalog/recipes/${defaultRecipe.id}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch recipe');
      return response.json();
    },
    enabled: isOpen && !!defaultRecipe?.id,
  });

  if (!item) return null;

  const showRecipeTab = item.itemType === 'SALE' || item.itemType === 'SEMI';

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ItemTypeIcon type={item.itemType} />
            <span>{item.name}</span>
          </DialogTitle>
          <DialogDescription>
            Code: {item.code} {item.category && `| Category: ${item.category}`}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full" style={{ gridTemplateColumns: showRecipeTab ? '1fr 1fr 1fr' : '1fr 1fr' }}>
            <TabsTrigger value="general" data-testid="tab-general">
              <Tag className="h-4 w-4 mr-2" />
              General
            </TabsTrigger>
            <TabsTrigger value="pricing" data-testid="tab-pricing">
              <DollarSign className="h-4 w-4 mr-2" />
              Pricing
            </TabsTrigger>
            {showRecipeTab && (
              <TabsTrigger value="recipe" data-testid="tab-recipe">
                <ChefHat className="h-4 w-4 mr-2" />
                Technical Spec
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Code</Label>
                <Input value={item.code} disabled data-testid="input-detail-code" />
              </div>
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={item.name} disabled data-testid="input-detail-name" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={item.description || ''} disabled rows={3} data-testid="input-detail-description" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={item.category || ''} disabled data-testid="input-detail-category" />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Input value={itemTypeConfig[item.itemType]?.label || item.itemType} disabled data-testid="input-detail-type" />
              </div>
            </div>
            <div className="flex gap-6 pt-2">
              <div className="flex items-center gap-2">
                <Switch checked={item.isSellable} disabled />
                <Label>Sellable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={item.isPurchasable} disabled />
                <Label>Purchasable</Label>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    Cost (Purchase/Production)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-cost">
                    {item.calculatedCost 
                      ? formatCurrency(item.calculatedCost)
                      : item.cost 
                        ? formatCurrency(item.cost)
                        : '-'}
                  </p>
                  {item.calculatedCost && item.cost && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Manual: {formatCurrency(item.cost)} | Calculated: {formatCurrency(item.calculatedCost)}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    List Price (Sale)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold" data-testid="text-price">
                    {formatCurrency(item.listPrice)}
                  </p>
                  {item.listPrice && item.calculatedCost && (
                    <p className="text-sm text-green-600 mt-1">
                      Margin: {((parseFloat(item.listPrice) - parseFloat(item.calculatedCost)) / parseFloat(item.listPrice) * 100).toFixed(1)}%
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {showRecipeTab && (
            <TabsContent value="recipe" className="space-y-4 mt-4">
              {defaultRecipe ? (
                <>
                  <div className="flex justify-between items-center">
                    <div>
                      <h4 className="font-medium">{defaultRecipe.name}</h4>
                      <p className="text-sm text-muted-foreground">Version {defaultRecipe.version}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Yield</p>
                      <p className="font-medium">{defaultRecipe.yieldQty} units</p>
                    </div>
                  </div>

                  {recipeDetail?.lines && recipeDetail.lines.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Component</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>UOM</TableHead>
                          <TableHead className="text-right">Unit Cost</TableHead>
                          <TableHead className="text-right">Loss %</TableHead>
                          <TableHead className="text-right">Line Cost</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recipeDetail.lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell>
                              {line.component ? (
                                <div>
                                  <p className="font-medium">{line.component.name}</p>
                                  <p className="text-xs text-muted-foreground">{line.component.code}</p>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">{line.componentName || 'Unknown'}</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">{line.qty}</TableCell>
                            <TableCell>{line.uom?.symbol || line.uom?.code || '-'}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrency(line.unitCost)}</TableCell>
                            <TableCell className="text-right">{line.lossPercent || '0'}%</TableCell>
                            <TableCell className="text-right font-mono font-medium">{formatCurrency(line.lineCost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="text-center py-8 border rounded-lg bg-muted/50">
                      <ChefHat className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                      <p className="text-muted-foreground">No ingredients defined yet</p>
                      <Button variant="outline" size="sm" className="mt-2">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Ingredient
                      </Button>
                    </div>
                  )}

                  <div className="flex justify-end pt-4 border-t">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Cost</p>
                      <p className="text-xl font-bold" data-testid="text-recipe-total-cost">
                        {formatCurrency(defaultRecipe.totalCost)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Cost per unit: {formatCurrency(defaultRecipe.costPerUnit)}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12 border rounded-lg bg-muted/50">
                  <ChefHat className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">No Technical Specification</h3>
                  <p className="text-muted-foreground mb-4">
                    Create a recipe to define the ingredients and calculate costs
                  </p>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Recipe
                  </Button>
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button>
            <Edit className="h-4 w-4 mr-2" />
            Edit Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewItemDialog({
  isOpen,
  onClose,
  uoms,
}: {
  isOpen: boolean;
  onClose: () => void;
  uoms: UOM[];
}) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    category: '',
    itemType: 'SALE' as ItemType,
    isSellable: true,
    isPurchasable: false,
    cost: '',
    listPrice: '',
    defaultUomId: '',
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('/api/financeiro/catalog/products', 'POST', data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/catalog/products'] });
      toast({
        title: 'Item created',
        description: 'The new item has been added to the catalog.',
      });
      onClose();
      setFormData({
        code: '',
        name: '',
        description: '',
        category: '',
        itemType: 'SALE',
        isSellable: true,
        isPurchasable: false,
        cost: '',
        listPrice: '',
        defaultUomId: '',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create item',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New Catalog Item</DialogTitle>
          <DialogDescription>
            Add a new item to the product catalog
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="code">Code *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                required
                data-testid="input-new-code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                data-testid="input-new-name"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={2}
              data-testid="input-new-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="itemType">Type *</Label>
              <Select
                value={formData.itemType}
                onValueChange={(v) => setFormData({ ...formData, itemType: v as ItemType })}
              >
                <SelectTrigger data-testid="select-new-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RAW">Raw Material</SelectItem>
                  <SelectItem value="SALE">For Sale</SelectItem>
                  <SelectItem value="SEMI">Semi-finished</SelectItem>
                  <SelectItem value="SERVICE">Service</SelectItem>
                  <SelectItem value="PACKAGING">Packaging</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                data-testid="input-new-category"
              />
            </div>
          </div>

          <div className="flex gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isSellable}
                onCheckedChange={(v) => setFormData({ ...formData, isSellable: v })}
                id="isSellable"
                data-testid="switch-new-sellable"
              />
              <Label htmlFor="isSellable">Sellable</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={formData.isPurchasable}
                onCheckedChange={(v) => setFormData({ ...formData, isPurchasable: v })}
                id="isPurchasable"
                data-testid="switch-new-purchasable"
              />
              <Label htmlFor="isPurchasable">Purchasable</Label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="cost">Cost (EUR)</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                min="0"
                value={formData.cost}
                onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                data-testid="input-new-cost"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="listPrice">List Price (EUR)</Label>
              <Input
                id="listPrice"
                type="number"
                step="0.01"
                min="0"
                value={formData.listPrice}
                onChange={(e) => setFormData({ ...formData, listPrice: e.target.value })}
                data-testid="input-new-price"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="defaultUomId">Default Unit of Measure</Label>
            <Select
              value={formData.defaultUomId}
              onValueChange={(v) => setFormData({ ...formData, defaultUomId: v })}
            >
              <SelectTrigger data-testid="select-new-uom">
                <SelectValue placeholder="Select UOM" />
              </SelectTrigger>
              <SelectContent>
                {uoms.map((uom) => (
                  <SelectItem key={uom.id} value={uom.id}>
                    {uom.name} ({uom.symbol || uom.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-item">
              {createMutation.isPending ? 'Creating...' : 'Create Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

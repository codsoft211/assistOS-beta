import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Carrot, Search, Eye, Edit, ShoppingCart, ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "wouter";

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
  stock: number;
  category: string | null;
  subcategory: string | null;
  isActive: boolean;
  defaultUom?: { id: string; name: string; symbol: string } | null;
}

interface ProductsResponse {
  products: Product[];
  total: number;
  page: number;
  limit: number;
}

const formatCurrency = (value: string | number | null) => {
  if (!value) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(num);
};

const formatNumber = (value: number) => {
  return new Intl.NumberFormat("pt-PT").format(value);
};

export default function RawMaterialsPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading } = useQuery<ProductsResponse>({
    queryKey: ["/api/inventory/products"],
  });

  const products = data?.products || [];
  const rawMaterials = products.filter((p) => p.itemType === 'RAW');

  const filteredProducts = rawMaterials.filter((product) => {
    return !searchQuery || 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.code.toLowerCase().includes(searchQuery.toLowerCase());
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Raw Materials</h1>
          <p className="text-muted-foreground">Ingredients and base inputs</p>
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
    <div className="p-6 space-y-6" data-testid="page-raw-materials">
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            <Carrot className="inline h-8 w-8 mr-2 text-amber-600" />
            Raw Materials
          </h1>
          <p className="text-muted-foreground">
            {filteredProducts.length} ingredients and base inputs
          </p>
        </div>
        <Link href="/inventario/items">
          <Button variant="outline" data-testid="button-view-all-items">
            View All Items
          </Button>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search raw materials..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search"
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>UoM</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Purchase Cost</TableHead>
                <TableHead>Purchasable</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No raw materials found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredProducts.map((product) => (
                  <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                    <TableCell className="font-mono text-sm">{product.code}</TableCell>
                    <TableCell className="font-medium">{product.name}</TableCell>
                    <TableCell>{product.category || '-'}</TableCell>
                    <TableCell>
                      {product.defaultUom ? (
                        <Badge variant="outline">{product.defaultUom.symbol}</Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell className="text-right">{formatNumber(product.stock)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(product.cost)}</TableCell>
                    <TableCell>
                      {product.isPurchasable ? (
                        <Badge className="bg-blue-100 text-blue-800">Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${product.id}`}>
                            <ArrowUpDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            View Suppliers
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
    </div>
  );
}

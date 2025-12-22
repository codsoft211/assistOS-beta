import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useLocation } from "wouter";
import { BookOpen, Plus, Search, ChevronRight, Clock, Euro, Calculator, Package } from "lucide-react";

interface Recipe {
  id: string;
  name: string;
  version: string;
  productId: string;
  productName: string;
  productCode: string;
  yieldQty: string;
  yieldUom: string | null;
  totalCost: string | null;
  costPerUnit: string | null;
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  isActive: boolean;
  ingredientCount: number;
  createdAt: string;
}

interface RecipeDetail {
  recipe: Recipe;
  ingredients: Array<{
    id: string;
    componentId: string;
    componentName: string;
    componentCode: string;
    qty: string;
    uomSymbol: string;
    unitCost: string | null;
    lineCost: string | null;
    lossPercent: string;
    notes: string | null;
  }>;
}

const formatCurrency = (value: string | number | null) => {
  if (!value) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(num);
};

const formatNumber = (value: string | number) => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(num);
};

const formatTime = (minutes: number | null) => {
  if (!minutes) return '-';
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
};

export default function InventarioRecipes() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);

  const { data: recipes, isLoading } = useQuery<Recipe[]>({
    queryKey: ["/api/inventory/recipes"],
  });

  const { data: recipeDetail, isLoading: isLoadingDetail } = useQuery<RecipeDetail>({
    queryKey: ["/api/inventory/recipes", selectedRecipeId],
    enabled: !!selectedRecipeId,
  });

  const filteredRecipes = recipes?.filter((recipe) => {
    const matchesSearch = !searchQuery || 
      recipe.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      recipe.productCode.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Recipes / BOMs</h1>
          <p className="text-muted-foreground">Manage recipes and bills of materials</p>
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
    <div className="p-6 space-y-6" data-testid="page-inventario-recipes">
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Recipes / BOMs</h1>
          <p className="text-muted-foreground">
            {filteredRecipes?.length || 0} recipes in catalog
          </p>
        </div>
        <Button data-testid="button-create-recipe">
          <Plus className="h-4 w-4 mr-2" />
          New Recipe
        </Button>
      </div>

      <div className="flex gap-4 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search recipes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-recipes"
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Recipe List
              </CardTitle>
              <CardDescription>Click on a recipe to view its ingredients</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Recipe Name</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Yield</TableHead>
                    <TableHead className="text-right">Cost/Unit</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecipes?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No recipes found. Create your first recipe to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRecipes?.map((recipe) => (
                      <TableRow 
                        key={recipe.id} 
                        data-testid={`row-recipe-${recipe.id}`}
                        className={`cursor-pointer hover-elevate ${selectedRecipeId === recipe.id ? 'bg-muted' : ''}`}
                        onClick={() => setSelectedRecipeId(recipe.id)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{recipe.name}</span>
                            <Badge variant="outline" className="text-xs">v{recipe.version}</Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{recipe.productName}</div>
                            <div className="text-xs text-muted-foreground">{recipe.productCode}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {formatNumber(recipe.yieldQty)} {recipe.yieldUom || 'units'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatCurrency(recipe.costPerUnit)}
                        </TableCell>
                        <TableCell>
                          {formatTime(recipe.totalTimeMinutes)}
                        </TableCell>
                        <TableCell>
                          {recipe.isActive ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-gray-50 text-gray-500">Inactive</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Recipe Details
              </CardTitle>
              {selectedRecipeId && recipeDetail?.recipe && (
                <CardDescription>{recipeDetail.recipe.name}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {!selectedRecipeId ? (
                <div className="py-8 text-center text-muted-foreground">
                  Select a recipe to view its ingredients
                </div>
              ) : isLoadingDetail ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : recipeDetail ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <Calculator className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Yield:</span>
                      <span className="font-medium">
                        {formatNumber(recipeDetail.recipe.yieldQty)} {recipeDetail.recipe.yieldUom || 'units'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Euro className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Cost:</span>
                      <span className="font-medium">{formatCurrency(recipeDetail.recipe.costPerUnit)}/unit</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Prep:</span>
                      <span className="font-medium">{formatTime(recipeDetail.recipe.prepTimeMinutes)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">Cook:</span>
                      <span className="font-medium">{formatTime(recipeDetail.recipe.cookTimeMinutes)}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="font-medium mb-3">Ingredients ({recipeDetail.ingredients.length})</h4>
                    <div className="space-y-2">
                      {recipeDetail.ingredients.map((ingredient) => (
                        <div 
                          key={ingredient.id}
                          className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50"
                          data-testid={`ingredient-${ingredient.id}`}
                        >
                          <div>
                            <div className="font-medium text-sm">{ingredient.componentName}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatNumber(ingredient.qty)} {ingredient.uomSymbol}
                              {parseFloat(ingredient.lossPercent) > 0 && (
                                <span className="text-yellow-600 ml-1">
                                  (+{ingredient.lossPercent}% loss)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono text-sm">{formatCurrency(ingredient.lineCost)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t pt-4 flex items-center justify-between">
                    <span className="font-medium">Total Cost:</span>
                    <span className="text-lg font-bold">{formatCurrency(recipeDetail.recipe.totalCost)}</span>
                  </div>

                  <Button variant="outline" className="w-full" data-testid="button-edit-recipe">
                    Edit Recipe
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

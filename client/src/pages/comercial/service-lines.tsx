import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Layers, 
  Search, 
  Eye, 
  Edit, 
  MoreHorizontal, 
  Plus,
  Settings2,
  Users,
  Euro
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface ServiceLine {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string | null;
  tier: string | null;
  pricingType: string;
  basePrice: string;
  currency: string;
  minItems: number | null;
  maxItems: number | null;
  isConfigurable: boolean;
  isActive: boolean;
  sortOrder: number;
  componentCount?: number;
}

interface ServiceLinesResponse {
  serviceLines: ServiceLine[];
  total: number;
}

const tierColors: Record<string, string> = {
  'base': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'premium': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'deluxe': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

const pricingTypeLabels: Record<string, string> = {
  'per_person': 'Por Pessoa',
  'flat': 'Preço Fixo',
  'per_unit': 'Por Unidade',
};

const formatCurrency = (value: string | number | null) => {
  if (!value) return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(num);
};

export default function ServiceLinesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ServiceLinesResponse>({
    queryKey: ["/api/comercial/service-lines"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<ServiceLine>) => {
      return apiRequest("/api/comercial/service-lines", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/comercial/service-lines"] });
      setIsCreateOpen(false);
      toast({
        title: "Service Line criada",
        description: "A nova linha de serviço foi criada com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível criar a linha de serviço.",
        variant: "destructive",
      });
    },
  });

  const serviceLines = data?.serviceLines || [];

  const categories = [...new Set(serviceLines.map(s => s.category).filter(Boolean))] as string[];

  const filteredServiceLines = serviceLines.filter((sl) => {
    const matchesSearch = !searchQuery || 
      sl.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sl.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || sl.category === categoryFilter;
    const matchesTier = tierFilter === "all" || sl.tier === tierFilter;
    return matchesSearch && matchesCategory && matchesTier;
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createMutation.mutate({
      code: formData.get("code") as string,
      name: formData.get("name") as string,
      description: formData.get("description") as string || null,
      category: formData.get("category") as string || null,
      tier: formData.get("tier") as string || null,
      pricingType: formData.get("pricingType") as string || "per_person",
      basePrice: formData.get("basePrice") as string || "0",
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Service Lines</h1>
          <p className="text-muted-foreground">Linhas de serviço para propostas de eventos</p>
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
    <div className="p-6 space-y-6" data-testid="page-service-lines">
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            <Layers className="inline h-8 w-8 mr-2 text-purple-600" />
            Service Lines
          </h1>
          <p className="text-muted-foreground">
            {filteredServiceLines.length} linhas de serviço para propostas de eventos
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Bundles comerciais usados em orçamentos de catering
          </p>
        </div>
        
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-service-line">
              <Plus className="h-4 w-4 mr-2" />
              Nova Service Line
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Nova Linha de Serviço</DialogTitle>
                <DialogDescription>
                  Criar um novo bundle comercial para propostas
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="code" className="text-right">Código</Label>
                  <Input 
                    id="code" 
                    name="code" 
                    placeholder="SRV-XXX" 
                    className="col-span-3" 
                    required 
                    data-testid="input-code"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="name" className="text-right">Nome</Label>
                  <Input 
                    id="name" 
                    name="name" 
                    placeholder="Nome da linha de serviço" 
                    className="col-span-3" 
                    required 
                    data-testid="input-name"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="category" className="text-right">Categoria</Label>
                  <Input 
                    id="category" 
                    name="category" 
                    placeholder="Ex: Cocktail, Sopas, Bebidas" 
                    className="col-span-3"
                    data-testid="input-category"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="tier" className="text-right">Tier</Label>
                  <Select name="tier" defaultValue="">
                    <SelectTrigger className="col-span-3" data-testid="select-tier">
                      <SelectValue placeholder="Selecionar tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Sem tier</SelectItem>
                      <SelectItem value="base">Base</SelectItem>
                      <SelectItem value="premium">Premium</SelectItem>
                      <SelectItem value="deluxe">Deluxe</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="pricingType" className="text-right">Preço</Label>
                  <Select name="pricingType" defaultValue="per_person">
                    <SelectTrigger className="col-span-3" data-testid="select-pricing-type">
                      <SelectValue placeholder="Tipo de preço" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_person">Por Pessoa</SelectItem>
                      <SelectItem value="flat">Preço Fixo</SelectItem>
                      <SelectItem value="per_unit">Por Unidade</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="basePrice" className="text-right">Valor Base</Label>
                  <Input 
                    id="basePrice" 
                    name="basePrice" 
                    type="number"
                    step="0.01"
                    placeholder="0.00" 
                    className="col-span-3"
                    data-testid="input-base-price"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="description" className="text-right">Descrição</Label>
                  <Textarea 
                    id="description" 
                    name="description" 
                    placeholder="Descrição opcional" 
                    className="col-span-3"
                    data-testid="input-description"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-create">
                  {createMutation.isPending ? "A criar..." : "Criar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 items-center flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar por nome ou código..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px]" data-testid="select-category-filter">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas Categorias</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-tier-filter">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Tiers</SelectItem>
            <SelectItem value="base">Base</SelectItem>
            <SelectItem value="premium">Premium</SelectItem>
            <SelectItem value="deluxe">Deluxe</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Total Service Lines</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{serviceLines.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Categorias</CardTitle>
            <Settings2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{categories.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Premium</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {serviceLines.filter(s => s.tier === 'premium').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 gap-2">
            <CardTitle className="text-sm font-medium">Activas</CardTitle>
            <Euro className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {serviceLines.filter(s => s.isActive).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Tipo Preço</TableHead>
                <TableHead className="text-right">Preço Base</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredServiceLines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhuma linha de serviço encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                filteredServiceLines.map((serviceLine) => (
                  <TableRow key={serviceLine.id} data-testid={`row-service-line-${serviceLine.id}`}>
                    <TableCell className="font-mono text-sm">{serviceLine.code}</TableCell>
                    <TableCell className="font-medium">{serviceLine.name}</TableCell>
                    <TableCell>{serviceLine.category || '-'}</TableCell>
                    <TableCell>
                      {serviceLine.tier ? (
                        <Badge className={tierColors[serviceLine.tier] || 'bg-gray-100 text-gray-800'}>
                          {serviceLine.tier.charAt(0).toUpperCase() + serviceLine.tier.slice(1)}
                        </Badge>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {pricingTypeLabels[serviceLine.pricingType] || serviceLine.pricingType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(serviceLine.basePrice)}
                    </TableCell>
                    <TableCell>
                      {serviceLine.isActive ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-800">
                          Activa
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                          Inactiva
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${serviceLine.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Ações</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>
                            <Eye className="h-4 w-4 mr-2" />
                            Ver Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Settings2 className="h-4 w-4 mr-2" />
                            Gerir Componentes
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="h-4 w-4 mr-2" />
                            Editar
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

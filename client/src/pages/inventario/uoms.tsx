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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Ruler, Plus, Search, Edit, Trash2, ArrowRightLeft } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface UoM {
  id: string;
  name: string;
  symbol: string;
  type: string;
  conversionFactor: string | null;
  baseUomId: string | null;
  isActive: boolean;
  baseUom?: { id: string; name: string; symbol: string } | null;
}

const uomTypes = [
  { value: 'WEIGHT', label: 'Weight', examples: 'kg, g, lb' },
  { value: 'VOLUME', label: 'Volume', examples: 'L, ml, gal' },
  { value: 'LENGTH', label: 'Length', examples: 'm, cm, in' },
  { value: 'UNIT', label: 'Unit/Count', examples: 'pcs, box, tray' },
  { value: 'TIME', label: 'Time', examples: 'h, min' },
  { value: 'OTHER', label: 'Other', examples: 'custom' },
];

const createUomSchema = z.object({
  name: z.string().min(1, "Name is required"),
  symbol: z.string().min(1, "Symbol is required").max(10, "Symbol too long"),
  type: z.enum(['WEIGHT', 'VOLUME', 'LENGTH', 'UNIT', 'TIME', 'OTHER']),
  conversionFactor: z.string().optional(),
  baseUomId: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CreateUomForm = z.infer<typeof createUomSchema>;

export default function UnitsOfMeasurePage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const { data: uoms, isLoading } = useQuery<UoM[]>({
    queryKey: ["/api/inventory/uoms"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateUomForm) => {
      return apiRequest("POST", "/api/inventory/uoms", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/uoms"] });
      setIsCreateDialogOpen(false);
      form.reset();
      toast({ title: "Success", description: "Unit of measure created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const form = useForm<CreateUomForm>({
    resolver: zodResolver(createUomSchema),
    defaultValues: {
      name: "",
      symbol: "",
      type: "UNIT",
      conversionFactor: "",
      baseUomId: "",
      isActive: true,
    },
  });

  const onSubmit = (data: CreateUomForm) => {
    createMutation.mutate(data);
  };

  const filteredUoms = uoms?.filter((uom) => {
    return !searchQuery || 
      uom.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      uom.symbol.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getTypeLabel = (type: string) => {
    const uomType = uomTypes.find(t => t.value === type);
    return uomType?.label || type;
  };

  const baseUoms = uoms?.filter(u => !u.baseUomId && u.isActive);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Units of Measure</h1>
          <p className="text-muted-foreground">Manage measurement units and conversions</p>
        </div>
        <Card>
          <CardContent className="pt-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center space-x-4 py-3">
                <Skeleton className="h-8 w-16 rounded" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-[200px]" />
                  <Skeleton className="h-4 w-[150px]" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6" data-testid="page-uoms">
      <div className="flex flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            <Ruler className="inline h-8 w-8 mr-2 text-indigo-600" />
            Units of Measure
          </h1>
          <p className="text-muted-foreground">
            {filteredUoms?.length || 0} units configured
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-uom">
              <Plus className="h-4 w-4 mr-2" />
              New Unit
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Unit of Measure</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Kilogram" data-testid="input-uom-name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="symbol"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Symbol *</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="kg" data-testid="input-uom-symbol" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-uom-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {uomTypes.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label} ({type.examples})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="baseUomId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base Unit (for conversions)</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-base-uom">
                              <SelectValue placeholder="None (is base)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="">None (is base unit)</SelectItem>
                            {baseUoms?.map((uom) => (
                              <SelectItem key={uom.id} value={uom.id}>
                                {uom.name} ({uom.symbol})
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
                    name="conversionFactor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Conversion Factor</FormLabel>
                        <FormControl>
                          <Input 
                            {...field} 
                            type="number" 
                            step="0.0001" 
                            placeholder="1000" 
                            data-testid="input-conversion-factor"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-uom">
                    {createMutation.isPending ? "Creating..." : "Create Unit"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search units..."
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
                <TableHead>Symbol</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Base Unit</TableHead>
                <TableHead>Conversion</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUoms?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No units of measure found. Create your first unit to get started.
                  </TableCell>
                </TableRow>
              ) : (
                filteredUoms?.map((uom) => (
                  <TableRow key={uom.id} data-testid={`row-uom-${uom.id}`}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-base">
                        {uom.symbol}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{uom.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getTypeLabel(uom.type)}</Badge>
                    </TableCell>
                    <TableCell>
                      {uom.baseUom ? (
                        <span className="flex items-center gap-1">
                          <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                          {uom.baseUom.symbol}
                        </span>
                      ) : (
                        <Badge className="bg-indigo-100 text-indigo-800">Base</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {uom.conversionFactor && uom.baseUom ? (
                        <span className="text-sm">
                          1 {uom.symbol} = {uom.conversionFactor} {uom.baseUom.symbol}
                        </span>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      {uom.isActive ? (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-actions-${uom.id}`}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
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
    </div>
  );
}

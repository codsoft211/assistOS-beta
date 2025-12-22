import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Eye, Edit, Trash2 } from "lucide-react";

type FaturaFornecedorFormData = {
  supplierId: string;
  invoiceNumber?: string;
  invoiceDate: string;
  dueDate?: string;
  linhas: Array<{
    descricao: string;
    quantidade: number;
    precoUnitario: number;
    taxaIVA: number;
  }>;
  notas?: string;
};

interface VendorBill {
  id: string;
  invoiceNumber: string;
  supplierName: string;
  supplierId: string;
  invoiceDate: string;
  dueDate: string | null;
  totalAmount: number;
  taxTotal: number;
  status: string;
}

export default function VendorBillsPage() {
  const { t, i18n } = useTranslation('financeiro');
  const currentLang = i18n.language || 'pt';
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("");

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'pt-PT').format(date);
  };

  const getStatusLabel = (status: string) => {
    return t(`ap.vendorBills.status.${status}`);
  };

  const linhaFaturaSchema = z.object({
    descricao: z.string().min(1, t('ap.vendorBills.validation.descriptionRequired')),
    quantidade: z.number().min(0.01, t('ap.vendorBills.validation.quantityMin')),
    precoUnitario: z.number().min(0, t('ap.vendorBills.validation.priceMin')),
    taxaIVA: z.number().min(0).max(100),
  });

  const faturaFornecedorSchema = z.object({
    supplierId: z.string().min(1, t('ap.vendorBills.validation.supplierRequired')),
    invoiceNumber: z.string().optional(),
    invoiceDate: z.string().min(1, t('ap.vendorBills.validation.invoiceDateRequired')),
    dueDate: z.string().optional(),
    linhas: z.array(linhaFaturaSchema).min(1, t('ap.vendorBills.validation.linesMin')),
    notas: z.string().optional(),
  });

  const billsQueryUrl = `/api/financeiro/ap/faturas-fornecedor?status=${statusFilter}${supplierFilter ? `&supplierId=${supplierFilter}` : ''}`;
  
  const { data: billsResponse, isLoading } = useQuery<{ bills: VendorBill[]; total: number }>({
    queryKey: [billsQueryUrl],
  });
  
  const bills = billsResponse?.bills || [];

  const { data: suppliers } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/compras/suppliers"],
  });

  const form = useForm<FaturaFornecedorFormData>({
    resolver: zodResolver(faturaFornecedorSchema),
    defaultValues: {
      supplierId: "",
      invoiceNumber: "",
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: "",
      linhas: [{ descricao: "", quantidade: 1, precoUnitario: 0, taxaIVA: 23 }],
      notas: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "linhas",
  });

  const createMutation = useMutation({
    mutationFn: async (data: FaturaFornecedorFormData) => {
      // Calculate totals
      let subtotal = 0;
      let taxTotal = 0;

      data.linhas.forEach(linha => {
        const linhaTotal = linha.quantidade * linha.precoUnitario;
        const linhaTax = linhaTotal * (linha.taxaIVA / 100);
        subtotal += linhaTotal;
        taxTotal += linhaTax;
      });

      const totalAmount = subtotal + taxTotal;

      return await apiRequest("/api/financeiro/ap/faturas-fornecedor", "POST", {
        supplierId: data.supplierId,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
        dueDate: data.dueDate || undefined,
        totalAmount: totalAmount.toFixed(2),
        taxTotal: taxTotal.toFixed(2),
        notes: data.notas,
        lines: data.linhas.map((linha, index) => ({
          lineNumber: index + 1,
          description: linha.descricao,
          quantity: linha.quantidade,
          unitPrice: linha.precoUnitario,
          taxRate: linha.taxaIVA,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/ap/faturas-fornecedor"] });
      toast({ title: t('ap.vendorBills.createSuccess') });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: t('ap.vendorBills.createError'), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/financeiro/ap/faturas-fornecedor/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/financeiro/ap/faturas-fornecedor"] });
      toast({ title: t('ap.vendorBills.deleteSuccess') });
    },
  });

  const calcularTotais = () => {
    const linhas = form.watch("linhas");
    const subtotal = linhas.reduce((acc, linha) => acc + (linha.quantidade * linha.precoUnitario), 0);
    const totalIVA = linhas.reduce((acc, linha) => {
      const valorLinha = linha.quantidade * linha.precoUnitario;
      return acc + (valorLinha * linha.taxaIVA / 100);
    }, 0);
    const total = subtotal + totalIVA;
    return { subtotal, totalIVA, total };
  };

  const onSubmit = (data: FaturaFornecedorFormData) => {
    createMutation.mutate(data);
  };

  const totais = calcularTotais();

  return (
    <div className="p-6 space-y-6" data-testid="page-vendor-bills">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">{t('ap.vendorBills.title')}</h1>
          <p className="text-muted-foreground">{t('ap.vendorBills.description')}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-bill">
              <Plus className="mr-2 h-4 w-4" />
              {t('ap.vendorBills.new')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('ap.vendorBills.newDialog')}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ap.vendorBills.form.supplier')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-supplier">
                              <SelectValue placeholder={t('ap.vendorBills.form.selectSupplier')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {suppliers?.map((supplier) => (
                              <SelectItem key={supplier.id} value={supplier.id}>
                                {supplier.name}
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
                    name="invoiceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ap.vendorBills.form.invoiceNumber')}</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder={t('ap.vendorBills.form.invoiceNumberPlaceholder')} data-testid="input-invoice-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="invoiceDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ap.vendorBills.form.invoiceDate')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-invoice-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ap.vendorBills.form.dueDate')}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-due-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Line Items */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label>{t('ap.vendorBills.form.lines')}</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ descricao: "", quantidade: 1, precoUnitario: 0, taxaIVA: 23 })}
                      data-testid="button-add-line"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      {t('ap.vendorBills.form.addLine')}
                    </Button>
                  </div>

                  <div className="border rounded-lg p-4 space-y-4">
                    {fields.map((field, index) => (
                      <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5">
                          <FormField
                            control={form.control}
                            name={`linhas.${index}.descricao`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('ap.vendorBills.form.description')}</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder={t('ap.vendorBills.form.descriptionPlaceholder')} data-testid={`input-description-${index}`} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-2">
                          <FormField
                            control={form.control}
                            name={`linhas.${index}.quantidade`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('ap.vendorBills.form.quantity')}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                    data-testid={`input-quantity-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-2">
                          <FormField
                            control={form.control}
                            name={`linhas.${index}.precoUnitario`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('ap.vendorBills.form.price')}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    {...field}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                    data-testid={`input-price-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-2">
                          <FormField
                            control={form.control}
                            name={`linhas.${index}.taxaIVA`}
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('ap.vendorBills.form.taxRate')}</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="1"
                                    {...field}
                                    onChange={(e) => field.onChange(parseFloat(e.target.value))}
                                    data-testid={`input-tax-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                            data-testid={`button-remove-line-${index}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="flex justify-end">
                    <div className="grid grid-cols-2 gap-2 w-64">
                      <div className="text-right font-medium">{t('ap.vendorBills.form.subtotal')}:</div>
                      <div className="text-right">{formatCurrency(totais.subtotal)}</div>
                      <div className="text-right font-medium">{t('ap.vendorBills.form.tax')}:</div>
                      <div className="text-right">{formatCurrency(totais.totalIVA)}</div>
                      <div className="text-right font-bold">{t('ap.vendorBills.form.total')}:</div>
                      <div className="text-right font-bold">{formatCurrency(totais.total)}</div>
                    </div>
                  </div>
                </div>

                <FormField
                  control={form.control}
                  name="notas"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('ap.vendorBills.form.notes')}</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder={t('ap.vendorBills.form.notesPlaceholder')} data-testid="textarea-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    {t('ap.vendorBills.cancel')}
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit">
                    {createMutation.isPending ? t('ap.vendorBills.creating') : t('ap.vendorBills.create')}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <Input
              placeholder={t('ap.vendorBills.search')}
              className="max-w-sm"
              data-testid="input-search"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-status">
                <SelectValue placeholder={t('ap.vendorBills.filterStatus')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('ap.vendorBills.status.all')}</SelectItem>
                <SelectItem value="draft">{t('ap.vendorBills.status.draft')}</SelectItem>
                <SelectItem value="approved">{t('ap.vendorBills.status.approved')}</SelectItem>
                <SelectItem value="scheduled">{t('ap.vendorBills.status.scheduled')}</SelectItem>
                <SelectItem value="overdue">{t('ap.vendorBills.status.overdue')}</SelectItem>
                <SelectItem value="partially_paid">{t('ap.vendorBills.status.partially_paid')}</SelectItem>
                <SelectItem value="paid">{t('ap.vendorBills.status.paid')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Bills Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table data-testid="table-vendor-bills">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('ap.vendorBills.table.number')}</TableHead>
                  <TableHead>{t('ap.vendorBills.table.supplier')}</TableHead>
                  <TableHead>{t('ap.vendorBills.table.date')}</TableHead>
                  <TableHead>{t('ap.vendorBills.table.dueDate')}</TableHead>
                  <TableHead>{t('ap.vendorBills.table.total')}</TableHead>
                  <TableHead>{t('ap.vendorBills.table.status')}</TableHead>
                  <TableHead className="text-right">{t('ap.vendorBills.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills && bills.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      {t('ap.vendorBills.noBills')}
                    </TableCell>
                  </TableRow>
                ) : (
                  bills?.map((bill) => (
                    <TableRow 
                      key={bill.id} 
                      data-testid={`row-bill-${bill.id}`}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setLocation(`/financeiro/ap/bills/${bill.id}`)}
                    >
                      <TableCell className="font-medium">{bill.invoiceNumber}</TableCell>
                      <TableCell>{bill.supplierName}</TableCell>
                      <TableCell>{formatDate(bill.invoiceDate)}</TableCell>
                      <TableCell>{formatDate(bill.dueDate)}</TableCell>
                      <TableCell>{formatCurrency(parseFloat(bill.totalAmount.toString()))}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{getStatusLabel(bill.status)}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/financeiro/ap/bills/${bill.id}`);
                          }}
                          data-testid={`button-view-${bill.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(bill.id);
                          }}
                          data-testid={`button-delete-${bill.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

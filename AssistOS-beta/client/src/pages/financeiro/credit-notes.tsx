import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const creditNoteLineSchema = z.object({
  lineNumber: z.number(),
  description: z.string().min(1, 'Descrição obrigatória'),
  quantity: z.number().min(0.01, 'Quantidade deve ser maior que 0'),
  unit: z.string(),
  unitPrice: z.number(),
  totalPrice: z.number()
});

const creditNoteFormSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().min(1, 'Nome do cliente obrigatório'),
  originalInvoiceId: z.string().optional(),
  originalInvoiceNumber: z.string().optional(),
  issueDate: z.date({ required_error: 'Data de emissão obrigatória' }),
  dueDate: z.date({ required_error: 'Data de vencimento obrigatória' }),
  isCreditNote: z.boolean().default(true),
  reason: z.string().min(1, 'Motivo da nota de crédito obrigatório'),
  lines: z.array(creditNoteLineSchema).min(1, 'Adicione pelo menos uma linha'),
  notes: z.string().optional(),
});

type CreditNoteFormData = z.infer<typeof creditNoteFormSchema>;

const createEmptyLineItem = (lineNumber: number) => ({
  lineNumber,
  description: '',
  quantity: 1,
  unit: 'un',
  unitPrice: 0,
  totalPrice: 0
});

export default function CreditNotesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t, i18n } = useTranslation('financeiro');
  const [isCreditNoteEnabled, setIsCreditNoteEnabled] = useState(true);
  
  const currentLang = i18n.language || 'pt';
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const { data: invoices } = useQuery<Array<{ id: string; invoiceNumber: string; clientName: string }>>({
    queryKey: ['/api/financeiro/ar/faturas'],
  });

  const form = useForm<CreditNoteFormData>({
    resolver: zodResolver(creditNoteFormSchema),
    defaultValues: {
      clientId: '',
      clientName: '',
      originalInvoiceId: '',
      originalInvoiceNumber: '',
      issueDate: new Date(),
      dueDate: addDays(new Date(), 30),
      isCreditNote: true,
      reason: '',
      lines: [createEmptyLineItem(1)],
      notes: '',
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "lines"
  });

  const lines = form.watch("lines");
  const isCreditNote = form.watch("isCreditNote");

  // Auto-calculate line totals when quantity or unitPrice changes
  useEffect(() => {
    lines.forEach((line, index) => {
      const rawTotal = line.quantity * line.unitPrice;
      // Auto-negate if isCreditNote is enabled
      const totalPrice = isCreditNote ? -Math.abs(rawTotal) : rawTotal;
      if (line.totalPrice !== totalPrice) {
        form.setValue(`lines.${index}.totalPrice`, totalPrice, { shouldValidate: false });
      }
    });
  }, [lines, isCreditNote, form]);

  // Calculate totals
  const { subtotal, taxAmount, totalAmount } = useMemo(() => {
    const subtotal = lines.reduce((acc, line) => acc + (line.totalPrice || 0), 0);
    const taxRate = 0.23; // 23% IVA
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;
    
    return { subtotal, taxAmount, totalAmount };
  }, [lines]);

  const createMutation = useMutation({
    mutationFn: async (data: CreditNoteFormData) => {
      return await apiRequest('/api/financeiro/ar/credit-notes', 'POST', {
        ...data,
        issueDate: data.issueDate.toISOString(),
        dueDate: data.dueDate.toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ar/credit-notes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/financeiro/ar/faturas'] });
      toast({
        title: t('ar.creditNotes.createSuccess'),
        description: t('ar.creditNotes.createSuccess'),
      });
      setLocation('/financeiro/invoices');
    },
    onError: (error: Error) => {
      toast({
        title: t('ar.creditNotes.createError'),
        description: error.message || t('ar.creditNotes.createError'),
        variant: 'destructive',
      });
    },
  });

  const handleAddLine = () => {
    const newLineNumber = fields.length + 1;
    append(createEmptyLineItem(newLineNumber));
  };

  const handleRemoveLine = (index: number) => {
    if (fields.length > 1) {
      remove(index);
      // Renumber remaining items
      const currentLines = form.getValues('lines');
      currentLines.forEach((_, idx) => {
        form.setValue(`lines.${idx}.lineNumber`, idx + 1);
      });
    }
  };

  const handleFormSubmit = async (data: CreditNoteFormData) => {
    await createMutation.mutateAsync(data);
  };

  const handleCancel = () => {
    setLocation('/financeiro/invoices');
  };

  const handleInvoiceSelect = (invoiceId: string) => {
    const invoice = invoices?.find(inv => inv.id === invoiceId);
    if (invoice) {
      form.setValue('originalInvoiceId', invoiceId);
      form.setValue('originalInvoiceNumber', invoice.invoiceNumber);
      form.setValue('clientName', invoice.clientName);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-credit-notes">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          {t('ar.creditNotes.title')}
        </h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          {t('ar.creditNotes.description')}
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6" data-testid="form-credit-note-create">
          {/* Credit Note Header */}
          <Card data-testid="card-credit-note-header">
            <CardHeader>
              <CardTitle>{t('ar.creditNotes.create')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Credit Note Toggle */}
                <div className="flex items-center space-x-2">
                  <FormField
                    control={form.control}
                    name="isCreditNote"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center space-x-3 space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={(checked) => {
                              field.onChange(checked);
                              setIsCreditNoteEnabled(checked);
                            }}
                            data-testid="switch-is-credit-note"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>
                            {t('ar.creditNotes.autoNegate')}
                          </FormLabel>
                          <FormDescription>
                            {t('ar.creditNotes.autoNegateHelp')}
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Original Invoice Selection */}
                  <FormField
                    control={form.control}
                    name="originalInvoiceId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ar.creditNotes.originalInvoice')}</FormLabel>
                        <Select onValueChange={handleInvoiceSelect} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-original-invoice">
                              <SelectValue placeholder={t('ar.creditNotes.selectInvoice')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {invoices?.map((invoice) => (
                              <SelectItem key={invoice.id} value={invoice.id}>
                                {invoice.invoiceNumber} - {invoice.clientName}
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
                    name="clientName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ar.creditNotes.client')}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={t('ar.creditNotes.clientName')}
                            data-testid="input-client-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="issueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ar.creditNotes.issueDate')}</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-issue-date"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecione a data</span>}
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
                    name="dueDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ar.creditNotes.dueDate')}</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                                data-testid="button-due-date"
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecione a data</span>}
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
                </div>

                {/* Reason */}
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('ar.creditNotes.reason')}</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder={t('ar.creditNotes.reasonPlaceholder')}
                          rows={2}
                          data-testid="textarea-reason"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card data-testid="card-line-items">
            <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
              <CardTitle>{t('ar.creditNotes.items')}</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddLine}
                data-testid="button-add-line"
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('ar.creditNotes.addItem')}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table data-testid="table-line-items">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">#</TableHead>
                      <TableHead>{t('ar.creditNotes.description')}</TableHead>
                      <TableHead className="w-[100px]">{t('ar.creditNotes.quantity')}</TableHead>
                      <TableHead className="w-[100px]">Un.</TableHead>
                      <TableHead className="w-[120px]">{t('ar.creditNotes.unitPrice')}</TableHead>
                      <TableHead className="w-[120px] text-right">{t('ar.creditNotes.total')}</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id} data-testid={`row-line-item-${index}`}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.description`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder={t('ar.creditNotes.itemDescription')}
                                    data-testid={`input-description-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.quantity`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                    data-testid={`input-quantity-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.unit`}
                            render={({ field }) => (
                              <FormItem>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-unit-${index}`}>
                                      <SelectValue placeholder="Un." />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="un">un</SelectItem>
                                    <SelectItem value="h">h</SelectItem>
                                    <SelectItem value="dias">dias</SelectItem>
                                    <SelectItem value="kg">kg</SelectItem>
                                    <SelectItem value="m">m</SelectItem>
                                    <SelectItem value="m2">m²</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <FormField
                            control={form.control}
                            name={`lines.${index}.unitPrice`}
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input
                                    {...field}
                                    type="number"
                                    step="0.01"
                                    onChange={e => field.onChange(parseFloat(e.target.value) || 0)}
                                    data-testid={`input-unit-price-${index}`}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </TableCell>
                        <TableCell className="text-right" data-testid={`text-total-price-${index}`}>
                          {formatCurrency(lines[index]?.totalPrice || 0)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLine(index)}
                            disabled={fields.length === 1}
                            data-testid={`button-remove-line-${index}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Totals */}
          <Card data-testid="card-totals">
            <CardContent className="pt-6">
              <div className="flex flex-col items-end space-y-2">
                <div className="grid grid-cols-2 gap-4 w-full max-w-xs">
                  <div className="text-right font-medium">{t('ar.creditNotes.subtotal')}:</div>
                  <div className="text-right" data-testid="text-subtotal">
                    {formatCurrency(subtotal)}
                  </div>
                  
                  <div className="text-right font-medium">{t('ar.creditNotes.tax', { rate: 23 })}:</div>
                  <div className="text-right" data-testid="text-tax-amount">
                    {formatCurrency(taxAmount)}
                  </div>
                  
                  <div className="text-right text-lg font-bold">{t('ar.creditNotes.totalAmount')}:</div>
                  <div className="text-right text-lg font-bold" data-testid="text-total-amount">
                    {formatCurrency(totalAmount)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          <Card data-testid="card-notes">
            <CardHeader>
              <CardTitle>{t('ar.creditNotes.items')}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={t('ar.creditNotes.itemDescription')}
                        rows={3}
                        data-testid="textarea-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={createMutation.isPending}
              data-testid="button-cancel"
            >
              {t('ar.creditNotes.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-create-credit-note"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMutation.isPending ? t('ar.creditNotes.creating') : t('ar.creditNotes.save')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

import { useEffect, useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
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
import { Plus, Trash2, Save, Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Validation Schema
const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, 'Número da fatura obrigatório'),
  clientId: z.string().optional(),
  clientName: z.string().min(1, 'Nome do cliente obrigatório'),
  issueDate: z.date({ required_error: 'Data de emissão obrigatória' }),
  dueDate: z.date({ required_error: 'Data de vencimento obrigatória' }),
  items: z.array(z.object({
    lineNumber: z.number(),
    description: z.string().min(1, 'Descrição obrigatória'),
    quantity: z.number().min(0.01, 'Quantidade deve ser maior que 0'),
    unit: z.string(),
    unitPrice: z.number().min(0, 'Preço deve ser positivo'),
    totalPrice: z.number()
  })).min(1, 'Adicione pelo menos um item'),
  notes: z.string().optional(),
  status: z.enum(['draft', 'sent', 'paid', 'overdue', 'cancelled']).default('draft')
});

type InvoiceFormData = z.infer<typeof invoiceFormSchema>;

interface InvoiceFormProps {
  mode: 'create' | 'edit';
  initialData?: Partial<InvoiceFormData> & { id?: string };
  onSubmit: (data: InvoiceFormData) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
};

const createEmptyLineItem = (lineNumber: number) => ({
  lineNumber,
  description: '',
  quantity: 1,
  unit: 'un',
  unitPrice: 0,
  totalPrice: 0
});

const generateInvoiceNumber = () => {
  const year = new Date().getFullYear();
  const seq = '001';
  return `FT ${year}/${seq}`;
};

export default function InvoiceForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
  isSubmitting = false
}: InvoiceFormProps) {
  const form = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceNumber: initialData?.invoiceNumber || generateInvoiceNumber(),
      clientId: initialData?.clientId || '',
      clientName: initialData?.clientName || '',
      issueDate: initialData?.issueDate ? new Date(initialData.issueDate) : new Date(),
      dueDate: initialData?.dueDate ? new Date(initialData.dueDate) : addDays(new Date(), 30),
      items: initialData?.items && initialData.items.length > 0 
        ? initialData.items 
        : [createEmptyLineItem(1)],
      notes: initialData?.notes || '',
      status: initialData?.status || 'draft'
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items"
  });

  const items = form.watch("items");

  // Auto-calculate line totals when quantity or unitPrice changes
  useEffect(() => {
    items.forEach((item, index) => {
      const totalPrice = item.quantity * item.unitPrice;
      if (item.totalPrice !== totalPrice) {
        form.setValue(`items.${index}.totalPrice`, totalPrice, { shouldValidate: false });
      }
    });
  }, [items, form]);

  // Calculate totals
  const { subtotal, taxAmount, totalAmount } = useMemo(() => {
    const subtotal = items.reduce((acc, item) => acc + (item.totalPrice || 0), 0);
    const taxRate = 0.23; // 23% IVA
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;
    
    return { subtotal, taxAmount, totalAmount };
  }, [items]);

  const handleAddLine = () => {
    const newLineNumber = fields.length + 1;
    append(createEmptyLineItem(newLineNumber));
  };

  const handleRemoveLine = (index: number) => {
    if (fields.length > 1) {
      remove(index);
      // Renumber remaining items
      const currentItems = form.getValues('items');
      currentItems.forEach((_, idx) => {
        form.setValue(`items.${idx}.lineNumber`, idx + 1);
      });
    }
  };

  const handleFormSubmit = async (data: InvoiceFormData) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-6">
        {/* Invoice Header */}
        <Card data-testid="card-invoice-header">
          <CardHeader>
            <CardTitle>Dados da Fatura</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="invoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número da Fatura</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="FT 2024/00001"
                        disabled={mode === 'edit'}
                        data-testid="input-invoice-number"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="clientName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Nome do cliente"
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
                    <FormLabel>Data de Emissão</FormLabel>
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
                    <FormLabel>Data de Vencimento</FormLabel>
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
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card data-testid="card-line-items">
          <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0 pb-4">
            <CardTitle>Itens da Fatura</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddLine}
              data-testid="button-add-line"
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar Linha
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table data-testid="table-line-items">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[100px]">Qtd</TableHead>
                    <TableHead className="w-[100px]">Unidade</TableHead>
                    <TableHead className="w-[120px]">Preço Unit.</TableHead>
                    <TableHead className="w-[120px] text-right">Total</TableHead>
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
                          name={`items.${index}.description`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Descrição do item"
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
                          name={`items.${index}.quantity`}
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
                          name={`items.${index}.unit`}
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
                          name={`items.${index}.unitPrice`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="number"
                                  step="0.01"
                                  min="0"
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
                        {formatCurrency(items[index]?.totalPrice || 0)}
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
                <div className="text-right font-medium">Subtotal:</div>
                <div className="text-right" data-testid="text-subtotal">
                  {formatCurrency(subtotal)}
                </div>
                
                <div className="text-right font-medium">IVA (23%):</div>
                <div className="text-right" data-testid="text-tax-amount">
                  {formatCurrency(taxAmount)}
                </div>
                
                <div className="text-right text-lg font-bold">Total:</div>
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
            <CardTitle>Notas</CardTitle>
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
                      placeholder="Notas adicionais (opcional)"
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
            onClick={onCancel}
            disabled={isSubmitting}
            data-testid="button-cancel"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="button-submit"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSubmitting ? 'Guardando...' : mode === 'create' ? 'Criar Fatura' : 'Atualizar Fatura'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

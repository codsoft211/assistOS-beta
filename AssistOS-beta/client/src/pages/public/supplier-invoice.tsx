import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, AlertCircle, Loader2, Upload } from "lucide-react";
import { useState, useRef } from "react";
import { getQueryFn } from "@/lib/queryClient";

const invoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  invoiceDate: z.string().min(1, "Invoice date is required"),
  totalAmount: z.coerce.number().positive("Total amount must be positive"),
  currency: z.string().default("EUR"),
  notes: z.string().optional(),
});

type InvoiceFormValues = z.infer<typeof invoiceFormSchema>;

export default function SupplierInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [isSuccess, setIsSuccess] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Validate token
  const { data: tokenData, isLoading: isValidating, error: tokenError } = useQuery({
    queryKey: [`/api/public/supplier-invoice/${token}/validate`],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: !!token,
    retry: false,
  });

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceFormSchema),
    defaultValues: {
      invoiceNumber: "",
      invoiceDate: new Date().toISOString().split('T')[0],
      totalAmount: 0,
      currency: "EUR",
      notes: "",
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      const formData = new FormData();
      formData.append('invoiceNumber', values.invoiceNumber);
      formData.append('invoiceDate', values.invoiceDate);
      formData.append('totalAmount', values.totalAmount.toString());
      formData.append('currency', values.currency);
      if (values.notes) {
        formData.append('notes', values.notes);
      }
      
      if (selectedFile) {
        formData.append('invoice_file', selectedFile);
      }

      const response = await fetch(`/api/public/supplier-invoice/${token}`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to submit invoice");
      }

      return response.json();
    },
    onSuccess: () => {
      setIsSuccess(true);
      toast({
        title: "Invoice Submitted Successfully",
        description: "Your invoice has been received and will be processed shortly.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit invoice. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // Validate file type and size
    if (file.type !== "application/pdf") {
      toast({
        title: "Invalid File Type",
        description: "Please upload a PDF file.",
        variant: "destructive",
      });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "File size must be less than 50MB.",
        variant: "destructive",
      });
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    setSelectedFile(file);
  };

  const onSubmit = (values: InvoiceFormValues) => {
    submitMutation.mutate(values);
  };

  if (isValidating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md" data-testid="card-loading">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="icon-loading" />
            <p className="text-sm text-muted-foreground" data-testid="text-validating">
              Validating submission link...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (tokenError || !(tokenData as any)?.valid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md" data-testid="card-error">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <AlertCircle className="h-12 w-12 text-destructive" data-testid="icon-error" />
            <div className="text-center">
              <h2 className="text-xl font-semibold" data-testid="text-error-title">
                Invalid or Expired Link
              </h2>
              <p className="mt-2 text-sm text-muted-foreground" data-testid="text-error-message">
                {(tokenData as any)?.message || "This invoice submission link is invalid or has expired. Please contact the sender for a new link."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md" data-testid="card-success">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <CheckCircle2 className="h-12 w-12 text-green-500" data-testid="icon-success" />
            <div className="text-center">
              <h2 className="text-xl font-semibold" data-testid="text-success-title">
                Invoice Submitted Successfully!
              </h2>
              <p className="mt-2 text-sm text-muted-foreground" data-testid="text-success-message">
                Your invoice has been received and will be processed shortly. You will be notified once it's approved.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl" data-testid="card-form">
        <CardHeader>
          <CardTitle data-testid="text-title">Submit Invoice</CardTitle>
          <CardDescription data-testid="text-description">
            Please fill in the invoice details below. All fields marked with * are required.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="invoiceNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invoice Number *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="INV-2024-001"
                        data-testid="input-invoice-number"
                      />
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
                    <FormLabel>Invoice Date *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="date"
                        data-testid="input-invoice-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="totalAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Total Amount *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          data-testid="input-total-amount"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Currency *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-currency">
                            <SelectValue placeholder="Select currency" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="EUR" data-testid="select-option-eur">EUR (€)</SelectItem>
                          <SelectItem value="USD" data-testid="select-option-usd">USD ($)</SelectItem>
                          <SelectItem value="GBP" data-testid="select-option-gbp">GBP (£)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Additional information about this invoice..."
                        rows={4}
                        data-testid="textarea-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Invoice File (PDF, max 10MB) *</FormLabel>
                <div className="flex items-center gap-4">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    disabled={submitMutation.isPending}
                    className="flex-1"
                    data-testid="input-file-upload"
                  />
                  {selectedFile && (
                    <CheckCircle2 className="h-5 w-5 text-green-500" data-testid="icon-file-selected" />
                  )}
                </div>
                {selectedFile && (
                  <p className="text-sm text-green-600" data-testid="text-file-selected">
                    {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>

              <div className="flex gap-4">
                <Button
                  type="submit"
                  disabled={submitMutation.isPending || !selectedFile}
                  className="flex-1"
                  data-testid="button-submit"
                >
                  {submitMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Submit Invoice
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

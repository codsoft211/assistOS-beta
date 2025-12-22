import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Upload, FileText, Check, X, AlertCircle, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";

const reviewFormSchema = z.object({
  contractNumber: z.string().min(1, "Número do contrato é obrigatório"),
  parties: z.array(z.object({
    name: z.string(),
    role: z.string(),
    taxId: z.string().optional(),
  })),
  contractValue: z.coerce.number().positive("Valor deve ser positivo"),
  currency: z.string().default('EUR'),
  startDate: z.string(),
  endDate: z.string(),
  paymentTerms: z.string().optional(),
  deliverables: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

type ReviewFormData = z.infer<typeof reviewFormSchema>;

const getStatusBadge = (status: string) => {
  const variants: Record<string, { variant: "default" | "secondary" | "outline" | "destructive", label: string }> = {
    uploaded: { variant: 'outline', label: 'Carregado' },
    processing: { variant: 'secondary', label: 'A processar...' },
    processed: { variant: 'default', label: 'Processado' },
    review: { variant: 'secondary', label: 'Em revisão' },
    approved: { variant: 'default', label: 'Aprovado' },
    rejected: { variant: 'destructive', label: 'Rejeitado' },
    error: { variant: 'destructive', label: 'Erro' },
  };
  
  const config = variants[status] || { variant: 'outline', label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
};

const formatCurrency = (value: string | number, currency: string = 'EUR') => {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency }).format(Number(value));
};

export default function ContractSubmissionsPage() {
  const { toast } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const { data: submissions, isLoading } = useQuery({
    queryKey: ['/api/crm/contract-submissions'],
  });

  const form = useForm<ReviewFormData>({
    resolver: zodResolver(reviewFormSchema),
    defaultValues: {
      currency: 'EUR',
      parties: [],
      deliverables: [],
    }
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/crm/contract-submissions/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      return response.json();
    },
    onSuccess: (submission) => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/contract-submissions'] });
      toast({ title: "Ficheiro carregado com sucesso" });
      setUploadProgress(0);
      setIsUploading(false);
      
      // Trigger OCR processing
      processSubmission(submission.id);
    },
    onError: () => {
      toast({ title: "Erro ao carregar ficheiro", variant: "destructive" });
      setUploadProgress(0);
      setIsUploading(false);
    }
  });

  const processSubmission = async (submissionId: string) => {
    setIsProcessing(true);
    setProcessingProgress(0);

    try {
      const response = await fetch(`/api/crm/contract-submissions/${submissionId}/process`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Processing failed');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        
        // Keep last partial line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.progress) {
                setProcessingProgress(data.progress);
              }

              if (data.complete) {
                setIsProcessing(false);
                
                if (data.error) {
                  toast({ title: "Erro no processamento", description: data.error, variant: "destructive" });
                } else {
                  queryClient.invalidateQueries({ queryKey: ['/api/crm/contract-submissions'] });
                  toast({ title: "Processamento concluído" });
                  
                  // Fetch updated submission and open review dialog
                  const submissionResponse = await fetch(`/api/crm/contract-submissions/${submissionId}`);
                  const submission = await submissionResponse.json();
                  setSelectedSubmission(submission);
                  setReviewOpen(true);
                  setUploadOpen(false);
                }
                break;
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError, 'Line:', line);
            }
          }
        }
      }
    } catch (error: any) {
      setIsProcessing(false);
      setProcessingProgress(0);
      toast({ title: "Erro no processamento", variant: "destructive" });
    }
  };

  const reviewMutation = useMutation({
    mutationFn: ({ submissionId, reviewedData, notes }: { submissionId: string, reviewedData: any, notes?: string }) => 
      apiRequest(`/api/crm/contract-submissions/${submissionId}/review`, 'PATCH', {
        reviewedData,
        reviewNotes: notes,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/contract-submissions'] });
      toast({ title: "Revisão submetida com sucesso" });
      setReviewOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao submeter revisão", variant: "destructive" });
    }
  });

  const approveMutation = useMutation({
    mutationFn: (submissionId: string) => 
      apiRequest(`/api/crm/contract-submissions/${submissionId}/approve`, 'POST', {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/contract-submissions'] });
      toast({ title: "Contrato aprovado e criado no CRM" });
      setReviewOpen(false);
    },
    onError: () => {
      toast({ title: "Erro ao aprovar contrato", variant: "destructive" });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: ({ submissionId, reviewNotes }: { submissionId: string, reviewNotes: string }) => 
      apiRequest(`/api/crm/contract-submissions/${submissionId}/reject`, 'POST', { reviewNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/contract-submissions'] });
      toast({ title: "Contrato rejeitado" });
      setReviewOpen(false);
    },
    onError: () => {
      toast({ title: "Erro ao rejeitar contrato", variant: "destructive" });
    }
  });

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: "Apenas ficheiros PDF são permitidos", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(30);
    uploadMutation.mutate(file);
    setUploadProgress(60);
  };

  const openReviewDialog = (submission: any) => {
    setSelectedSubmission(submission);
    
    // Populate form with extracted data, ensuring all required fields have defaults
    const extractedData = submission.extractedData || {};
    form.reset({
      contractNumber: extractedData.contractNumber || '',
      parties: extractedData.parties || [],
      contractValue: extractedData.contractValue || 0,
      currency: extractedData.currency || 'EUR',
      startDate: extractedData.startDate || '',
      endDate: extractedData.endDate || '',
      paymentTerms: extractedData.paymentTerms || '',
      deliverables: extractedData.deliverables || [],
      notes: '',
    });
    
    setReviewOpen(true);
  };

  const onReviewSubmit = (data: ReviewFormData) => {
    if (!selectedSubmission) return;
    reviewMutation.mutate({ 
      submissionId: selectedSubmission.id,
      reviewedData: data,
      notes: data.notes,
    });
  };

  const handleApprove = () => {
    if (!selectedSubmission) return;
    approveMutation.mutate(selectedSubmission.id);
  };

  const handleReject = () => {
    if (!selectedSubmission) return;
    const reviewNotes = prompt("Motivo da rejeição:");
    if (reviewNotes) {
      rejectMutation.mutate({ submissionId: selectedSubmission.id, reviewNotes });
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Submissão de Contratos</h1>
          <p className="text-muted-foreground">Upload e processamento automático de contratos via OCR</p>
        </div>
        <Button data-testid="button-upload-contract" onClick={() => setUploadOpen(true)}>
          <Upload className="h-4 w-4 mr-2" />
          Upload Contrato
        </Button>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload de Contrato</DialogTitle>
            <DialogDescription>
              Carregue um ficheiro PDF para processamento automático via OCR
            </DialogDescription>
          </DialogHeader>

          <div
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-border'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            data-testid="dropzone-upload"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              onChange={handleFileInput}
              className="hidden"
              data-testid="input-file"
            />
            
            {!isUploading && !isProcessing ? (
              <>
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-2">
                  Arraste um ficheiro PDF ou clique para selecionar
                </p>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-select-file"
                >
                  Selecionar Ficheiro
                </Button>
              </>
            ) : (
              <div className="space-y-4">
                {isUploading && (
                  <>
                    <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
                    <p className="text-lg font-medium">A carregar ficheiro...</p>
                    <Progress value={uploadProgress} className="w-full" />
                  </>
                )}
                
                {isProcessing && (
                  <>
                    <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
                    <p className="text-lg font-medium">A processar com OCR...</p>
                    <Progress value={processingProgress} className="w-full" />
                    <p className="text-sm text-muted-foreground">{processingProgress}%</p>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Revisão de Contrato</DialogTitle>
            <DialogDescription>
              Revise e corrija os dados extraídos via OCR
            </DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onReviewSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="contractNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número do Contrato</FormLabel>
                        <FormControl>
                          <Input {...field} data-testid="input-contract-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contractValue"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Valor do Contrato</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" {...field} data-testid="input-contract-value" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Início</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-start-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Data de Término</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-end-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="paymentTerms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condições de Pagamento</FormLabel>
                      <FormControl>
                        <Textarea {...field} data-testid="input-payment-terms" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notas de Revisão</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Adicione notas sobre correções feitas..." data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2 justify-end">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={handleReject}
                    disabled={rejectMutation.isPending}
                    data-testid="button-reject"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Rejeitar
                  </Button>
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={reviewMutation.isPending}
                    data-testid="button-save-review"
                  >
                    Guardar Revisão
                  </Button>
                  <Button
                    type="button"
                    onClick={handleApprove}
                    disabled={approveMutation.isPending}
                    data-testid="button-approve"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Aprovar e Criar Contrato
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      {/* Submissions List */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Submissões</CardTitle>
          <CardDescription>Contratos carregados e em processamento</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ficheiro</TableHead>
                  <TableHead>Data Upload</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contrato #</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!submissions || (submissions as any)?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      Nenhuma submissão encontrada
                    </TableCell>
                  </TableRow>
                ) : (
                  (submissions as any)?.map((submission: any) => (
                    <TableRow key={submission.id} data-testid={`row-submission-${submission.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{submission.originalFilename}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {format(new Date(submission.uploadedAt), "dd/MM/yyyy HH:mm", { locale: pt })}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(submission.status)}
                      </TableCell>
                      <TableCell>
                        {submission.extractedData?.contractNumber || '-'}
                      </TableCell>
                      <TableCell>
                        {submission.extractedData?.contractValue 
                          ? formatCurrency(submission.extractedData.contractValue, submission.extractedData.currency)
                          : '-'
                        }
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {(submission.status === 'processed' || submission.status === 'review') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReviewDialog(submission)}
                              data-testid={`button-review-${submission.id}`}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              Rever
                            </Button>
                          )}
                          {submission.status === 'error' && (
                            <Badge variant="destructive">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              {submission.errorMessage}
                            </Badge>
                          )}
                        </div>
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

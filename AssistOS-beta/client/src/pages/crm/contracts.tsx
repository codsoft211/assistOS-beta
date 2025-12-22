import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FileText, Calendar, AlertCircle, Plus, Euro, Upload, Loader2, Edit } from "lucide-react";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { pt } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";

const contractFormSchema = z.object({
  clientId: z.string().min(1, "Cliente é obrigatório"),
  contractNumber: z.string().min(1, "Número do contrato é obrigatório"),
  type: z.enum(['service', 'product', 'subscription', 'support', 'license']),
  title: z.string().min(1, "Título é obrigatório"),
  description: z.string().optional(),
  contractValue: z.coerce.number().positive("Valor deve ser positivo"),
  currency: z.string().default('EUR'),
  startDate: z.string(),
  endDate: z.string(),
  renewalDate: z.string().optional(),
  autoRenewal: z.boolean().default(false),
  renewalNoticeDays: z.coerce.number().default(60),
});

type ContractFormData = z.infer<typeof contractFormSchema>;

const formatCurrency = (value: string | number) => {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(Number(value));
};

export default function ContractsPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<any>(null);
  const [entryMode, setEntryMode] = useState<'manual' | 'upload'>('manual');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['/api/crm/contracts'],
  });

  const { data: clients } = useQuery({
    queryKey: ['/api/crm/clientes'],
  });

  const form = useForm<ContractFormData>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: {
      type: 'service',
      currency: 'EUR',
      autoRenewal: false,
      renewalNoticeDays: 60,
    }
  });

  const editForm = useForm<ContractFormData>({
    resolver: zodResolver(contractFormSchema),
  });

  useEffect(() => {
    if (selectedContract) {
      editForm.reset({
        clientId: selectedContract.clientId || '',
        contractNumber: selectedContract.contractNumber,
        type: selectedContract.type,
        title: selectedContract.title,
        description: selectedContract.description || '',
        contractValue: selectedContract.contractValue,
        currency: selectedContract.currency,
        startDate: selectedContract.startDate,
        endDate: selectedContract.endDate,
        renewalDate: selectedContract.renewalDate || '',
        autoRenewal: selectedContract.autoRenewal ?? false,
        renewalNoticeDays: selectedContract.renewalNoticeDays ?? 60,
      });
    }
  }, [selectedContract, editForm]);

  const createMutation = useMutation({
    mutationFn: (data: ContractFormData) => apiRequest('/api/crm/contracts', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/contracts'] });
      toast({ title: "Contrato criado com sucesso" });
      setOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Erro ao criar contrato", variant: "destructive" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (data: ContractFormData) => 
      apiRequest(`/api/crm/contracts/${selectedContract?.id}`, 'PATCH', { ...data, status: 'active' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/contracts'] });
      toast({ title: "Contrato atualizado e ativado com sucesso" });
      setEditOpen(false);
      setSelectedContract(null);
      editForm.reset();
    },
    onError: () => {
      toast({ title: "Erro ao atualizar contrato", variant: "destructive" });
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
                  // Create contract from OCR data with pending_review status
                  try {
                    const submissionResponse = await fetch(`/api/crm/contract-submissions/${submissionId}`);
                    const submission = await submissionResponse.json();
                    
                    if (submission.extractedData) {
                      const contractData = {
                        contractNumber: submission.extractedData.contractNumber || `OCR-${Date.now()}`,
                        title: submission.extractedData.title || 'Contrato via OCR',
                        description: submission.extractedData.description || '',
                        type: 'service' as const,
                        clientId: null,
                        contractValue: submission.extractedData.contractValue || 0,
                        currency: submission.extractedData.currency || 'EUR',
                        startDate: submission.extractedData.startDate || new Date().toISOString().split('T')[0],
                        endDate: submission.extractedData.endDate || new Date().toISOString().split('T')[0],
                        renewalDate: submission.extractedData.renewalDate || undefined,
                        autoRenewal: submission.extractedData.autoRenewal ?? false,
                        renewalNoticeDays: submission.extractedData.renewalNoticeDays ?? 60,
                        status: 'pending_review' as const,
                        ocrData: submission.extractedData,
                        fileUrl: submission.fileUrl,
                      };
                      
                      await apiRequest('/api/crm/contracts', 'POST', contractData);
                      queryClient.invalidateQueries({ queryKey: ['/api/crm/contracts'] });
                      toast({ title: "Contrato criado com sucesso", description: "Status: Por Rever" });
                      setOpen(false);
                      setEntryMode('manual');
                    }
                  } catch (error) {
                    console.error('Failed to create contract from OCR:', error);
                    toast({ title: "OCR concluído mas falhou a criação do contrato", variant: "destructive" });
                  }
                }
                break;
              }
            } catch (parseError) {
              console.error('Failed to parse SSE data:', parseError);
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
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  }, []);

  const handleFile = (file: File) => {
    if (file.type !== 'application/pdf') {
      toast({ title: "Apenas ficheiros PDF são permitidos", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    setUploadProgress(50);
    uploadMutation.mutate(file);
  };

  const getStatusBadge = (contract: any) => {
    const status = contract.status;
    const endDate = new Date(contract.endDate);
    const daysUntilExpiry = differenceInDays(endDate, new Date());

    if (status === 'pending_review') {
      return (
        <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 border-yellow-500/30">
          <AlertCircle className="h-3 w-3 mr-1" />
          Por Rever
        </Badge>
      );
    }

    if (status === 'active' && daysUntilExpiry < 30 && daysUntilExpiry > 0) {
      return <Badge variant="destructive">Expira em breve</Badge>;
    }

    const variants: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      draft: 'outline',
      active: 'default',
      pending_renewal: 'secondary',
      renewed: 'outline',
      expired: 'destructive',
      cancelled: 'destructive',
    };
    
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const onSubmit = (data: ContractFormData) => {
    createMutation.mutate(data);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Contratos CRM</h1>
          <p className="text-muted-foreground">Gestão de contratos e renovações</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-contract">
              <Plus className="h-4 w-4 mr-2" />
              Novo Contrato
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Contrato</DialogTitle>
              <DialogDescription>
                Adicione manualmente ou faça upload de PDF para extração automática
              </DialogDescription>
            </DialogHeader>

            <Tabs value={entryMode} onValueChange={(v) => setEntryMode(v as 'manual' | 'upload')} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="manual" data-testid="tab-manual">Manual</TabsTrigger>
                <TabsTrigger value="upload" data-testid="tab-upload">Upload OCR</TabsTrigger>
              </TabsList>

              <TabsContent value="manual" className="mt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="clientId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-client">
                            <SelectValue placeholder="Selecione um cliente" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {clients?.clients?.map((client: any) => (
                            <SelectItem key={client.id} value={client.id}>
                              {client.name}
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
                    name="contractNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número do Contrato</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="CON-2024-001" data-testid="input-contract-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-type">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="service">Serviço</SelectItem>
                            <SelectItem value="product">Produto</SelectItem>
                            <SelectItem value="subscription">Subscrição</SelectItem>
                            <SelectItem value="support">Suporte</SelectItem>
                            <SelectItem value="license">Licença</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Título</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Ex: Contrato de Manutenção Anual" data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descrição</FormLabel>
                      <FormControl>
                        <Textarea {...field} placeholder="Detalhes do contrato..." rows={3} data-testid="textarea-description" />
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
                      <FormLabel>Valor do Contrato (€)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} placeholder="10000.00" data-testid="input-value" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
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
                        <FormLabel>Data de Fim</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} data-testid="input-end-date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-contract">
                    {createMutation.isPending ? "A guardar..." : "Guardar"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel">
                    Cancelar
                  </Button>
                </div>
              </form>
            </Form>
              </TabsContent>

              <TabsContent value="upload" className="mt-4">
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
                      <p className="text-sm text-muted-foreground mb-4">
                        O contrato será processado com OCR e ficará "Por Rever"
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="button-select-file"
                      >
                        Selecionar Ficheiro PDF
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
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Contratos</CardTitle>
          <CardDescription>
            {data?.total || 0} contratos registados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Fim do Contrato</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.contracts?.map((contract: any) => (
                  <TableRow key={contract.id} data-testid={`row-contract-${contract.id}`}>
                    <TableCell className="font-mono text-sm">{contract.contractNumber}</TableCell>
                    <TableCell className="font-medium">{contract.title}</TableCell>
                    <TableCell>{contract.client?.name || 'N/A'}</TableCell>
                    <TableCell>{formatCurrency(contract.contractValue)}</TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(contract.endDate), 'dd/MM/yyyy')}
                    </TableCell>
                    <TableCell>{getStatusBadge(contract)}</TableCell>
                    <TableCell>
                      {contract.status === 'pending_review' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedContract(contract);
                            setEditOpen(true);
                          }}
                          data-testid={`button-edit-${contract.id}`}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Rever
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {data?.contracts?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum contrato registado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Rever e Ativar Contrato</DialogTitle>
            <DialogDescription>
              Reveja e ajuste os dados extraídos via OCR. O contrato será ativado após guardar.
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit((data) => updateMutation.mutate(data))} className="space-y-4">
              <FormField
                control={editForm.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cliente</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-client-edit">
                          <SelectValue placeholder="Selecione um cliente" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {clients?.clients?.map((client: any) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="contractNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Número do Contrato</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="CT-2024-001" data-testid="input-contract-number-edit" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Contrato</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-type-edit">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="service">Serviço</SelectItem>
                        <SelectItem value="product">Produto</SelectItem>
                        <SelectItem value="subscription">Subscrição</SelectItem>
                        <SelectItem value="support">Suporte</SelectItem>
                        <SelectItem value="license">Licença</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Contrato de manutenção anual" data-testid="input-title-edit" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Descrição detalhada..." data-testid="textarea-description-edit" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="contractValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valor do Contrato (€)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} placeholder="10000.00" data-testid="input-value-edit" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Moeda</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="EUR" data-testid="input-currency-edit" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="startDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Início</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-start-date-edit" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="endDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data de Fim</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} data-testid="input-end-date-edit" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={editForm.control}
                name="renewalDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Renovação (Opcional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} data-testid="input-renewal-date-edit" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={editForm.control}
                  name="autoRenewal"
                  render={({ field }) => (
                    <FormItem className="flex items-center gap-2 space-y-0 pt-2">
                      <FormControl>
                        <input
                          type="checkbox"
                          checked={field.value}
                          onChange={field.onChange}
                          data-testid="checkbox-auto-renewal-edit"
                          className="h-4 w-4"
                        />
                      </FormControl>
                      <FormLabel className="!mt-0">Renovação Automática</FormLabel>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="renewalNoticeDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dias de Aviso de Renovação</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} placeholder="60" data-testid="input-notice-days-edit" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-save-edit">
                  {updateMutation.isPending ? "A guardar..." : "Guardar e Ativar"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditOpen(false)} data-testid="button-cancel-edit">
                  Cancelar
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

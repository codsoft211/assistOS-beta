import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Upload, FileText, X, CalendarIcon, Folder, CheckCircle2, AlertCircle, FileImage, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

const uploadSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  documentType: z.enum(['invoice', 'contract', 'receipt', 'fiscal_note', 'purchase_order', 'report', 'other']).optional(),
  fiscalYear: z.string().optional(),
  fiscalMonth: z.string().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  
  // Folder
  folderId: z.string().optional(),
  
  // Portuguese Fiscal Fields
  nifEmissor: z.string().optional().refine((val) => !val || /^[0-9]{9}$/.test(val), {
    message: "NIF deve ter 9 dígitos"
  }),
  nifDestinatario: z.string().optional().refine((val) => !val || /^[0-9]{9}$/.test(val), {
    message: "NIF deve ter 9 dígitos"
  }),
  atcud: z.string().optional(),
  codigoValidacaoAt: z.string().optional(),
  dataDocumento: z.date().optional(),
}).refine((data) => {
  // ATCUD required if documentType is 'invoice'
  if (data.documentType === 'invoice' && !data.atcud) {
    return false;
  }
  return true;
}, {
  message: "ATCUD é obrigatório para faturas",
  path: ["atcud"],
});

type UploadFormData = z.infer<typeof uploadSchema>;

interface FolderNode {
  id: string;
  name: string;
  path: string;
  parentFolderId: string | null;
  folderType: string | null;
  documentCount?: number;
  children: FolderNode[];
}

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'application/zip',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Helper function to flatten folder tree
function flattenFolders(folders: FolderNode[] | undefined | null, level = 0): Array<{ id: string; name: string; level: number }> {
  if (!folders || !Array.isArray(folders)) {
    return [];
  }
  const result: Array<{ id: string; name: string; level: number }> = [];
  for (const folder of folders) {
    result.push({ id: folder.id, name: folder.name, level });
    if (folder.children && folder.children.length > 0) {
      result.push(...flattenFolders(folder.children, level + 1));
    }
  }
  return result;
}

// Helper to get file icon based on MIME type
function getFileIcon(fileType: string) {
  if (fileType.startsWith('image/')) return FileImage;
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) return FileSpreadsheet;
  return FileText;
}

// Helper to validate NIF format (9 digits)
function isValidNIF(nif: string | undefined): boolean {
  if (!nif) return false;
  return /^[0-9]{9}$/.test(nif);
}

interface DocumentUploadProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentUpload({ open, onOpenChange }: DocumentUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: "",
      description: "",
      documentType: undefined,
      fiscalYear: new Date().getFullYear().toString(),
      fiscalMonth: "",
      folderId: "",
      nifEmissor: "",
      nifDestinatario: "",
      atcud: "",
      codigoValidacaoAt: "",
    },
  });

  // Fetch folders for dropdown
  const foldersQuery = useQuery({
    queryKey: ['/api/folders'],
    queryFn: async () => {
      const response = await fetch('/api/folders?format=tree');
      if (!response.ok) throw new Error('Falha ao carregar pastas');
      const data = await response.json();
      // Handle both array and object responses
      const folders = Array.isArray(data) ? data : (data.folders || []);
      return folders as FolderNode[];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: UploadFormData & { file: File }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      if (data.title) formData.append('title', data.title);
      if (data.description) formData.append('description', data.description);
      if (data.documentType) formData.append('documentType', data.documentType);
      if (data.fiscalYear) formData.append('fiscalYear', data.fiscalYear);
      if (data.fiscalMonth) formData.append('fiscalMonth', data.fiscalMonth);
      if (data.entityType) formData.append('entityType', data.entityType);
      if (data.entityId) formData.append('entityId', data.entityId);
      if (data.folderId) formData.append('folderId', data.folderId);
      
      // Portuguese Fiscal Fields
      if (data.nifEmissor) formData.append('nifEmissor', data.nifEmissor);
      if (data.nifDestinatario) formData.append('nifDestinatario', data.nifDestinatario);
      if (data.atcud) formData.append('atcud', data.atcud);
      if (data.codigoValidacaoAt) formData.append('codigoValidacaoAt', data.codigoValidacaoAt);
      if (data.dataDocumento) formData.append('dataDocumento', data.dataDocumento.toISOString());

      const response = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Falha ao carregar documento');
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Documento carregado",
        description: "O seu documento foi carregado com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/folders'] });
      form.reset();
      setSelectedFile(null);
      setUploadProgress(0);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Falha no carregamento",
        description: error.message,
        variant: "destructive",
      });
      setUploadProgress(0);
    },
  });

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return `Tipo de ficheiro inválido: ${file.type}. Por favor carregue ficheiros PDF, imagens, documentos Office, texto, CSV ou ZIP.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `O tamanho do ficheiro excede o limite de 50MB. Tamanho: ${(file.size / 1024 / 1024).toFixed(2)}MB`;
    }
    return null;
  };

  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) {
      toast({
        title: "Ficheiro inválido",
        description: error,
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    if (!form.getValues('title')) {
      form.setValue('title', file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const onSubmit = (data: UploadFormData) => {
    if (!selectedFile) {
      toast({
        title: "Nenhum ficheiro selecionado",
        description: "Por favor selecione um ficheiro para carregar.",
        variant: "destructive",
      });
      return;
    }

    setUploadProgress(50);
    uploadMutation.mutate({ ...data, file: selectedFile });
  };

  const flatFolders = foldersQuery.data ? flattenFolders(foldersQuery.data) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]" data-testid="dialog-upload">
        <DialogHeader>
          <DialogTitle>Carregar Documento</DialogTitle>
          <DialogDescription>
            Carregue documentos com metadados para classificação e armazenamento
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-8rem)] pr-4">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Drag & Drop Zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-md p-6 transition-colors ${
                dragActive ? "border-primary bg-muted" : "border-muted-foreground/25"
              }`}
              data-testid="dropzone-upload"
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileInputChange}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.xls,.xlsx,.doc,.docx,.txt,.csv,.zip"
                data-testid="input-file"
              />
              
              {selectedFile ? (
                <div className="flex items-center gap-3">
                  {(() => {
                    const FileIcon = getFileIcon(selectedFile.type);
                    return <FileIcon className="h-8 w-8 text-primary shrink-0" />;
                  })()}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate" data-testid="text-filename">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type || 'Tipo desconhecido'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedFile(null)}
                    data-testid="button-remove-file"
                    className="shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                  <div className="mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-select-file"
                    >
                      Selecionar Ficheiro
                    </Button>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    ou arraste e largue um ficheiro aqui
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PDF, Imagens, Documentos Office, Texto, CSV, ZIP (máx 50MB)
                  </p>
                </div>
              )}
            </div>

            {/* Upload Progress */}
            {uploadProgress > 0 && uploadProgress < 100 && (
              <Progress value={uploadProgress} data-testid="progress-upload" />
            )}

            {/* Portuguese Fiscal Fields - PRIORITY */}
            <div className="space-y-4 border-2 border-primary/20 rounded-lg p-4 bg-primary/5">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-primary">Conformidade Fiscal Portuguesa</h3>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="nifEmissor"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        NIF Emissor
                        {field.value && (
                          isValidNIF(field.value) ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          )
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="123456789" maxLength={9} data-testid="input-nif-emissor" />
                      </FormControl>
                      <FormDescription>9 dígitos</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nifDestinatario"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        NIF Destinatário (Optional)
                        {field.value && (
                          isValidNIF(field.value) ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          )
                        )}
                      </FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="987654321" maxLength={9} data-testid="input-nif-destinatario" />
                      </FormControl>
                      <FormDescription>9 dígitos</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="atcud"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ATCUD {form.watch('documentType') === 'invoice' && <span className="text-destructive">*</span>}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Código ATCUD" data-testid="input-atcud" />
                      </FormControl>
                      <FormDescription>Obrigatório para faturas</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="codigoValidacaoAt"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código Validação AT (Opcional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Código de validação" data-testid="input-codigo-validacao-at" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="dataDocumento"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Data Documento (Optional)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={`w-full justify-start text-left font-normal ${!field.value && "text-muted-foreground"}`}
                              data-testid="input-data-documento"
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        Data do documento (diferente da data de carregamento)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Basic Metadata */}
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Título do documento" data-testid="input-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="documentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Documento</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-document-type">
                          <SelectValue placeholder="Selecionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="invoice">Fatura</SelectItem>
                        <SelectItem value="contract">Contrato</SelectItem>
                        <SelectItem value="receipt">Recibo</SelectItem>
                        <SelectItem value="fiscal_note">Nota Fiscal</SelectItem>
                        <SelectItem value="purchase_order">Ordem de Compra</SelectItem>
                        <SelectItem value="report">Relatório</SelectItem>
                        <SelectItem value="other">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fiscalYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ano Fiscal</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" placeholder="2025" data-testid="input-fiscal-year" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fiscalMonth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mês Fiscal</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-fiscal-month">
                          <SelectValue placeholder="Selecionar mês" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => (
                          <SelectItem key={i + 1} value={String(i + 1)}>
                            {new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Folder Selector */}
            <FormField
              control={form.control}
              name="folderId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pasta (Opcional)</FormLabel>
                  <Select 
                    onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                    value={field.value || "none"}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-folder">
                        <SelectValue placeholder="Selecionar pasta" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">Nenhuma</SelectItem>
                      {flatFolders.map((folder) => (
                        <SelectItem key={folder.id} value={folder.id}>
                          <span style={{ paddingLeft: `${folder.level * 16}px` }}>
                            {folder.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Escolha uma pasta para organizar este documento
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description - Last field */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (Opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Descrição do documento"
                      className="resize-none"
                      rows={3}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

              <Button
                type="submit"
                className="w-full"
                disabled={!selectedFile || uploadMutation.isPending}
                data-testid="button-upload"
              >
                {uploadMutation.isPending ? "A carregar..." : "Carregar Documento"}
              </Button>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

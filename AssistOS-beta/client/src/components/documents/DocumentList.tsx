import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Download,
  Eye,
  Trash2,
  Sparkles,
  FileText,
  MoreVertical,
  Search,
  ChevronRight,
  Folder,
  FolderInput,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest } from "@/lib/queryClient";

interface Document {
  id: string;
  filename: string;
  title: string | null;
  description: string | null;
  documentType: string;
  status: string;
  size: number;
  fiscalYear: number | null;
  fiscalMonth: number | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
  // Portuguese Fiscal Fields
  nifEmissor: string | null;
  nifDestinatario: string | null;
  atcud: string | null;
  codigoValidacaoAt: string | null;
  dataDocumento: string | null;
  isFiscalCompliant: boolean | null;
}

interface FolderNode {
  id: string;
  name: string;
  path: string;
  parentFolderId: string | null;
  folderType: string | null;
  documentCount?: number;
  children: FolderNode[];
}

interface DocumentListProps {
  onViewDetails: (doc: Document) => void;
  folderId?: string | null;
}

// Helper to flatten folder tree for dropdown
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

// Helper to get folder breadcrumbs
function getFolderBreadcrumbs(folderId: string, folders: FolderNode[] | undefined | null): string[] {
  const breadcrumbs: string[] = [];
  if (!folders || !Array.isArray(folders)) {
    return breadcrumbs;
  }
  
  function findPath(nodes: FolderNode[], targetId: string, path: string[]): boolean {
    for (const node of nodes) {
      const currentPath = [...path, node.name];
      if (node.id === targetId) {
        breadcrumbs.push(...currentPath);
        return true;
      }
      if (node.children && findPath(node.children, targetId, currentPath)) {
        return true;
      }
    }
    return false;
  }
  
  findPath(folders, folderId, []);
  return breadcrumbs;
}

export function DocumentList({ onViewDetails, folderId }: DocumentListProps) {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    type: "",
    fiscalYear: "",
    fiscalMonth: "",
    search: "",
  });
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: ['/api/documents', page, filters, folderId],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        ...(filters.type && { type: filters.type }),
        ...(filters.fiscalYear && { fiscalYear: filters.fiscalYear }),
        ...(filters.fiscalMonth && { fiscalMonth: filters.fiscalMonth }),
        ...(filters.search && { search: filters.search }),
        ...(folderId && { folderId }),
      });
      const response = await fetch(`/api/documents?${params}`);
      if (!response.ok) throw new Error('Falha ao carregar documentos');
      return response.json();
    },
  });

  const foldersQuery = useQuery({
    queryKey: ['/api/folders'],
    queryFn: async () => {
      const response = await fetch('/api/folders?format=tree');
      if (!response.ok) throw new Error('Falha ao carregar pastas');
      const data = await response.json();
      return data.folders as FolderNode[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/documents/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Falha ao eliminar documento');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Documento eliminado",
        description: "O documento foi eliminado com sucesso.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao eliminar",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const classifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/documents/${id}/classify`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Falha ao classificar documento');
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Classificação iniciada",
        description: "A classificação AI está em progresso.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha na classificação",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const moveToFolderMutation = useMutation({
    mutationFn: async ({ folderId, documentIds }: { folderId: string; documentIds: string[] }) => {
      return apiRequest('POST', `/api/folders/${folderId}/documents`, {
        documentIds,
        setPrimary: true,
      });
    },
    onSuccess: () => {
      toast({
        title: "Documentos movidos",
        description: "Os documentos foram movidos para a pasta selecionada.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/folders'] });
      setSelectedDocuments(new Set());
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao mover",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleDownload = async (id: string, filename: string) => {
    try {
      const response = await fetch(`/api/documents/${id}/download`);
      if (!response.ok) throw new Error('Falha ao descarregar documento');
      
      const data = await response.json();
      window.open(data.downloadUrl, '_blank');
    } catch (error: any) {
      toast({
        title: "Falha no download",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleMoveToFolder = (targetFolderId: string) => {
    if (selectedDocuments.size === 0) {
      toast({
        title: "Nenhum documento selecionado",
        description: "Por favor selecione documentos para mover.",
        variant: "destructive",
      });
      return;
    }

    moveToFolderMutation.mutate({
      folderId: targetFolderId,
      documentIds: Array.from(selectedDocuments),
    });
  };

  const toggleDocumentSelection = (docId: string) => {
    const newSelection = new Set(selectedDocuments);
    if (newSelection.has(docId)) {
      newSelection.delete(docId);
    } else {
      newSelection.add(docId);
    }
    setSelectedDocuments(newSelection);
  };

  const toggleAllDocuments = () => {
    if (selectedDocuments.size === documents.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(documents.map((d: Document) => d.id)));
    }
  };

  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      invoice: "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300",
      contract: "bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300",
      receipt: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300",
      fiscal_note: "bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300",
      purchase_order: "bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300",
      report: "bg-pink-100 dark:bg-pink-950 text-pink-700 dark:text-pink-300",
      other: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
    };
    return colors[type] || colors.other;
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300",
      processing: "bg-yellow-100 dark:bg-yellow-950 text-yellow-700 dark:text-yellow-300",
      archived: "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
      deleted: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300",
    };
    return colors[status] || colors.active;
  };

  const documents = documentsQuery.data?.documents || [];
  const totalPages = documentsQuery.data?.totalPages || 1;
  const folders = foldersQuery.data || [];
  const flatFolders = folders.length > 0 ? flattenFolders(folders) : [];

  // Get breadcrumbs for current folder
  const breadcrumbs = folderId && folders.length > 0 ? getFolderBreadcrumbs(folderId, folders) : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle>Documentos</CardTitle>
            <CardDescription>
              {folderId ? (
                <div className="flex items-center gap-1 mt-1" data-testid="breadcrumb-folder">
                  <Folder className="h-3 w-3" />
                  {breadcrumbs.map((crumb, index) => (
                    <span key={index} className="flex items-center gap-1">
                      {index > 0 && <ChevronRight className="h-3 w-3" />}
                      <span className="text-xs">{crumb}</span>
                    </span>
                  ))}
                </div>
              ) : (
                "Gerir os seus documentos carregados e classificações"
              )}
            </CardDescription>
          </div>
          
          {selectedDocuments.size > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" data-testid="badge-selected-count">
                {selectedDocuments.size} selecionado{selectedDocuments.size !== 1 ? 's' : ''}
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-move-to-folder">
                    <FolderInput className="h-4 w-4 mr-2" />
                    Mover para Pasta
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {flatFolders.map((folder) => (
                    <DropdownMenuItem
                      key={folder.id}
                      onClick={() => handleMoveToFolder(folder.id)}
                      data-testid={`menu-move-to-${folder.id}`}
                    >
                      <span style={{ paddingLeft: `${folder.level * 16}px` }}>
                        {folder.name}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Pesquisar documentos..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="pl-8"
                data-testid="input-search-documents"
              />
            </div>
          </div>
          <Select
            value={filters.type || "all"}
            onValueChange={(value) => setFilters({ ...filters, type: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full md:w-48" data-testid="select-filter-type">
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="invoice">Fatura</SelectItem>
              <SelectItem value="contract">Contrato</SelectItem>
              <SelectItem value="receipt">Recibo</SelectItem>
              <SelectItem value="fiscal_note">Nota Fiscal</SelectItem>
              <SelectItem value="purchase_order">Ordem de Compra</SelectItem>
              <SelectItem value="report">Relatório</SelectItem>
              <SelectItem value="other">Outro</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={filters.fiscalYear || "all"}
            onValueChange={(value) => setFilters({ ...filters, fiscalYear: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full md:w-32" data-testid="select-filter-year">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {Array.from({ length: 5 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <Select
            value={filters.fiscalMonth || "all"}
            onValueChange={(value) => setFilters({ ...filters, fiscalMonth: value === "all" ? "" : value })}
          >
            <SelectTrigger className="w-full md:w-36" data-testid="select-filter-month">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              <SelectItem value="1">Janeiro</SelectItem>
              <SelectItem value="2">Fevereiro</SelectItem>
              <SelectItem value="3">Março</SelectItem>
              <SelectItem value="4">Abril</SelectItem>
              <SelectItem value="5">Maio</SelectItem>
              <SelectItem value="6">Junho</SelectItem>
              <SelectItem value="7">Julho</SelectItem>
              <SelectItem value="8">Agosto</SelectItem>
              <SelectItem value="9">Setembro</SelectItem>
              <SelectItem value="10">Outubro</SelectItem>
              <SelectItem value="11">Novembro</SelectItem>
              <SelectItem value="12">Dezembro</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table data-testid="table-documents">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={documents.length > 0 && selectedDocuments.size === documents.length}
                    onCheckedChange={toggleAllDocuments}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead>Documento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="min-w-28">NIF Emissor</TableHead>
                <TableHead className="min-w-32">ATCUD</TableHead>
                <TableHead>Período Fiscal</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Tamanho</TableHead>
                <TableHead>Criado</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : documents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3" data-testid="text-empty-state">
                      <div className="rounded-full bg-muted p-3">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">
                          {filters.search || filters.type || filters.fiscalYear || filters.fiscalMonth
                            ? "Nenhum documento encontrado"
                            : folderId 
                              ? "Pasta vazia" 
                              : "Nenhum documento carregado"}
                        </p>
                        <p className="text-sm text-muted-foreground max-w-sm">
                          {filters.search || filters.type || filters.fiscalYear || filters.fiscalMonth
                            ? "Nenhum documento corresponde aos filtros selecionados. Tente ajustar os critérios de pesquisa."
                            : folderId 
                              ? "Esta pasta ainda não contém documentos. Carregue ficheiros ou mova documentos existentes para aqui." 
                              : "Comece por carregar o seu primeiro documento usando o formulário de upload."}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                documents.map((doc: Document) => (
                  <TableRow key={doc.id} data-testid={`row-document-${doc.id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedDocuments.has(doc.id)}
                        onCheckedChange={() => toggleDocumentSelection(doc.id)}
                        data-testid={`checkbox-select-${doc.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium" data-testid={`text-document-title-${doc.id}`}>
                          {doc.title || doc.filename}
                        </div>
                        {doc.description && (
                          <div className="text-sm text-muted-foreground truncate max-w-xs">
                            {doc.description}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getTypeColor(doc.documentType)} data-testid={`badge-type-${doc.id}`}>
                        {doc.documentType.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {doc.nifEmissor ? (
                        <span className="text-sm font-mono" data-testid={`text-nif-emissor-${doc.id}`}>
                          {doc.nifEmissor}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground" data-testid={`text-nif-emissor-${doc.id}`}>-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {doc.atcud ? (
                        <span className="text-xs font-mono truncate max-w-32 block" data-testid={`text-atcud-${doc.id}`}>
                          {doc.atcud}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground" data-testid={`text-atcud-${doc.id}`}>-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {doc.fiscalYear && doc.fiscalMonth ? (
                        <span className="text-sm" data-testid={`text-fiscal-period-${doc.id}`}>
                          {doc.fiscalYear}-{String(doc.fiscalMonth).padStart(2, '0')}
                        </span>
                      ) : doc.fiscalYear ? (
                        <span className="text-sm" data-testid={`text-fiscal-period-${doc.id}`}>{doc.fiscalYear}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground" data-testid={`text-fiscal-period-${doc.id}`}>-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(doc.status)} data-testid={`badge-status-${doc.id}`}>
                        {doc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(doc.size / 1024 / 1024).toFixed(2)} MB
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(doc.createdAt), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid={`button-actions-${doc.id}`}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => onViewDetails(doc)}
                            data-testid={`button-view-${doc.id}`}
                          >
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDownload(doc.id, doc.filename)}
                            data-testid={`button-download-${doc.id}`}
                          >
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => classifyMutation.mutate(doc.id)}
                            disabled={classifyMutation.isPending}
                            data-testid={`button-classify-${doc.id}`}
                          >
                            <Sparkles className="mr-2 h-4 w-4" />
                            Classify with AI
                          </DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger data-testid={`button-move-${doc.id}`}>
                              <FolderInput className="mr-2 h-4 w-4" />
                              Move to Folder
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {flatFolders.map((folder) => (
                                <DropdownMenuItem
                                  key={folder.id}
                                  onClick={() => moveToFolderMutation.mutate({
                                    folderId: folder.id,
                                    documentIds: [doc.id],
                                  })}
                                  data-testid={`menu-move-single-${doc.id}-${folder.id}`}
                                >
                                  <span style={{ paddingLeft: `${folder.level * 16}px` }}>
                                    {folder.name}
                                  </span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuItem
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this document?')) {
                                deleteMutation.mutate(doc.id);
                              }
                            }}
                            className="text-destructive"
                            data-testid={`button-delete-${doc.id}`}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
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
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className={page === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  data-testid="button-prev-page"
                />
              </PaginationItem>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = i + 1;
                return (
                  <PaginationItem key={pageNum}>
                    <PaginationLink
                      onClick={() => setPage(pageNum)}
                      isActive={page === pageNum}
                      className="cursor-pointer"
                      data-testid={`button-page-${pageNum}`}
                    >
                      {pageNum}
                    </PaginationLink>
                  </PaginationItem>
                );
              })}
              <PaginationItem>
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className={page === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  data-testid="button-next-page"
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </CardContent>
    </Card>
  );
}

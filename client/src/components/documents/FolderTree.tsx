import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  ChevronRight, 
  Folder, 
  FolderOpen, 
  FolderPlus, 
  Trash2, 
  Edit, 
  MoreVertical,
  Receipt,
  FileText,
  ShoppingCart,
  Landmark
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as globalQueryClient } from "@/lib/queryClient";

interface FolderNode {
  id: string;
  name: string;
  path: string;
  parentFolderId: string | null;
  folderType: string | null;
  documentCount?: number;
  children: FolderNode[];
}

interface FolderTreeProps {
  onFolderSelect?: (folderId: string | null) => void;
  selectedFolderId?: string | null;
}

// Helper function to get folder icon based on type
function getFolderIcon(folderType: string | null, isOpen: boolean) {
  if (!folderType) {
    return isOpen ? FolderOpen : Folder;
  }
  
  // Portuguese fiscal folder types
  switch (folderType) {
    case 'invoices':
    case 'faturas':
      return Receipt;
    case 'fiscal_docs':
    case 'documentos_fiscais':
      return FileText;
    case 'purchases':
    case 'compras':
      return ShoppingCart;
    case 'taxes':
    case 'impostos':
      return Landmark;
    default:
      return isOpen ? FolderOpen : Folder;
  }
}

export function FolderTree({ onFolderSelect, selectedFolderId }: FolderTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<FolderNode | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderDescription, setNewFolderDescription] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const foldersQuery = useQuery({
    queryKey: ['/api/folders'],
    queryFn: async () => {
      const response = await fetch('/api/folders?format=tree');
      if (!response.ok) throw new Error('Falha ao carregar pastas');
      return response.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; parentFolderId?: string | null; description?: string }) => {
      return apiRequest('POST', '/api/folders', data);
    },
    onSuccess: () => {
      toast({ title: "Pasta criada", description: "A pasta foi criada com sucesso." });
      queryClient.invalidateQueries({ queryKey: ['/api/folders'] });
      setCreateDialogOpen(false);
      setNewFolderName("");
      setNewFolderDescription("");
      setSelectedFolder(null);
    },
    onError: (error: Error) => {
      toast({ title: "Falha ao criar", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; name: string; description?: string }) => {
      return apiRequest('PATCH', `/api/folders/${data.id}`, { name: data.name, description: data.description });
    },
    onSuccess: () => {
      toast({ title: "Pasta atualizada", description: "A pasta foi atualizada com sucesso." });
      queryClient.invalidateQueries({ queryKey: ['/api/folders'] });
      setEditDialogOpen(false);
      setNewFolderName("");
      setNewFolderDescription("");
      setSelectedFolder(null);
    },
    onError: (error: Error) => {
      toast({ title: "Falha ao atualizar", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (folderId: string) => {
      return apiRequest('DELETE', `/api/folders/${folderId}`);
    },
    onSuccess: () => {
      toast({ title: "Pasta eliminada", description: "A pasta foi eliminada com sucesso." });
      queryClient.invalidateQueries({ queryKey: ['/api/folders'] });
    },
    onError: (error: Error) => {
      toast({ title: "Falha ao eliminar", description: error.message, variant: "destructive" });
    },
  });

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
    }
    setExpandedFolders(newExpanded);
  };

  const handleCreateFolder = (parentFolder?: FolderNode) => {
    setSelectedFolder(parentFolder || null);
    setCreateDialogOpen(true);
  };

  const handleEditFolder = (folder: FolderNode) => {
    setSelectedFolder(folder);
    setNewFolderName(folder.name);
    setNewFolderDescription("");
    setEditDialogOpen(true);
  };

  const handleSubmitCreate = () => {
    if (!newFolderName.trim()) {
      toast({ title: "Erro de validação", description: "O nome da pasta é obrigatório", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      name: newFolderName,
      parentFolderId: selectedFolder?.id || null,
      description: newFolderDescription || undefined,
    });
  };

  const handleSubmitEdit = () => {
    if (!selectedFolder || !newFolderName.trim()) {
      toast({ title: "Erro de validação", description: "O nome da pasta é obrigatório", variant: "destructive" });
      return;
    }

    updateMutation.mutate({
      id: selectedFolder.id,
      name: newFolderName,
      description: newFolderDescription || undefined,
    });
  };

  const renderFolder = (folder: FolderNode, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;
    const FolderIcon = getFolderIcon(folder.folderType, isExpanded);

    return (
      <div key={folder.id} data-testid={`folder-${folder.id}`}>
        <div
          className={`
            flex items-center gap-1 py-1.5 hover-elevate active-elevate-2
            ${isSelected ? 'bg-accent' : ''}
          `}
          style={{ paddingLeft: `${level * 24 + 12}px`, paddingRight: '12px' }}
        >
          {hasChildren ? (
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={() => toggleFolder(folder.id)}
              data-testid={`button-toggle-${folder.id}`}
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            </Button>
          ) : (
            <div className="w-6 shrink-0" />
          )}

          <div
            className="flex-1 flex items-center gap-2 cursor-pointer min-w-0"
            onClick={() => onFolderSelect?.(folder.id)}
            data-testid={`folder-item-${folder.id}`}
          >
            <FolderIcon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm truncate">{folder.name}</span>
            {folder.documentCount !== undefined && folder.documentCount > 0 && (
              <Badge variant="secondary" className="ml-auto h-5 text-xs shrink-0" data-testid={`badge-count-${folder.id}`}>
                {folder.documentCount}
              </Badge>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                data-testid={`button-menu-${folder.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleCreateFolder(folder)} data-testid={`menu-create-subfolder-${folder.id}`}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Criar Subpasta
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleEditFolder(folder)} data-testid={`menu-edit-${folder.id}`}>
                <Edit className="mr-2 h-4 w-4" />
                Renomear
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  if (confirm(`Eliminar pasta "${folder.name}"? Isto irá desassociar documentos mas não os eliminará.`)) {
                    deleteMutation.mutate(folder.id);
                  }
                }}
                className="text-destructive"
                data-testid={`menu-delete-${folder.id}`}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {isExpanded && hasChildren && (
          <div>
            {folder.children.map((child) => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  const folders = foldersQuery.data?.folders || [];

  return (
    <div className="flex flex-col h-full" data-testid="folder-tree">
      <div className="flex items-center justify-between p-2 border-b">
        <h3 className="font-semibold text-sm">Pastas</h3>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => handleCreateFolder()}
          data-testid="button-create-root-folder"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="py-2 space-y-1">
          <div
            className={`
              flex items-center gap-2 px-3 py-1.5 hover-elevate active-elevate-2 cursor-pointer
              ${selectedFolderId === null ? 'bg-accent' : ''}
            `}
            onClick={() => onFolderSelect?.(null)}
            data-testid="folder-item-all"
          >
            <Folder className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Todos os Documentos</span>
          </div>

          {foldersQuery.isLoading ? (
            // Loading skeleton
            (Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1" />
              </div>
            )))
          ) : folders.length === 0 ? (
            // Empty state - compact
            (<div className="flex flex-col items-center py-6 px-4 text-center ml-[24px] mr-[24px]" data-testid="text-empty-folders">
              <div className="rounded-full bg-muted p-2.5 mb-2.5">
                <FolderPlus className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground mb-1">
                Nenhuma pasta criada
              </p>
              <p className="text-xs text-muted-foreground mb-3 max-w-44">
                Organize os seus documentos criando pastas personalizadas
              </p>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => handleCreateFolder()}
                data-testid="button-create-first-folder"
              >
                <FolderPlus className="h-4 w-4 mr-2" />
                Criar Pasta
              </Button>
            </div>)
          ) : (
            folders.map((folder: FolderNode) => renderFolder(folder))
          )}
        </div>
      </ScrollArea>
      {/* Create Folder Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent data-testid="dialog-create-folder">
          <DialogHeader>
            <DialogTitle>Criar Pasta</DialogTitle>
            <DialogDescription>
              {selectedFolder ? `Criar subpasta em "${selectedFolder.name}"` : 'Criar nova pasta raiz'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="folder-name">Nome da Pasta</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Introduza o nome da pasta"
                data-testid="input-folder-name"
              />
            </div>

            <div>
              <Label htmlFor="folder-description">Descrição (opcional)</Label>
              <Textarea
                id="folder-description"
                value={newFolderDescription}
                onChange={(e) => setNewFolderDescription(e.target.value)}
                placeholder="Introduza descrição"
                data-testid="input-folder-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} data-testid="button-cancel-create">
              Cancelar
            </Button>
            <Button onClick={handleSubmitCreate} disabled={createMutation.isPending} data-testid="button-submit-create">
              {createMutation.isPending ? "A criar..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Edit Folder Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-folder">
          <DialogHeader>
            <DialogTitle>Editar Pasta</DialogTitle>
            <DialogDescription>Atualizar nome e descrição da pasta</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-folder-name">Nome da Pasta</Label>
              <Input
                id="edit-folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Introduza o nome da pasta"
                data-testid="input-edit-folder-name"
              />
            </div>

            <div>
              <Label htmlFor="edit-folder-description">Descrição (opcional)</Label>
              <Textarea
                id="edit-folder-description"
                value={newFolderDescription}
                onChange={(e) => setNewFolderDescription(e.target.value)}
                placeholder="Introduza descrição"
                data-testid="input-edit-folder-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} data-testid="button-cancel-edit">
              Cancelar
            </Button>
            <Button onClick={handleSubmitEdit} disabled={updateMutation.isPending} data-testid="button-submit-edit">
              {updateMutation.isPending ? "A atualizar..." : "Atualizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

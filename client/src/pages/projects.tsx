import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search, FolderKanban, Calendar, Users, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { LinkFieldPicker } from "@/components/projects/LinkFieldPicker";

interface ProjectEntity {
  id: string;
  tenantId: string;
  entityName: string;
  environment: 'sandbox' | 'production';
  schema: any;
}

interface ProjectRecord {
  id: string;
  tenantId: string;
  entityId: string;
  data: Record<string, any>;
  environment: 'sandbox' | 'production';
  createdAt: string;
  updatedAt: string;
}

export default function ProjectsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<ProjectEntity | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [linkLabels, setLinkLabels] = useState<Record<string, string>>({}); // Store display values for link fields

  // Fetch configured project entities (production only)
  const { data: entitiesData, isLoading: entitiesLoading, error: entitiesError } = useQuery<{ entities: ProjectEntity[] }>({
    queryKey: ['/api/modules/projects/entities', 'production'],
    queryFn: async () => {
      const response = await fetch('/api/modules/projects/entities?env=production');
      if (!response.ok) throw new Error('Failed to fetch entities');
      return response.json();
    },
  });

  // Fetch project records
  const { data: projectsData, isLoading: projectsLoading, error: projectsError } = useQuery<{ records: ProjectRecord[] }>({
    queryKey: ['/api/modules/projects/records', 'production'],
    queryFn: async () => {
      const response = await fetch('/api/modules/projects/records?env=production');
      if (!response.ok) throw new Error('Failed to fetch records');
      return response.json();
    },
    enabled: (entitiesData?.entities?.length || 0) > 0,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (payload: { entityId: string; data: Record<string, any> }) => {
      return await apiRequest('POST', '/api/modules/projects/records', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/records'] });
      setCreateDialogOpen(false);
      setSelectedEntity(null);
      setFormData({});
      setLinkLabels({});
      toast({
        title: "Projeto criado!",
        description: "Projeto criado com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar projeto",
        description: error.message || "Falha ao criar projeto.",
        variant: "destructive",
      });
    },
  });

  const entities = entitiesData?.entities || [];
  const projects = projectsData?.records || [];
  const hasConfiguration = entities.length > 0;

  const filteredProjects = projects.filter(project => {
    if (!searchQuery) return true;
    const data = project.data;
    return Object.values(data).some(value => 
      String(value).toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleCreateClick = (entity: ProjectEntity) => {
    setSelectedEntity(entity);
    // Initialize form data with required fields
    const initialData: Record<string, any> = {};
    if (entity.schema?.fields) {
      entity.schema.fields.forEach((field: any) => {
        if (field.required) {
          initialData[field.name] = '';
        }
      });
    }
    setFormData(initialData);
    setLinkLabels({}); // Clear link labels
    setCreateDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!selectedEntity) return;
    
    createProjectMutation.mutate({
      entityId: selectedEntity.id,
      data: formData,
    });
  };

  if (entitiesError) {
    return (
      <div className="p-6">
        <Alert variant="destructive" data-testid="alert-entities-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar configuração de projetos. {(entitiesError as Error).message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (entitiesLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!hasConfiguration) {
    return (
      <div className="p-6">
        <Alert data-testid="alert-no-config">
          <FolderKanban className="h-4 w-4" />
          <AlertDescription>
            Nenhuma configuração de projetos encontrada. Configure o módulo Projects no <Link href="/studio/modules/projects/config" className="underline">Studio</Link>.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="text-page-title">
            <FolderKanban className="h-8 w-8" />
            Projetos
          </h1>
          <p className="text-muted-foreground mt-1">
            Gerencie seus projetos com campos personalizados e links cross-module
          </p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-project">
              <Plus className="h-4 w-4 mr-2" />
              Novo Projeto
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-create-project">
            <DialogHeader>
              <DialogTitle>Criar Novo Projeto</DialogTitle>
              <DialogDescription>
                Selecione o tipo de projeto e preencha os campos
              </DialogDescription>
            </DialogHeader>
            
            {!selectedEntity ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Escolha o template:</p>
                <div className="grid gap-3">
                  {entities.map((entity) => (
                    <Card 
                      key={entity.id}
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleCreateClick(entity)}
                      data-testid={`card-entity-${entity.entityName}`}
                    >
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">{entity.entityName}</CardTitle>
                        <CardDescription className="text-xs">
                          {entity.schema?.fields?.length || 0} campos configurados
                        </CardDescription>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <FolderKanban className="h-4 w-4" />
                  <span className="font-medium">{selectedEntity.entityName}</span>
                </div>

                {selectedEntity.schema?.fields?.map((field: any) => {
                  // Check if field has link metadata
                  if (field.linkMetadata) {
                    return (
                      <LinkFieldPicker
                        key={field.name}
                        fieldName={field.name}
                        linkMetadata={field.linkMetadata}
                        value={formData[field.name] || null}
                        onChange={(linkId, displayValue) => {
                          setFormData({ ...formData, [field.name]: linkId });
                          setLinkLabels({ ...linkLabels, [field.name]: displayValue });
                        }}
                        required={field.required}
                      />
                    );
                  }

                  // Regular text input for non-link fields
                  return (
                    <div key={field.name} className="space-y-2">
                      <label className="text-sm font-medium">
                        {field.name}
                        {field.required && <span className="text-destructive ml-1">*</span>}
                      </label>
                      <Input
                        value={formData[field.name] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                        placeholder={`Digite ${field.name.toLowerCase()}`}
                        data-testid={`input-${field.name}`}
                      />
                    </div>
                  );
                })}

                <div className="flex gap-2 pt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setSelectedEntity(null);
                      setFormData({});
                      setLinkLabels({});
                    }}
                    data-testid="button-back"
                  >
                    Voltar
                  </Button>
                  <Button 
                    onClick={handleSubmit}
                    disabled={createProjectMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createProjectMutation.isPending ? 'Criando...' : 'Criar Projeto'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar projetos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <Badge variant="outline" data-testid="badge-count">
          {filteredProjects.length} projeto(s)
        </Badge>
      </div>

      {/* Projects List */}
      {projectsError ? (
        <Alert variant="destructive" data-testid="alert-projects-error">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Erro ao carregar projetos. {(projectsError as Error).message}
          </AlertDescription>
        </Alert>
      ) : projectsLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <Card data-testid="card-empty">
          <CardContent className="pt-6 text-center text-muted-foreground">
            {searchQuery ? 'Nenhum projeto encontrado com esse filtro.' : 'Nenhum projeto criado ainda. Clique em "Novo Projeto" para começar.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredProjects.map((project) => {
            const entity = entities.find(e => e.id === project.entityId);
            
            return (
              <Link key={project.id} href={`/projects/${project.id}`}>
                <Card className="hover-elevate cursor-pointer" data-testid={`card-project-${project.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2">
                          <FolderKanban className="h-5 w-5" />
                          {project.data.name || project.data.Nome || project.data.title || 'Projeto sem nome'}
                        </CardTitle>
                        <CardDescription className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Criado em {new Date(project.createdAt).toLocaleDateString('pt-BR')}
                          </span>
                          {entity && (
                            <Badge variant="secondary" className="text-xs">
                              {entity.entityName}
                            </Badge>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  {Object.keys(project.data).length > 1 && (
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {Object.entries(project.data).slice(0, 4).map(([key, value]) => (
                          key !== 'name' && key !== 'Nome' && key !== 'title' && (
                            <div key={key}>
                              <span className="text-muted-foreground text-xs">{key}:</span>
                              <p className="font-medium truncate">{String(value)}</p>
                            </div>
                          )
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

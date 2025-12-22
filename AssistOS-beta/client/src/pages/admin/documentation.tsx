import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { 
  BookOpen, 
  Search, 
  Package, 
  Database, 
  Wrench, 
  GitBranch,
  FileText,
  Code,
  Zap,
  ExternalLink
} from "lucide-react";

type ModuleDoc = {
  id: string;
  name: string;
  description: string;
  content: string;
  entities: number;
  tools: number;
  workflows: number;
  routes: number;
  path: string;
};

type DocumentationResponse = {
  modules: ModuleDoc[];
};

const MODULE_ICONS: Record<string, any> = {
  compras: Package,
  comercial: Zap,
  financeiro: Database,
  logistica: GitBranch,
  projetos: FileText,
};

export default function AdminDocumentationPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModule, setSelectedModule] = useState<string>("compras");

  const { data, isLoading, error } = useQuery<DocumentationResponse>({
    queryKey: ["/api/admin/documentation"],
  });

  const filteredModules = data?.modules.filter(
    (mod) =>
      mod.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      mod.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const currentModule = filteredModules?.find((m) => m.id === selectedModule);

  if (error) {
    return (
      <div className="container mx-auto p-6 max-w-7xl">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              Erro ao carregar documentação
            </CardTitle>
            <CardDescription>
              {error instanceof Error ? error.message : "Erro desconhecido"}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2" data-testid="text-documentation-title">
            <BookOpen className="h-8 w-8" />
            Documentação dos Módulos
          </h2>
          <p className="text-muted-foreground mt-1" data-testid="text-documentation-description">
            Documentação técnica completa de todos os módulos do AssistOS
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Pesquisar módulos, entidades, ferramentas..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-documentation"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          {/* Module List Sidebar */}
          <Card data-testid="card-module-list">
            <CardHeader>
              <CardTitle className="text-lg">Módulos Disponíveis</CardTitle>
              <CardDescription>
                {filteredModules?.length || 0} módulos encontrados
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-2">
                  {filteredModules?.map((module) => {
                    const Icon = MODULE_ICONS[module.id] || Package;
                    const isSelected = selectedModule === module.id;

                    return (
                      <button
                        key={module.id}
                        onClick={() => setSelectedModule(module.id)}
                        className={`w-full text-left p-3 rounded-md border transition-colors ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "hover:bg-accent border-transparent"
                        }`}
                        data-testid={`button-module-${module.id}`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                              isSelected ? "bg-primary/20" : "bg-muted"
                            }`}
                          >
                            <Icon
                              className={`h-5 w-5 ${
                                isSelected ? "text-primary" : "text-muted-foreground"
                              }`}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm capitalize">
                              {module.name}
                            </h3>
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {module.description}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-2">
                              <Badge variant="secondary" className="text-xs">
                                {module.entities} entidades
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {module.tools} ferramentas
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {(!filteredModules || filteredModules.length === 0) && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      Nenhum módulo encontrado
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Documentation Content */}
          {currentModule ? (
            <Card data-testid="card-documentation-content">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-2xl capitalize flex items-center gap-2">
                        {(() => {
                          const Icon = MODULE_ICONS[currentModule.id] || Package;
                          return <Icon className="h-6 w-6" />;
                        })()}
                        {currentModule.name}
                      </CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1"
                        asChild
                        data-testid="button-view-readme"
                      >
                        <a 
                          href={`/api/admin/documentation/${currentModule.id}/raw`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Ver README.md
                        </a>
                      </Button>
                    </div>
                    <CardDescription className="mt-2">
                      {currentModule.description}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="gap-1">
                      <Database className="h-3 w-3" />
                      {currentModule.entities} Entidades
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Wrench className="h-3 w-3" />
                      {currentModule.tools} Ferramentas
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <GitBranch className="h-3 w-3" />
                      {currentModule.workflows} Workflows
                    </Badge>
                    <Badge variant="outline" className="gap-1">
                      <Code className="h-3 w-3" />
                      {currentModule.routes} Rotas
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="overview" className="w-full">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="overview" data-testid="tab-overview">
                      Visão Geral
                    </TabsTrigger>
                    <TabsTrigger value="documentation" data-testid="tab-documentation">
                      Documentação
                    </TabsTrigger>
                    <TabsTrigger value="examples" data-testid="tab-examples">
                      Exemplos
                    </TabsTrigger>
                    <TabsTrigger value="api" data-testid="tab-api">
                      API Reference
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4 mt-4">
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <h3>Resumo do Módulo</h3>
                      <p>{currentModule.description}</p>
                      <div className="grid grid-cols-2 gap-4 not-prose mt-4">
                        <div className="p-4 border rounded-md">
                          <div className="text-2xl font-bold">{currentModule.entities}</div>
                          <div className="text-sm text-muted-foreground">Entidades de Base de Dados</div>
                        </div>
                        <div className="p-4 border rounded-md">
                          <div className="text-2xl font-bold">{currentModule.tools}</div>
                          <div className="text-sm text-muted-foreground">Ferramentas AI</div>
                        </div>
                        <div className="p-4 border rounded-md">
                          <div className="text-2xl font-bold">{currentModule.workflows}</div>
                          <div className="text-sm text-muted-foreground">Workflows Automatizados</div>
                        </div>
                        <div className="p-4 border rounded-md">
                          <div className="text-2xl font-bold">{currentModule.routes}</div>
                          <div className="text-sm text-muted-foreground">Rotas API RESTful</div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="documentation" className="mt-4">
                    <ScrollArea className="h-[600px]">
                      <div 
                        className="prose prose-sm max-w-none dark:prose-invert"
                        dangerouslySetInnerHTML={{ __html: currentModule.content }}
                        data-testid="text-documentation-markdown"
                      />
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="examples" className="mt-4">
                    <div className="p-6 border rounded-md bg-muted/30">
                      <p className="text-sm text-muted-foreground">
                        Exemplos de uso e casos práticos serão adicionados em breve.
                      </p>
                    </div>
                  </TabsContent>

                  <TabsContent value="api" className="mt-4">
                    <div className="p-6 border rounded-md bg-muted/30">
                      <p className="text-sm text-muted-foreground">
                        Referência completa da API será adicionada em breve.
                      </p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-96">
                <div className="text-center text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Selecione um módulo para ver a documentação</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

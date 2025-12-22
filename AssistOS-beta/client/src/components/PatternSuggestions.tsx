import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, Sparkles, X, Zap } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DetectedPattern {
  id: string;
  type: string;
  sequence: Array<{
    actionType: string;
    toolName?: string;
    category?: string;
  }>;
  occurrences: number;
  confidence: number;
  suggestedWorkflow: {
    name: string;
    description: string;
  };
  lastSeen: string;
  dismissedAt: string | null;
}

export default function PatternSuggestions() {
  const { toast } = useToast();
  const [forceAnalyze, setForceAnalyze] = useState(false);

  const { data: patterns, isLoading, refetch } = useQuery<DetectedPattern[]>({
    queryKey: ['/api/patterns', forceAnalyze ? { analyze: 'true' } : {}],
    queryFn: async () => {
      const url = forceAnalyze ? '/api/patterns?analyze=true' : '/api/patterns';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch patterns');
      return res.json();
    },
  });

  const createWorkflow = useMutation({
    mutationFn: async (patternId: string) => {
      return await apiRequest('POST', `/api/patterns/${patternId}/create-workflow`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patterns'] });
      toast({
        title: "Automação Criada",
        description: "O workflow foi criado com sucesso.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível criar a automação.",
        variant: "destructive",
      });
    },
  });

  const dismissPattern = useMutation({
    mutationFn: async (patternId: string) => {
      return await apiRequest('POST', `/api/patterns/${patternId}/dismiss`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patterns'] });
      toast({
        title: "Pattern Dispensado",
        description: "Este padrão foi marcado como dispensado.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro",
        description: error.message || "Não foi possível dispensar o padrão.",
        variant: "destructive",
      });
    },
  });

  const handleRefresh = () => {
    setForceAnalyze(true);
    refetch().finally(() => setForceAnalyze(false));
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'Alta';
    if (confidence >= 0.6) return 'Média';
    return 'Baixa';
  };

  const visiblePatterns = patterns?.filter(p => !p.dismissedAt) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-page-title">Automações Sugeridas</h2>
          <p className="text-sm text-muted-foreground">
            Padrões detectados nas suas atividades que podem ser automatizados
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isLoading}
          variant="outline"
          data-testid="button-refresh-patterns"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Empty State */}
      {visiblePatterns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Sparkles className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2" data-testid="text-empty-title">
              Nenhum Padrão Detectado
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-md" data-testid="text-empty-description">
              Continue usando o sistema e vamos detectar padrões nas suas atividades que podem ser automatizados.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visiblePatterns.map((pattern) => (
            <Card key={pattern.id} className="hover-elevate" data-testid={`card-pattern-${pattern.id}`}>
              <CardHeader className="gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base" data-testid={`text-pattern-name-${pattern.id}`}>
                      {pattern.suggestedWorkflow.name}
                    </CardTitle>
                  </div>
                  <Badge 
                    variant="secondary" 
                    className={getConfidenceColor(pattern.confidence)}
                    data-testid={`badge-confidence-${pattern.id}`}
                  >
                    {getConfidenceLabel(pattern.confidence)}
                  </Badge>
                </div>
                <CardDescription data-testid={`text-pattern-description-${pattern.id}`}>
                  {pattern.suggestedWorkflow.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Action Sequence */}
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Sequência de Ações:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pattern.sequence.map((action, idx) => (
                      <Badge 
                        key={idx} 
                        variant="outline" 
                        className="text-xs"
                        data-testid={`badge-action-${pattern.id}-${idx}`}
                      >
                        {action.toolName || action.actionType}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Confiança:</span>
                    <span className={getConfidenceColor(pattern.confidence)} data-testid={`text-confidence-value-${pattern.id}`}>
                      {Math.round(pattern.confidence * 100)}%
                    </span>
                  </div>
                  <Progress 
                    value={pattern.confidence * 100} 
                    className="h-1"
                    data-testid={`progress-confidence-${pattern.id}`}
                  />
                  
                  <div className="flex items-center justify-between text-xs pt-2">
                    <span className="text-muted-foreground">Ocorrências:</span>
                    <span data-testid={`text-occurrences-${pattern.id}`}>{pattern.occurrences}</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Última vez:</span>
                    <span data-testid={`text-last-seen-${pattern.id}`}>
                      {formatDistanceToNow(new Date(pattern.lastSeen), { 
                        addSuffix: true,
                        locale: ptBR 
                      })}
                    </span>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex gap-2 justify-between">
                <Button
                  onClick={() => createWorkflow.mutate(pattern.id)}
                  disabled={createWorkflow.isPending}
                  className="flex-1"
                  data-testid={`button-create-workflow-${pattern.id}`}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Criar Automação
                </Button>
                <Button
                  onClick={() => dismissPattern.mutate(pattern.id)}
                  disabled={dismissPattern.isPending}
                  variant="ghost"
                  size="icon"
                  data-testid={`button-dismiss-${pattern.id}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

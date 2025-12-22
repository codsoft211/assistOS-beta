import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  PlayCircle
} from "lucide-react";

import { apiRequest } from "@/lib/queryClient";

interface Execution {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  triggerData: any;
  result: any;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  duration: number | null;
}

interface Workflow {
  id: string;
  name: string;
  description: string;
}

export default function WorkflowExecutionsPage() {
  const { id: workflowId } = useParams();
  const [, navigate] = useLocation();

  // Fetch workflow details
  const { data: workflow, isLoading: loadingWorkflow } = useQuery<Workflow>({
    queryKey: [`/api/assistbuild/workflows/${workflowId}`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/assistbuild/workflows/${workflowId}`);
      return await response.json();
    },
    enabled: !!workflowId,
  });

  // Fetch executions for this workflow
  const { data: executionsData, isLoading: loadingExecutions } = useQuery({
    queryKey: [`/api/assistbuild/executions?workflowId=${workflowId}`],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/assistbuild/executions?workflowId=${workflowId}`);
      return await response.json();
    },
    enabled: !!workflowId,
    refetchInterval: 3000, // Refresh every 3 seconds to show live updates
  });

  const executions = executionsData?.executions || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge className="bg-green-500">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Completed
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      case 'running':
        return (
          <Badge className="bg-blue-500">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Running
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDuration = (ms: number | null) => {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(date);
  };

  if (loadingWorkflow) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="h-8 w-1/3 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/workflows')}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Workflows
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Execution History</h1>
        <p className="text-muted-foreground mt-1">
          {workflow?.name || 'Workflow'} - All executions
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Executions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {executions.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {executions.filter((e: Execution) => e.status === 'completed').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {executions.filter((e: Execution) => e.status === 'failed').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Running
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {executions.filter((e: Execution) => e.status === 'running').length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Executions List */}
      <div className="space-y-4">
        {loadingExecutions ? (
          <>
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-4 w-2/3 mt-2" />
                </CardHeader>
              </Card>
            ))}
          </>
        ) : executions.length > 0 ? (
          executions.map((execution: Execution) => (
            <Card key={execution.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                      <PlayCircle className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">
                        Execution #{execution.id.slice(0, 8)}
                      </CardTitle>
                      {getStatusBadge(execution.status)}
                    </div>
                    <CardDescription>
                      Started: {formatDate(execution.startedAt)}
                      {execution.completedAt && (
                        <> • Completed: {formatDate(execution.completedAt)}</>
                      )}
                      {execution.duration && (
                        <> • Duration: {formatDuration(execution.duration)}</>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Trigger Data */}
                  {execution.triggerData && Object.keys(execution.triggerData).length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-1">Trigger Data:</p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(execution.triggerData, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {/* Result */}
                  {execution.result && execution.status === 'completed' && (
                    <div>
                      <p className="text-sm font-medium mb-1 text-green-600">Result:</p>
                      <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                        {JSON.stringify(execution.result, null, 2)}
                      </pre>
                    </div>
                  )}
                  
                  {/* Error */}
                  {execution.error && execution.status === 'failed' && (
                    <div>
                      <p className="text-sm font-medium mb-1 text-red-600">Error:</p>
                      <pre className="text-xs bg-red-50 text-red-900 p-2 rounded overflow-auto max-h-32">
                        {execution.error}
                      </pre>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <PlayCircle className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No executions yet</h3>
              <p className="text-muted-foreground mb-6 max-w-md">
                This workflow hasn't been executed yet. Execute it from the workflows page to see history here.
              </p>
              <Button onClick={() => navigate('/workflows')}>
                Go to Workflows
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

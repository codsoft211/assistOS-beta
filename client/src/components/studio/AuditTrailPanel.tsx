/**
 * Audit Trail Panel
 * 
 * Displays audit log entries from tenant schema with pagination.
 * View-only panel showing all configuration changes and actions.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  User,
  Clock,
  Activity,
  Filter,
  RefreshCw,
} from "lucide-react";

// ==================== TYPES ====================

interface AuditLog {
  id: string;
  tenantId: string;
  actorUserId: string;
  actorName: string | null;
  actorEmail: string | null;
  targetUserId: string | null;
  action: string;
  metadata: Record<string, any> | null;
  ipAddress: string | null;
  userAgent: string | null;
  environment: string | null;
  createdAt: string;
}

interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  actions: string[];
}

// ==================== ACTION BADGE COLORS ====================

const getActionBadgeVariant = (action: string): "default" | "secondary" | "destructive" | "outline" => {
  if (action.includes('created') || action.includes('activated')) return 'default';
  if (action.includes('deleted') || action.includes('deactivated')) return 'destructive';
  if (action.includes('updated') || action.includes('changed')) return 'secondary';
  return 'outline';
};

const formatActionLabel = (action: string): string => {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

// ==================== MAIN COMPONENT ====================

export default function AuditTrailPanel() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Fetch audit logs
  const { data, isLoading, isFetching, refetch } = useQuery<AuditLogsResponse>({
    queryKey: ['/api/org-structure/audit-logs', page, pageSize, actionFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        size: pageSize.toString(),
      });
      if (actionFilter !== 'all') params.append('action', actionFilter);
      if (search) params.append('search', search);
      
      const res = await fetch(`/api/org-structure/audit-logs?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch audit logs');
      return res.json();
    },
  });

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Audit Trail
          </CardTitle>
          <CardDescription>Loading audit logs...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-10 w-48" />
            </div>
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const { logs, pagination, actions } = data || { logs: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 }, actions: [] };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Audit Trail
              </CardTitle>
              <CardDescription>
                View all configuration changes and actions ({pagination.total} entries)
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-4">
            <div className="flex-1 min-w-[200px] max-w-[300px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search actions or metadata..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actions.map(action => (
                  <SelectItem key={action} value={action}>
                    {formatActionLabel(action)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={handleSearch}>
              Search
            </Button>
          </div>

          {/* Table */}
          {logs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No audit logs found</p>
              <p className="text-sm mt-1">
                {search || actionFilter !== 'all' 
                  ? 'Try adjusting your filters' 
                  : 'Actions will appear here as you make changes'}
              </p>
            </div>
          ) : (
            <>
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Timestamp</TableHead>
                      <TableHead className="w-[180px]">Action</TableHead>
                      <TableHead className="w-[200px]">User</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id} className="group">
                        <TableCell className="text-sm">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger className="flex items-center gap-1.5 text-left">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                {new Date(log.createdAt).toLocaleDateString('pt-PT', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                })}
                                <span className="text-muted-foreground">
                                  {new Date(log.createdAt).toLocaleTimeString('pt-PT', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {new Date(log.createdAt).toLocaleString('pt-PT')}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getActionBadgeVariant(log.action)}>
                            {formatActionLabel(log.action)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium">
                                {log.actorName || 'Unknown'}
                              </p>
                              {log.actorEmail && (
                                <p className="text-xs text-muted-foreground">
                                  {log.actorEmail}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[300px]">
                          {log.metadata && (
                            <p className="text-sm text-muted-foreground truncate">
                              {typeof log.metadata === 'object' 
                                ? Object.entries(log.metadata)
                                    .slice(0, 3)
                                    .map(([k, v]) => `${k}: ${typeof v === 'object' ? '...' : v}`)
                                    .join(', ')
                                : String(log.metadata)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setSelectedLog(log)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Showing</span>
                  <Select 
                    value={pageSize.toString()} 
                    onValueChange={(v) => { setPageSize(parseInt(v)); setPage(1); }}
                  >
                    <SelectTrigger className="w-[70px] h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                  <span>of {pagination.total} entries</span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(1)}
                    disabled={page === 1}
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-3 text-sm">
                    Page {page} of {pagination.totalPages || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(pagination.totalPages)}
                    disabled={page >= pagination.totalPages}
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant={selectedLog ? getActionBadgeVariant(selectedLog.action) : 'outline'}>
                {selectedLog ? formatActionLabel(selectedLog.action) : ''}
              </Badge>
            </DialogTitle>
            <DialogDescription>
              {selectedLog && new Date(selectedLog.createdAt).toLocaleString('pt-PT')}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              {/* Actor Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">Actor</h4>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{selectedLog.actorName || 'Unknown'}</p>
                      {selectedLog.actorEmail && (
                        <p className="text-sm text-muted-foreground">{selectedLog.actorEmail}</p>
                      )}
                    </div>
                  </div>
                </div>
                {selectedLog.environment && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">Environment</h4>
                    <Badge variant="outline">{selectedLog.environment}</Badge>
                  </div>
                )}
              </div>

              {/* IP & User Agent */}
              {(selectedLog.ipAddress || selectedLog.userAgent) && (
                <div className="grid grid-cols-2 gap-4">
                  {selectedLog.ipAddress && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">IP Address</h4>
                      <p className="text-sm font-mono">{selectedLog.ipAddress}</p>
                    </div>
                  )}
                  {selectedLog.userAgent && (
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">User Agent</h4>
                      <p className="text-sm text-muted-foreground truncate" title={selectedLog.userAgent}>
                        {selectedLog.userAgent.substring(0, 50)}...
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Metadata */}
              {selectedLog.metadata && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Metadata</h4>
                  <ScrollArea className="h-[200px] border rounded-lg p-3 bg-muted/30">
                    <pre className="text-sm font-mono whitespace-pre-wrap">
                      {JSON.stringify(selectedLog.metadata, null, 2)}
                    </pre>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}


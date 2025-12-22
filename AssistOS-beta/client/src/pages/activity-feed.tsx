import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  Filter,
  Calendar,
  Users,
  TrendingUp,
  FileText,
  Package,
  MessageSquare,
  DollarSign,
  Briefcase,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

interface ActivityItem {
  id: string;
  moduleType: string;
  entityType: string;
  entityId: string;
  entityName: string | null;
  action: string;
  userId: string | null;
  userName: string | null;
  title: string;
  description: string | null;
  link: string | null;
  metadata: any;
  priority: string;
  category: string | null;
  tags: string[] | null;
  createdAt: string;
}

interface ActivityStats {
  totalActivities: number;
  byModule: Record<string, number>;
  byPriority: Record<string, number>;
  byUser: Record<string, number>;
}

const MODULE_ICONS: Record<string, any> = {
  finance: DollarSign,
  crm: Briefcase,
  logistics: Package,
  projects: FileText,
  angariacao: TrendingUp,
  communications: MessageSquare,
};

const PRIORITY_COLORS: Record<string, string> = {
  low: 'secondary',
  normal: 'default',
  high: 'default',
  critical: 'destructive',
};

export default function ActivityFeedPage() {
  const { t, i18n } = useTranslation();
  const [selectedModule, setSelectedModule] = useState<string>('all');
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [limit, setLimit] = useState(50);

  // Fetch activity feed
  const { data: activityData, isLoading: isLoadingActivities } = useQuery<{
    success: boolean;
    data: ActivityItem[];
    count: number;
  }>({
    queryKey: [
      '/api/activity-feed',
      { moduleTypes: selectedModule !== 'all' ? selectedModule : undefined, limit },
    ],
  });

  // Fetch stats
  const { data: statsData, isLoading: isLoadingStats } = useQuery<{
    success: boolean;
    data: ActivityStats;
  }>({
    queryKey: ['/api/activity-feed/stats'],
  });

  const activities = activityData?.data || [];
  const stats = statsData?.data;

  const getModuleIcon = (moduleType: string) => {
    const Icon = MODULE_ICONS[moduleType] || Activity;
    return <Icon className="w-4 h-4" />;
  };

  const getPriorityColor = (priority: string) => {
    return PRIORITY_COLORS[priority] || 'default';
  };

  const getActionColor = (action: string) => {
    if (action === 'created') return 'default';
    if (action === 'updated') return 'secondary';
    if (action === 'deleted') return 'destructive';
    if (action === 'completed') return 'default';
    return 'secondary';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="w-8 h-8" />
            {t('common.activityFeed', 'Activity Feed')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t('common.activityFeedDesc', 'Real-time updates from all modules')}
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('common.totalActivities', 'Total Activities')}
              </CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalActivities}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('common.byModule', 'By Module')}
              </CardTitle>
              <Filter className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                {Object.entries(stats.byModule)
                  .slice(0, 3)
                  .map(([module, count]) => (
                    <div key={module} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{module}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('common.highPriority', 'High Priority')}
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(stats.byPriority.high || 0) + (stats.byPriority.critical || 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {t('common.topContributors', 'Top Contributors')}
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm space-y-1">
                {Object.entries(stats.byUser)
                  .slice(0, 2)
                  .map(([user, count]) => (
                    <div key={user} className="flex justify-between">
                      <span className="text-muted-foreground truncate">{user}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            {t('common.filters', 'Filters')}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium mb-2 block">
              {t('common.module', 'Module')}
            </label>
            <Select value={selectedModule} onValueChange={setSelectedModule}>
              <SelectTrigger data-testid="select-module-filter">
                <SelectValue placeholder={t('common.allModules', 'All Modules')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.allModules', 'All Modules')}</SelectItem>
                <SelectItem value="finance">{t('common.finance', 'Finance')}</SelectItem>
                <SelectItem value="crm">CRM</SelectItem>
                <SelectItem value="logistics">{t('common.logistics', 'Logistics')}</SelectItem>
                <SelectItem value="projects">{t('common.projects', 'Projects')}</SelectItem>
                <SelectItem value="angariacao">
                  {t('common.angariacao', 'Lead Generation')}
                </SelectItem>
                <SelectItem value="communications">
                  {t('common.communications', 'Communications')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium mb-2 block">
              {t('common.priority', 'Priority')}
            </label>
            <Select value={selectedPriority} onValueChange={setSelectedPriority}>
              <SelectTrigger data-testid="select-priority-filter">
                <SelectValue placeholder={t('common.allPriorities', 'All Priorities')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('common.allPriorities', 'All Priorities')}</SelectItem>
                <SelectItem value="low">{t('common.low', 'Low')}</SelectItem>
                <SelectItem value="normal">{t('common.normal', 'Normal')}</SelectItem>
                <SelectItem value="high">{t('common.high', 'High')}</SelectItem>
                <SelectItem value="critical">{t('common.critical', 'Critical')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="text-sm font-medium mb-2 block">
              {t('common.limit', 'Limit')}
            </label>
            <Select value={String(limit)} onValueChange={(val) => setLimit(Number(val))}>
              <SelectTrigger data-testid="select-limit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
                <SelectItem value="200">200</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Activity List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t('common.recentActivity', 'Recent Activity')} ({activities.length})
          </CardTitle>
          <CardDescription>
            {t('common.activityDescription', 'Latest updates from all modules')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px]">
            {isLoadingActivities ? (
              <div className="flex items-center justify-center h-40">
                <p className="text-muted-foreground">{t('common.loading', 'Loading...')}</p>
              </div>
            ) : activities.length === 0 ? (
              <div className="flex items-center justify-center h-40">
                <p className="text-muted-foreground">
                  {t('common.noActivities', 'No activities found')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 rounded-md border hover-elevate active-elevate-2"
                    data-testid={`activity-item-${activity.id}`}
                  >
                    <div className="mt-1">{getModuleIcon(activity.moduleType)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-medium truncate">{activity.title}</h4>
                        <Badge variant={getActionColor(activity.action) as any}>
                          {activity.action}
                        </Badge>
                        <Badge variant={getPriorityColor(activity.priority) as any}>
                          {activity.priority}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {activity.moduleType}
                        </Badge>
                      </div>
                      {activity.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {activity.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        {activity.userName && (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {activity.userName}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDistanceToNow(new Date(activity.createdAt), {
                            addSuffix: true,
                            locale: i18n.language === 'pt' ? pt : undefined,
                          })}
                        </span>
                        {activity.entityName && (
                          <span className="truncate">{activity.entityName}</span>
                        )}
                      </div>
                    </div>
                    {activity.link && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => (window.location.href = activity.link!)}
                        data-testid={`button-view-${activity.id}`}
                      >
                        {t('common.view', 'View')}
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

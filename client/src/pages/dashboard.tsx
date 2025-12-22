import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Users, DollarSign, CheckSquare, MessageSquare, FileUp, Briefcase } from "lucide-react";
import { useLocation } from "wouter";
import { ActivityFeed } from "@/components/ActivityFeed";

interface Metric {
  label: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
  icon: any;
}

export default function DashboardPage() {
  const [, setLocation] = useLocation();

  const { data: metrics, isLoading: loadingMetrics } = useQuery<Metric[]>({
    queryKey: ["/api/dashboard/metrics"],
  });

  const getTrendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };


  const defaultMetrics: Metric[] = [
    {
      label: "Total Revenue",
      value: "€0",
      change: "+0%",
      trend: "neutral",
      icon: DollarSign,
    },
    {
      label: "Active Users",
      value: "0",
      change: "+0%",
      trend: "neutral",
      icon: Users,
    },
    {
      label: "Pending Tasks",
      value: "0",
      change: "0%",
      trend: "neutral",
      icon: CheckSquare,
    },
    {
      label: "Open Leads",
      value: "0",
      change: "+0%",
      trend: "neutral",
      icon: Briefcase,
    },
  ];

  const displayMetrics = metrics || defaultMetrics;

  return (
    <div className="h-full overflow-auto">
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-7xl mx-auto">
        {/* Header - Mobile Responsive */}
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-sm md:text-base text-muted-foreground">
            Welcome back! Here's what's happening with your business.
          </p>
        </div>

        {/* Metrics Grid - Mobile Responsive */}
        <div className="grid gap-3 md:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {loadingMetrics
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 md:h-32" />
              ))
            : displayMetrics.map((metric, index) => {
                const Icon = metric.icon;
                return (
                  <Card key={index} className="hover-elevate" data-testid={`metric-${metric.label.toLowerCase().replace(/\s+/g, "-")}`}>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">
                        {metric.label}
                      </CardTitle>
                      <Icon className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground flex-shrink-0" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-xl md:text-2xl font-bold">{metric.value}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 flex-wrap">
                        {getTrendIcon(metric.trend)}
                        <span className="line-clamp-1">{metric.change} from last month</span>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
        </div>

        {/* Quick Actions & Activity - Mobile Responsive */}
        <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-2">
          {/* Quick Actions - Touch-friendly */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg">Quick Actions</CardTitle>
              <CardDescription className="text-sm">Common tasks to get you started</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                className="w-full justify-start min-h-11"
                variant="outline"
                onClick={() => setLocation("/chat")}
                data-testid="button-new-chat"
              >
                <MessageSquare className="mr-2 h-5 w-5" />
                Start New Chat
              </Button>
              <Button
                className="w-full justify-start min-h-11"
                variant="outline"
                onClick={() => setLocation("/studio")}
                data-testid="button-create-feature"
              >
                <CheckSquare className="mr-2 h-5 w-5" />
                Create New Feature
              </Button>
              <Button
                className="w-full justify-start min-h-11"
                variant="outline"
                data-testid="button-import-data"
              >
                <FileUp className="mr-2 h-5 w-5" />
                Import Data
              </Button>
            </CardContent>
          </Card>

          {/* Activity Feed - Real-time cross-module activity */}
          <ActivityFeed 
            limit={10} 
            showFilters={false} 
            className="h-[350px]"
          />
        </div>
      </div>
    </div>
  );
}

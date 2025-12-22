import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface CashflowForecast {
  dailyForecast: Array<{
    date: string;
    inflow: number;
    outflow: number;
    netBalance: number;
  }>;
  weeklyBreakdown: Array<{
    week: string;
    inflow: number;
    outflow: number;
    net: number;
  }>;
  summary: {
    totalInflow: number;
    totalOutflow: number;
    netPosition: number;
  };
}

export default function CashflowForecastPage() {
  const { t, i18n } = useTranslation('financeiro');
  const currentLang = i18n.language || 'pt';
  const { toast } = useToast();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', {
      style: "currency",
      currency: "EUR",
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(currentLang === 'en' ? 'en-US' : 'pt-PT', { day: '2-digit', month: 'short' }).format(date);
  };

  const { data: forecast, isLoading, error } = useQuery<CashflowForecast>({
    queryKey: ['/api/financeiro/treasury/forecast-cashflow'],
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['/api/financeiro/treasury/forecast-cashflow'] });
      toast({
        title: t('treasury.cashflowForecast.refreshSuccess'),
        description: t('treasury.cashflowForecast.refreshSuccessDesc'),
      });
    } catch (error) {
      toast({
        title: t('treasury.cashflowForecast.refreshError'),
        description: t('treasury.cashflowForecast.refreshErrorDesc'),
        variant: 'destructive',
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="p-6 space-y-6" data-testid="page-cashflow-forecast">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            {t('treasury.cashflowForecast.title')}
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            {t('treasury.cashflowForecast.description')}
          </p>
        </div>
        <Button
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
          data-testid="button-refresh-forecast"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          {t('treasury.cashflowForecast.refresh')}
        </Button>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">{t('treasury.cashflowForecast.loadError')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('treasury.cashflowForecast.summary.inflowsExpected')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400" data-testid="text-total-inflow">
                    {formatCurrency(forecast?.summary.totalInflow || 0)}
                  </p>
                  <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('treasury.cashflowForecast.summary.outflowsExpected')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400" data-testid="text-total-outflow">
                    {formatCurrency(forecast?.summary.totalOutflow || 0)}
                  </p>
                  <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('treasury.cashflowForecast.summary.netPosition')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p
                    className={`text-2xl font-bold ${
                      (forecast?.summary.netPosition || 0) >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                    data-testid="text-net-position"
                  >
                    {formatCurrency(forecast?.summary.netPosition || 0)}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Cashflow Chart */}
          <Card data-testid="card-cashflow-chart">
            <CardHeader>
              <CardTitle>{t('treasury.cashflowForecast.chart.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80" data-testid="chart-cashflow">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={forecast?.dailyForecast || []}
                    margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tickFormatter={(value) => `€${value / 1000}k`} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => formatDate(label)}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="inflow"
                      name={t('treasury.cashflowForecast.chart.inflows')}
                      stroke="#10b981"
                      fill="#10b981"
                      fillOpacity={0.3}
                    />
                    <Area
                      type="monotone"
                      dataKey="outflow"
                      name={t('treasury.cashflowForecast.chart.outflows')}
                      stroke="#ef4444"
                      fill="#ef4444"
                      fillOpacity={0.3}
                    />
                    <Area
                      type="monotone"
                      dataKey="netBalance"
                      name={t('treasury.cashflowForecast.chart.netBalance')}
                      stroke="#3b82f6"
                      fill="none"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Weekly Breakdown Table */}
          <Card data-testid="card-weekly-breakdown">
            <CardHeader>
              <CardTitle>{t('treasury.cashflowForecast.weeklyBreakdown.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="table-weekly-breakdown">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('treasury.cashflowForecast.weeklyBreakdown.week')}</TableHead>
                    <TableHead className="text-right">{t('treasury.cashflowForecast.weeklyBreakdown.inflows')}</TableHead>
                    <TableHead className="text-right">{t('treasury.cashflowForecast.weeklyBreakdown.outflows')}</TableHead>
                    <TableHead className="text-right">{t('treasury.cashflowForecast.weeklyBreakdown.netBalance')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {forecast?.weeklyBreakdown && forecast.weeklyBreakdown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        {t('treasury.cashflowForecast.weeklyBreakdown.noData')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    forecast?.weeklyBreakdown.map((week, index) => (
                      <TableRow key={index} data-testid={`row-week-${index}`}>
                        <TableCell className="font-medium">{week.week}</TableCell>
                        <TableCell className="text-right text-green-600 dark:text-green-400">
                          {formatCurrency(week.inflow)}
                        </TableCell>
                        <TableCell className="text-right text-red-600 dark:text-red-400">
                          {formatCurrency(week.outflow)}
                        </TableCell>
                        <TableCell
                          className={`text-right font-bold ${
                            week.net >= 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {formatCurrency(week.net)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

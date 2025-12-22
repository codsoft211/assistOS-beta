import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Factory,
  Plus,
  ClipboardList,
  Cog,
  Calendar,
  BarChart3,
  Search,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  Layers,
  Settings2,
  AlertTriangle,
  TrendingUp,
  Zap,
} from "lucide-react";

export default function ProductionIndexPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [createOrderOpen, setCreateOrderOpen] = useState(false);

  // Fetch production summary
  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["/api/production/analytics/summary"],
  });

  // Fetch production orders
  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/production/orders", searchQuery],
  });

  // Fetch work orders
  const { data: workOrdersData, isLoading: workOrdersLoading } = useQuery({
    queryKey: ["/api/production/work-orders"],
  });

  // Fetch work centers
  const { data: workCentersData, isLoading: workCentersLoading } = useQuery({
    queryKey: ["/api/production/work-centers"],
  });

  const summary = summaryData?.data?.summary || { total: 0, planned: 0, scheduled: 0, in_progress: 0, completed: 0 };
  const orders = ordersData?.productionOrders || [];
  const workOrders = workOrdersData?.workOrders || [];
  const workCenters = workCentersData?.workCenters || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "planned":
        return <Badge className="bg-slate-500/10 text-slate-500 border-slate-500/20">Planned</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Scheduled</Badge>;
      case "in_progress":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20"><Play className="w-3 h-3 mr-1" />In Progress</Badge>;
      case "completed":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle className="w-3 h-3 mr-1" />Completed</Badge>;
      case "cancelled":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "urgent":
        return <Badge variant="destructive">Urgent</Badge>;
      case "high":
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">High</Badge>;
      case "medium":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Medium</Badge>;
      case "low":
        return <Badge variant="secondary">Low</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const getWorkCenterStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Available</Badge>;
      case "busy":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Busy</Badge>;
      case "maintenance":
        return <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">Maintenance</Badge>;
      case "offline":
        return <Badge variant="destructive">Offline</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-background to-muted/20 min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3 tracking-tight">
            <div className="p-2 rounded-xl bg-gradient-to-br from-orange-500 to-red-600 text-white">
              <Factory className="h-7 w-7" />
            </div>
            Production
          </h1>
          <p className="text-muted-foreground mt-1">
            Manufacturing operations, work orders, and production scheduling
          </p>
        </div>
        <Dialog open={createOrderOpen} onOpenChange={setCreateOrderOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700">
              <Plus className="h-4 w-4 mr-2" />
              New Production Order
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[525px]">
            <DialogHeader>
              <DialogTitle>Create Production Order</DialogTitle>
              <DialogDescription>
                Enter the details for the new production order.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="product">Product *</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product to manufacture" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product-1">Product A</SelectItem>
                    <SelectItem value="product-2">Product B</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input id="quantity" type="number" placeholder="100" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input id="startDate" type="date" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input id="endDate" type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Input id="notes" placeholder="Additional notes..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOrderOpen(false)}>Cancel</Button>
              <Button className="bg-gradient-to-r from-orange-500 to-red-600">Create Order</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-500/10 to-gray-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            <ClipboardList className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-slate-600">{summary.total || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-blue-600">{summary.scheduled || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-500/10 to-orange-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <Zap className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-amber-600">{summary.in_progress || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-500/10 to-green-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-emerald-600">{summary.completed || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg bg-gradient-to-br from-purple-500/10 to-violet-500/10">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Work Centers</CardTitle>
            <Settings2 className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            {workCentersLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold text-purple-600">{workCenters.length}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <BarChart3 className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="orders" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <ClipboardList className="h-4 w-4 mr-2" />
            Production Orders
          </TabsTrigger>
          <TabsTrigger value="work-orders" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Cog className="h-4 w-4 mr-2" />
            Work Orders
          </TabsTrigger>
          <TabsTrigger value="work-centers" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Settings2 className="h-4 w-4 mr-2" />
            Work Centers
          </TabsTrigger>
          <TabsTrigger value="bom" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Layers className="h-4 w-4 mr-2" />
            BOM
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-orange-500" />
                  Recent Production Orders
                </CardTitle>
                <CardDescription>Latest manufacturing orders</CardDescription>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : orders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Factory className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No production orders found</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.slice(0, 5).map((order: any) => (
                      <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center text-white">
                            <Package className="h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium">{order.orderNumber}</p>
                            <p className="text-sm text-muted-foreground">Qty: {order.quantity}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getPriorityBadge(order.priority)}
                          {getStatusBadge(order.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings2 className="h-5 w-5 text-purple-500" />
                  Work Center Status
                </CardTitle>
                <CardDescription>Current work center utilization</CardDescription>
              </CardHeader>
              <CardContent>
                {workCentersLoading ? (
                  <div className="space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : workCenters.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Settings2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No work centers configured</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {workCenters.slice(0, 4).map((center: any) => (
                      <div key={center.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{center.name}</span>
                            <span className="text-sm text-muted-foreground">({center.code})</span>
                          </div>
                          {getWorkCenterStatusBadge(center.status)}
                        </div>
                        <Progress value={center.utilization || Math.random() * 100} className="h-2" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Production Orders Tab */}
        <TabsContent value="orders" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Production Orders</CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search orders..."
                      className="pl-10 w-[300px]"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {ordersLoading ? (
                <div className="space-y-3">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No production orders found
                        </TableCell>
                      </TableRow>
                    ) : (
                      orders.map((order: any) => (
                        <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50">
                          <TableCell className="font-medium">{order.orderNumber}</TableCell>
                          <TableCell>{order.productName || "-"}</TableCell>
                          <TableCell>{order.quantity}</TableCell>
                          <TableCell>{order.startDate || "-"}</TableCell>
                          <TableCell>{getPriorityBadge(order.priority)}</TableCell>
                          <TableCell>{getStatusBadge(order.status)}</TableCell>
                          <TableCell>
                            {order.status === "planned" && (
                              <Button size="sm" variant="ghost" className="text-blue-500">
                                <Calendar className="h-4 w-4 mr-1" />
                                Schedule
                              </Button>
                            )}
                            {order.status === "scheduled" && (
                              <Button size="sm" variant="ghost" className="text-amber-500">
                                <Play className="h-4 w-4 mr-1" />
                                Start
                              </Button>
                            )}
                            {order.status === "in_progress" && (
                              <Button size="sm" variant="ghost" className="text-emerald-500">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Complete
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Work Orders Tab */}
        <TabsContent value="work-orders" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Work Orders</CardTitle>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Work Order
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {workOrdersLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : workOrders.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Cog className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>No work orders found</p>
                  <p className="text-sm mt-2">Work orders are created from production orders</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Order #</TableHead>
                      <TableHead>Production Order</TableHead>
                      <TableHead>Work Center</TableHead>
                      <TableHead>Scheduled Start</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {workOrders.map((wo: any) => (
                      <TableRow key={wo.id}>
                        <TableCell className="font-medium">{wo.workOrderNumber}</TableCell>
                        <TableCell>{wo.productionOrderNumber || "-"}</TableCell>
                        <TableCell>{wo.workCenterName || "-"}</TableCell>
                        <TableCell>{wo.scheduledStart || "-"}</TableCell>
                        <TableCell>{getStatusBadge(wo.status)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Work Centers Tab */}
        <TabsContent value="work-centers" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Work Centers</CardTitle>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Work Center
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {workCentersLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full" />
                  ))}
                </div>
              ) : workCenters.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Settings2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p>No work centers configured</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {workCenters.map((center: any) => (
                    <Card key={center.id} className="bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-lg">{center.name}</h3>
                            <p className="text-sm text-muted-foreground">Code: {center.code}</p>
                          </div>
                          {getWorkCenterStatusBadge(center.status)}
                        </div>
                        <div className="mt-4 space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Type:</span>
                            <span className="capitalize">{center.type || "mixed"}</span>
                          </div>
                          {center.capacity && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Capacity:</span>
                              <span>{center.capacity} {center.capacityUnit || "hrs"}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* BOM Tab */}
        <TabsContent value="bom" className="space-y-4">
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Bill of Materials</CardTitle>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create BOM
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12 text-muted-foreground">
                <Layers className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <p>Bill of Materials management</p>
                <p className="text-sm mt-2">Define component requirements for your products</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}


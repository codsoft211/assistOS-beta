import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, Eye, Send, Package } from "lucide-react";
import { format } from "date-fns";

interface PurchaseOrder {
  id: string;
  code: string;
  status: string;
  orderDate: string;
  expectedDeliveryDate: string;
  totalAmount: number;
  supplier: string;
  supplierId: string;
}

interface PurchaseOrderDetails extends PurchaseOrder {
  lines?: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
  }>;
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  pending_approval: "outline",
  approved: "default",
  sent: "default",
  received: "default",
  cancelled: "destructive",
};

export default function ComprasOrders() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);

  const { data, isLoading } = useQuery<{ purchaseOrders: PurchaseOrder[] }>({
    queryKey: ["/api/compras/purchase-orders"],
  });

  const { data: orderDetails } = useQuery<PurchaseOrderDetails>({
    queryKey: ["/api/compras/purchase-orders", selectedOrder],
    enabled: !!selectedOrder,
  });

  const filteredOrders = data?.purchaseOrders?.filter((order) =>
    order.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.supplier.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleViewDetails = (orderId: string) => {
    setSelectedOrder(orderId);
    setIsDetailSheetOpen(true);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Purchase Orders
          </h1>
          <p className="text-muted-foreground">Gestão de pedidos de compra</p>
        </div>
        <Button data-testid="button-create-po">
          <Plus className="mr-2 h-4 w-4" />
          Nova PO
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por código ou fornecedor..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
                data-testid="input-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Fornecedor</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Entrega Prevista</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhuma purchase order encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order) => (
                  <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                    <TableCell className="font-medium">{order.code}</TableCell>
                    <TableCell>{order.supplier}</TableCell>
                    <TableCell>
                      {format(new Date(order.orderDate), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_COLORS[order.status] || "outline"} data-testid={`badge-status-${order.status}`}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(order.expectedDeliveryDate), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      €{order.totalAmount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(order.id)}
                          data-testid={`button-view-${order.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-send-${order.id}`}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle data-testid="text-detail-title">
              {orderDetails?.code || "Purchase Order"}
            </SheetTitle>
            <SheetDescription>
              {orderDetails?.supplier}
            </SheetDescription>
          </SheetHeader>
          {orderDetails && (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant={STATUS_COLORS[orderDetails.status] || "outline"}>
                      {orderDetails.status}
                    </Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Total Amount</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      €{orderDetails.totalAmount.toFixed(2)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Datas</h3>
                <div className="space-y-1 text-sm">
                  <p>Criada: {format(new Date(orderDetails.orderDate), "dd/MM/yyyy")}</p>
                  <p>Entrega: {format(new Date(orderDetails.expectedDeliveryDate), "dd/MM/yyyy")}</p>
                </div>
              </div>

              {orderDetails.lines && orderDetails.lines.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Line Items</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Qtd</TableHead>
                        <TableHead className="text-right">Preço</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderDetails.lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>{line.description}</TableCell>
                          <TableCell className="text-right">{line.quantity}</TableCell>
                          <TableCell className="text-right">€{line.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">
                            €{line.totalPrice.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex gap-2">
                <Button className="flex-1" data-testid="button-send-po">
                  <Send className="mr-2 h-4 w-4" />
                  Enviar para Fornecedor
                </Button>
                <Button variant="outline" data-testid="button-track-po">
                  <Package className="mr-2 h-4 w-4" />
                  Track
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

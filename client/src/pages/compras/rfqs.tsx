import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Plus, Search, Eye, Award, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface RFQ {
  id: string;
  code?: string;
  title?: string;
  status: string;
  issueDate: string;
  dueDate: string;
  totalEstimatedValue?: number;
}

interface RFQDetails extends RFQ {
  lines?: Array<{
    id: string;
    description: string;
    quantity: number;
    targetPrice?: number;
  }>;
}

export default function ComprasRFQs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRFQ, setSelectedRFQ] = useState<string | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [priceWeight, setPriceWeight] = useState([50]);
  const [qualityWeight, setQualityWeight] = useState([30]);
  const [deliveryWeight, setDeliveryWeight] = useState([20]);

  const { data, isLoading } = useQuery<{ rfqs: RFQ[] }>({
    queryKey: ["/api/compras/rfqs"],
  });

  const { data: rfqDetails } = useQuery<RFQDetails>({
    queryKey: ["/api/compras/rfqs", selectedRFQ],
    enabled: !!selectedRFQ,
  });

  const filteredRFQs = data?.rfqs?.filter((rfq) =>
    (rfq.code?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
    (rfq.title?.toLowerCase().includes(searchTerm.toLowerCase()) || false)
  ) || [];

  const handleViewDetails = (rfqId: string) => {
    setSelectedRFQ(rfqId);
    setIsDetailSheetOpen(true);
  };

  const totalWeight = priceWeight[0] + qualityWeight[0] + deliveryWeight[0];
  const isWeightsValid = totalWeight === 100;

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
            RFQs - Request for Quotations
          </h1>
          <p className="text-muted-foreground">Gestão e comparação de cotações</p>
        </div>
        <Button data-testid="button-create-rfq">
          <Plus className="mr-2 h-4 w-4" />
          Nova RFQ
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar RFQ..."
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
                <TableHead>Título</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Emitida</TableHead>
                <TableHead>Deadline</TableHead>
                <TableHead className="text-right">Valor Est.</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRFQs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Nenhuma RFQ encontrada
                  </TableCell>
                </TableRow>
              ) : (
                filteredRFQs.map((rfq) => (
                  <TableRow key={rfq.id} data-testid={`row-rfq-${rfq.id}`}>
                    <TableCell className="font-medium">{rfq.code || "-"}</TableCell>
                    <TableCell>{rfq.title || "Sem título"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" data-testid={`badge-status-${rfq.status}`}>
                        {rfq.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(rfq.issueDate), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell>
                      {format(new Date(rfq.dueDate), "dd/MM/yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      {rfq.totalEstimatedValue ? `€${rfq.totalEstimatedValue.toFixed(2)}` : "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewDetails(rfq.id)}
                        data-testid={`button-view-${rfq.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
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
              {rfqDetails?.code || "RFQ Details"}
            </SheetTitle>
            <SheetDescription>
              {rfqDetails?.title || "Request for Quotation"}
            </SheetDescription>
          </SheetHeader>
          {rfqDetails && (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="outline">{rfqDetails.status}</Badge>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Deadline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium">
                      {format(new Date(rfqDetails.dueDate), "dd/MM/yyyy HH:mm")}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Evaluation Weights */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Critérios de Avaliação</CardTitle>
                  <CardDescription>
                    Ajuste os pesos para avaliar cotações (total deve ser 100%)
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Preço</Label>
                      <span className="text-sm font-medium">{priceWeight[0]}%</span>
                    </div>
                    <Slider
                      value={priceWeight}
                      onValueChange={setPriceWeight}
                      max={100}
                      step={5}
                      data-testid="slider-price"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Qualidade</Label>
                      <span className="text-sm font-medium">{qualityWeight[0]}%</span>
                    </div>
                    <Slider
                      value={qualityWeight}
                      onValueChange={setQualityWeight}
                      max={100}
                      step={5}
                      data-testid="slider-quality"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Prazo de Entrega</Label>
                      <span className="text-sm font-medium">{deliveryWeight[0]}%</span>
                    </div>
                    <Slider
                      value={deliveryWeight}
                      onValueChange={setDeliveryWeight}
                      max={100}
                      step={5}
                      data-testid="slider-delivery"
                    />
                  </div>
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <Label>Total</Label>
                      <span className={`text-sm font-bold ${isWeightsValid ? "text-green-500" : "text-red-500"}`}>
                        {totalWeight}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* RFQ Items */}
              {rfqDetails.lines && rfqDetails.lines.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Itens da RFQ</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Qtd</TableHead>
                          <TableHead className="text-right">Target Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rfqDetails.lines.map((line) => (
                          <TableRow key={line.id}>
                            <TableCell>{line.description}</TableCell>
                            <TableCell className="text-right">{line.quantity}</TableCell>
                            <TableCell className="text-right">
                              {line.targetPrice ? `€${line.targetPrice.toFixed(2)}` : "-"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Quotes Comparison Placeholder */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Award className="h-4 w-4" />
                    Comparação de Cotações
                  </CardTitle>
                  <CardDescription>
                    As cotações recebidas aparecerão aqui
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">Aguardando cotações dos fornecedores</p>
                  </div>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                <Button className="flex-1" disabled={!isWeightsValid} data-testid="button-evaluate">
                  <TrendingUp className="mr-2 h-4 w-4" />
                  Avaliar Cotações
                </Button>
                <Button variant="outline" data-testid="button-select-best">
                  Selecionar Melhor
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

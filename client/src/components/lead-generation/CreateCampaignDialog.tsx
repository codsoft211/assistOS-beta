import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CreateCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateCampaignDialog({ open, onOpenChange }: CreateCampaignDialogProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    campaignName: "",
    campaignType: "search",
    campaignStatus: "active",
    googleCampaignId: "",
    adPlatform: "google_ads",
    budget: "",
    budgetPeriod: "daily",
    targetAudience: "",
    objectives: "",
  });

  const createMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest('POST', '/api/lead-generation/campaigns', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/campaigns'] });
      toast({ title: "Campanha criada com sucesso" });
      onOpenChange(false);
      setFormData({
        campaignName: "",
        campaignType: "search",
        campaignStatus: "active",
        googleCampaignId: "",
        adPlatform: "google_ads",
        budget: "",
        budgetPeriod: "daily",
        targetAudience: "",
        objectives: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar campanha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const payload = {
      ...formData,
      budget: formData.budget ? parseFloat(formData.budget) : null,
      googleCampaignId: formData.googleCampaignId || null,
    };

    createMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-create-campaign">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Nova Campanha</DialogTitle>
            <DialogDescription>
              Criar uma nova campanha de marketing para tracking de leads
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="campaignName">Nome da Campanha *</Label>
              <Input
                id="campaignName"
                value={formData.campaignName}
                onChange={(e) => setFormData({ ...formData, campaignName: e.target.value })}
                placeholder="Ex: Campanha Verão 2024"
                required
                data-testid="input-campaign-name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="campaignType">Tipo</Label>
                <Select
                  value={formData.campaignType}
                  onValueChange={(value) => setFormData({ ...formData, campaignType: value })}
                >
                  <SelectTrigger id="campaignType" data-testid="select-campaign-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="search">Pesquisa</SelectItem>
                    <SelectItem value="display">Display</SelectItem>
                    <SelectItem value="shopping">Shopping</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="campaignStatus">Status</Label>
                <Select
                  value={formData.campaignStatus}
                  onValueChange={(value) => setFormData({ ...formData, campaignStatus: value })}
                >
                  <SelectTrigger id="campaignStatus" data-testid="select-campaign-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativa</SelectItem>
                    <SelectItem value="paused">Pausada</SelectItem>
                    <SelectItem value="ended">Terminada</SelectItem>
                    <SelectItem value="draft">Rascunho</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="googleCampaignId">ID Google Ads (opcional)</Label>
              <Input
                id="googleCampaignId"
                value={formData.googleCampaignId}
                onChange={(e) => setFormData({ ...formData, googleCampaignId: e.target.value })}
                placeholder="Ex: 123456789"
                data-testid="input-google-campaign-id"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="adPlatform">Plataforma</Label>
              <Select
                value={formData.adPlatform}
                onValueChange={(value) => setFormData({ ...formData, adPlatform: value })}
              >
                <SelectTrigger id="adPlatform" data-testid="select-ad-platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_ads">Google Ads</SelectItem>
                  <SelectItem value="facebook_ads">Facebook Ads</SelectItem>
                  <SelectItem value="linkedin_ads">LinkedIn Ads</SelectItem>
                  <SelectItem value="other">Outra</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="budget">Orçamento (€)</Label>
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-budget"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="budgetPeriod">Período</Label>
                <Select
                  value={formData.budgetPeriod}
                  onValueChange={(value) => setFormData({ ...formData, budgetPeriod: value })}
                >
                  <SelectTrigger id="budgetPeriod" data-testid="select-budget-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Diário</SelectItem>
                    <SelectItem value="monthly">Mensal</SelectItem>
                    <SelectItem value="total">Total</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="targetAudience">Público-Alvo</Label>
              <Textarea
                id="targetAudience"
                value={formData.targetAudience}
                onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })}
                placeholder="Descreva o público-alvo da campanha..."
                rows={3}
                data-testid="input-target-audience"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="objectives">Objetivos</Label>
              <Textarea
                id="objectives"
                value={formData.objectives}
                onChange={(e) => setFormData({ ...formData, objectives: e.target.value })}
                placeholder="Descreva os objetivos da campanha..."
                rows={3}
                data-testid="input-objectives"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={createMutation.isPending}
              data-testid="button-cancel"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              data-testid="button-submit"
            >
              {createMutation.isPending ? "A criar..." : "Criar Campanha"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

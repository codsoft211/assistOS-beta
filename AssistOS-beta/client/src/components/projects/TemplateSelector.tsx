import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  HardHat, Calendar, Briefcase, CheckCircle, Loader2,
  ArrowRight, AlertCircle
} from "lucide-react";

interface ModuleTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  suggestedFor: string[];
  configuration: {
    customEntities: any[];
    customWorkflows: any[];
    enabledFeatures: string[];
  };
}

interface TemplateSelectorProps {
  templates: ModuleTemplate[];
  onTemplateApplied: () => void;
}

const TEMPLATE_ICONS: Record<string, any> = {
  construction: HardHat,
  events: Calendar,
  consulting: Briefcase,
};

export default function TemplateSelector({ templates, onTemplateApplied }: TemplateSelectorProps) {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const applyTemplateMutation = useMutation({
    mutationFn: async (templateId: string) => {
      return await apiRequest('POST', `/api/modules/projects/templates/${templateId}/apply`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'sandbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/modules/projects/entities', 'production'] });
      onTemplateApplied();
    },
    onError: (error: any) => {
      toast({
        title: "Erro",
        description: error.message || "Falha ao aplicar template.",
        variant: "destructive",
      });
    },
  });

  const handleApply = async (templateId: string) => {
    setSelectedTemplate(templateId);
    await applyTemplateMutation.mutateAsync(templateId);
  };

  if (templates.length === 0) {
    return (
      <Alert data-testid="alert-no-templates">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Nenhum template disponível. Contacte o administrador.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="template-selector">
      {templates.map((template) => {
        const IconComponent = TEMPLATE_ICONS[template.id] || Briefcase;
        const isSelected = selectedTemplate === template.id;
        const isApplying = applyTemplateMutation.isPending && isSelected;

        return (
          <Card 
            key={template.id}
            className={`hover-elevate cursor-pointer transition-all ${
              isSelected ? 'ring-2 ring-primary' : ''
            }`}
            data-testid={`card-template-${template.id}`}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <IconComponent className="h-8 w-8 text-primary mb-2" />
                <Badge variant="outline" data-testid={`badge-version-${template.id}`}>
                  v{template.version}
                </Badge>
              </div>
              <CardTitle className="text-lg" data-testid={`text-name-${template.id}`}>
                {template.name}
              </CardTitle>
              <CardDescription data-testid={`text-description-${template.id}`}>
                {template.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Includes:</p>
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary" data-testid={`badge-entities-${template.id}`}>
                    {template.configuration.customEntities.length} Entities
                  </Badge>
                  <Badge variant="secondary" data-testid={`badge-workflows-${template.id}`}>
                    {template.configuration.customWorkflows.length} Workflows
                  </Badge>
                  <Badge variant="secondary" data-testid={`badge-features-${template.id}`}>
                    {template.configuration.enabledFeatures.length} Features
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Sugerido para:</p>
                <div className="flex flex-wrap gap-1">
                  {template.suggestedFor.slice(0, 3).map((tag, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs" data-testid={`badge-tag-${template.id}-${idx}`}>
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>

              <Button
                onClick={() => handleApply(template.id)}
                disabled={applyTemplateMutation.isPending}
                className="w-full"
                data-testid={`button-apply-${template.id}`}
              >
                {isApplying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Aplicando...
                  </>
                ) : (
                  <>
                    Aplicar Template
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

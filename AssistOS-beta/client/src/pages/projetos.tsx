import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase } from "lucide-react";

export default function ProjetosPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Módulo Projetos
        </h1>
        <p className="text-muted-foreground">
          Gestão de projetos, fases, recursos e documentos
        </p>
      </div>

      <Card data-testid="card-coming-soon">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Briefcase className="h-8 w-8 text-primary" />
            </div>
            <div>
              <CardTitle>Interface em Desenvolvimento</CardTitle>
              <CardDescription>
                O módulo de Projetos está configurado no backend
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Funcionalidades disponíveis via backend:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>Gestão de projetos e fases</li>
            <li>Alocação de recursos humanos e materiais</li>
            <li>Controlo de documentos do projeto</li>
            <li>Templates configuráveis (construção, eventos, consultoria)</li>
            <li>Dashboards de acompanhamento</li>
          </ul>
          <p className="text-sm font-medium mt-4">
            A interface de utilizador será implementada nas próximas fases do projeto.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

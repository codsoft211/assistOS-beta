import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function AngariacaoPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-page-title">
          Módulo Angariação
        </h1>
        <p className="text-muted-foreground">
          Gestão de leads, fontes, scoring e funil de vendas
        </p>
      </div>

      <Card data-testid="card-coming-soon">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <div>
              <CardTitle>Interface em Desenvolvimento</CardTitle>
              <CardDescription>
                O módulo de Angariação está configurado no backend
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Funcionalidades disponíveis via backend:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground">
            <li>Gestão de leads e fontes</li>
            <li>Scoring automático com AI</li>
            <li>Funil de vendas e conversões</li>
            <li>Analytics e dashboards</li>
            <li>Automações de nutrição de leads</li>
          </ul>
          <p className="text-sm font-medium mt-4">
            A interface de utilizador será implementada nas próximas fases do projeto.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";

export default function AdminModulesPage() {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <Card data-testid="card-modules-placeholder">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-primary/10">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl" data-testid="text-modules-title">
                Em breve: Gestão de Módulos
              </CardTitle>
              <CardDescription data-testid="text-modules-description">
                Esta funcionalidade está em desenvolvimento
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground" data-testid="text-modules-info">
            A página de gestão de módulos permitirá administrar todas as funcionalidades e extensões da plataforma AssistOS. 
            Funcionalidades previstas:
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-4">
            <li>Catálogo completo de módulos disponíveis</li>
            <li>Ativação e desativação de módulos por tenant</li>
            <li>Configuração de permissões e acesso</li>
            <li>Monitorização de uso e performance</li>
            <li>Gestão de versões e atualizações</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

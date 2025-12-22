import ModulesConfigPanel from "@/components/studio/ModulesConfigPanel";

export default function StudioModules() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold" data-testid="text-title">Módulos Instalados</h1>
        <p className="text-muted-foreground mt-2">
          Gerir módulos ativos do sistema
        </p>
      </div>

      <ModulesConfigPanel />
    </div>
  );
}

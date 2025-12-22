import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, FileSpreadsheet, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";

export function ImportLeadsDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const ext = selectedFile.name.toLowerCase();
      if (ext.endsWith('.xlsx') || ext.endsWith('.xls') || ext.endsWith('.csv')) {
        setFile(selectedFile);
        setResult(null);
      } else {
        toast({
          title: "Formato inválido",
          description: "Por favor, selecione um ficheiro Excel (.xlsx, .xls) ou CSV (.csv)",
          variant: "destructive",
        });
      }
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/lead-generation/leads/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to import leads');
      }

      const data = await response.json();
      setResult(data.results);

      toast({
        title: "Import concluído!",
        description: `${data.results.success} leads importados com sucesso`,
      });

      // Invalidate leads cache
      await queryClient.invalidateQueries({ queryKey: ['/api/lead-generation/leads'] });

      // Reset after 3 seconds
      setTimeout(() => {
        setFile(null);
        setResult(null);
        setOpen(false);
      }, 3000);
    } catch (error: any) {
      console.error('Error importing leads:', error);
      toast({
        title: "Erro ao importar",
        description: error.message || "Ocorreu um erro ao importar os leads",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-import-leads">
          <Upload className="h-4 w-4 mr-2" />
          Importar Leads
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-import-leads">
        <DialogHeader>
          <DialogTitle>Importar Leads via Excel/CSV</DialogTitle>
          <DialogDescription>
            Faça upload de um ficheiro Excel ou CSV com os seus leads. O sistema irá mapear automaticamente as colunas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!result && (
            <>
              <div className="border-2 border-dashed rounded-lg p-6 text-center hover-elevate">
                <input
                  type="file"
                  id="file-upload"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-file"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  {file ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheet className="h-12 w-12 text-primary" />
                      <div className="text-sm font-medium">{file.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(file.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-12 w-12 text-muted-foreground" />
                      <div className="text-sm font-medium">Clique para selecionar ficheiro</div>
                      <div className="text-xs text-muted-foreground">
                        Formatos suportados: .xlsx, .xls, .csv
                      </div>
                    </div>
                  )}
                </label>
              </div>

              <div className="text-xs text-muted-foreground space-y-1">
                <div className="font-medium">Colunas reconhecidas automaticamente:</div>
                <div>• Nome, Email, Telefone, Empresa, Cargo</div>
                <div>• UTM Source, Medium, Campaign, Term, Content</div>
              </div>

              {uploading && (
                <div className="space-y-2">
                  <Progress value={50} />
                  <p className="text-sm text-center text-muted-foreground">
                    A processar ficheiro...
                  </p>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <Check className="h-5 w-5 text-green-600" />
                <div>
                  <div className="font-medium text-green-600">Import concluído!</div>
                  <div className="text-sm text-muted-foreground">
                    {result.success} de {result.total} leads importados
                  </div>
                </div>
              </div>

              {result.errors > 0 && (
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                    <div className="font-medium text-yellow-600">
                      {result.errors} erros encontrados
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-1">
                    {result.errorDetails?.slice(0, 5).map((err: any, idx: number) => (
                      <div key={idx}>
                        {err.row}: {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!result && (
            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full"
              data-testid="button-upload"
            >
              {uploading ? "A importar..." : "Importar Leads"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

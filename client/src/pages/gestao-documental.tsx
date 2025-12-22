import { useState } from "react";
import { FileText, Cloud, Menu, Plus } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentUpload } from "@/components/documents/DocumentUpload";
import { DocumentList } from "@/components/documents/DocumentList";
import { DocumentDetails } from "@/components/documents/DocumentDetails";
import { ProviderManagement } from "@/components/documents/ProviderManagement";
import { SearchDialog } from "@/components/documents/SearchDialog";
import { FolderTree } from "@/components/documents/FolderTree";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

interface Document {
  id: string;
  filename: string;
  title: string | null;
  description: string | null;
  documentType: string;
  status: string;
  size: number;
  fiscalYear: number | null;
  fiscalMonth: number | null;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}

export default function GestaoDocumentalPage() {
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleViewDetails = (doc: Document) => {
    setSelectedDocument(doc);
    setDetailsDialogOpen(true);
  };

  const handleFolderSelect = (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setMobileMenuOpen(false); // Close mobile menu on folder select
  };

  return (
    <div className="h-full overflow-hidden flex" data-testid="page-gestao-documental">
      {/* Desktop Sidebar - Folders */}
      <aside className="hidden lg:flex lg:w-64 border-r bg-background">
        <FolderTree 
          selectedFolderId={selectedFolderId} 
          onFolderSelect={handleFolderSelect}
        />
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto flex flex-col">
        <div className="p-6 space-y-6 flex flex-col flex-1">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile menu toggle */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden"
                data-testid="button-mobile-menu"
              >
                <Menu className="h-4 w-4" />
              </Button>
              
              <div>
                <h1 className="text-3xl font-bold">Gestão Documental</h1>
                <p className="text-muted-foreground">
                  Carregue, organize e gira os seus documentos empresariais com classificação AI
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setUploadDialogOpen(true)}
                data-testid="button-add-document"
              >
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Documento
              </Button>
              <SearchDialog />
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="documents" className="space-y-6 flex flex-col flex-1">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="documents" data-testid="tab-documents">
                <FileText className="mr-2 h-4 w-4" />
                Documentos
              </TabsTrigger>
              <TabsTrigger value="providers" data-testid="tab-providers">
                <Cloud className="mr-2 h-4 w-4" />
                Fornecedores de Armazenamento
              </TabsTrigger>
            </TabsList>

            <TabsContent value="documents" className="flex-1">
              <DocumentList 
                onViewDetails={handleViewDetails} 
                folderId={selectedFolderId}
              />
            </TabsContent>

            <TabsContent value="providers" className="space-y-6">
              <ProviderManagement />
            </TabsContent>
          </Tabs>

          {/* Document Details Dialog */}
          <DocumentDetails
            document={selectedDocument}
            open={detailsDialogOpen}
            onOpenChange={setDetailsDialogOpen}
          />

          {/* Upload Dialog */}
          <DocumentUpload
            open={uploadDialogOpen}
            onOpenChange={setUploadDialogOpen}
          />
        </div>
      </div>

      {/* Mobile Sidebar Sheet */}
      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <FolderTree 
            selectedFolderId={selectedFolderId} 
            onFolderSelect={handleFolderSelect}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

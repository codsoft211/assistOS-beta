import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Download,
  FileText,
  Clock,
  User,
  Tag,
  Calendar,
  Link as LinkIcon,
  Shield,
  Sparkles,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface DocumentDetailsProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DocumentDetails({ document, open, onOpenChange }: DocumentDetailsProps) {
  const detailsQuery = useQuery({
    queryKey: ['/api/documents', document?.id],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${document?.id}`);
      if (!response.ok) throw new Error('Failed to fetch document details');
      return response.json();
    },
    enabled: !!document?.id && open,
  });

  const versionsQuery = useQuery({
    queryKey: ['/api/documents', document?.id, 'versions'],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${document?.id}/versions`);
      if (!response.ok) throw new Error('Failed to fetch versions');
      return response.json();
    },
    enabled: !!document?.id && open,
  });

  const classificationsQuery = useQuery({
    queryKey: ['/api/documents', document?.id, 'classifications'],
    queryFn: async () => {
      const response = await fetch(`/api/documents/${document?.id}/classifications`);
      if (!response.ok) throw new Error('Failed to fetch classifications');
      return response.json();
    },
    enabled: !!document?.id && open,
  });

  if (!document) return null;

  const details = detailsQuery.data?.document || document;
  const versions = versionsQuery.data?.versions || [];
  const classifications = classificationsQuery.data?.classifications || [];
  const latestClassification = classifications[0];

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/documents/${document.id}/download`);
      if (!response.ok) throw new Error('Failed to download document');
      
      const data = await response.json();
      window.open(data.downloadUrl, '_blank');
    } catch (error: any) {
      console.error('Download failed:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh]" data-testid="dialog-document-details">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {details.title || details.filename}
          </DialogTitle>
          <DialogDescription>{details.description}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-8rem)]">
          <Tabs defaultValue="metadata" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="metadata" data-testid="tab-metadata">Metadata</TabsTrigger>
              <TabsTrigger value="classification" data-testid="tab-classification">
                Classification
              </TabsTrigger>
              <TabsTrigger value="versions" data-testid="tab-versions">
                Versions ({versions.length})
              </TabsTrigger>
              <TabsTrigger value="permissions" data-testid="tab-permissions">Permissions</TabsTrigger>
            </TabsList>

            <TabsContent value="metadata" className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Tag className="h-4 w-4" />
                    Document Type
                  </div>
                  <Badge variant="outline" data-testid="badge-document-type">{details.documentType}</Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    Status
                  </div>
                  <Badge variant="outline" data-testid="badge-document-status">{details.status}</Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Fiscal Period
                  </div>
                  <div className="text-sm" data-testid="text-fiscal-period">
                    {details.fiscalYear && details.fiscalMonth
                      ? `${details.fiscalYear}-${String(details.fiscalMonth).padStart(2, '0')}`
                      : details.fiscalYear || '-'}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    File Size
                  </div>
                  <div className="text-sm" data-testid="text-file-size">
                    {(details.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    Created
                  </div>
                  <div className="text-sm" data-testid="text-created-date">
                    {format(new Date(details.createdAt), 'PPpp')}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    Uploaded By
                  </div>
                  <div className="text-sm" data-testid="text-uploaded-by">{details.uploadedBy}</div>
                </div>
              </div>

              <Separator />

              <div>
                <h4 className="text-sm font-medium mb-2">Actions</h4>
                <div className="flex gap-2">
                  <Button onClick={handleDownload} size="sm" data-testid="button-download-detail">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="classification" className="space-y-4">
              {classificationsQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : latestClassification ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">AI Classification Results</span>
                    <Badge variant="outline" className="ml-auto" data-testid="badge-classification-confidence">
                      {(latestClassification.confidence * 100).toFixed(1)}% confidence
                    </Badge>
                  </div>

                  {latestClassification.detectedType && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Detected Type</div>
                      <Badge data-testid="badge-detected-type">{latestClassification.detectedType}</Badge>
                    </div>
                  )}

                  {latestClassification.extractedData && (
                    <div>
                      <div className="text-sm font-medium mb-2">Extracted Data</div>
                      <div className="rounded-md border p-3 space-y-2" data-testid="text-extracted-data">
                        {Object.entries(latestClassification.extractedData).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground capitalize">
                              {key.replace(/([A-Z])/g, ' $1').trim()}:
                            </span>
                            <span className="font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {latestClassification.extractedText && (
                    <div>
                      <div className="text-sm font-medium mb-2">Extracted Text</div>
                      <div className="rounded-md border p-3 text-sm whitespace-pre-wrap max-h-48 overflow-y-auto" data-testid="text-extracted-text">
                        {latestClassification.extractedText}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-classification">
                  <Sparkles className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No classification results yet</p>
                  <p className="text-sm mt-1">Run AI classification to extract data</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="versions" className="space-y-4">
              {versionsQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : versions.length > 0 ? (
                <div className="space-y-2">
                  {versions.map((version: any) => (
                    <div key={version.id} className="flex items-center gap-3 p-3 rounded-md border" data-testid={`row-version-${version.id}`}>
                      <div className="flex-1">
                        <div className="text-sm font-medium" data-testid={`text-version-number-${version.id}`}>Version {version.versionNumber}</div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(version.createdAt), 'PPp')}
                        </div>
                        {version.changeDescription && (
                          <div className="text-sm mt-1">{version.changeDescription}</div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {(version.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground" data-testid="text-no-versions">
                  <Clock className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No version history</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="permissions" className="space-y-4">
              <div className="text-center py-8 text-muted-foreground" data-testid="text-permissions-placeholder">
                <Shield className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Permissions management</p>
                <p className="text-sm mt-1">Configure user access to this document</p>
              </div>
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

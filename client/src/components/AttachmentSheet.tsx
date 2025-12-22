import { useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FileText, Images, Camera, ScanLine } from "lucide-react";

interface AttachmentSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelect: (files: FileList) => void;
}

export function AttachmentSheet({ open, onOpenChange, onFileSelect }: AttachmentSheetProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFileSelect(e.target.files);
      onOpenChange(false);
    }
  };

  const openFileInput = (type: 'file' | 'photos' | 'camera' | 'scan') => {
    if (type === 'file' && fileInputRef.current) {
      fileInputRef.current.click();
    } else if (type === 'photos' && photosInputRef.current) {
      photosInputRef.current.click();
    } else if (type === 'camera' && cameraInputRef.current) {
      cameraInputRef.current.click();
    } else if (type === 'scan' && scanInputRef.current) {
      scanInputRef.current.click();
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="pb-8" data-testid="sheet-attachments">
        <SheetHeader className="mb-4">
          <SheetTitle>Anexar arquivo</SheetTitle>
        </SheetHeader>
        
        <div className="space-y-3">
          <Button
            variant="outline"
            className="w-full min-h-11 justify-start gap-4 text-base"
            onClick={() => openFileInput('file')}
            data-testid="button-attach-file"
          >
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium">Escolher arquivo</div>
              <div className="text-xs text-muted-foreground">Qualquer tipo de arquivo, até 50MB</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full min-h-11 justify-start gap-4 text-base"
            onClick={() => openFileInput('photos')}
            data-testid="button-attach-photos"
          >
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
              <Images className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium">Fotos</div>
              <div className="text-xs text-muted-foreground">Escolher da galeria (iOS/Android)</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full min-h-11 justify-start gap-4 text-base"
            onClick={() => openFileInput('camera')}
            data-testid="button-attach-camera"
          >
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
              <Camera className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium">Câmera</div>
              <div className="text-xs text-muted-foreground">Tirar foto ou vídeo com câmera nativa</div>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full min-h-11 justify-start gap-4 text-base"
            onClick={() => openFileInput('scan')}
            data-testid="button-attach-scan"
          >
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
              <ScanLine className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-medium">Scanner</div>
              <div className="text-xs text-muted-foreground">Scanner de documentos nativo (iOS 13+ / Android)</div>
            </div>
          </Button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="*/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-file"
        />
        
        <input
          ref={photosInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-photos"
        />
        
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-camera"
        />
        
        <input
          ref={scanInputRef}
          type="file"
          accept="application/pdf"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
          data-testid="input-scan"
        />
      </SheetContent>
    </Sheet>
  );
}

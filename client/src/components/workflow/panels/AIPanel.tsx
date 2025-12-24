import {
    Sheet,
    SheetContent,
    SheetTitle,
} from '@/components/ui/sheet';
import { AssistBuildChat } from '../AssistBuildChat';

interface AIPanelProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    workflowId: string;
}

export function AIPanel({ isOpen, onOpenChange, workflowId }: AIPanelProps) {
    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent className="w-[400px] sm:w-[500px] p-0 flex flex-col gap-0 border-l shadow-xl" side="right">
                <SheetTitle className="sr-only">AssistBuild AI Assistant</SheetTitle>
                <AssistBuildChat workflowId={workflowId} className="h-full w-full" />
            </SheetContent>
        </Sheet>
    );
}

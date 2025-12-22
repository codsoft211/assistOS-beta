import { BarChart3, CheckSquare, Mail } from "lucide-react";
import { useLocation } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface PessoalItem {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const pessoalItems: PessoalItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Tarefas", url: "/tarefas", icon: CheckSquare },
  { title: "Comunicações", url: "/comunicacoes", icon: Mail },
];

interface PessoalDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PessoalDrawer({ open, onOpenChange }: PessoalDrawerProps) {
  const [, setLocation] = useLocation();

  const handleNavigate = (url: string) => {
    setLocation(url);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[75vw] sm:w-[350px]">
        <SheetHeader>
          <SheetTitle>Pessoal</SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-2">
          {pessoalItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.url}
                onClick={() => handleNavigate(item.url)}
                className="w-full flex items-center gap-3 p-3 rounded-lg hover-elevate active-elevate-2 text-left"
                data-testid={`pessoal-${item.title.toLowerCase()}`}
              >
                <Icon className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">{item.title}</span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

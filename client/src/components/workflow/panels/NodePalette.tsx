import { DragEvent, useState, useMemo, useEffect, useCallback } from 'react';
import { Search, X, Layers, Zap, Database, Cpu, MessageSquare, Wrench, GitBranch, Globe } from 'lucide-react';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from '@/lib/utils';
import { Command } from 'cmdk';
import { useWorkflowStore } from '@/lib/workflow/store/workflowStore';

const categories = [
  { key: 'all', label: 'All Nodes', icon: Layers },
  { key: 'trigger', label: 'Triggers', icon: Zap },
  { key: 'data', label: 'Data', icon: Database },
  { key: 'ai', label: 'AI', icon: Cpu },
  { key: 'communication', label: 'Messaging', icon: MessageSquare },
  { key: 'utility', label: 'Utils', icon: Wrench },
  { key: 'condition', label: 'Logic', icon: GitBranch },
  { key: 'integration', label: 'Integrations', icon: Globe },
] as const;

export function NodePalette() {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('all');
  const addNode = useWorkflowStore(state => state.addNode);

  // Keyboard shortcut to focus search: Space (when not typing) or /
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if already in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      if (e.key === ' ' || e.key === '/') {
        e.preventDefault();
        const searchInput = document.getElementById('node-search-input');
        searchInput?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleAddNode = useCallback((type: string) => {
    const definition = nodeRegistry.get(type);
    if (!definition) return;

    const newNode = {
      id: `${type}-${Date.now()}`,
      type,
      position: { x: 250, y: 150 }, // Default position, ideally center of viewport
      data: {
        label: definition.label,
        config: { ...definition.defaultConfig },
      },
    };

    addNode(newNode);
  }, [addNode]);

  const allNodes = useMemo(() => nodeRegistry.getAll(), []);

  const filteredNodes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    return allNodes.filter(node => {
      // 1. Category Filter
      if (activeTab !== 'all' && node.category !== activeTab) {
        // Special case: if node has multiple categories, Handle potentially
        return false;
      }

      // 2. Search Filter
      if (!q) return true;

      const labelMatch = node.label.toLowerCase().includes(q);
      const descMatch = node.description.toLowerCase().includes(q);
      const typeMatch = node.type.toLowerCase().includes(q);
      const keywordsMatch = node.metadata?.searchableKeywords?.some(k => k.toLowerCase().includes(q));

      return labelMatch || descMatch || typeMatch || keywordsMatch;
    });
  }, [searchQuery, activeTab, allNodes]);

  return (
    <Card className="w-80 h-full flex flex-col shadow-xl border-r bg-background/50 backdrop-blur-sm overflow-hidden border-none rounded-none">
      <Command className="flex flex-col h-full" loop>
        {/* Header & Search */}
        <div className="p-4 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-sm tracking-tight flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" /> Node Library
            </h3>
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono font-bold">
              {filteredNodes.length}
            </span>
          </div>

          <div className="relative group">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
            <Command.Input
              id="node-search-input"
              placeholder="Search nodes (Press Space to focus)..."
              onValueChange={setSearchQuery}
              value={searchQuery}
              className="w-full bg-background border border-primary/10 pl-8 pr-8 h-9 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all rounded-md"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground p-0.5 hover:bg-muted rounded"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Categories Tabs */}
        <div className="px-2 pb-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <ScrollArea className="w-full">
              <TabsList className="bg-transparent h-8 p-1 gap-1 flex min-w-max">
                {categories.map(cat => (
                  <TabsTrigger
                    key={cat.key}
                    value={cat.key}
                    className={cn(
                      "text-[10px] h-6 px-2.5 rounded-full border border-transparent transition-all",
                      "data-[state=active]:bg-primary data-[state=active]:text-white data-[state=active]:border-primary",
                      "hover:bg-muted"
                    )}
                  >
                    <cat.icon className="w-2.5 h-2.5 mr-1" />
                    {cat.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <ScrollBar orientation="horizontal" className="h-1.5" />
            </ScrollArea>
          </Tabs>
        </div>

        <Separator />

        {/* Node List with cmdk */}
        <div className="flex-1 overflow-hidden relative">
          <Command.List className="h-full px-2 py-2 overflow-y-auto outline-none custom-scrollbar">
            <Command.Empty className="py-12 text-center">
              <div className="mb-2 flex justify-center">
                <Search className="w-8 h-8 text-muted-foreground/30 animate-pulse" />
              </div>
              <p className="text-xs text-muted-foreground font-medium italic">
                No nodes match your search
              </p>
            </Command.Empty>

            {filteredNodes.length > 0 && (
              <div className="space-y-1.5">
                {filteredNodes.map(node => {
                  const Icon = node.icon;
                  return (
                    <Command.Item
                      key={node.type}
                      onSelect={() => handleAddNode(node.type)}
                      className={cn(
                        'flex items-center gap-3 p-2.5 rounded-lg border border-transparent cursor-pointer',
                        'hover:bg-muted group aria-selected:bg-primary/5 aria-selected:border-primary/20 transition-all active:scale-[0.98]'
                      )}
                    >
                      <div
                        draggable
                        onDragStart={(e) => onDragStart(e, node.type)}
                        className={cn(
                          'p-2 rounded-md shadow-sm flex-shrink-0 transition-transform group-hover:scale-110',
                          node.color || 'bg-slate-500'
                        )}
                      >
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold tracking-tight truncate group-hover:text-primary transition-colors">
                            {node.label}
                          </span>
                          <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">
                            {node.category}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-1 leading-tight mt-0.5">
                          {node.description}
                        </p>
                      </div>
                    </Command.Item>
                  );
                })}
              </div>
            )}
          </Command.List>
        </div>

        {/* Footer info */}
        <div className="p-3 border-t bg-muted/10 text-[9px] text-muted-foreground flex justify-between items-center font-medium">
          <div className="flex gap-2 capitalize">
            <span>↑↓ Navigate</span>
            <span>↵ Add</span>
          </div>
          <div>/ Focus</div>
        </div>
      </Command>
    </Card>
  );
}

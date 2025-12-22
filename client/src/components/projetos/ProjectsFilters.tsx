import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface ProjectFilters {
  search?: string;
  status?: string;
  clientId?: string;
  tags?: string[];
  startDateFrom?: string;
  startDateTo?: string;
  endDateFrom?: string;
  endDateTo?: string;
}

interface ProjectsFiltersProps {
  filters: ProjectFilters;
  onFilterChange: (filters: Partial<ProjectFilters>) => void;
  onClearFilters: () => void;
}

export function ProjectsFilters({
  filters,
  onFilterChange,
  onClearFilters,
}: ProjectsFiltersProps) {
  const [tagInput, setTagInput] = useState("");

  // Fetch available clients for filter
  const { data: clientsData } = useQuery({
    queryKey: ["/api/crm/clients?limit=100"],
  });

  const clients = clientsData?.clients || [];

  const handleAddTag = () => {
    if (!tagInput.trim()) return;
    const currentTags = filters.tags || [];
    if (!currentTags.includes(tagInput.trim())) {
      onFilterChange({ tags: [...currentTags, tagInput.trim()] });
    }
    setTagInput("");
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = filters.tags || [];
    onFilterChange({ tags: currentTags.filter((t) => t !== tagToRemove) });
  };

  const statusOptions = [
    { value: "planning", label: "Planeamento" },
    { value: "active", label: "Ativo" },
    { value: "on_hold", label: "Em Espera" },
    { value: "completed", label: "Concluído" },
    { value: "cancelled", label: "Cancelado" },
  ];

  return (
    <div className="space-y-4" data-testid="projects-filters">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Status Filter */}
        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={filters.status || "all"}
            onValueChange={(value) =>
              onFilterChange({ status: value === "all" ? undefined : value })
            }
          >
            <SelectTrigger data-testid="select-filter-status">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Client Filter */}
        <div className="space-y-2">
          <Label>Cliente</Label>
          <Select
            value={filters.clientId || "all"}
            onValueChange={(value) =>
              onFilterChange({ clientId: value === "all" ? undefined : value })
            }
          >
            <SelectTrigger data-testid="select-filter-client">
              <SelectValue placeholder="Todos os clientes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os clientes</SelectItem>
              {clients.map((client: any) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Start Date Range */}
        <div className="space-y-2">
          <Label>Data Início (De)</Label>
          <Input
            type="date"
            value={filters.startDateFrom || ""}
            onChange={(e) => onFilterChange({ startDateFrom: e.target.value })}
            data-testid="input-filter-start-date-from"
          />
        </div>

        <div className="space-y-2">
          <Label>Data Início (Até)</Label>
          <Input
            type="date"
            value={filters.startDateTo || ""}
            onChange={(e) => onFilterChange({ startDateTo: e.target.value })}
            data-testid="input-filter-start-date-to"
          />
        </div>

        {/* End Date Range */}
        <div className="space-y-2">
          <Label>Data Fim (De)</Label>
          <Input
            type="date"
            value={filters.endDateFrom || ""}
            onChange={(e) => onFilterChange({ endDateFrom: e.target.value })}
            data-testid="input-filter-end-date-from"
          />
        </div>

        <div className="space-y-2">
          <Label>Data Fim (Até)</Label>
          <Input
            type="date"
            value={filters.endDateTo || ""}
            onChange={(e) => onFilterChange({ endDateTo: e.target.value })}
            data-testid="input-filter-end-date-to"
          />
        </div>
      </div>

      {/* Tags Filter */}
      <div className="space-y-2">
        <Label>Tags</Label>
        <div className="flex gap-2">
          <Input
            placeholder="Adicionar tag..."
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddTag();
              }
            }}
            data-testid="input-filter-tag"
          />
          <Button type="button" onClick={handleAddTag} data-testid="button-add-tag">
            Adicionar
          </Button>
        </div>
        {filters.tags && filters.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {filters.tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="gap-1">
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 hover:text-destructive"
                  data-testid={`button-remove-tag-${index}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Clear Filters */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={onClearFilters}
          data-testid="button-clear-filters"
        >
          Limpar Filtros
        </Button>
      </div>
    </div>
  );
}

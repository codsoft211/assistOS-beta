import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

export interface StatusOption {
  value: string;
  label: string;
}

interface EntityFiltersProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statusOptions: StatusOption[];
  customFilters?: React.ReactNode;
}

export default function EntityFilters({
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Pesquisar...",
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  customFilters,
}: EntityFiltersProps) {
  return (
    <Card data-testid="card-filters">
      <CardContent className="pt-6">
        <div className="flex gap-4 flex-wrap">
          <Input
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="max-w-sm"
            data-testid="input-search"
          />
          <Select value={statusFilter} onValueChange={onStatusFilterChange}>
            <SelectTrigger className="w-[200px]" data-testid="select-status-filter">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {customFilters}
        </div>
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";

interface LookupFieldProps {
  value?: string | string[];
  onChange: (value: string | string[]) => void;
  entityKey: string;
  displayField?: string;
  cardinality?: 'one' | 'many';
  moduleId?: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function LookupField({
  value,
  onChange,
  entityKey,
  displayField = 'name',
  cardinality = 'one',
  moduleId = 'projects',
  placeholder = 'Selecione...',
  disabled = false,
}: LookupFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];

  const { data, isLoading } = useQuery({
    queryKey: [`/api/modules/${moduleId}/entities/${entityKey}/records`, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      const url = `/api/modules/${moduleId}/entities/${entityKey}/records${params.toString() ? `?${params}` : ''}`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch records');
      return response.json();
    },
    enabled: open,
  });

  const records = data?.records || [];

  const handleSelect = (recordId: string) => {
    if (cardinality === 'one') {
      onChange(recordId);
      setOpen(false);
    } else {
      const newValues = selectedValues.includes(recordId)
        ? selectedValues.filter(id => id !== recordId)
        : [...selectedValues, recordId];
      onChange(newValues);
    }
  };

  const getDisplayValue = () => {
    if (selectedValues.length === 0) return placeholder;
    
    if (cardinality === 'one') {
      const record = records.find((r: any) => r.id === selectedValues[0]);
      return record?.[displayField] || value;
    }
    
    return `${selectedValues.length} selecionados`;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
          data-testid="lookup-trigger"
        >
          <span className="truncate">{getDisplayValue()}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" data-testid="lookup-content">
        <Command>
          <CommandInput 
            placeholder="Pesquisar..." 
            value={search}
            onValueChange={setSearch}
            data-testid="lookup-search"
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                'Nenhum resultado encontrado.'
              )}
            </CommandEmpty>
            <CommandGroup>
              {records.map((record: any) => (
                <CommandItem
                  key={record.id}
                  value={record.id}
                  onSelect={() => handleSelect(record.id)}
                  data-testid={`lookup-item-${record.id}`}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedValues.includes(record.id) ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="flex-1 truncate">{record[displayField]}</span>
                  {record.status && (
                    <Badge variant="outline" className="ml-2">
                      {record.status}
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

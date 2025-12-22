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

interface LinkMetadata {
  targetModule: string;
  targetEntity: string;
  displayField: string;
}

interface LinkFieldPickerProps {
  fieldName: string;
  linkMetadata: LinkMetadata;
  value: string | null;
  onChange: (value: string | null, displayValue: string) => void;
  required?: boolean;
  disabled?: boolean;
}

interface LinkableRecord {
  id: string;
  displayValue: string;
  metadata?: Record<string, any>;
}

export function LinkFieldPicker({
  fieldName,
  linkMetadata,
  value,
  onChange,
  required = false,
  disabled = false,
}: LinkFieldPickerProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLabel, setSelectedLabel] = useState<string>("");

  // Fetch linkable records with search - uses shared fetcher
  // IMPORTANT: Shared fetcher only uses first segment of queryKey as URL
  const searchParams = new URLSearchParams({
    targetModule: linkMetadata.targetModule,
    targetEntity: linkMetadata.targetEntity,
    displayField: linkMetadata.displayField,
    ...(searchQuery && { search: searchQuery }),
  });

  const { data, isLoading, error } = useQuery<{ records: LinkableRecord[] }>({
    queryKey: [`/api/modules/projects/linkable-entities/search?${searchParams.toString()}`],
    enabled: open, // Only fetch when dropdown is open
  });

  // Fetch selected record's display value if value exists - uses shared fetcher
  const resolveParams = new URLSearchParams({
    targetModule: linkMetadata.targetModule,
    targetEntity: linkMetadata.targetEntity,
    targetRecordId: value || '',
  });

  const { data: selectedData } = useQuery<{ record: LinkableRecord }>({
    queryKey: [`/api/modules/projects/linkable-entities/resolve?${resolveParams.toString()}`],
    enabled: !!value && !selectedLabel,
  });

  useEffect(() => {
    if (selectedData?.record) {
      setSelectedLabel(selectedData.record.displayValue);
    }
  }, [selectedData]);

  const records = data?.records || [];

  const handleSelect = (recordId: string) => {
    const selected = records.find(r => r.id === recordId);
    if (selected) {
      onChange(recordId, selected.displayValue);
      setSelectedLabel(selected.displayValue);
      setOpen(false);
    }
  };

  const handleClear = () => {
    onChange(null, '');
    setSelectedLabel('');
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">
        {fieldName}
        {required && <span className="text-destructive ml-1">*</span>}
        <span className="text-xs text-muted-foreground ml-2">
          (vinculado a {linkMetadata.targetModule})
        </span>
      </label>
      
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
            disabled={disabled}
            data-testid={`button-link-picker-${fieldName}`}
          >
            {selectedLabel || "Selecionar..."}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0" align="start">
          <Command>
            <CommandInput
              placeholder={`Buscar em ${linkMetadata.targetModule}...`}
              value={searchQuery}
              onValueChange={setSearchQuery}
              data-testid={`input-link-search-${fieldName}`}
            />
            <CommandList>
              {isLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="ml-2 text-sm text-muted-foreground">Carregando...</span>
                </div>
              ) : error ? (
                <div className="py-6 text-center text-sm text-destructive" data-testid="text-link-error">
                  Erro ao carregar registros
                </div>
              ) : records.length === 0 ? (
                <CommandEmpty>Nenhum registro encontrado.</CommandEmpty>
              ) : (
                <CommandGroup>
                  {records.map((record) => (
                    <CommandItem
                      key={record.id}
                      value={record.id}
                      onSelect={() => handleSelect(record.id)}
                      data-testid={`item-link-${record.id}`}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === record.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {record.displayValue}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleClear}
          className="h-6 px-2 text-xs"
          data-testid={`button-clear-link-${fieldName}`}
        >
          Limpar seleção
        </Button>
      )}
    </div>
  );
}

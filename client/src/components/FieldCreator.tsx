import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Plus, 
  Link as LinkIcon,
  Type,
  Calendar,
  Hash,
  ToggleLeft,
  AlertCircle
} from "lucide-react";

interface FieldDefinition {
  fieldKey: string;
  displayName: string;
  fieldType: string;
  linkType?: 'internal' | 'crossModule';
  targetEntity?: string;
  targetModule?: string;
  displayField?: string;
  cardinality?: 'one' | 'many';
}

interface FieldCreatorProps {
  onFieldAdd: (field: FieldDefinition) => void;
  availableEntities?: string[];
}

const FIELD_TYPES = [
  { value: 'text', label: 'Texto', icon: Type },
  { value: 'number', label: 'Número', icon: Hash },
  { value: 'date', label: 'Data', icon: Calendar },
  { value: 'boolean', label: 'Sim/Não', icon: ToggleLeft },
  { value: 'lookup', label: 'Lookup/Relação', icon: LinkIcon },
];

const CROSS_MODULE_OPTIONS = [
  { value: 'crm', label: 'CRM', entities: ['clients', 'contracts', 'activities'] },
  { value: 'financeiro', label: 'Financial', entities: ['invoices', 'bills', 'payments'] },
  { value: 'logistica', label: 'Logistics', entities: ['warehouses', 'inventory'] },
];

export default function FieldCreator({ onFieldAdd, availableEntities = [] }: FieldCreatorProps) {
  const [fieldKey, setFieldKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [linkType, setLinkType] = useState<'internal' | 'crossModule'>('internal');
  const [targetEntity, setTargetEntity] = useState("");
  const [targetModule, setTargetModule] = useState("");
  const [displayField, setDisplayField] = useState("name");
  const [cardinality, setCardinality] = useState<'one' | 'many'>('one');

  const handleAddField = () => {
    if (!fieldKey || !displayName) return;

    const field: FieldDefinition = {
      fieldKey,
      displayName,
      fieldType,
    };

    if (fieldType === 'lookup') {
      field.linkType = linkType;
      field.targetEntity = targetEntity;
      field.displayField = displayField;
      field.cardinality = cardinality;
      
      if (linkType === 'crossModule') {
        field.targetModule = targetModule;
      }
    }

    onFieldAdd(field);
    
    // Reset form
    setFieldKey("");
    setDisplayName("");
    setFieldType("text");
    setTargetEntity("");
    setTargetModule("");
  };

  const isLookupField = fieldType === 'lookup';
  const selectedModule = CROSS_MODULE_OPTIONS.find(m => m.value === targetModule);

  return (
    <Card data-testid="card-field-creator">
      <CardContent className="p-4 space-y-4">
        <h5 className="font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Adicionar Campo Customizado
        </h5>

        <div className="grid grid-cols-2 gap-3">
          {/* Field Name */}
          <div className="space-y-2">
            <Label>Nome Interno (key)</Label>
            <Input
              placeholder="ex: responsavel"
              value={fieldKey}
              onChange={(e) => {
                const normalized = e.target.value.toLowerCase().replace(/\s+/g, '_');
                setFieldKey(normalized);
              }}
              data-testid="input-field-key"
            />
          </div>

          {/* Display Name */}
          <div className="space-y-2">
            <Label>Nome para Mostrar</Label>
            <Input
              placeholder="ex: Responsável"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              data-testid="input-display-name"
            />
          </div>
        </div>

        {/* Field Type */}
        <div className="space-y-2">
          <Label>Tipo de Campo</Label>
          <Select value={fieldType} onValueChange={setFieldType}>
            <SelectTrigger data-testid="select-field-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FIELD_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <SelectItem key={type.value} value={type.value}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {type.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Lookup/Relation Options */}
        {isLookupField && (
          <div className="space-y-3 p-3 bg-muted/50 rounded-md">
            <Alert data-testid="alert-lookup-help">
              <LinkIcon className="h-4 w-4" />
              <AlertDescription>
                Campo de relação/lookup permite referenciar outros registros
              </AlertDescription>
            </Alert>

            {/* Link Type */}
            <div className="space-y-2">
              <Label>Tipo de Link</Label>
              <Select value={linkType} onValueChange={(value: 'internal' | 'crossModule') => setLinkType(value)}>
                <SelectTrigger data-testid="select-link-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">
                    <Badge variant="outline">Internal</Badge> Dentro do Projects
                  </SelectItem>
                  <SelectItem value="crossModule">
                    <Badge variant="outline">Cross-Module</Badge> CRM / Financial / Logistics
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Internal: Target Entity */}
            {linkType === 'internal' && (
              <div className="space-y-2">
                <Label>Entidade Alvo</Label>
                <Select value={targetEntity} onValueChange={setTargetEntity}>
                  <SelectTrigger data-testid="select-target-entity">
                    <SelectValue placeholder="Escolha a entidade..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEntities.map((entity) => (
                      <SelectItem key={entity} value={entity}>
                        {entity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Cross-Module: Module + Entity */}
            {linkType === 'crossModule' && (
              <>
                <div className="space-y-2">
                  <Label>Módulo Externo</Label>
                  <Select value={targetModule} onValueChange={setTargetModule}>
                    <SelectTrigger data-testid="select-target-module">
                      <SelectValue placeholder="Escolha o módulo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CROSS_MODULE_OPTIONS.map((module) => (
                        <SelectItem key={module.value} value={module.value}>
                          {module.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {targetModule && (
                  <div className="space-y-2">
                    <Label>Entidade do {selectedModule?.label}</Label>
                    <Select value={targetEntity} onValueChange={setTargetEntity}>
                      <SelectTrigger data-testid="select-cross-entity">
                        <SelectValue placeholder="Escolha a entidade..." />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedModule?.entities.map((entity) => (
                          <SelectItem key={entity} value={entity}>
                            {entity}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* Display Field */}
            <div className="space-y-2">
              <Label>Campo para Mostrar</Label>
              <Input
                placeholder="ex: name, title, code"
                value={displayField}
                onChange={(e) => setDisplayField(e.target.value)}
                data-testid="input-display-field"
              />
            </div>

            {/* Cardinality */}
            <div className="space-y-2">
              <Label>Cardinalidade</Label>
              <Select value={cardinality} onValueChange={(value: 'one' | 'many') => setCardinality(value)}>
                <SelectTrigger data-testid="select-cardinality">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one">Um único registro (1:1)</SelectItem>
                  <SelectItem value="many">Múltiplos registros (1:N)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddField}
          disabled={!fieldKey || !displayName || (isLookupField && !targetEntity)}
          data-testid="button-add-field"
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Campo
        </Button>
      </CardContent>
    </Card>
  );
}

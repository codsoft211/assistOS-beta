import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RuleActionsEditorProps {
  value: any;
  onChange: (val: any) => void;
}

export function RuleActionsEditor({ value = {}, onChange }: RuleActionsEditorProps) {
  const handleFieldChange = (fieldName: string, fieldValue: string) => {
    onChange({
      ...value,
      [fieldName]: fieldValue
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="opportunityType">Tipo de oportunidade</Label>
        <Input
          id="opportunityType"
          type="text"
          value={value.opportunityType || ''}
          onChange={(e) => handleFieldChange('opportunityType', e.target.value)}
          placeholder="Ex: reactivation, cross-sell, upsell"
          data-testid="input-action-type"
        />
        <p className="text-sm text-muted-foreground">
          Tipo de oportunidade que será criada quando a regra for ativada
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="opportunityPriority">Prioridade</Label>
        <Select 
          value={value.opportunityPriority || ''} 
          onValueChange={(val) => handleFieldChange('opportunityPriority', val)}
        >
          <SelectTrigger id="opportunityPriority" data-testid="select-action-priority">
            <SelectValue placeholder="Selecione a prioridade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="low">Baixa</SelectItem>
            <SelectItem value="medium">Média</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Prioridade das oportunidades geradas
        </p>
      </div>
    </div>
  );
}

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RuleConditionsEditorProps {
  triggerType: string;
  value: any;
  onChange: (val: any) => void;
}

export function RuleConditionsEditor({ triggerType, value = {}, onChange }: RuleConditionsEditorProps) {
  const handleFieldChange = (fieldName: string, fieldValue: string) => {
    if (fieldValue === '') {
      const newValue = { ...value };
      delete newValue[fieldName];
      onChange(newValue);
    } else {
      onChange({
        ...value,
        [fieldName]: Number(fieldValue)
      });
    }
  };

  const handleTextFieldChange = (fieldName: string, fieldValue: string) => {
    onChange({
      ...value,
      [fieldName]: fieldValue
    });
  };

  if (triggerType === 'client_inactive') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="daysInactive">Dias sem atividade</Label>
          <Input
            id="daysInactive"
            type="number"
            min="1"
            value={value.daysInactive ?? ''}
            onChange={(e) => handleFieldChange('daysInactive', e.target.value)}
            placeholder="Ex: 90"
            data-testid="input-condition-daysInactive"
          />
          <p className="text-sm text-muted-foreground">
            Número de dias sem compras para considerar cliente inativo
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minLifetimeValue">Valor mínimo histórico (€)</Label>
          <Input
            id="minLifetimeValue"
            type="number"
            min="0"
            step="0.01"
            value={value.minLifetimeValue ?? ''}
            onChange={(e) => handleFieldChange('minLifetimeValue', e.target.value)}
            placeholder="Ex: 1000"
            data-testid="input-condition-minLifetimeValue"
          />
          <p className="text-sm text-muted-foreground">
            Valor mínimo total de compras do cliente
          </p>
        </div>
      </div>
    );
  }

  if (triggerType === 'product_recurring') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="productName">Nome do produto</Label>
          <Input
            id="productName"
            type="text"
            value={value.productName || ''}
            onChange={(e) => handleTextFieldChange('productName', e.target.value)}
            placeholder="Ex: Produto X"
            data-testid="input-condition-productName"
          />
          <p className="text-sm text-muted-foreground">
            Nome ou parte do nome do produto recorrente
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expectedFrequencyDays">Frequência esperada (dias)</Label>
          <Input
            id="expectedFrequencyDays"
            type="number"
            min="1"
            value={value.expectedFrequencyDays ?? ''}
            onChange={(e) => handleFieldChange('expectedFrequencyDays', e.target.value)}
            placeholder="Ex: 30"
            data-testid="input-condition-expectedFrequencyDays"
          />
          <p className="text-sm text-muted-foreground">
            Intervalo esperado entre compras (em dias)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gracePeriodDays">Período de tolerância (dias)</Label>
          <Input
            id="gracePeriodDays"
            type="number"
            min="1"
            value={value.gracePeriodDays ?? ''}
            onChange={(e) => handleFieldChange('gracePeriodDays', e.target.value)}
            placeholder="Ex: 45"
            data-testid="input-condition-gracePeriodDays"
          />
          <p className="text-sm text-muted-foreground">
            Dias adicionais de tolerância antes de alertar
          </p>
        </div>
      </div>
    );
  }

  if (triggerType === 'cross_sell') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="boughtProduct">Produto comprado</Label>
          <Input
            id="boughtProduct"
            type="text"
            value={value.boughtProduct || ''}
            onChange={(e) => handleTextFieldChange('boughtProduct', e.target.value)}
            placeholder="Ex: Produto A"
            data-testid="input-condition-boughtProduct"
          />
          <p className="text-sm text-muted-foreground">
            Produto que o cliente já comprou
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="suggestedProduct">Produto sugerido</Label>
          <Input
            id="suggestedProduct"
            type="text"
            value={value.suggestedProduct || ''}
            onChange={(e) => handleTextFieldChange('suggestedProduct', e.target.value)}
            placeholder="Ex: Produto B"
            data-testid="input-condition-suggestedProduct"
          />
          <p className="text-sm text-muted-foreground">
            Produto complementar a sugerir
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minOrders">Número mínimo de compras</Label>
          <Input
            id="minOrders"
            type="number"
            min="1"
            value={value.minOrders ?? ''}
            onChange={(e) => handleFieldChange('minOrders', e.target.value)}
            placeholder="Ex: 3"
            data-testid="input-condition-minOrders"
          />
          <p className="text-sm text-muted-foreground">
            Quantas vezes deve ter comprado o produto original
          </p>
        </div>
      </div>
    );
  }

  if (triggerType === 'upsell') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="minLifetimeValue">Valor mínimo histórico (€)</Label>
          <Input
            id="minLifetimeValue"
            type="number"
            min="0"
            step="0.01"
            value={value.minLifetimeValue ?? ''}
            onChange={(e) => handleFieldChange('minLifetimeValue', e.target.value)}
            placeholder="Ex: 5000"
            data-testid="input-condition-minLifetimeValue"
          />
          <p className="text-sm text-muted-foreground">
            Valor mínimo de compras do cliente
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="maxLifetimeValue">Valor máximo histórico (€)</Label>
          <Input
            id="maxLifetimeValue"
            type="number"
            min="0"
            step="0.01"
            value={value.maxLifetimeValue ?? ''}
            onChange={(e) => handleFieldChange('maxLifetimeValue', e.target.value)}
            placeholder="Ex: 20000"
            data-testid="input-condition-maxLifetimeValue"
          />
          <p className="text-sm text-muted-foreground">
            Valor máximo de compras do cliente
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minOrders">Número mínimo de encomendas</Label>
          <Input
            id="minOrders"
            type="number"
            min="1"
            value={value.minOrders ?? ''}
            onChange={(e) => handleFieldChange('minOrders', e.target.value)}
            placeholder="Ex: 5"
            data-testid="input-condition-minOrders"
          />
          <p className="text-sm text-muted-foreground">
            Número mínimo de encomendas realizadas
          </p>
        </div>
      </div>
    );
  }

  if (triggerType === 'churn_risk') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="comparisonMonths">Meses para comparação</Label>
          <Input
            id="comparisonMonths"
            type="number"
            min="1"
            value={value.comparisonMonths ?? ''}
            onChange={(e) => handleFieldChange('comparisonMonths', e.target.value)}
            placeholder="Ex: 3"
            data-testid="input-condition-comparisonMonths"
          />
          <p className="text-sm text-muted-foreground">
            Número de meses a comparar com período anterior
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="minDecreasePercent">Percentagem mínima de queda (%)</Label>
          <Input
            id="minDecreasePercent"
            type="number"
            min="1"
            max="100"
            value={value.minDecreasePercent ?? ''}
            onChange={(e) => handleFieldChange('minDecreasePercent', e.target.value)}
            placeholder="Ex: 30"
            data-testid="input-condition-minDecreasePercent"
          />
          <p className="text-sm text-muted-foreground">
            Percentagem de diminuição no valor para alertar
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm text-muted-foreground">
      Selecione um tipo de regra para configurar as condições
    </div>
  );
}

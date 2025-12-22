# AssistBuild - Data Import Tools

## 📥 import_leads_csv

Ferramenta do AssistBuild para importar leads de ficheiros Excel (.xlsx, .xls) ou CSV (.csv).

### Funcionalidades

- ✅ **Mapeamento automático de colunas** - Detecta automaticamente colunas comuns (nome, email, telefone, etc.)
- ✅ **Mapeamento manual** - Permite especificar exatamente quais colunas do CSV correspondem a quais campos
- ✅ **Campos personalizados (customFields)** - Suporta campos específicos de campanhas como número de proposta, tipo de evento, localização, etc.
- ✅ **Batch import** - Importação eficiente em lotes de 50 registos
- ✅ **Relatório detalhado** - Retorna sumário com total, sucessos, erros e exemplos de leads importados
- ✅ **Isolamento de tenant e environment** - Todos os leads são automaticamente associados ao tenant e environment corretos

### Como usar no AssistBuild (Studio)

1. **Guardar o ficheiro CSV** no servidor (ex: `/home/runner/workspace/attached_assets/propostas.csv`)

2. **Abrir o AssistBuild (Studio)** e usar a ferramenta `import_leads_csv`:

#### Exemplo 1: Mapeamento automático (mais simples)

```
Importa os leads do ficheiro /home/runner/workspace/attached_assets/Comercial - Propostas2025 (1)_1764023670455.csv
```

O AssistBuild vai automaticamente:
- Detectar as colunas do CSV
- Mapear para os campos do sistema
- Importar todos os leads válidos

#### Exemplo 2: Mapeamento manual (mais controlo)

```
Importa os leads do ficheiro /home/runner/workspace/attached_assets/propostas.csv 
com o seguinte mapeamento de colunas:
- "Descrição" → descricao
- "Nome" → nome
- "Contacto" → contacto
- "Nº Proposta" → numero_proposta
- "ESTADO" → estado
- "Onwer" → owner
- "LEAD" → lead_source
- "Tipo Evento" → tipo_evento
- "Localização" → localizacao
- "Data" → data_evento
```

### Estrutura dos dados importados

Os leads são criados na tabela `angariacao_leads` com:

**Campos principais:**
- `email` - Email do contacto (se fornecido)
- `firstName` / `lastName` - Nome do contacto (extraído do campo Nome)
- `phone` - Telefone do contacto
- `status` - Estado do lead (ex: "WIN", "Proposta Enviada", "Novo")
- `leadSource` - Origem do lead (ex: "Direto", "Jordão", "Parceiro")
- `score` - Pontuação automática (WIN=100, Proposta Enviada=50, outros=0)

**Campos personalizados (customFields):**
- `numero_proposta` - Número da proposta comercial
- `tipo_evento` - Tipo de evento (Casamento, Corporativo, Natal, etc.)
- `localizacao` - Local do evento
- `data_evento` - Data do evento
- `ano` - Ano
- `num_pax` - Número de pessoas
- `valor_pax` - Valor por pessoa
- `budget_total` - Orçamento total
- `comentarios` - Observações/comentários
- `owner` - Responsável comercial

### Exemplo de resposta

```json
{
  "success": true,
  "data": {
    "message": "✅ Import concluído com sucesso!\n\n📊 Resumo:\n- Total de linhas: 602\n- Leads importados: 567\n- Erros: 35\n\n📝 Exemplos de leads importados:\n- p2026/072: jantar Jordão (Proposta Enviada)\n- p2025/378: jantar trofa saude (Proposta Enviada)\n- p2025/351: Jantar de natal - marisa (WIN)",
    "total": 602,
    "success": 567,
    "errors": 35,
    "errorCount": 35,
    "sampleLeads": [...]
  }
}
```

### Notas importantes

1. **Identificador único**: O campo `numero_proposta` é usado como identificador obrigatório. Linhas sem proposta são ignoradas.

2. **Isolamento de dados**: Todos os leads são automaticamente associados ao:
   - Tenant do utilizador autenticado
   - Environment ativo (sandbox ou production)

3. **Responsável**: Todos os leads são automaticamente atribuídos ao utilizador que fez a importação.

4. **Formatos suportados**: `.xlsx`, `.xls`, `.csv`

### Para desenvolvedores

Ver implementação em: `packages/ai/tools/assistbuild/data-import/import-leads-csv.ts`

Registado em: `packages/ai/tools/kernel/tool-allowlists.ts` (categoria: `data-import`)

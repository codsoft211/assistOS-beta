# ✅ Checklist: Criar Nova Tool para AssistME

**Data:** 2025-11-17  
**Objetivo:** Garantir que todas as novas tools do AssistME são corretamente registadas e disponíveis

---

## 🎯 PROBLEMA IDENTIFICADO

Quando criámos a `universal_search` tool, esquecemo-nos de **2 passos críticos**:

1. ❌ **Import no AssistME index** - A tool não era carregada
2. ❌ **Registo no TOOL_REGISTRY** - A tool não aparecia no filtro inteligente

---

## 📋 CHECKLIST COMPLETO

### **Fase 1: Criar a Tool**

- [ ] **1.1** Criar a classe da tool (extends `ToolBase`)
  - Localização: `packages/ai/tools/assistme/{categoria}/{tool-name}.ts`
  - Exemplo: `packages/ai/tools/assistme/discovery/universal-search.ts`

- [ ] **1.2** Implementar `manifest` com:
  - `name`: nome único da tool
  - `category`: categoria (financial, discovery, etc.)
  - `scope`: 'tenant' ou 'user'
  - `description`: descrição clara em português
  - `parameters`: array de parâmetros
  - `outputSchema`: schema Zod

- [ ] **1.3** Implementar `executeInternal()` com a lógica

---

### **Fase 2: Registar no Módulo**

- [ ] **2.1** Importar a tool no `index.ts` do módulo
  - Localização: `packages/ai/tools/assistme/{categoria}/index.ts`
  - Exemplo: `packages/ai/tools/assistme/discovery/index.ts`

- [ ] **2.2** Instanciar a tool e adicionar ao array de tools
  ```typescript
  export const discoveryTools = [
    new GetActiveModulesTool(),
    new UniversalSearchTool(), // ← NOVA TOOL
  ];
  ```

- [ ] **2.3** Auto-registrar no `toolRegistry`
  ```typescript
  for (const tool of discoveryTools) {
    toolRegistry.register(tool);
  }
  ```

- [ ] **2.4** Exportar a tool (opcional, para uso direto)
  ```typescript
  export { UniversalSearchTool };
  ```

---

### **Fase 3: Carregar no AssistME**

- [ ] **3.1** Importar o módulo no AssistME index
  - Localização: `packages/ai/agents/assistme/index.ts`
  - Adicionar: `import '../../tools/assistme/{categoria}';`
  - Exemplo: `import '../../tools/assistme/discovery';`

- [ ] **3.2** Verificar que o import está na ordem correta
  - Os imports devem estar antes dos exports

---

### **Fase 4: Registar no TOOL_REGISTRY (CRÍTICO!)**

- [ ] **4.1** Adicionar ao `TOOL_REGISTRY`
  - Localização: `apps/api/services/tool-registry.ts`
  - Adicionar entrada no array `TOOL_REGISTRY`:
  ```typescript
  {
    name: "universal_search",  // ← Nome exato da tool
    categories: ['core', 'documents'],  // ← Categorias relevantes
  },
  ```

- [ ] **4.2** Adicionar keywords (se necessário)
  - Localização: `apps/api/services/tool-registry.ts`
  - Adicionar keywords no `CATEGORY_KEYWORDS` se a categoria for nova:
  ```typescript
  'documents': [
    'documento', 'documentos', 'ficheiro', 'pdf',
    'busca', 'procurar', 'encontrar',  // ← Keywords para universal_search
  ],
  ```

- [ ] **4.3** Verificar permissões (se necessário)
  - Se a tool requer módulo específico: `requiredModule: "financeiro"`
  - Se a tool requer permissão: `requiredPermission: "viewFinancialData"`

---

### **Fase 5: Testar**

- [ ] **5.1** Reiniciar o servidor
  ```bash
  # Ctrl+C para parar
  npm run dev
  ```

- [ ] **5.2** Verificar logs de registo
  - Procurar: `[Discovery] Registered 2 tools` (ou similar)
  - Verificar que não há erros de import

- [ ] **5.3** Testar no AssistME
  - Fazer pergunta que deveria usar a tool
  - Verificar que a tool é chamada
  - Verificar que o resultado é correto

- [ ] **5.4** Verificar filtro inteligente
  - Testar com diferentes keywords
  - Verificar que a tool aparece nas categorias corretas

---

## 🔍 DOIS SISTEMAS DE REGISTO

### **Sistema 1: `toolRegistry` (Execução)**
- **Onde:** `packages/ai/tools/kernel/registry.ts`
- **Quando:** Auto-registrado no `index.ts` do módulo
- **Para quê:** Permite executar a tool quando chamada
- **Como verificar:** Logs mostram `[Module] Registered X tools`

### **Sistema 2: `TOOL_REGISTRY` (Filtragem)**
- **Onde:** `apps/api/services/tool-registry.ts`
- **Quando:** Manualmente adicionado ao array
- **Para quê:** Permite filtrar tools baseado na intenção do user
- **Como verificar:** Tool aparece quando fazes pergunta relevante

**⚠️ IMPORTANTE:** Ambos os sistemas são necessários!

---

## 📝 TEMPLATE DE ENTRADA NO TOOL_REGISTRY

```typescript
// ============ {CATEGORIA} ============
{
  name: "{tool_name}",  // ← Nome exato (sem underscores se possível)
  categories: ['core', '{categoria-principal}'],
  // Opcional:
  requiredModule: "financeiro",  // Se requer módulo específico
  requiredPermission: "viewFinancialData",  // Se requer permissão
},
```

---

## 🎯 EXEMPLO COMPLETO: Universal Search

### ✅ O que foi feito:

1. **Criada tool:** `packages/ai/tools/assistme/discovery/universal-search.ts`
2. **Registada no módulo:** `packages/ai/tools/assistme/discovery/index.ts`
3. **Importada no AssistME:** `packages/ai/agents/assistme/index.ts` (linha 24)
4. **Adicionada ao TOOL_REGISTRY:** `apps/api/services/tool-registry.ts` (linhas 88-90)

### ❌ O que faltou inicialmente:

1. ❌ Import no AssistME index (corrigido)
2. ❌ Registo no TOOL_REGISTRY (corrigido)

---

## 🚨 ERROS COMUNS

### **Erro 1: Tool não é executada**
- **Causa:** Não foi importada no AssistME index
- **Solução:** Adicionar `import '../../tools/assistme/{categoria}';`

### **Erro 2: Tool não aparece no filtro**
- **Causa:** Não foi adicionada ao TOOL_REGISTRY
- **Solução:** Adicionar entrada no array `TOOL_REGISTRY`

### **Erro 3: Tool não é encontrada**
- **Causa:** Nome diferente entre `manifest.name` e `TOOL_REGISTRY.name`
- **Solução:** Verificar que os nomes são idênticos

### **Erro 4: Tool não aparece para certas perguntas**
- **Causa:** Keywords não estão na categoria correta
- **Solução:** Adicionar keywords ao `CATEGORY_KEYWORDS`

---

## 📚 REFERÊNCIAS

- **Tool Base:** `packages/ai/tools/kernel/base.ts`
- **Tool Registry:** `packages/ai/tools/kernel/registry.ts`
- **Tool Registry (Filtro):** `apps/api/services/tool-registry.ts`
- **AssistME Index:** `packages/ai/agents/assistme/index.ts`

---

## ✅ CHECKLIST RÁPIDO (Copy-Paste)

Ao criar nova tool, verificar:

```
[ ] Tool criada e implementada
[ ] Tool registada no módulo (index.ts)
[ ] Módulo importado no AssistME index
[ ] Tool adicionada ao TOOL_REGISTRY
[ ] Keywords adicionadas (se necessário)
[ ] Servidor reiniciado
[ ] Testada no AssistME
```

---

**Última atualização:** 2025-11-17  
**Criado após:** Problema com `universal_search` tool


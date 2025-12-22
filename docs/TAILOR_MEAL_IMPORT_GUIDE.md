# Guia de Importação - Propostas Comerciais Tailor Meal

## 📋 Dados Disponíveis

**Ficheiro:** `attached_assets/Comercial - Propostas2025 (1)_1764023670455.csv`  
**Total de registos:** 603 linhas  
**Tenant:** Tailor Meal Catering (ID: `464d1492-ff64-4e11-814e-b4e416b9c250`)  
**Utilizador:** geral@tailormeal.pt

## ✅ Ferramenta Criada

Foi criada uma nova ferramenta para o **AssistBuild (Studio)** chamada `import_leads_csv` que permite importar ficheiros Excel (.xlsx, .xls) ou CSV (.csv) com leads de forma conversacional.

### Funcionalidades

- ✅ Mapeamento automático de colunas (detecta automaticamente nome, email, telefone, etc.)
- ✅ Mapeamento manual (controlo total sobre quais colunas correspondem a quais campos)
- ✅ Campos personalizados (customFields) para dados específicos de propostas
- ✅ Batch import eficiente (50 registos por lote)
- ✅ Relatório detalhado com sucessos e erros
- ✅ Isolamento automático por tenant e environment

## 🚀 Como Importar os Dados

### Passo 1: Aceder ao Studio

1. Fazer login como **geral@tailormeal.pt**
2. Aceder ao **Studio** (botão no menu lateral)

### Passo 2: Usar a Ferramenta de Importação

No chat do AssistBuild (Studio), escrever:

```
Importa os leads do ficheiro /home/runner/workspace/attached_assets/Comercial - Propostas2025 (1)_1764023670455.csv
```

O AssistBuild vai:
1. Ler o ficheiro CSV
2. Detectar automaticamente as colunas:
   - "Descrição" → descrição do lead
   - "Nome" → nome do contacto
   - "Contacto" → telefone ou email
   - "Nº Proposta" → identificador único
   - "ESTADO" → status (WIN, Proposta Enviada, etc.)
   - "Owner" → responsável comercial
   - "LEAD" → origem do lead
   - "Tipo Evento" → tipo de evento (Casamento, Corporativo, etc.)
   - "Localização" → local do evento
   - "Data" → data do evento
   - "Ano" → ano
   - "Nº Pax" → número de pessoas
   - "Valor Pax" → valor por pessoa
   - "Budget Total" → orçamento total
   - "Comentários" → observações

3. Importar todos os leads válidos
4. Retornar um resumo detalhado com:
   - Total de linhas processadas
   - Leads importados com sucesso
   - Número de erros (se houver)
   - Exemplos de leads importados

### Exemplo de Resposta Esperada

```
✅ Import concluído com sucesso!

📊 Resumo:
- Total de linhas: 603
- Leads importados: 567
- Erros: 36

📝 Exemplos de leads importados:
- p2026/072: jantar Jordão (Proposta Enviada)
- p2025/378: jantar trofa saude (Proposta Enviada)
- p2025/351: Jantar de natal - marisa (WIN)
```

## 📊 Dados Importados

Cada lead será criado na tabela `angariacao_leads` com:

**Campos principais:**
- Email/telefone do contacto
- Nome (dividido em firstName/lastName)
- Status do lead
- Origem do lead
- Pontuação automática:
  - WIN = 100 pontos
  - Proposta Enviada = 50 pontos
  - Outros = 0 pontos

**Campos personalizados (customFields):**
- Número da proposta (identificador único)
- Tipo de evento
- Localização
- Data do evento
- Número de pessoas (pax)
- Valor por pessoa
- Orçamento total
- Comentários
- Responsável (owner)

## 🔒 Isolamento de Dados

Todos os leads são automaticamente:
- Associados ao tenant Tailor Meal
- Colocados no environment ativo (sandbox ou production)
- Atribuídos ao utilizador que fez a importação

## 📚 Documentação Técnica

Para mais detalhes sobre a ferramenta, consultar:
- `packages/ai/tools/assistbuild/data-import/README.md` - Documentação completa
- `packages/ai/tools/assistbuild/data-import/import-leads-csv.ts` - Código fonte

## ⚠️ Notas Importantes

1. **Identificador obrigatório**: Linhas sem "Nº Proposta" são ignoradas
2. **Formatos suportados**: `.xlsx`, `.xls`, `.csv`
3. **Execução**: A importação é feita em lotes de 50 registos para melhor performance
4. **Erros**: Eventuais erros são reportados mas não param a importação - outros registos continuam a ser processados

## ✨ Outras Utilizações

Esta ferramenta pode ser usada para importar qualquer tipo de leads de CSV/Excel, não apenas propostas comerciais. Basta adaptar o mapeamento de colunas conforme necessário.

Exemplos:
- Leads de campanhas de marketing
- Contactos de eventos
- Propostas de fornecedores
- Listas de clientes potenciais

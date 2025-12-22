# 🔄 Como Reiniciar o Servidor no Replit

## 🎯 Método 1: Via Terminal (Recomendado)

### **Se o servidor está rodando no terminal do Replit:**

1. **Ir para o terminal onde está rodando `npm run dev`**
2. **Parar o servidor:**
   - Pressione `Ctrl+C` (ou `Cmd+C` no Mac)
   - Aguarde até ver a mensagem de que o processo foi encerrado

3. **Reiniciar:**
   ```bash
   npm run dev
   ```

### **Se não sabe onde está rodando:**

1. **Encontrar o processo:**
   ```bash
   ps aux | grep "tsx server"
   ```

2. **Matar o processo:**
   ```bash
   pkill -f "tsx server"
   ```

3. **Reiniciar:**
   ```bash
   npm run dev
   ```

## 🎯 Método 2: Via Interface do Replit

1. **Parar:**
   - Clique no botão **"Stop"** (ou ícone de stop) na interface do Replit
   - Ou use o atalho (geralmente há um botão de stop)

2. **Iniciar:**
   - Clique no botão **"Run"** (ou ícone de play)
   - Ou pressione `Ctrl+Enter` (ou `Cmd+Enter` no Mac)

## 🎯 Método 3: Forçar Reinício Completo

Se o servidor estiver travado:

```bash
# 1. Matar todos os processos Node
pkill -f node
pkill -f tsx

# 2. Limpar cache (opcional)
rm -rf node_modules/.vite

# 3. Reiniciar
npm run dev
```

## 📋 Verificar se Reiniciou Corretamente

Após reiniciar, você deve ver nos logs:

```
✅ [Bootstrap] Core assets protection active
✅ [ModuleRegistry] ✅ Registered: hr
✅ [ModuleRegistry] ✅ Registered: production
✅ [ModuleRegistry] ✅ Registered: accounting
✅ Servidor a correr na porta 5000
```

## 🚨 Problemas Comuns

### **Porta já em uso:**
```bash
# Ver qual processo está usando a porta
lsof -i :5000

# Matar o processo
kill -9 <PID>
```

### **Servidor não inicia:**
```bash
# Verificar erros
npm run dev 2>&1 | tee server.log

# Verificar dependências
npm install
```

### **Mudanças não aparecem:**
```bash
# Limpar cache e reiniciar
rm -rf node_modules/.vite
rm -rf dist
npm run dev
```

## ✅ Checklist de Reinício

- [ ] Servidor parado (Ctrl+C ou botão Stop)
- [ ] Processo encerrado (verificar com `ps aux | grep tsx`)
- [ ] Cache limpo (opcional, mas recomendado)
- [ ] Servidor reiniciado (`npm run dev`)
- [ ] Logs mostram módulos registrados
- [ ] Porta 5000 está respondendo

## 🎯 Comando Rápido (Tudo em Um)

```bash
# Parar, limpar e reiniciar
pkill -f "tsx server" && rm -rf node_modules/.vite && npm run dev
```

---

**Nota:** No Replit, geralmente há um botão "Run" na interface que faz tudo automaticamente. Mas via SSH, use `Ctrl+C` para parar e `npm run dev` para reiniciar.


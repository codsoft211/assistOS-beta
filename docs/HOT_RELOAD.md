# 🔥 Como Fazer Hot Reload Manual

## 🎯 Métodos Disponíveis

### **Método 1: Script Automático (Recomendado)**

Execute no terminal do Replit:

```bash
bash scripts/hot-reload.sh
```

Ou simplesmente:

```bash
touch client/src/App.tsx
```

### **Método 2: Via Terminal (Comandos Manuais)**

```bash
# Tocar em arquivos que o Vite monitora
touch client/src/App.tsx
touch vite.config.ts

# Ou qualquer arquivo frontend
touch client/src/main.tsx
```

### **Método 3: Reiniciar Servidor**

No terminal onde o `npm run dev` está rodando:

1. **Parar servidor:** `Ctrl+C`
2. **Reiniciar:** `npm run dev`

### **Método 4: Limpar Cache e Reiniciar**

```bash
# Limpar cache do Vite
rm -rf node_modules/.vite

# Reiniciar servidor
npm run dev
```

## 📍 Onde o Vite Monitora

O Vite monitora automaticamente mudanças em:
- ✅ `client/src/**/*` (todos os arquivos frontend)
- ✅ `vite.config.ts` (configuração)
- ✅ Arquivos importados pelo frontend

## 🔍 Verificar se Funcionou

Após executar qualquer método, verifique os logs do Replit. Você deve ver:

```
[vite] hot updated: /src/App.tsx
```

Ou:

```
[vite] page reload /src/App.tsx
```

## ⚡ Solução Rápida (1 comando)

```bash
touch client/src/App.tsx && echo "✅ Hot reload triggerado!"
```

## 🚨 Se Nada Funcionar

1. **Verificar se o servidor está rodando:**
   ```bash
   ps aux | grep "tsx server"
   ```

2. **Verificar porta do Vite:**
   ```bash
   lsof -i :5173
   ```

3. **Reiniciar completamente:**
   ```bash
   # Parar tudo
   pkill -f "tsx server"
   
   # Limpar cache
   rm -rf node_modules/.vite
   
   # Reiniciar
   npm run dev
   ```

## 📝 Nota Importante

Como você está trabalhando via SSH, os arquivos **já estão no sistema de arquivos do Replit**. O problema é apenas o Vite não detectar as mudanças automaticamente.

**Solução mais simples:** Execute `touch client/src/App.tsx` sempre que quiser forçar o hot reload! 🎯


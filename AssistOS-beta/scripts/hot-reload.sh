#!/bin/bash
# Script para forçar hot reload do Vite

echo "🔄 Forçando hot reload do Vite..."

# Tocar em arquivos que o Vite monitora
touch client/src/App.tsx
touch client/src/main.tsx 2>/dev/null || true
touch vite.config.ts

echo "✅ Arquivos atualizados. O Vite deve detectar as mudanças automaticamente."
echo ""
echo "Se não funcionar, tente:"
echo "1. Verificar logs do Vite no Replit"
echo "2. Reiniciar servidor: Ctrl+C e depois 'npm run dev'"
echo "3. Limpar cache: rm -rf node_modules/.vite && npm run dev"


#!/bin/bash
# Script to update all module query builders to use tenant schemas
# This script adds the tenantSchemaService import to all query builder files

set -e

echo "=========================================="
echo "Updating Module Query Builders"
echo "=========================================="

QUERY_BUILDERS=(
  "packages/modules/compras/query-builder.ts"
  "packages/modules/projetos/query-builder.ts"
  "packages/modules/angariacao/query-builder.ts"
  "packages/modules/logistica/query-builder.ts"
)

for file in "${QUERY_BUILDERS[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing: $file"
    
    # Check if already has tenantSchemaService import
    if grep -q "tenantSchemaService" "$file"; then
      echo "  ✅ Already updated (tenantSchemaService import found)"
    else
      echo "  🔄 Adding tenantSchemaService import..."
      
      # Add import after existing drizzle-orm import
      sed -i "/from 'drizzle-orm';/a import { tenantSchemaService } from '../../../apps/api/services/tenant-schema.service';" "$file"
      
      echo "  ✅ Updated"
    fi
  else
    echo "  ⚠️  File not found: $file"
  fi
done

echo ""
echo "=========================================="
echo "✅ All query builders updated!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Review changes in each file"
echo "2. Update execute() methods to use schema parameter"
echo "3. Run tests: npm run test:tenant-schemas"
echo ""


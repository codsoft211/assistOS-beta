-- ============================================================
-- CREDIT SYSTEM - END-TO-END TESTING SCRIPT
-- ============================================================
-- Use este script para testar manualmente a integração completa
-- do Credit System com os orchestrators AssistME e AssistBuild.
--
-- Pré-requisito: Aplicação a correr (npm run dev)
-- ============================================================

-- ============================================================
-- STEP 1: Setup - Criar tenant de teste com 100 créditos
-- ============================================================

-- 1.1 Verificar se tenant já tem créditos (ajustar tenant_id conforme necessário)
SELECT 
  tenant_id,
  environment,
  balance,
  lifetime_purchases,
  lifetime_usage,
  last_usage_at
FROM tenant_credits
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR com ID real
  AND environment = 'production';

-- 1.2 Se não existe, criar registro inicial com 100 créditos
-- (normalmente criado automaticamente, mas pode fazer manualmente para testes)
INSERT INTO tenant_credits (
  tenant_id,
  environment,
  balance,
  lifetime_purchases,
  lifetime_usage
) VALUES (
  'replace-with-your-tenant-id',  -- ⚠️ SUBSTITUIR com ID real
  'production',
  100.00,
  100.00,
  0.00
)
ON CONFLICT (tenant_id, environment) DO NOTHING;

-- 1.3 OU resetar créditos de tenant existente para 100
UPDATE tenant_credits
SET 
  balance = 100.00,
  lifetime_purchases = 100.00,
  lifetime_usage = 0.00,
  last_usage_at = NULL
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR com ID real
  AND environment = 'production';

COMMIT;

-- ============================================================
-- STEP 2: Baseline - Verificar estado inicial
-- ============================================================

-- 2.1 Balance inicial
SELECT 
  tenant_id,
  balance AS initial_balance,
  lifetime_usage
FROM tenant_credits
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND environment = 'production';

-- 2.2 Confirmar que não há usage_events recentes
SELECT COUNT(*) AS recent_events_count
FROM usage_events
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND created_at > NOW() - INTERVAL '5 minutes';

-- Expected: 0 (ou número baixo)

-- ============================================================
-- STEP 3: TEST - Fazer request AssistME
-- ============================================================
-- 🎯 ACTION REQUIRED:
-- 1. Ir ao UI do AssistOS
-- 2. Fazer login como utilizador do tenant acima
-- 3. Enviar mensagem ao AssistME (chat operacional):
--    Exemplo: "Qual é o meu stock de batatas?"
-- 4. Aguardar resposta completa
-- 5. Voltar aqui e executar queries abaixo
-- ============================================================

-- 3.1 Verificar que balance DIMINUIU
SELECT 
  tenant_id,
  balance AS balance_after_request,
  lifetime_usage,
  last_usage_at
FROM tenant_credits
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND environment = 'production';

-- Expected: balance < 100 (ex: 97.50)

-- 3.2 Ver últimos usage_events criados (input + output tokens)
SELECT 
  id,
  provider,
  service,
  units_consumed,
  unit_type,
  cost_eur,
  metadata->>'orchestratorType' AS orchestrator,
  metadata->>'model' AS model,
  metadata->>'iterationCount' AS iterations,
  created_at
FROM usage_events
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 10;

-- Expected: 2 records (1 input_tokens_1k + 1 output_tokens_1k)
-- orchestrator: 'assistme'

-- 3.3 Ver credit_transactions correspondentes
SELECT 
  id,
  amount,
  transaction_type,
  reason,
  created_by,
  usage_event_id,
  created_at
FROM credit_transactions
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND created_at > NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC
LIMIT 10;

-- Expected: 2 records (negative amounts = deductions)
-- Example: -0.90, -1.80

-- 3.4 Calcular total deduzido
SELECT 
  SUM(ABS(amount::numeric)) AS total_credits_deducted,
  COUNT(*) AS num_transactions
FROM credit_transactions
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND transaction_type = 'consumption'
  AND created_at > NOW() - INTERVAL '5 minutes';

-- Expected: total_credits_deducted = diferença entre balance inicial e final

-- ============================================================
-- STEP 4: TEST - Fazer request AssistBuild (Studio)
-- ============================================================
-- 🎯 ACTION REQUIRED:
-- 1. Ir ao Studio (configuração) no UI
-- 2. Enviar mensagem ao AssistBuild:
--    Exemplo: "Quais módulos estão ativos?"
-- 3. Aguardar resposta completa
-- 4. Voltar aqui e executar queries abaixo
-- ============================================================

-- 4.1 Verificar novos usage_events (assistbuild)
SELECT 
  id,
  provider,
  service,
  units_consumed,
  unit_type,
  cost_eur,
  metadata->>'orchestratorType' AS orchestrator,
  metadata->>'model' AS model,
  created_at
FROM usage_events
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND created_at > NOW() - INTERVAL '2 minutes'
ORDER BY created_at DESC
LIMIT 5;

-- Expected: 2 novos records com orchestrator = 'assistbuild'

-- 4.2 Balance atualizado novamente
SELECT 
  tenant_id,
  balance,
  lifetime_usage,
  last_usage_at
FROM tenant_credits
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND environment = 'production';

-- Expected: balance ainda menor que antes

-- ============================================================
-- STEP 5: VALIDATION - Reconciliar custos
-- ============================================================

-- 5.1 Comparar OpenAI cost real vs Credits deducted
SELECT 
  provider,
  service,
  metadata->>'orchestratorType' AS orchestrator,
  SUM(units_consumed) AS total_tokens,
  SUM(cost_eur) AS total_openai_cost_eur,
  SUM(cost_eur) / 0.03 AS expected_credits_deducted,
  COUNT(*) AS num_events
FROM usage_events
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND created_at > NOW() - INTERVAL '10 minutes'
GROUP BY provider, service, metadata->>'orchestratorType'
ORDER BY total_openai_cost_eur DESC;

-- 5.2 Verificar correspondência: usage_events ↔ credit_transactions
SELECT 
  ue.id AS usage_event_id,
  ue.cost_eur AS openai_cost,
  ue.cost_eur / 0.03 AS expected_credits,
  ct.amount AS actual_credits_deducted,
  ABS(ct.amount::numeric) - (ue.cost_eur / 0.03) AS difference
FROM usage_events ue
INNER JOIN credit_transactions ct ON ct.usage_event_id = ue.id
WHERE ue.tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND ue.created_at > NOW() - INTERVAL '10 minutes'
ORDER BY ue.created_at DESC
LIMIT 20;

-- Expected: difference ≈ 0.00 (pode ter pequenas diferenças de arredondamento)

-- 5.3 Verificar margin (70%)
WITH summary AS (
  SELECT 
    SUM(cost_eur) AS total_provider_cost,
    SUM(ABS(amount::numeric)) AS total_credits_deducted
  FROM usage_events ue
  LEFT JOIN credit_transactions ct ON ct.usage_event_id = ue.id
  WHERE ue.tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
    AND ue.created_at > NOW() - INTERVAL '10 minutes'
)
SELECT 
  total_provider_cost,
  total_credits_deducted,
  total_credits_deducted * 0.10 AS customer_pays_eur,
  (total_credits_deducted * 0.10) - total_provider_cost AS assistos_profit_eur,
  ((total_credits_deducted * 0.10 - total_provider_cost) / (total_credits_deducted * 0.10) * 100) AS margin_percentage
FROM summary;

-- Expected: margin_percentage ≈ 70%

-- ============================================================
-- STEP 6: EDGE CASES - Testar cenários especiais
-- ============================================================

-- 6.1 Test: Insufficient Credits
-- Reduzir balance para valor muito baixo
UPDATE tenant_credits
SET balance = 0.01
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND environment = 'production';

COMMIT;

-- 🎯 ACTION: Fazer novo request AssistME
-- Expected: Request FUNCIONA (non-blocking), mas logs mostram erro

-- 6.2 Ver logs de erro (se application logs estiverem no DB)
-- Ou verificar nos console logs do backend:
-- docker logs assistos-api | grep "❌ CRITICAL"

-- Expected output:
-- [AssistME] ❌ CRITICAL: Tenant has insufficient credits!

-- 6.3 Resetar balance para continuar testes
UPDATE tenant_credits
SET balance = 100.00
WHERE tenant_id = 'replace-with-your-tenant-id'  -- ⚠️ SUBSTITUIR
  AND environment = 'production';

COMMIT;

-- ============================================================
-- STEP 7: ANALYTICS - Queries úteis para monitorização
-- ============================================================

-- 7.1 Top 10 tenants por consumo de créditos (últimas 24h)
SELECT 
  ue.tenant_id,
  COUNT(DISTINCT ue.id) AS num_requests,
  SUM(ue.units_consumed) AS total_tokens,
  SUM(ue.cost_eur) AS total_openai_cost_eur,
  SUM(ABS(ct.amount::numeric)) AS total_credits_deducted,
  SUM(ABS(ct.amount::numeric)) * 0.10 AS customer_pays_eur,
  (SUM(ABS(ct.amount::numeric)) * 0.10) - SUM(ue.cost_eur) AS profit_eur
FROM usage_events ue
LEFT JOIN credit_transactions ct ON ct.usage_event_id = ue.id
WHERE ue.created_at > NOW() - INTERVAL '24 hours'
GROUP BY ue.tenant_id
ORDER BY total_credits_deducted DESC
LIMIT 10;

-- 7.2 Breakdown por orchestrator (AssistME vs AssistBuild)
SELECT 
  metadata->>'orchestratorType' AS orchestrator,
  COUNT(*) AS num_requests,
  SUM(units_consumed) AS total_tokens,
  AVG(units_consumed) AS avg_tokens_per_request,
  SUM(cost_eur) AS total_cost_eur
FROM usage_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY metadata->>'orchestratorType'
ORDER BY total_cost_eur DESC;

-- 7.3 Breakdown por unit_type (input vs output)
SELECT 
  unit_type,
  COUNT(*) AS num_events,
  SUM(units_consumed) AS total_units,
  AVG(units_consumed) AS avg_units,
  SUM(cost_eur) AS total_cost_eur
FROM usage_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY unit_type
ORDER BY total_cost_eur DESC;

-- 7.4 Tenants com balance baixo (alertar!)
SELECT 
  tenant_id,
  environment,
  balance,
  lifetime_purchases,
  lifetime_usage,
  (balance / NULLIF(lifetime_purchases, 0) * 100) AS remaining_percentage,
  last_usage_at
FROM tenant_credits
WHERE balance < 10.00  -- Threshold: 10 créditos
  AND environment = 'production'
ORDER BY balance ASC;

-- 7.5 Evolução diária de consumo (últimos 7 dias)
SELECT 
  DATE(created_at) AS usage_date,
  COUNT(DISTINCT tenant_id) AS active_tenants,
  COUNT(*) AS total_requests,
  SUM(cost_eur) AS total_cost_eur,
  SUM(cost_eur) / 0.03 AS total_credits_deducted,
  (SUM(cost_eur) / 0.03) * 0.10 AS revenue_eur,
  ((SUM(cost_eur) / 0.03) * 0.10) - SUM(cost_eur) AS profit_eur
FROM usage_events
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY usage_date DESC;

-- ============================================================
-- STEP 8: CLEANUP (Optional) - Limpar dados de teste
-- ============================================================

-- 8.1 Remover usage_events de teste (últimos 30 minutos)
-- ⚠️ CUIDADO: Só executar se tiver certeza que são dados de teste!
/*
DELETE FROM usage_events
WHERE tenant_id = 'replace-with-your-tenant-id'
  AND created_at > NOW() - INTERVAL '30 minutes';

-- 8.2 Remover credit_transactions órfãos (sem usage_event correspondente)
DELETE FROM credit_transactions
WHERE tenant_id = 'replace-with-your-tenant-id'
  AND usage_event_id IS NOT NULL
  AND usage_event_id NOT IN (SELECT id FROM usage_events);

-- 8.3 Resetar tenant_credits para estado inicial
UPDATE tenant_credits
SET 
  balance = 100.00,
  lifetime_purchases = 100.00,
  lifetime_usage = 0.00,
  last_usage_at = NULL
WHERE tenant_id = 'replace-with-your-tenant-id'
  AND environment = 'production';

COMMIT;
*/

-- ============================================================
-- ✅ TESTING COMPLETE!
-- ============================================================
-- Se todos os steps acima funcionaram:
-- 1. ✅ Balance diminui após cada request AI
-- 2. ✅ usage_events criados para input + output tokens
-- 3. ✅ credit_transactions linkados aos usage_events
-- 4. ✅ Margin de 70% aplicada corretamente
-- 5. ✅ Orchestrators diferenciados (assistme vs assistbuild)
-- 6. ✅ Erro de insufficient credits logado mas não bloqueia request
--
-- 🎉 CREDIT SYSTEM PHASE 3 VALIDATED!
-- ============================================================

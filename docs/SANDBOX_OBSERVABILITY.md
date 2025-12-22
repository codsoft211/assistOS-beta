# Sandbox Promotion Observability Guide

## Overview

This document describes the observability infrastructure for the Sandbox Promotion system, including metrics, logging patterns, debugging tools, and alert thresholds.

## Metrics

### Promotion Metrics

The `PromotionMetricsService` tracks the following metrics:

#### 1. Promotion Count (by Tenant)
- **Metric**: `promotion.count.{tenantId}`
- **Type**: Counter
- **Description**: Number of promotions executed per tenant
- **Labels**: `tenantId`, `status` (success/failure)

#### 2. Promotion Duration
- **Metric**: `promotion.duration`
- **Type**: Histogram
- **Description**: Time taken to complete promotion workflow
- **Unit**: Milliseconds
- **Buckets**: 100ms, 500ms, 1s, 5s, 10s, 30s, 60s

#### 3. Promotion Errors
- **Metric**: `promotion.errors`
- **Type**: Counter
- **Description**: Number of failed promotions
- **Labels**: `tenantId`, `errorType`

#### 4. Records Promoted
- **Metric**: `promotion.records.count`
- **Type**: Counter
- **Description**: Total number of records promoted
- **Labels**: `tenantId`, `tableName`

### Accessing Metrics

```typescript
import { promotionMetrics } from '@api/services/promotion-metrics.service';

// Get metrics summary
const metrics = promotionMetrics.getMetrics();

console.log(metrics);
// Output:
// {
//   promotionsByTenant: { 'tenant-1': 5, 'tenant-2': 3 },
//   totalPromotions: 8,
//   averageDuration: 1234,
//   totalErrors: 2,
//   totalRecordsPromoted: 150
// }
```

## Structured Logging

### Log Patterns

All promotion operations use structured logging with consistent patterns:

#### Promotion Start
```json
{
  "level": "info",
  "msg": "Starting promotion workflow",
  "tenantId": "tenant-123",
  "environment": "sandbox",
  "entityCount": 3,
  "timestamp": "2025-11-08T10:00:00Z"
}
```

#### Promotion Completion
```json
{
  "level": "info",
  "msg": "Promotion workflow completed",
  "tenantId": "tenant-123",
  "auditLogId": "audit-456",
  "success": true,
  "promotedCount": 25,
  "duration": 1234,
  "timestamp": "2025-11-08T10:00:02Z"
}
```

#### Promotion Failure
```json
{
  "level": "error",
  "msg": "Promotion workflow failed",
  "tenantId": "tenant-123",
  "error": "Failed to apply clients: Foreign key violation",
  "timestamp": "2025-11-08T10:00:02Z"
}
```

### Log Queries

#### Find all promotions for a tenant
```bash
# Using grep on log files
grep '"tenantId":"tenant-123"' /var/log/assistos/api.log | grep promotion

# Using structured log query (if using JSON logging)
jq 'select(.tenantId == "tenant-123" and (.msg | contains("promotion")))' /var/log/assistos/api.log
```

#### Find all failed promotions
```bash
# Find promotion failures
grep '"msg":"Promotion workflow failed"' /var/log/assistos/api.log

# Or with jq
jq 'select(.msg == "Promotion workflow failed")' /var/log/assistos/api.log
```

#### Find slow promotions (>5 seconds)
```bash
# Find promotions that took longer than 5000ms
jq 'select(.msg == "Promotion workflow completed" and .duration > 5000)' /var/log/assistos/api.log
```

## Alert Thresholds

### Critical Alerts

#### 1. High Promotion Failure Rate
- **Condition**: `(promotion.errors / promotion.count) > 0.2` (20% failure rate)
- **Severity**: Critical
- **Action**: Investigate error logs immediately, check database connectivity

#### 2. Promotion Duration Spike
- **Condition**: `promotion.duration.p95 > 30000ms` (30 seconds)
- **Severity**: Critical
- **Action**: Check database performance, investigate table locks

#### 3. Zero Successful Promotions (24h)
- **Condition**: `promotion.count.success == 0` for 24 hours
- **Severity**: High
- **Action**: Check worker status, verify queue connectivity

### Warning Alerts

#### 1. Elevated Promotion Duration
- **Condition**: `promotion.duration.avg > 10000ms` (10 seconds)
- **Severity**: Warning
- **Action**: Monitor for performance degradation

#### 2. Increasing Promotion Volume
- **Condition**: `promotion.count > 100` per hour
- **Severity**: Warning
- **Action**: Monitor system resources, consider scaling

## Debugging Tools

### 1. Promotion Audit Trail Query

Query the promotion logs table to investigate past promotions:

```sql
-- Find recent promotions
SELECT 
  id,
  tenant_id,
  status,
  (result->>'promotedCount')::int as promoted_count,
  (result->>'success')::boolean as success,
  duration,
  created_at
FROM promotion_logs
WHERE tenant_id = 'tenant-123'
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Failed Promotion Analysis

```sql
-- Analyze failed promotions
SELECT 
  tenant_id,
  result->>'errors' as errors,
  manifest_json->>'entities' as entities,
  duration,
  created_at
FROM promotion_logs
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

### 3. Promotion Performance Analysis

```sql
-- Average promotion duration by tenant
SELECT 
  tenant_id,
  COUNT(*) as promotion_count,
  AVG(duration) as avg_duration_ms,
  MAX(duration) as max_duration_ms,
  MIN(duration) as min_duration_ms
FROM promotion_logs
WHERE status = 'completed'
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY tenant_id
ORDER BY avg_duration_ms DESC;
```

### 4. Environment Data Consistency Check

Verify no cross-environment data leakage:

```sql
-- Check for cross-environment foreign key violations
-- Example: Invoices referencing clients from different environments
SELECT 
  i.id as invoice_id,
  i.environment as invoice_env,
  c.id as client_id,
  c.environment as client_env
FROM purchasing_invoices i
JOIN suppliers c ON i.supplier_id = c.id
WHERE i.environment != c.environment
  AND i.tenant_id = 'tenant-123';
```

## Common Issues & Solutions

### Issue 1: Promotion Fails with Foreign Key Violation

**Symptoms:**
```json
{
  "error": "Failed to apply invoices: Foreign key violation",
  "promotedCount": 0
}
```

**Root Cause:** Attempting to promote records that reference entities not yet promoted to production.

**Solution:**
1. Identify missing foreign key references
2. Expand promotion manifest to include referenced entities
3. Retry promotion with complete entity graph

**Prevention:** Use the `validateForeignKeyEnvironment` utility before creating records.

---

### Issue 2: Slow Promotion Performance

**Symptoms:**
- Promotion duration >30 seconds
- Database connection timeouts

**Root Cause:** Large record volumes or missing database indexes.

**Solution:**
1. Check promotion logs for record counts
2. Verify database indexes on environment columns
3. Consider batching large promotions

**Query to diagnose:**
```sql
-- Check if environment columns are indexed
SELECT 
  t.tablename,
  i.indexname
FROM pg_tables t
LEFT JOIN pg_indexes i ON t.tablename = i.tablename AND i.indexname LIKE '%environment%'
WHERE t.schemaname = 'public'
  AND t.tablename IN ('clients', 'suppliers', 'purchasing_invoices')
ORDER BY t.tablename;
```

---

### Issue 3: Duplicate Records in Production

**Symptoms:**
```json
{
  "success": true,
  "promotedCount": 0,
  "warnings": ["All records already exist in production"]
}
```

**Root Cause:** Records were previously promoted.

**Solution:**
1. This is expected behavior - the diff step prevents duplicates
2. If re-promotion is needed, delete production records first
3. Verify promotion manifest has correct record IDs

---

### Issue 4: Worker Queue Backlog

**Symptoms:**
- Promotions stuck in "pending" status
- Worker logs show no activity

**Root Cause:** Redis connection issues or worker not running.

**Solution:**
1. Check Redis connectivity: `redis-cli ping`
2. Verify worker is running: `ps aux | grep worker`
3. Restart worker: `npm run worker:restart`

---

## Performance Baselines

Expected performance characteristics:

- **Small promotion** (1-10 records): <1 second
- **Medium promotion** (10-100 records): 1-5 seconds
- **Large promotion** (100-1000 records): 5-30 seconds
- **Very large promotion** (1000+ records): 30-120 seconds

If your promotions consistently exceed these baselines, investigate:
1. Database query performance
2. Network latency
3. Database connection pool saturation

## Monitoring Dashboard Queries

### Key Metrics for Dashboard

```sql
-- Real-time promotion activity (last 24h)
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as total_promotions,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  AVG(duration) as avg_duration_ms
FROM promotion_logs
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;
```

```sql
-- Top tenants by promotion volume
SELECT 
  tenant_id,
  COUNT(*) as promotion_count,
  SUM((result->>'promotedCount')::int) as total_records_promoted
FROM promotion_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY tenant_id
ORDER BY promotion_count DESC
LIMIT 10;
```

## Health Check Endpoints

### Promotion System Health

```typescript
// GET /api/health/promotion
{
  "status": "healthy",
  "checks": {
    "database": "ok",
    "redis": "ok",
    "worker": "ok"
  },
  "metrics": {
    "promotionsLast24h": 15,
    "averageDuration": 1234,
    "failureRate": 0.05
  }
}
```

## Troubleshooting Checklist

When investigating promotion issues:

- [ ] Check promotion logs table for audit trail
- [ ] Verify environment is "sandbox" in manifest
- [ ] Confirm user has permission (owner/admin/config role)
- [ ] Check for cross-environment foreign key violations
- [ ] Verify database connectivity
- [ ] Check Redis/BullMQ worker status
- [ ] Review application logs for errors
- [ ] Verify database indexes on environment columns
- [ ] Check for table locks or long-running transactions

## Future Enhancements

Planned observability improvements:

1. **Prometheus Integration**: Export metrics to Prometheus for centralized monitoring
2. **Grafana Dashboards**: Pre-built dashboards for promotion monitoring
3. **Distributed Tracing**: OpenTelemetry integration for end-to-end tracing
4. **Anomaly Detection**: ML-based detection of unusual promotion patterns
5. **Auto-remediation**: Automatic retry of failed promotions with exponential backoff

## Support Contacts

For issues with the promotion system:

- **Development Team**: dev-team@assistos.com
- **On-Call**: Slack #assistos-oncall
- **Documentation**: https://docs.assistos.com/sandbox-promotion

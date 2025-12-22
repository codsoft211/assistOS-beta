# 🧪 Workflow Testing - Quick Start

## Prerequisites

Ensure these are running:

```bash
# 1. Start API server
npm run dev

# 2. Start Worker (in another terminal)
npm run worker

# 3. Start Redis (if not running)
redis-server
```

## Quick Test Commands

### Option 1: Automated Test Suite (Recommended)

```bash
# Run all test scenarios
npm run test:workflows

# Run specific scenario
npm run test:workflows -- --scenario=1

# List available scenarios
npm run test:workflows -- --list

# Run without cleanup (inspect data after)
npm run test:workflows -- --no-cleanup

# Cleanup test data only
npm run test:workflows -- --cleanup
```

### Option 2: Manual HTTP Testing

```bash
# Check system status
./scripts/test-workflows-http.sh status

# List available scenarios
./scripts/test-workflows-http.sh list

# Run scenario
./scripts/test-workflows-http.sh 1
```

## Test Scenarios

### ✅ Scenario 1: Simple CRUD - Create Customer
**What it tests**: Basic workflow with manual trigger → create record
- Tests: Node execution, variable interpolation
- Expected: Customer created successfully

### ✅ Scenario 2: CRUD Chain - Create and Read  
**What it tests**: Sequential operations
- Tests: Data passing between nodes, DAG traversal
- Expected: Record created and retrieved

### ✅ Scenario 3: Multiple Operations
**What it tests**: Complex workflows with 3+ nodes
- Tests: Related records (customer → order)
- Expected: All records created in order

### ❌ Scenario 4: Error Handling - Invalid Node
**What it tests**: Validation system
- Tests: Missing config fields
- Expected: Validation error before execution

### ❌ Scenario 5: Cycle Detection
**What it tests**: DAG validation
- Tests: Circular dependency detection
- Expected: Cycle detection prevents execution

## Sample Test Output

```
============================================================
Scenario 1: Simple CRUD - Create Customer
============================================================

ℹ️  Manual trigger → Create customer record

📝 Step 1: Creating workflow...
✅ Workflow created: 12345-uuid
ℹ️    Name: Test: Create Customer
ℹ️    Status: draft

📤 Step 2: Publishing workflow...
✅ Workflow published

▶️  Step 3: Executing workflow...
✅ Execution started: 67890-uuid
ℹ️    Status: pending

👀 Step 4: Monitoring execution...
ℹ️    Status: running (1s)
✅ Execution completed successfully!

📊 Step 5: Fetching execution logs...
✅ Retrieved 2 execution logs
ℹ️    ✅ 1. Manual Start (manual_trigger) - success
ℹ️       Duration: 45ms
ℹ️    ✅ 2. Create Customer (crud_record) - success
ℹ️       Duration: 156ms

✅ Scenario 1 completed successfully!
```

## Troubleshooting

### Worker Not Processing Jobs

```bash
# Check if worker is running
ps aux | grep "apps/worker/index.ts"

# Start worker
npm run worker
```

### Redis Connection Errors

```bash
# Check Redis status
redis-cli ping

# Start Redis
# Mac:
brew services start redis

# Linux:
sudo systemctl start redis

# Manual:
redis-server
```

### API Server Not Responding

```bash
# Check if server is running
curl http://localhost:5000/api/health

# Start server
npm run dev
```

### Database Issues

```bash
# Check database connection
psql $DATABASE_URL

# Run migrations if needed
npm run db:push
```

## Monitoring Tests

### Watch Execution in Real-time

```bash
# Terminal 1: Watch logs
tail -f logs/worker.log

# Terminal 2: Run tests
npm run test:workflows -- --scenario=1
```

### Check Queue Status

```bash
# Redis queue monitoring
redis-cli llen bull:assistbuild-workflows:wait
redis-cli llen bull:assistbuild-workflows:active
redis-cli llen bull:assistbuild-workflows:completed
redis-cli llen bull:assistbuild-workflows:failed
```

### Database Queries

```sql
-- Recent test executions
SELECT 
  w.name as workflow_name,
  e.status,
  e.created_at,
  e.completed_at,
  EXTRACT(EPOCH FROM (e.completed_at - e.created_at)) as duration_seconds
FROM assistbuild_executions e
JOIN assistbuild_workflows w ON w.id = e.workflow_id
WHERE e.tenant_id = 'test-tenant'
ORDER BY e.created_at DESC
LIMIT 10;

-- Node-level logs
SELECT 
  node_name,
  node_type,
  status,
  duration_ms,
  error_message
FROM assistbuild_execution_logs
WHERE execution_id = 'YOUR_EXECUTION_ID'
ORDER BY started_at;
```

## Performance Benchmarks

Expected timings:
- Workflow creation: < 50ms
- Workflow validation: < 100ms
- Simple execution (2 nodes): 150-300ms
- Complex execution (5+ nodes): 400-800ms

## Common Issues

### Issue: "Workflow must be published before execution"
**Solution**: Workflow status is 'draft'. Run publish step first.

### Issue: "Queue is not available"
**Solution**: Redis not running or not connected. Check Redis connection.

### Issue: "Execution timeout"
**Solution**: Worker not processing jobs. Start worker process.

### Issue: "Validation error: cycle detected"
**Solution**: Workflow has circular dependency. Check edge connections.

## Advanced Testing

### Custom Scenarios

Edit `scripts/test-workflows.ts` and add your scenario:

```typescript
6: {
  name: 'Your Custom Test',
  description: 'What it does',
  workflow: {
    // Your workflow definition
  },
  triggerData: {
    // Your test data
  },
}
```

### API Testing with curl

```bash
# Create workflow
curl -X POST http://localhost:5000/api/assistbuild/workflows \
  -H 'Content-Type: application/json' \
  -H 'Cookie: connect.sid=YOUR_SESSION' \
  -d '{
    "name": "My Workflow",
    "definition": { ... }
  }'

# Execute workflow
curl -X POST http://localhost:5000/api/assistbuild/workflows/{id}/execute \
  -H 'Content-Type: application/json' \
  -d '{ "triggerData": { "test": true } }'

# Check status
curl http://localhost:5000/api/assistbuild/executions/{id}
```

## CI/CD Integration

```yaml
# .github/workflows/test-workflows.yml
name: Test Workflows

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      redis:
        image: redis
        ports:
          - 6379:6379
      
      postgres:
        image: postgres
        env:
          POSTGRES_PASSWORD: postgres
        ports:
          - 5432:5432
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm install
      
      - name: Start worker
        run: npm run worker &
      
      - name: Run workflow tests
        run: npm run test:workflows
```

## Next Steps

After successful tests:
1. ✅ Verify all scenarios pass
2. 📊 Review execution logs
3. 🎨 Build frontend UI
4. 🚀 Deploy to staging
5. 📈 Monitor production metrics

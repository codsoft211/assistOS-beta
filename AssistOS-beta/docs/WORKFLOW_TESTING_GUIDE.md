# Workflow Testing Scripts

## Quick Start

```bash
# Install dependencies (if needed)
npm install

# Run all test scenarios
npm run test:workflows

# Run a specific scenario
npm run test:workflows -- --scenario=1

# List all available scenarios
npm run test:workflows -- --list

# Cleanup test data
npm run test:workflows -- --cleanup

# Run tests without automatic cleanup
npm run test:workflows -- --no-cleanup
```

## Test Scenarios

### Scenario 1: Simple CRUD - Create Customer
**Description**: Manual trigger → Create customer record

Tests the basic workflow with:
- 1 Manual Trigger node
- 1 CRUD Record node (CREATE operation)
- Variable interpolation from trigger data

**Expected Outcome**: Customer record created successfully

---

### Scenario 2: CRUD Chain - Create and Read
**Description**: Create record → Read it back

Tests:
- Sequential node execution
- Data passing between nodes
- Multiple CRUD operations in sequence

**Expected Outcome**: Customer created and then retrieved successfully

---

### Scenario 3: Multiple Operations
**Description**: Create multiple records in sequence

Tests:
- Complex DAG with 3+ nodes
- Creating related records (customer → order)
- Variable passing through multiple nodes

**Expected Outcome**: Both customer and order records created

---

### Scenario 4: Error Scenario - Invalid Node
**Description**: Workflow with validation errors

Tests:
- Validation system catches errors
- Missing required config fields
- Proper error messages

**Expected Outcome**: Workflow creation or publishing fails with validation error

---

### Scenario 5: Cycle Detection
**Description**: Workflow with circular dependency

Tests:
- Cycle detection algorithm
- Edge validation
- Prevents infinite loops

**Expected Outcome**: Workflow fails validation due to cycle

---

## Environment Variables

```bash
# Optional - defaults provided
export TEST_TENANT_ID=your-tenant-id
export TEST_USER_ID=your-user-id
export API_URL=http://localhost:5000
```

## Adding New Test Scenarios

Edit `scripts/test-workflows.ts` and add to the `scenarios` object:

```typescript
6: {
  name: 'Your Test Name',
  description: 'What this test does',
  workflow: {
    name: 'Test: Your Workflow',
    description: 'Workflow description',
    environment: 'sandbox',
    definition: {
      nodes: [ /* your nodes */ ],
      edges: [ /* your edges */ ],
    },
  },
  triggerData: { /* test data */ },
}
```

## Troubleshooting

### Redis Connection Error
Make sure Redis is running:
```bash
# Mac
brew services start redis

# Linux
sudo systemctl start redis

# Or run manually
redis-server
```

### Worker Not Processing Jobs
Start the worker process:
```bash
npm run worker
# or
tsx apps/worker/index.ts
```

### Database Connection Error
Check your database connection in `.env`:
```bash
DATABASE_URL=postgresql://...
```

## Test Output

Each test scenario will show:

```
============================================================
Scenario 1: Simple CRUD - Create Customer
============================================================

ℹ️  Manual trigger → Create customer record

📝 Step 1: Creating workflow...
✅ Workflow created: workflow-uuid
ℹ️    Name: Test: Create Customer
ℹ️    Status: draft

📤 Step 2: Publishing workflow...
✅ Workflow published

▶️  Step 3: Executing workflow...
✅ Execution started: execution-uuid
ℹ️    Status: pending

👀 Step 4: Monitoring execution...
ℹ️    Status: running (1s)
ℹ️    Status: running (2s)
✅ Execution completed successfully!

📊 Step 5: Fetching execution logs...
✅ Retrieved 2 execution logs
ℹ️    ✅ 1. Manual Start (manual_trigger) - success
ℹ️       Duration: 50ms
ℹ️    ✅ 2. Create Customer (crud_record) - success
ℹ️       Duration: 120ms

📈 Step 6: Getting workflow statistics...
✅ Statistics retrieved
ℹ️    Total executions: 1
ℹ️    Success rate: 100%

✅ Scenario 1 completed successfully!
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
- name: Test Workflows
  run: |
    npm run worker &
    sleep 5
    npm run test:workflows
```

## Performance Benchmarks

Track execution times:
- Simple workflow (2 nodes): ~200ms
- Complex workflow (5+ nodes): ~500ms
- With database operations: +100-200ms per CRUD

## Monitoring

Use these queries to monitor test executions:

```sql
-- Recent test executions
SELECT * FROM assistbuild_executions 
WHERE tenant_id = 'test-tenant' 
ORDER BY created_at DESC 
LIMIT 10;

-- Execution success rate
SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM assistbuild_executions
WHERE tenant_id = 'test-tenant'
GROUP BY status;

-- Average execution time
SELECT 
  AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_seconds
FROM assistbuild_executions
WHERE tenant_id = 'test-tenant' 
  AND status = 'completed';
```

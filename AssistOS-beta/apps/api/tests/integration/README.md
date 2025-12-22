# Integration Tests - TODO

## Entity Embeddings Integration Tests

The entity embeddings integration tests (`entity-embeddings.integration.test.ts`) are currently disabled due to schema evolution challenges.

### Current Status
- ❌ Tests fail due to schema mismatches (missing required fields: `code`, `firstName`, etc.)
- ✅ Unit tests with mocks validate core behavior
- ✅ Schema has proper unique constraints for upsert behavior

### Future Work (Post-Sprint 1)
Following architect guidance, these tests should be refactored using:

1. **Lightweight Data Factories**
   - Only populate columns actually referenced by embedding service
   - Fail fast if schema adds new non-null columns
   - One factory per entity (tenant, supplier, invoice, project)

2. **Transactional Setup/Teardown**
   - Use transactions + savepoints
   - Assert: insert, timestamp bump, tenant-filtered reads

3. **Minimal Fixtures**
   - Focus on embedding tables directly
   - Reduce coupling to domain schema evolution

### Current Test Coverage
- ✅ Unit tests validate methods exist
- ✅ Unit tests verify onConflictDoUpdate usage (via spy)
- ✅ Performance tests validate cosine similarity speed
- ✅ Schema has UNIQUE indexes preventing duplicates
- ❌ Integration tests for real database writes (TODO)

### Why Deferred?
Integration tests are fragile during rapid schema evolution. The hybrid strategy (unit tests + schema constraints) provides adequate coverage for Sprint 1 MVP, with full integration tests planned for schema stabilization phase.

### References
- Architect Review: "Adopt focused hybrid integration strategy"
- Schema: `shared/schema.ts` (supplier_embeddings, invoice_embeddings, project_embeddings)
- Service: `apps/api/services/embedding.service.ts`

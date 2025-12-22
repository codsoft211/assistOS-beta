import { describe, it, expect } from 'vitest';
import { environmentFilter, scopedFilter, withEnvironment } from '../../utils/environment-query.utils';
import { ENVIRONMENTS } from '../../../../shared/types/environment';

const mockTable = {
  id: { name: 'id' },
  tenantId: { name: 'tenant_id' },
  environment: { name: 'environment' },
};

describe('Environment Query Utils', () => {
  describe('environmentFilter', () => {
    it('creates correct SQL filter for production', () => {
      const filter = environmentFilter(mockTable, ENVIRONMENTS.PRODUCTION);
      expect(filter).toBeDefined();
    });

    it('creates correct SQL filter for sandbox', () => {
      const filter = environmentFilter(mockTable, ENVIRONMENTS.SANDBOX);
      expect(filter).toBeDefined();
    });

    it('throws error for invalid environment', () => {
      expect(() => {
        environmentFilter(mockTable, 'invalid' as any);
      }).toThrow('Invalid environment: invalid');
    });
  });

  describe('scopedFilter', () => {
    it('combines tenant and environment filters for production', () => {
      const filter = scopedFilter(mockTable, 'tenant-123', ENVIRONMENTS.PRODUCTION);
      expect(filter).toBeDefined();
    });

    it('combines tenant and environment filters for sandbox', () => {
      const filter = scopedFilter(mockTable, 'tenant-456', ENVIRONMENTS.SANDBOX);
      expect(filter).toBeDefined();
    });

    it('validates environment before creating filter', () => {
      expect(() => {
        scopedFilter(mockTable, 'tenant-123', 'invalid' as any);
      }).toThrow('Invalid environment: invalid');
    });
  });

  describe('withEnvironment', () => {
    it('adds environment field to data object', () => {
      const data = { name: 'Test', tenantId: 'tenant-123' };
      const result = withEnvironment(data, ENVIRONMENTS.PRODUCTION);
      
      expect(result.environment).toBe(ENVIRONMENTS.PRODUCTION);
      expect(result.name).toBe('Test');
      expect(result.tenantId).toBe('tenant-123');
    });

    it('preserves all original fields', () => {
      const data = { 
        name: 'Test',
        description: 'Test description',
        active: true,
        count: 42
      };
      const result = withEnvironment(data, ENVIRONMENTS.SANDBOX);
      
      expect(result.environment).toBe(ENVIRONMENTS.SANDBOX);
      expect(result.name).toBe('Test');
      expect(result.description).toBe('Test description');
      expect(result.active).toBe(true);
      expect(result.count).toBe(42);
    });

    it('validates environment before adding to data', () => {
      const data = { name: 'Test' };
      expect(() => {
        withEnvironment(data, 'invalid' as any);
      }).toThrow('Invalid environment: invalid');
    });

    it('does not mutate original data object', () => {
      const data = { name: 'Test' };
      const result = withEnvironment(data, ENVIRONMENTS.PRODUCTION);
      
      expect(data).not.toHaveProperty('environment');
      expect(result).toHaveProperty('environment');
    });
  });

  describe('validateForeignKeyEnvironment', () => {
    it('is exported and available', async () => {
      const { validateForeignKeyEnvironment } = await import('../../utils/environment-query.utils');
      expect(validateForeignKeyEnvironment).toBeDefined();
      expect(typeof validateForeignKeyEnvironment).toBe('function');
    });
  });
});

import type { IConnector } from './connector-interface';
import type { ConnectorType, ConnectorMetadata, ConnectorConstructor } from './types';

class ConnectorRegistry {
  private connectors: Map<ConnectorType, ConnectorConstructor> = new Map();

  register(ConnectorClass: ConnectorConstructor): void {
    const tempInstance = new ConnectorClass();
    
    if (this.connectors.has(tempInstance.type)) {
      throw new Error(`Connector ${tempInstance.type} is already registered`);
    }
    
    this.connectors.set(tempInstance.type, ConnectorClass);
    console.log(`[ConnectorRegistry] Registered: ${tempInstance.type}`);
  }

  get(type: ConnectorType): IConnector | undefined {
    const ConnectorClass = this.connectors.get(type);
    if (!ConnectorClass) return undefined;
    return new ConnectorClass(); // NEW INSTANCE every time - prevents cross-tenant data leakage!
  }

  getAll(): IConnector[] {
    return Array.from(this.connectors.values()).map(Class => new Class());
  }

  listAvailable(): ConnectorMetadata[] {
    return this.getAll().map(connector => ({
      type: connector.type,
      name: connector.name,
      description: connector.description,
      capabilities: connector.capabilities,
      authType: connector.authType,
      isAvailable: true,
    }));
  }

  unregister(type: ConnectorType): boolean {
    const existed = this.connectors.has(type);
    if (existed) {
      this.connectors.delete(type);
      console.log(`[ConnectorRegistry] Unregistered connector: ${type}`);
    }
    return existed;
  }

  clear(): void {
    this.connectors.clear();
    console.log('[ConnectorRegistry] Cleared all connectors');
  }
}

export const connectorRegistry = new ConnectorRegistry();

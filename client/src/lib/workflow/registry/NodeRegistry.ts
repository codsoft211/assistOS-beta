import { INodeDefinition } from '../types/workflow.types';

/**
 * Node Registry - Singleton pattern for registering and managing workflow node types
 * Follows Open/Closed Principle: Open for extension (new nodes), closed for modification
 */
export class NodeRegistry {
  private static instance: NodeRegistry;
  private definitions = new Map<string, INodeDefinition>();
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  static getInstance(): NodeRegistry {
    if (!NodeRegistry.instance) {
      NodeRegistry.instance = new NodeRegistry();
    }
    return NodeRegistry.instance;
  }
  
  /**
   * Register a new node type definition
   * @throws Error if node type already exists
   */
  register(definition: INodeDefinition): void {
    if (this.definitions.has(definition.type)) {
      console.warn(`Node type '${definition.type}' already registered, skipping`);
      return;
    }
    this.definitions.set(definition.type, definition);
  }
  
  /**
   * Get node definition by type
   * @throws Error if node type not found
   */
  get(type: string): INodeDefinition {
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new Error(`Node type '${type}' not found in registry`);
    }
    return definition;
  }
  
  /**
   * Check if node type exists
   */
  has(type: string): boolean {
    return this.definitions.has(type);
  }
  
  /**
   * Get all registered node definitions
   */
  getAll(): INodeDefinition[] {
    return Array.from(this.definitions.values());
  }
  
  /**
   * Get node definitions by category
   */
  getByCategory(category: string): INodeDefinition[] {
    return this.getAll().filter(d => d.category === category);
  }
  
  /**
   * Unregister a node type (useful for testing/plugins)
   */
  unregister(type: string): boolean {
    return this.definitions.delete(type);
  }
  
  /**
   * Clear all registrations (useful for testing)
   */
  clear(): void {
    this.definitions.clear();
  }
}

// Export singleton instance
export const nodeRegistry = NodeRegistry.getInstance();

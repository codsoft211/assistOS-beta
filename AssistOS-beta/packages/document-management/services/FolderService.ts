/**
 * Folder Service
 * 
 * Service for managing hierarchical document folders, including creation, updates,
 * deletion, and linking documents to folders. Supports Portuguese fiscal year templates.
 */

import { eq, and, sql, desc, isNull, inArray } from 'drizzle-orm';
import { db } from '../../../apps/api/db';
import {
  documentFolders,
  documentFolderLinks,
  documents,
  SelectDocumentFolder,
  InsertDocumentFolder,
  InsertDocumentFolderLink,
} from '../../../shared/schema';

// ═══════════════════════════════════════════════════════════════════════════════
// Error Classes
// ═══════════════════════════════════════════════════════════════════════════════

export class FolderNotFoundError extends Error {
  constructor(folderId: string) {
    super(`Folder not found: ${folderId}`);
    this.name = 'FolderNotFoundError';
  }
}

export class FolderPathConflictError extends Error {
  constructor(path: string) {
    super(`Folder path already exists: ${path}`);
    this.name = 'FolderPathConflictError';
  }
}

export class InvalidFolderOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFolderOperationError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface FolderTreeNode extends SelectDocumentFolder {
  children: FolderTreeNode[];
  documentCount?: number;
}

export interface CreateFolderInput {
  name: string;
  parentFolderId?: string | null;
  description?: string;
  folderType?: string;
  metadata?: Record<string, any>;
}

export interface UpdateFolderInput {
  name?: string;
  parentFolderId?: string | null;
  description?: string;
  folderType?: string;
  metadata?: Record<string, any>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Service
// ═══════════════════════════════════════════════════════════════════════════════

export class FolderService {
  /**
   * Create a new folder
   * 
   * @param tenantId - Tenant ID
   * @param userId - User ID creating the folder
   * @param input - Folder creation input
   * @returns Created folder
   */
  async createFolder(
    tenantId: string,
    userId: string,
    input: CreateFolderInput
  ): Promise<SelectDocumentFolder> {
    // Calculate path based on parent
    const path = await this.calculateFolderPath(tenantId, input.name, input.parentFolderId);

    // Create folder
    const result = await db.insert(documentFolders).values({
      tenantId,
      parentFolderId: input.parentFolderId || null,
      name: input.name,
      path,
      description: input.description,
      folderType: input.folderType,
      metadata: input.metadata || {},
      createdBy: userId,
    }).returning() as SelectDocumentFolder[];

    return result[0];
  }

  /**
   * Get all folders for a tenant (flat list)
   * 
   * @param tenantId - Tenant ID
   * @returns List of folders
   */
  async getFoldersByTenant(tenantId: string): Promise<SelectDocumentFolder[]> {
    const folders = await db
      .select()
      .from(documentFolders)
      .where(eq(documentFolders.tenantId, tenantId))
      .orderBy(documentFolders.path);

    return folders;
  }

  /**
   * Get folder tree structure (hierarchical)
   * 
   * @param tenantId - Tenant ID
   * @returns Hierarchical tree of folders
   */
  async getFolderTree(tenantId: string): Promise<FolderTreeNode[]> {
    const folders = await this.getFoldersByTenant(tenantId);
    
    // Get document counts for each folder
    const folderDocCounts = await this.getFolderDocumentCounts(tenantId);
    const countsMap = new Map(folderDocCounts.map(f => [f.folderId, f.count]));

    // Build tree structure
    const folderMap = new Map<string, FolderTreeNode>();
    const rootFolders: FolderTreeNode[] = [];

    // First pass: create nodes with document counts
    folders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        children: [],
        documentCount: countsMap.get(folder.id) || 0,
      });
    });

    // Second pass: build hierarchy
    folders.forEach(folder => {
      const node = folderMap.get(folder.id)!;
      if (folder.parentFolderId) {
        const parent = folderMap.get(folder.parentFolderId);
        if (parent) {
          parent.children.push(node);
        }
      } else {
        rootFolders.push(node);
      }
    });

    return rootFolders;
  }

  /**
   * Get a specific folder by ID
   * 
   * @param folderId - Folder ID
   * @param tenantId - Tenant ID for validation
   * @returns Folder details
   */
  async getFolderById(folderId: string, tenantId: string): Promise<SelectDocumentFolder> {
    const [folder] = await db
      .select()
      .from(documentFolders)
      .where(and(
        eq(documentFolders.id, folderId),
        eq(documentFolders.tenantId, tenantId)
      ))
      .limit(1);

    if (!folder) {
      throw new FolderNotFoundError(folderId);
    }

    return folder;
  }

  /**
   * Update a folder
   * 
   * @param folderId - Folder ID
   * @param tenantId - Tenant ID for validation
   * @param userId - User ID performing the update
   * @param input - Update input
   * @returns Updated folder
   */
  async updateFolder(
    folderId: string,
    tenantId: string,
    userId: string,
    input: UpdateFolderInput
  ): Promise<SelectDocumentFolder> {
    // Verify folder exists
    const existingFolder = await this.getFolderById(folderId, tenantId);

    // If parent is changing or name is changing, recalculate path
    let newPath = existingFolder.path;
    if (input.name || input.parentFolderId !== undefined) {
      const newName = input.name || existingFolder.name;
      const newParentId = input.parentFolderId !== undefined 
        ? input.parentFolderId 
        : existingFolder.parentFolderId;

      // Prevent circular references
      if (newParentId) {
        await this.validateNoCircularReference(folderId, newParentId, tenantId);
      }

      newPath = await this.calculateFolderPath(tenantId, newName, newParentId);
    }

    // Update folder
    const [updatedFolder] = await db.update(documentFolders)
      .set({
        ...input,
        path: newPath,
        updatedAt: new Date(),
      })
      .where(and(
        eq(documentFolders.id, folderId),
        eq(documentFolders.tenantId, tenantId)
      ))
      .returning();

    // If path changed, update all child folders' paths recursively
    if (newPath !== existingFolder.path) {
      await this.updateChildFolderPaths(folderId, tenantId);
    }

    return updatedFolder;
  }

  /**
   * Delete a folder
   * 
   * @param folderId - Folder ID
   * @param tenantId - Tenant ID for validation
   * @param deleteDocuments - Whether to delete documents in folder
   */
  async deleteFolder(
    folderId: string,
    tenantId: string,
    deleteDocuments: boolean = false
  ): Promise<void> {
    // Verify folder exists
    await this.getFolderById(folderId, tenantId);

    if (deleteDocuments) {
      // Delete all documents in folder and subfolder
      const allFolderIds = await this.getAllSubfolderIds(folderId, tenantId);
      allFolderIds.push(folderId);

      // Get all documents in these folders
      const docIds = await db
        .select({ documentId: documentFolderLinks.documentId })
        .from(documentFolderLinks)
        .where(and(
          inArray(documentFolderLinks.folderId, allFolderIds),
          eq(documentFolderLinks.tenantId, tenantId)
        ));

      // Delete documents
      if (docIds.length > 0) {
        const documentIds = docIds.map(d => d.documentId);
        await db.delete(documents)
          .where(and(
            inArray(documents.id, documentIds),
            eq(documents.tenantId, tenantId)
          ));
      }
    } else {
      // Just unlink documents from folder
      await db.delete(documentFolderLinks)
        .where(and(
          eq(documentFolderLinks.folderId, folderId),
          eq(documentFolderLinks.tenantId, tenantId)
        ));
    }

    // Delete folder (cascade will delete children and links)
    await db.delete(documentFolders)
      .where(and(
        eq(documentFolders.id, folderId),
        eq(documentFolders.tenantId, tenantId)
      ));
  }

  /**
   * Add documents to a folder
   * 
   * @param folderId - Folder ID
   * @param tenantId - Tenant ID
   * @param documentIds - Array of document IDs to add
   * @param isPrimary - Whether this should be the primary folder for documents
   */
  async addDocumentsToFolder(
    folderId: string,
    tenantId: string,
    documentIds: string[],
    isPrimary: boolean = false
  ): Promise<void> {
    // Verify folder exists
    await this.getFolderById(folderId, tenantId);

    // If setting as primary, unset existing primary folders
    if (isPrimary) {
      await db.update(documentFolderLinks)
        .set({ isPrimary: false })
        .where(and(
          inArray(documentFolderLinks.documentId, documentIds),
          eq(documentFolderLinks.tenantId, tenantId)
        ));
    }

    // Insert new links (ignore conflicts)
    const values = documentIds.map(docId => ({
      tenantId,
      documentId: docId,
      folderId,
      isPrimary,
    }));

    await db.insert(documentFolderLinks)
      .values(values)
      .onConflictDoNothing();
  }

  /**
   * Remove documents from a folder
   * 
   * @param folderId - Folder ID
   * @param tenantId - Tenant ID
   * @param documentIds - Array of document IDs to remove
   */
  async removeDocumentsFromFolder(
    folderId: string,
    tenantId: string,
    documentIds: string[]
  ): Promise<void> {
    await db.delete(documentFolderLinks)
      .where(and(
        eq(documentFolderLinks.folderId, folderId),
        inArray(documentFolderLinks.documentId, documentIds),
        eq(documentFolderLinks.tenantId, tenantId)
      ));
  }

  /**
   * Move documents from one folder to another
   * 
   * @param sourceFolderId - Source folder ID
   * @param targetFolderId - Target folder ID
   * @param tenantId - Tenant ID
   * @param documentIds - Array of document IDs to move
   */
  async moveDocuments(
    sourceFolderId: string,
    targetFolderId: string,
    tenantId: string,
    documentIds: string[]
  ): Promise<void> {
    // Verify both folders exist
    await this.getFolderById(sourceFolderId, tenantId);
    await this.getFolderById(targetFolderId, tenantId);

    // Remove from source
    await this.removeDocumentsFromFolder(sourceFolderId, tenantId, documentIds);

    // Add to target
    await this.addDocumentsToFolder(targetFolderId, tenantId, documentIds, false);
  }

  /**
   * Get documents in a folder
   * 
   * @param folderId - Folder ID
   * @param tenantId - Tenant ID
   * @param includeSubfolders - Whether to include documents from subfolders
   * @returns List of document IDs
   */
  async getDocumentsInFolder(
    folderId: string,
    tenantId: string,
    includeSubfolders: boolean = false
  ): Promise<string[]> {
    const folderIds = includeSubfolders 
      ? [...await this.getAllSubfolderIds(folderId, tenantId), folderId]
      : [folderId];

    const links = await db
      .select({ documentId: documentFolderLinks.documentId })
      .from(documentFolderLinks)
      .where(and(
        inArray(documentFolderLinks.folderId, folderIds),
        eq(documentFolderLinks.tenantId, tenantId)
      ));

    return links.map(link => link.documentId);
  }

  /**
   * Create Portuguese fiscal year template structure
   * 
   * @param tenantId - Tenant ID
   * @param userId - User ID creating the template
   * @param year - Fiscal year (e.g., 2025)
   * @returns Root folder of the fiscal year structure
   */
  async createFiscalYearTemplate(
    tenantId: string,
    userId: string,
    year: number
  ): Promise<SelectDocumentFolder> {
    // Create root fiscal year folder
    const rootFolder = await this.createFolder(tenantId, userId, {
      name: `Fiscal ${year}`,
      folderType: 'fiscal',
      metadata: { year, isTemplate: true },
    });

    // Create subfolders
    const subfolders = [
      'Faturas',
      'Notas de Crédito',
      'Recibos',
      'Contratos',
      'Comprovantes',
      'Outros Documentos Fiscais',
    ];

    for (const folderName of subfolders) {
      await this.createFolder(tenantId, userId, {
        name: folderName,
        parentFolderId: rootFolder.id,
        folderType: 'fiscal',
        metadata: { year, category: folderName },
      });
    }

    return rootFolder;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // Private Helper Methods
  // ═══════════════════════════════════════════════════════════════════════════════

  /**
   * Calculate folder path based on parent hierarchy
   */
  private async calculateFolderPath(
    tenantId: string,
    name: string,
    parentFolderId?: string | null
  ): Promise<string> {
    if (!parentFolderId) {
      return `/${name}`;
    }

    const [parent] = await db
      .select({ path: documentFolders.path })
      .from(documentFolders)
      .where(and(
        eq(documentFolders.id, parentFolderId),
        eq(documentFolders.tenantId, tenantId)
      ))
      .limit(1);

    if (!parent) {
      throw new FolderNotFoundError(parentFolderId);
    }

    return `${parent.path}/${name}`;
  }

  /**
   * Update paths of all child folders recursively
   */
  private async updateChildFolderPaths(
    folderId: string,
    tenantId: string
  ): Promise<void> {
    const children = await db
      .select()
      .from(documentFolders)
      .where(and(
        eq(documentFolders.parentFolderId, folderId),
        eq(documentFolders.tenantId, tenantId)
      ));

    for (const child of children) {
      const newPath = await this.calculateFolderPath(
        tenantId,
        child.name,
        child.parentFolderId
      );

      await db.update(documentFolders)
        .set({ path: newPath, updatedAt: new Date() })
        .where(eq(documentFolders.id, child.id));

      // Recursively update children
      await this.updateChildFolderPaths(child.id, tenantId);
    }
  }

  /**
   * Get all subfolder IDs recursively
   */
  private async getAllSubfolderIds(
    folderId: string,
    tenantId: string
  ): Promise<string[]> {
    const children = await db
      .select({ id: documentFolders.id })
      .from(documentFolders)
      .where(and(
        eq(documentFolders.parentFolderId, folderId),
        eq(documentFolders.tenantId, tenantId)
      ));

    const ids: string[] = [];
    for (const child of children) {
      ids.push(child.id);
      const subIds = await this.getAllSubfolderIds(child.id, tenantId);
      ids.push(...subIds);
    }

    return ids;
  }

  /**
   * Validate that moving a folder won't create a circular reference
   */
  private async validateNoCircularReference(
    folderId: string,
    newParentId: string,
    tenantId: string
  ): Promise<void> {
    // Can't be its own parent
    if (folderId === newParentId) {
      throw new InvalidFolderOperationError('A folder cannot be its own parent');
    }

    // Check if newParentId is a descendant of folderId
    const descendants = await this.getAllSubfolderIds(folderId, tenantId);
    if (descendants.includes(newParentId)) {
      throw new InvalidFolderOperationError('Cannot move folder to one of its descendants');
    }
  }

  /**
   * Get document counts for all folders
   */
  private async getFolderDocumentCounts(
    tenantId: string
  ): Promise<Array<{ folderId: string; count: number }>> {
    const results = await db
      .select({
        folderId: documentFolderLinks.folderId,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(documentFolderLinks)
      .where(eq(documentFolderLinks.tenantId, tenantId))
      .groupBy(documentFolderLinks.folderId);

    return results;
  }
}

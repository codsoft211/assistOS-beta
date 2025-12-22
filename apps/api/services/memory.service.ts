// Migrated from AssistOS legacy - Phase 2
// TODO: Add conversation_messages table to shared/schema.ts with the following structure:
// - id: serial (primary key)
// - tenantId: varchar (references tenants.id)
// - userId: varchar (references users.id)
// - agentType: text
// - role: text ("user" | "assistant")
// - content: text
// - embedding: vector(1536) -- requires pgvector extension
// - metadata: jsonb
// - createdAt: timestamp
import { db } from "../db";
import { learnedPreferences } from "../../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { embeddingService } from "./embedding.service";

export interface ConversationMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  agentType: string;
  metadata?: any;
  createdAt: Date;
}

export interface SimilarMessage extends ConversationMessage {
  similarity: number;
}

export class MemoryService {
  /**
   * Salva mensagem com embedding automático
   * TODO: Re-enable when conversation_messages table is added to schema
   */
  async saveMessage(
    tenantId: string,
    userId: string,
    agentType: string,
    role: "user" | "assistant",
    content: string,
    metadata?: any
  ): Promise<number> {
    console.log(`[Memory] saveMessage disabled - conversation_messages table not yet in schema`);
    console.log(`[Memory] Would save ${role} message (${content.length} chars) for user ${userId}`);
    return 0;
    
    // TODO: Re-enable this code when conversation_messages table exists:
    // try {
    //   const embedding = await embeddingService.generateEmbedding(content);
    //   const result = await db.insert(conversationMessages).values({
    //     tenantId,
    //     userId,
    //     agentType,
    //     role,
    //     content,
    //     embedding: sql`${JSON.stringify(embedding)}::vector`,
    //     metadata,
    //   }).returning();
    //   console.log(`[Memory] Saved ${role} message (${content.length} chars) for user ${userId}`);
    //   return result[0].id;
    // } catch (error) {
    //   console.error("[Memory] Error saving message:", error);
    //   throw error;
    // }
  }
  
  /**
   * Busca mensagens similares usando vector search
   * TODO: Re-enable when conversation_messages table is added to schema
   */
  async findSimilarMessages(
    tenantId: string,
    userId: string,
    query: string,
    limit: number = 5,
    agentType?: string
  ): Promise<SimilarMessage[]> {
    console.log(`[Memory] findSimilarMessages disabled - conversation_messages table not yet in schema`);
    return [];
    
    // TODO: Re-enable this code when conversation_messages table exists:
    // try {
    //   const queryEmbedding = await embeddingService.generateEmbedding(query);
    //   const agentFilter = agentType ? sql`AND agent_type = ${agentType}` : sql``;
    //   const results = await db.execute(sql`
    //     SELECT 
    //       id, tenant_id, user_id, agent_type, role, content, metadata, created_at,
    //       1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) as similarity
    //     FROM conversation_messages
    //     WHERE tenant_id = ${tenantId} 
    //       AND user_id = ${userId}
    //       ${agentFilter}
    //     ORDER BY embedding <=> ${JSON.stringify(queryEmbedding)}::vector
    //     LIMIT ${limit}
    //   `);
    //   return results.rows.map((row: any) => ({
    //     id: row.id,
    //     role: row.role,
    //     content: row.content,
    //     agentType: row.agent_type,
    //     metadata: row.metadata,
    //     createdAt: row.created_at,
    //     similarity: row.similarity,
    //   }));
    // } catch (error) {
    //   console.error("[Memory] Error finding similar messages:", error);
    //   return [];
    // }
  }
  
  /**
   * Carrega TODAS as mensagens do histórico (contexto completo)
   * TODO: Re-enable when conversation_messages table is added to schema
   */
  async getRecentMessages(
    tenantId: string,
    userId: string,
    agentType: string,
    limit?: number
  ): Promise<ConversationMessage[]> {
    console.log(`[Memory] getRecentMessages disabled - conversation_messages table not yet in schema`);
    return [];
    
    // TODO: Re-enable this code when conversation_messages table exists:
    // const messages = await db.query.conversationMessages.findMany({
    //   where: and(
    //     eq(conversationMessages.tenantId, tenantId),
    //     eq(conversationMessages.userId, userId),
    //     eq(conversationMessages.agentType, agentType)
    //   ),
    //   orderBy: [conversationMessages.createdAt],
    //   ...(limit && { limit }),
    // });
    // return messages.map((msg: any) => ({
    //   id: msg.id,
    //   role: msg.role as "user" | "assistant",
    //   content: msg.content,
    //   agentType: msg.agentType,
    //   metadata: msg.metadata,
    //   createdAt: msg.createdAt,
    // }));
  }
  
  /**
   * Carrega preferências aprendidas
   */
  async getLearnedPreferences(
    tenantId: string,
    userId: string
  ): Promise<Record<string, any>> {
    const prefs = await db.query.learnedPreferences.findMany({
      where: and(
        eq(learnedPreferences.tenantId, tenantId),
        eq(learnedPreferences.userId, userId)
      ),
      orderBy: [desc(learnedPreferences.confidence)],
    });
    
    const grouped: Record<string, any> = {};
    
    for (const pref of prefs) {
      if (!grouped[pref.category]) {
        grouped[pref.category] = {};
      }
      grouped[pref.category][pref.preferenceKey] = {
        value: pref.preferenceValue,
        confidence: pref.confidence,
        timesReinforced: pref.timesReinforced,
      };
    }
    
    return grouped;
  }
  
  /**
   * Salva preferência aprendida
   */
  async savePreference(
    tenantId: string,
    userId: string,
    category: string,
    key: string,
    value: string,
    source: string,
    confidence: number = 1.0,
    extractedFromMessageId?: number
  ) {
    // Verifica se já existe
    const existing = await db.query.learnedPreferences.findFirst({
      where: and(
        eq(learnedPreferences.tenantId, tenantId),
        eq(learnedPreferences.userId, userId),
        eq(learnedPreferences.category, category),
        eq(learnedPreferences.preferenceKey, key)
      ),
    });
    
    if (existing) {
      // Atualiza e reforça
      await db.update(learnedPreferences)
        .set({
          preferenceValue: value,
          confidence: Math.min(1.0, existing.confidence + 0.1),
          timesReinforced: existing.timesReinforced + 1,
          lastReinforcedAt: new Date(),
        })
        .where(eq(learnedPreferences.id, existing.id));
      
      console.log(`[Memory] Reinforced preference: ${category}.${key} = ${value} (confidence: ${(existing.confidence + 0.1).toFixed(2)})`);
    } else {
      // Cria nova
      await db.insert(learnedPreferences).values({
        tenantId,
        userId,
        category,
        preferenceKey: key,
        preferenceValue: value,
        confidence,
        source,
        extractedFrom: extractedFromMessageId,
      });
      
      console.log(`[Memory] Learned new preference: ${category}.${key} = ${value}`);
    }
  }
  
  /**
   * Salva feedback do utilizador
   * NOTE: Disabled - userFeedback table not in clean schema
   */
  async saveFeedback(
    tenantId: string,
    userId: string,
    messageId: number,
    feedbackType: 'thumbs_up' | 'thumbs_down' | 'correction',
    correctionText?: string,
    metadata?: any
  ) {
    console.log(`[Memory] Feedback feature disabled - userFeedback table not available`);
    // TODO: Re-enable when userFeedback table is added to schema
  }
}

export const memoryService = new MemoryService();

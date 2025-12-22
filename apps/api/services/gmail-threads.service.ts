/**
 * Gmail Thread Management Service
 * Groups and manages email threads
 */

import { db } from "../db";
import { emailInbox } from "../../../shared/schema";
import { eq, and, desc } from "drizzle-orm";

export interface ThreadMessage {
  id: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string | null;
  subject: string | null;
  snippet: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isRead: boolean | null;
  isStarred: boolean | null;
  receivedAt: Date;
  attachments: any;
}

export interface ThreadSummary {
  threadId: string;
  messageCount: number;
  participants: string[];
  subject: string | null;
  lastMessageAt: Date;
  hasUnread: boolean;
  hasStarred: boolean;
  hasAttachments: boolean;
}

export class GmailThreadsService {
  /**
   * Get all messages in a thread
   */
  static async getThreadMessages(tenantId: string, threadId: string): Promise<ThreadMessage[]> {
    const messages = await db.query.emailInbox.findMany({
      where: and(
        eq(emailInbox.tenantId, tenantId),
        eq(emailInbox.threadId, threadId)
      ),
      orderBy: [desc(emailInbox.receivedAt)],
    });

    return messages.map(msg => ({
      id: msg.id,
      fromAddress: msg.fromAddress,
      fromName: msg.fromName,
      toAddress: msg.toAddress,
      subject: msg.subject,
      snippet: msg.snippet,
      bodyText: msg.bodyText,
      bodyHtml: msg.bodyHtml,
      isRead: msg.isRead,
      isStarred: msg.isStarred,
      receivedAt: msg.receivedAt,
      attachments: msg.attachments,
    }));
  }

  /**
   * Get summary information for a thread
   */
  static async getThreadSummary(tenantId: string, threadId: string): Promise<ThreadSummary | null> {
    const messages = await db.query.emailInbox.findMany({
      where: and(
        eq(emailInbox.tenantId, tenantId),
        eq(emailInbox.threadId, threadId)
      ),
      orderBy: [desc(emailInbox.receivedAt)],
    });

    if (messages.length === 0) {
      return null;
    }

    // Extract unique participants
    const participants = new Set<string>();
    let hasUnread = false;
    let hasStarred = false;
    let hasAttachments = false;

    messages.forEach(msg => {
      if (msg.fromAddress) participants.add(msg.fromAddress);
      if (msg.toAddress) {
        msg.toAddress.split(',').forEach(addr => participants.add(addr.trim()));
      }
      if (!msg.isRead) hasUnread = true;
      if (msg.isStarred) hasStarred = true;
      if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        hasAttachments = true;
      }
    });

    return {
      threadId,
      messageCount: messages.length,
      participants: Array.from(participants),
      subject: messages[0].subject,
      lastMessageAt: messages[0].receivedAt,
      hasUnread,
      hasStarred,
      hasAttachments,
    };
  }

  /**
   * Group emails by thread for inbox view
   */
  static async groupByThreads(tenantId: string, limit: number = 50): Promise<Map<string, ThreadMessage[]>> {
    const emails = await db.query.emailInbox.findMany({
      where: eq(emailInbox.tenantId, tenantId),
      orderBy: [desc(emailInbox.receivedAt)],
      limit: limit * 3, // Get more to account for threading
    });

    const threadMap = new Map<string, ThreadMessage[]>();

    emails.forEach(email => {
      const threadId = email.threadId || email.id; // Use email ID if no threadId
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      
      threadMap.get(threadId)!.push({
        id: email.id,
        fromAddress: email.fromAddress,
        fromName: email.fromName,
        toAddress: email.toAddress,
        subject: email.subject,
        snippet: email.snippet,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        isRead: email.isRead,
        isStarred: email.isStarred,
        receivedAt: email.receivedAt,
        attachments: email.attachments,
      });
    });

    // Sort messages within each thread by date descending
    threadMap.forEach(messages => {
      messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
    });

    return threadMap;
  }
}

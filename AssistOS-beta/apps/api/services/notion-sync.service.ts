import { Client } from '@notionhq/client';
import * as fs from 'fs/promises';
import * as path from 'path';

interface Bug {
  id: string;
  title: string;
  severity: 'P0' | 'P1' | 'P2';
  component: string;
  reporter: string;
  date: string;
  status: string;
  timeEstimate: string;
  description: string;
  impact: string;
  nextAction?: string;
  exitCriteria?: string[];
  notionPageId?: string;
  owner?: string;
  lastSynced?: Date;
  notionLastEditedTime?: Date;
  attachments?: Array<{ name: string; url: string }>;
}

interface SyncResult {
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: string[];
}

export class NotionSyncService {
  private notion: Client;
  private databaseId: string;
  private mdFilePath: string;

  constructor() {
    const apiKey = process.env.NOTION_API_KEY;
    const dbId = process.env.NOTION_DATABASE_ID;

    if (!apiKey || !dbId) {
      throw new Error('NOTION_API_KEY and NOTION_DATABASE_ID must be set');
    }

    this.notion = new Client({ auth: apiKey });
    this.databaseId = dbId;
    this.mdFilePath = path.join(process.cwd(), 'docs', 'TODO_GO_LIVE.md');
  }

  async syncBidirectional(): Promise<SyncResult> {
    const result: SyncResult = {
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: [],
    };

    try {
      console.log('🔄 Starting bidirectional sync...\n');

      const mdBugs = await this.parseMarkdownBugs();
      const notionPages = await this.fetchNotionPages();

      console.log(`📄 Found ${mdBugs.length} bugs in Markdown`);
      console.log(`📊 Found ${notionPages.length} pages in Notion\n`);

      const notionBugsMap = new Map(notionPages.map(bug => [bug.id, bug]));
      const mdBugsMap = new Map(mdBugs.map(bug => [bug.id, bug]));
      const pushedBugIds: string[] = [];

      for (const mdBug of mdBugs) {
        const notionBug = notionBugsMap.get(mdBug.id);

        if (!notionBug) {
          await this.createNotionPage(mdBug);
          result.pushed++;
          pushedBugIds.push(mdBug.id);
          console.log(`✅ Pushed: ${mdBug.id} → Notion`);
        } else {
          const conflict = this.detectConflict(mdBug, notionBug);
          if (conflict === 'md_newer') {
            await this.updateNotionPage(notionBug.notionPageId!, mdBug);
            result.pushed++;
            pushedBugIds.push(mdBug.id);
            console.log(`🔼 Updated: ${mdBug.id} (MD → Notion)`);
          } else if (conflict === 'notion_newer') {
            result.conflicts++;
            console.log(`⚠️  Conflict: ${mdBug.id} (Notion is newer, skipping)`);
          }
        }
      }

      // Update MD with timestamps for pushed bugs
      if (pushedBugIds.length > 0) {
        await this.updateMarkdownTimestamps(pushedBugIds);
        console.log(`\n✅ Updated ${pushedBugIds.length} timestamps in Markdown`);
      }

      for (const notionBug of notionPages) {
        if (!mdBugsMap.has(notionBug.id)) {
          result.pulled++;
          console.log(`📥 New from Notion: ${notionBug.id} (will update MD)`);
        }
      }

      if (result.pulled > 0 || result.conflicts > 0) {
        await this.updateMarkdownFromNotion(notionPages);
        console.log(`\n✅ Updated Markdown with ${result.pulled} new bugs from Notion`);
      }

      console.log('\n📊 Sync Summary:');
      console.log(`   Pushed to Notion: ${result.pushed}`);
      console.log(`   Pulled from Notion: ${result.pulled}`);
      console.log(`   Conflicts detected: ${result.conflicts}`);

      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMsg);
      console.error('❌ Sync error:', errorMsg);
      return result;
    }
  }

  private async parseMarkdownBugs(): Promise<Bug[]> {
    const content = await fs.readFile(this.mdFilePath, 'utf-8');
    const bugs: Bug[] = [];

    const bugSections = content.split(/(?=###\s+\*\*)/);

    for (const section of bugSections) {
      if (!section.trim()) continue;

      const titleMatch = section.match(/###\s+\*\*(.+?)\*\*/);
      if (!titleMatch) continue;

      const title = titleMatch[1].trim();
      
      const bugIdMatch = title.match(/(?:BUG|BLOCKER|UX)\s*#?(\d+)/i);
      if (!bugIdMatch) continue;

      const bugId = `BUG${bugIdMatch[1]}`;

      const severityMatch = section.match(/\*\*Severity:\*\*\s*([🔴🟠🟡])\s*(P\d)\s*(\w*)/);
      const componentMatch = section.match(/\*\*Component:\*\*\s*(.+?)(?:\n|\*\*)/);
      const reporterMatch = section.match(/\*\*Reported by:\*\*\s*(.+?)(?:\n|\*\*)/);
      const dateMatch = section.match(/\*\*Date:\*\*\s*(.+?)(?:\n|\*\*)/);
      const statusMatch = section.match(/\*\*Status:\*\*\s*(.+?)(?:\n|\*\*)/);
      const lastSyncedMatch = section.match(/\*\*Last Synced:\*\*\s*(.+?)(?:\n|\*\*)/);
      const timeMatch = section.match(/\*\*Time Estimate:\*\*\s*(.+?)(?:\n|$)/);

      const descMatch = section.match(/####\s+\*\*Description:\*\*\s+(.+?)(?=####|$)/s);
      const impactMatch = section.match(/####\s+\*\*Impact:\*\*\s+(.+?)(?=####|$)/s);
      const nextActionMatch = section.match(/####\s+\*\*(?:Next Action|Investigation Plan):\*\*\s+(.+?)(?=####|$)/s);
      const exitMatch = section.match(/####\s+\*\*Exit Criteria.*?:\*\*\s+((?:- \[.\].+?\n?)+)/s);
      const attachmentsMatch = section.match(/####\s+\*\*Attachments:\*\*\s+((?:- \[.+?\]\(.+?\)\n?)+)/s);

      const severityMap: Record<string, 'P0' | 'P1' | 'P2'> = {
        'P0': 'P0',
        'P1': 'P1',
        'P2': 'P2',
      };

      const severity = severityMatch ? severityMap[severityMatch[2]] || 'P2' : 'P2';

      const exitCriteria = exitMatch
        ? exitMatch[1].split('\n').filter(line => line.trim().startsWith('- [')).map(line => line.trim())
        : [];

      let attachments: Array<{ name: string; url: string }> = [];
      if (attachmentsMatch) {
        const links = attachmentsMatch[1].match(/- \[(.+?)\]\((.+?)\)/g) || [];
        attachments = links.map(link => {
          const match = link.match(/- \[(.+?)\]\((.+?)\)/);
          return {
            name: match?.[1] || 'Untitled',
            url: match?.[2] || '',
          };
        });
      }

      let lastSynced: Date | undefined = undefined;
      if (lastSyncedMatch) {
        try {
          const timestamp = lastSyncedMatch[1].trim();
          lastSynced = new Date(timestamp);
          if (isNaN(lastSynced.getTime())) {
            lastSynced = undefined;
          }
        } catch {
          lastSynced = undefined;
        }
      }

      bugs.push({
        id: bugId,
        title: title.trim(),
        severity,
        component: componentMatch ? componentMatch[1].trim() : 'Unknown',
        reporter: reporterMatch ? reporterMatch[1].trim() : 'Unknown',
        date: dateMatch ? dateMatch[1].trim() : '',
        status: statusMatch ? statusMatch[1].trim() : '',
        timeEstimate: timeMatch ? timeMatch[1].trim() : 'Unknown',
        description: descMatch ? descMatch[1].trim() : '',
        impact: impactMatch ? impactMatch[1].trim() : '',
        nextAction: nextActionMatch ? nextActionMatch[1].trim() : undefined,
        exitCriteria,
        lastSynced,
        attachments,
      });
    }

    console.log(`\n🔍 Parser found ${bugs.length} bugs`);
    if (bugs.length > 0) {
      console.log('   Sample bug IDs:', bugs.slice(0, 3).map(b => b.id).join(', '));
    }

    return bugs;
  }

  private async fetchNotionPages(): Promise<Bug[]> {
    const response = await this.notion.dataSources.query({
      data_source_id: this.databaseId,
    });

    return response.results.map(page => {
      if (!('properties' in page)) {
        throw new Error('Invalid page structure');
      }

      const props = page.properties;

      const getTextProperty = (prop: any): string => {
        if (!prop) return '';
        if (prop.type === 'title' && prop.title.length > 0) {
          return prop.title[0]?.plain_text || '';
        }
        if (prop.type === 'rich_text' && prop.rich_text.length > 0) {
          return prop.rich_text[0]?.plain_text || '';
        }
        return '';
      };

      const getSelectProperty = (prop: any): string => {
        return prop?.select?.name || '';
      };

      const getDateProperty = (prop: any): Date | undefined => {
        return prop?.date?.start ? new Date(prop.date.start) : undefined;
      };

      const getFilesProperty = (prop: any): Array<{ name: string; url: string }> => {
        if (!prop || prop.type !== 'files') return [];
        return prop.files.map((file: any) => ({
          name: file.name || 'Untitled',
          url: file.type === 'external' ? file.external.url : file.file.url,
        }));
      };

      const notionLastEditedTime = new Date(page.last_edited_time);

      return {
        id: getTextProperty(props['Bug ID']),
        title: getTextProperty(props['Title']) || getTextProperty(props['Name']),
        severity: (getSelectProperty(props['Severity']) || 'P2') as 'P0' | 'P1' | 'P2',
        component: getTextProperty(props['Component']),
        reporter: getTextProperty(props['Reporter']),
        date: props['Date']?.date?.start || '',
        owner: props['Owner']?.people?.[0]?.name || '',
        status: getSelectProperty(props['Status']),
        timeEstimate: getTextProperty(props['DateTime Estimate']),
        description: getTextProperty(props['Description']),
        impact: getTextProperty(props['Impact']),
        nextAction: getTextProperty(props['Next Action']),
        exitCriteria: getTextProperty(props['Exit Criteria'])?.split('\n') || [],
        notionPageId: page.id,
        lastSynced: getDateProperty(props['Last Synced']),
        notionLastEditedTime,
        attachments: props['Attachment'] ? getFilesProperty(props['Attachment']) : [],
      };
    });
  }

  private async createNotionPage(bug: Bug): Promise<void> {
    const severityEmojiMap: Record<string, string> = {
      P0: '🔴 P0',
      P1: '🟠 P1',
      P2: '🟡 P2',
    };

    const properties: any = {
      'Title': {
        title: [{ text: { content: bug.title.substring(0, 2000) } }],
      },
    };

    if (bug.id) {
      properties['Bug ID'] = {
        rich_text: [{ text: { content: bug.id } }],
      };
    }

    if (bug.severity) {
      properties['Severity'] = {
        select: { name: severityEmojiMap[bug.severity] },
      };
    }

    if (bug.status) {
      properties['Status'] = {
        select: { name: bug.status.substring(0, 100) },
      };
    }

    if (bug.component) {
      properties['Component'] = {
        rich_text: [{ text: { content: bug.component.substring(0, 2000) } }],
      };
    }

    if (bug.reporter) {
      properties['Reporter'] = {
        rich_text: [{ text: { content: bug.reporter } }],
      };
    }

    if (bug.date) {
      try {
        const dateObj = new Date(bug.date);
        if (!isNaN(dateObj.getTime())) {
          properties['Date'] = {
            date: { start: dateObj.toISOString().split('T')[0] },
          };
        }
      } catch {
        // Ignore date parsing errors
      }
    }

    if (bug.timeEstimate) {
      properties['DateTime Estimate'] = {
        rich_text: [{ text: { content: bug.timeEstimate.substring(0, 2000) } }],
      };
    }

    if (bug.description) {
      properties['Description'] = {
        rich_text: [{ text: { content: bug.description.substring(0, 2000) } }],
      };
    }

    if (bug.impact) {
      properties['Impact'] = {
        rich_text: [{ text: { content: bug.impact.substring(0, 2000) } }],
      };
    }

    if (bug.exitCriteria && bug.exitCriteria.length > 0) {
      properties['Exit Criteria'] = {
        rich_text: [{ text: { content: bug.exitCriteria.join('\n').substring(0, 2000) } }],
      };
    }

    // SEMPRE enviar Attachment (array vazio limpa ficheiros)
    properties['Attachment'] = {
      files: (bug.attachments || []).map(att => ({
        name: att.name,
        type: 'external',
        external: { url: att.url },
      })),
    };

    properties['Last Synced'] = {
      date: { start: new Date().toISOString() },
    };

    // Wrap API call em try-catch para handle caso campo não exista
    try {
      await this.notion.pages.create({
        parent: { database_id: this.databaseId },
        properties,
      });
    } catch (error: any) {
      // Se erro for "Attachment property doesn't exist", tentar sem Attachment
      const errorMessage = error?.message || '';
      if (errorMessage.includes('Attachment') && errorMessage.includes('not a property')) {
        console.log(`⚠️  Attachment property doesn't exist in database, skipping attachment sync`);
        delete properties['Attachment'];
        await this.notion.pages.create({
          parent: { database_id: this.databaseId },
          properties,
        });
      } else {
        throw error;
      }
    }
  }

  private async updateNotionPage(pageId: string, bug: Bug): Promise<void> {
    const severityEmojiMap: Record<string, string> = {
      P0: '🔴 P0',
      P1: '🟠 P1',
      P2: '🟡 P2',
    };

    const properties: any = {
      'Title': {
        title: [{ text: { content: bug.title.substring(0, 2000) } }],
      },
    };

    if (bug.severity) {
      properties['Severity'] = {
        select: { name: severityEmojiMap[bug.severity] },
      };
    }

    if (bug.status) {
      properties['Status'] = {
        select: { name: bug.status.substring(0, 100) },
      };
    }

    if (bug.component) {
      properties['Component'] = {
        rich_text: [{ text: { content: bug.component.substring(0, 2000) } }],
      };
    }

    if (bug.reporter) {
      properties['Reporter'] = {
        rich_text: [{ text: { content: bug.reporter } }],
      };
    }

    if (bug.date) {
      try {
        const dateObj = new Date(bug.date);
        if (!isNaN(dateObj.getTime())) {
          properties['Date'] = {
            date: { start: dateObj.toISOString().split('T')[0] },
          };
        }
      } catch {
        // Ignore date parsing errors
      }
    }

    if (bug.timeEstimate) {
      properties['DateTime Estimate'] = {
        rich_text: [{ text: { content: bug.timeEstimate.substring(0, 2000) } }],
      };
    }

    if (bug.description) {
      properties['Description'] = {
        rich_text: [{ text: { content: bug.description.substring(0, 2000) } }],
      };
    }

    if (bug.impact) {
      properties['Impact'] = {
        rich_text: [{ text: { content: bug.impact.substring(0, 2000) } }],
      };
    }

    if (bug.exitCriteria && bug.exitCriteria.length > 0) {
      properties['Exit Criteria'] = {
        rich_text: [{ text: { content: bug.exitCriteria.join('\n').substring(0, 2000) } }],
      };
    }

    // SEMPRE enviar Attachment (array vazio limpa ficheiros)
    properties['Attachment'] = {
      files: (bug.attachments || []).map(att => ({
        name: att.name,
        type: 'external',
        external: { url: att.url },
      })),
    };

    properties['Last Synced'] = {
      date: { start: new Date().toISOString() },
    };

    // Wrap API call em try-catch
    try {
      await this.notion.pages.update({
        page_id: pageId,
        properties,
      });
    } catch (error: any) {
      // Se erro for "Attachment property doesn't exist", tentar sem Attachment
      const errorMessage = error?.message || '';
      if (errorMessage.includes('Attachment') && errorMessage.includes('not a property')) {
        console.log(`⚠️  Attachment property doesn't exist in database, skipping attachment sync`);
        delete properties['Attachment'];
        await this.notion.pages.update({
          page_id: pageId,
          properties,
        });
      } else {
        throw error;
      }
    }
  }

  private detectConflict(mdBug: Bug, notionBug: Bug): 'md_newer' | 'notion_newer' | 'no_conflict' {
    // 1. Comparar conteúdo primeiro
    const mdContent = JSON.stringify({
      title: mdBug.title,
      status: mdBug.status,
      severity: mdBug.severity,
      description: mdBug.description,
      impact: mdBug.impact,
      attachments: mdBug.attachments || [],
    });

    const notionContent = JSON.stringify({
      title: notionBug.title,
      status: notionBug.status,
      severity: notionBug.severity,
      description: notionBug.description,
      impact: notionBug.impact,
      attachments: notionBug.attachments || [],
    });

    // Se conteúdo idêntico, não há conflito
    if (mdContent === notionContent) {
      return 'no_conflict';
    }

    // 2. NOVA LÓGICA: Usar timestamp nativo do Notion
    
    // Se MD não tem Last Synced → edição manual recente no MD
    if (!mdBug.lastSynced) {
      return 'md_newer';
    }

    // Se Notion não tem last_edited_time (edge case) → priorizar MD
    if (!notionBug.notionLastEditedTime) {
      return 'md_newer';
    }

    // 3. Comparar Notion last_edited_time vs MD Last Synced
    const mdLastSyncedTime = mdBug.lastSynced.getTime();
    const notionEditedTime = notionBug.notionLastEditedTime.getTime();

    // Se Notion foi editado DEPOIS do último sync do MD → Notion mais recente
    // Dar margem de 2 segundos para evitar falsos positivos
    if (notionEditedTime > mdLastSyncedTime + 2000) {
      return 'notion_newer';
    }

    // Se Notion foi editado ANTES do último sync → MD mais recente
    if (notionEditedTime < mdLastSyncedTime - 2000) {
      return 'md_newer';
    }

    // Se timestamps muito próximos (±2s) mas conteúdo diferente:
    // Preferir MD (assume que última edição foi no MD e ainda não sincronizou)
    return 'md_newer';
  }

  private formatBugToMarkdown(bug: Bug): string {
    const severityMap = {
      'P0': '🔴 P0 BLOCKER',
      'P1': '🟠 P1 HIGH',
      'P2': '🟡 P2 MEDIUM',
    };

    const lastSyncedStr = bug.lastSynced 
      ? `**Last Synced:** ${bug.lastSynced.toISOString().replace('T', ' ').substring(0, 19)}  `
      : '';

    // Build metadata section with consistent spacing
    let markdown = `### **${bug.title}**\n\n`;
    markdown += `**Severity:** ${severityMap[bug.severity] || bug.severity}  \n`;
    markdown += `**Component:** ${bug.component}  \n`;
    markdown += `**Reported by:** ${bug.reporter}  \n`;
    markdown += `**Date:** ${bug.date}  \n`;
    markdown += `**Status:** ${bug.status}  \n`;
    if (lastSyncedStr) {
      markdown += `${lastSyncedStr}\n`;
    }
    if (bug.timeEstimate) {
      markdown += `**Time Estimate:** ${bug.timeEstimate}  \n`;
    }
    // Add blank line after metadata section
    markdown += `\n`;

    // Add description section with proper spacing
    if (bug.description) {
      markdown += `#### **Description:**\n${bug.description}\n\n`;
    }

    // Add impact section with proper spacing
    if (bug.impact) {
      markdown += `#### **Impact:**\n${bug.impact}\n\n`;
    }

    // Add exit criteria section with proper spacing
    if (bug.exitCriteria && bug.exitCriteria.length > 0) {
      markdown += `#### **Exit Criteria:**\n`;
      bug.exitCriteria.forEach(criteria => {
        markdown += `${criteria}\n`;
      });
      markdown += `\n`;
    }

    // Add attachments section with proper spacing
    if (bug.attachments && bug.attachments.length > 0) {
      markdown += `#### **Attachments:**\n`;
      bug.attachments.forEach(att => {
        markdown += `- [${att.name}](${att.url})\n`;
      });
      markdown += `\n`;
    }

    // Add separator with blank line after
    markdown += `---\n\n`;
    return markdown;
  }

  private getSectionMarker(severity: 'P0' | 'P1' | 'P2'): string {
    const markers = {
      'P0': '## 🔴 P0 - BLOCKERS (Critical Go-Live Issues)',
      'P1': '## 🟠 P1 - UX IMPORTANT (Important but not blockers)',
      'P2': '## 📥 NEW BUGS (ADD HERE!)',
    };
    return markers[severity] || markers['P2'];
  }

  private insertBugInSection(content: string, bugMarkdown: string, sectionMarker: string): string {
    const sectionIndex = content.indexOf(sectionMarker);
    if (sectionIndex === -1) {
      return content + '\n\n' + bugMarkdown;
    }
    
    const nextSectionIndex = content.indexOf('\n## ', sectionIndex + sectionMarker.length);
    
    if (nextSectionIndex === -1) {
      return content + '\n\n' + bugMarkdown;
    } else {
      return content.slice(0, nextSectionIndex) + '\n\n' + bugMarkdown + content.slice(nextSectionIndex);
    }
  }

  private async updateMarkdownTimestamps(bugIds: string[]): Promise<void> {
    const content = await fs.readFile(this.mdFilePath, 'utf-8');
    let updatedContent = content;
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    let updatedCount = 0;

    for (const bugId of bugIds) {
      // Find the bug section - look for the bug heading
      // Handle both "BUG999" and "BUG #999" formats (case-insensitive)
      const bugNumber = bugId.replace('BUG', '');
      const bugHeadingPattern = new RegExp(
        `(###\\s+\\*\\*[^*]*BUG\\s*#?${bugNumber}[^*]*\\*\\*)`,
        'i'
      );
      
      const headingMatch = content.match(bugHeadingPattern);
      if (!headingMatch) {
        console.log(`⚠️  Could not find heading for ${bugId}, skipping...`);
        continue;
      }

      // Find the Status line after this heading
      const headingIndex = updatedContent.indexOf(headingMatch[0]);
      if (headingIndex === -1) {
        console.log(`⚠️  Could not locate heading in content for ${bugId}, skipping...`);
        continue;
      }

      // Extract section from heading to next ### or end of file
      const afterHeading = updatedContent.substring(headingIndex);
      const nextSectionMatch = afterHeading.match(/\n###\s+/);
      const sectionEnd = nextSectionMatch ? headingIndex + nextSectionMatch.index! : updatedContent.length;
      const section = updatedContent.substring(headingIndex, sectionEnd);

      // Find Status line in this section
      const statusMatch = section.match(/(\*\*Status:\*\*\s*[^\n]+)/);
      if (!statusMatch) {
        console.log(`⚠️  Could not find Status line for ${bugId}, skipping...`);
        continue;
      }

      // Check if Last Synced already exists right after Status
      const afterStatus = section.substring(section.indexOf(statusMatch[0]) + statusMatch[0].length);
      const hasLastSynced = /^\s*\n\*\*Last Synced:\*\*/.test(afterStatus);
      
      if (hasLastSynced) {
        // Update existing timestamp
        const updatedSection = section.replace(
          /(\*\*Status:\*\*\s*[^\n]+)\s*\n\*\*Last Synced:\*\*\s*[^\n]+/,
          `$1  \n**Last Synced:** ${timestamp}  `
        );
        updatedContent = updatedContent.substring(0, headingIndex) + 
                        updatedSection + 
                        updatedContent.substring(sectionEnd);
      } else {
        // Add new timestamp after Status line
        const updatedSection = section.replace(
          /(\*\*Status:\*\*\s*[^\n]+)(\s*\n)/,
          `$1  \n**Last Synced:** ${timestamp}  $2`
        );
        updatedContent = updatedContent.substring(0, headingIndex) + 
                        updatedSection + 
                        updatedContent.substring(sectionEnd);
      }
      
      updatedCount++;
    }

    if (updatedContent !== content) {
      await fs.writeFile(this.mdFilePath, updatedContent, 'utf-8');
    }
  }

  private async updateMarkdownFromNotion(notionBugs: Bug[]): Promise<void> {
    const content = await fs.readFile(this.mdFilePath, 'utf-8');
    let updatedContent = content;

    // Para cada bug do Notion que é mais recente
    for (const notionBug of notionBugs) {
      const mdBugs = await this.parseMarkdownBugs();
      const mdBug = mdBugs.find(b => b.id === notionBug.id);

      if (!mdBug) {
        console.log(`📥 New bug from Notion: ${notionBug.id} (adding to Markdown)`);
        
        const bugMarkdown = this.formatBugToMarkdown(notionBug);
        const sectionMarker = this.getSectionMarker(notionBug.severity);
        updatedContent = this.insertBugInSection(updatedContent, bugMarkdown, sectionMarker);
        continue;
      }

      const conflict = this.detectConflict(mdBug, notionBug);

      if (conflict === 'notion_newer') {
        console.log(`🔽 Pulling: ${notionBug.id} (Notion → MD)`);

        // Encontrar e substituir o bug no Markdown
        const bugPattern = new RegExp(
          `###\\s+\\*\\*${mdBug.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*[\\s\\S]*?(?=###|$)`,
          'g'
        );

        const newBugMarkdown = this.formatBugToMarkdown(notionBug);
        updatedContent = updatedContent.replace(bugPattern, newBugMarkdown.trim());
      }
    }

    // Escrever de volta se houve mudanças
    if (updatedContent !== content) {
      await fs.writeFile(this.mdFilePath, updatedContent, 'utf-8');
      console.log(`✅ Updated Markdown file with Notion changes`);
    }
  }
}

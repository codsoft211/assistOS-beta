/**
 * Module Templates Library
 * 
 * This file exports all available templates for the Projetos module.
 * Templates are industry-specific configurations that extend the base module
 * with custom entities, workflows, and AI tools.
 */

import type { ModuleTemplate } from '../../base/module.interface';
import constructionTemplate from './construction.json';
import eventsTemplate from './events.json';
import consultingTemplate from './consulting.json';

// Export all templates
export const templates: ModuleTemplate[] = [
  constructionTemplate as ModuleTemplate,
  eventsTemplate as ModuleTemplate,
  consultingTemplate as ModuleTemplate
];

// Export by ID for easy lookup
export const templatesById: Record<string, ModuleTemplate> = {
  construction: constructionTemplate as ModuleTemplate,
  events: eventsTemplate as ModuleTemplate,
  consulting: consultingTemplate as ModuleTemplate
};

// Helper to get template by ID
export function getTemplate(templateId: string): ModuleTemplate | undefined {
  return templatesById[templateId];
}

// Helper to search templates by keywords
export function searchTemplates(keyword: string): ModuleTemplate[] {
  const lowerKeyword = keyword.toLowerCase();
  return templates.filter(template => 
    template.suggestedFor?.some(tag => tag.toLowerCase().includes(lowerKeyword)) ||
    template.name.toLowerCase().includes(lowerKeyword) ||
    template.description.toLowerCase().includes(lowerKeyword)
  );
}

// Get most popular templates (for pattern recognition)
export function getPopularTemplates(limit: number = 3): ModuleTemplate[] {
  return templates
    .sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    .slice(0, limit);
}

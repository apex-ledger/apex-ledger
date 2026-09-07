import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { CoaTemplate } from './seeds/coaTemplateTypes';

// A "save this company's whole Chart of Accounts as a reusable template" feature (the QuickBooks
// pattern) — unlike built-in templates (COA_TEMPLATES), these are user-created and need to live
// somewhere that isn't any single company file, since the whole point is reusing one across many
// clients. Stored the same way recent-companies.json is: plain JSON in the app's userData folder.
const CUSTOM_TEMPLATE_ID_PREFIX = 'custom-';

function customTemplatesFilePath(): string {
  return path.join(app.getPath('userData'), 'custom-coa-templates.json');
}

export function listCustomTemplates(): CoaTemplate[] {
  try {
    const raw = fs.readFileSync(customTemplatesFilePath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CoaTemplate[]) : [];
  } catch {
    return [];
  }
}

export function getCustomTemplate(id: string): CoaTemplate | undefined {
  return listCustomTemplates().find((t) => t.id === id);
}

export function isCustomTemplateId(id: string): boolean {
  return id.startsWith(CUSTOM_TEMPLATE_ID_PREFIX);
}

export function saveCustomTemplate(label: string, description: string, accounts: CoaTemplate['accounts']): CoaTemplate {
  const template: CoaTemplate = {
    id: `${CUSTOM_TEMPLATE_ID_PREFIX}${Date.now()}`,
    label,
    description,
    accounts,
  };
  const existing = listCustomTemplates();
  const updated = [...existing, template];
  fs.mkdirSync(path.dirname(customTemplatesFilePath()), { recursive: true });
  fs.writeFileSync(customTemplatesFilePath(), JSON.stringify(updated, null, 2), 'utf-8');
  return template;
}

export function deleteCustomTemplate(id: string): void {
  const remaining = listCustomTemplates().filter((t) => t.id !== id);
  fs.mkdirSync(path.dirname(customTemplatesFilePath()), { recursive: true });
  fs.writeFileSync(customTemplatesFilePath(), JSON.stringify(remaining, null, 2), 'utf-8');
}

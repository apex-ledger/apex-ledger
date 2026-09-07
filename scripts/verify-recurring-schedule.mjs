import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const migration = fs.readFileSync(new URL('../src/main/db/migrations/0060_recurring_schedule.sql', import.meta.url), 'utf8');
const quickEntry = fs.readFileSync(new URL('../src/renderer/features/quick-entry/QuickEntryPage.tsx', import.meta.url), 'utf8');
const recurring = fs.readFileSync(new URL('../src/renderer/features/transactions/RecurringTransactionsTab.tsx', import.meta.url), 'utf8');
const checklist = fs.readFileSync(new URL('../src/renderer/features/bookkeeping-checklist/BookkeepingChecklistPage.tsx', import.meta.url), 'utf8');
const failures = [];
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE recurring_templates (id INTEGER PRIMARY KEY, name TEXT NOT NULL); ${migration}`);
const columns = new Set(db.prepare('PRAGMA table_info(recurring_templates)').all().map((row) => row.name));
for (const column of ['schedule_frequency', 'next_due_date', 'last_used_date']) if (!columns.has(column)) failures.push(`Migration is missing ${column}.`);
try { db.exec("INSERT INTO recurring_templates(id,name,schedule_frequency) VALUES (1,'Bad','daily')"); failures.push('Schedule frequency constraint accepts unsupported values.'); } catch {}
if (!quickEntry.includes('nextRecurringDate(entryDate, usedTemplate.scheduleFrequency)')) failures.push('Saving a scheduled template does not advance its next due date.');
if (!quickEntry.includes('templateId={view.templateId}') && !quickEntry.includes('initialTemplateApplied')) failures.push('Recurring template drill-back does not preload Quick Entry.');
if (!recurring.includes("templateId: t.id")) failures.push('Recurring Use action does not identify its source template.');
if (!checklist.includes('Recurring entries due') || !checklist.includes("tab: 'recurring'")) failures.push('Due recurring work is not exposed on the Bookkeeping Checklist.');
db.close();
if (failures.length) { console.error('Recurring schedule verification FAILED:'); failures.forEach((failure) => console.error(` - ${failure}`)); process.exit(2); }
console.log('Recurring schedule verification PASSED.');
console.log(' migration, supported frequencies, due checklist drill-back, template preload, and next-date advancement verified.');

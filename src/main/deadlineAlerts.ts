import { app, Notification, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { computeAllDeadlines } from '@shared/domain/reminders/computeDeadlines';
import * as registry from './clientsRegistry';
import { localIsoDate } from '@shared/domain/dates/localDate';

function notifiedFilePath(): string {
  return path.join(app.getPath('userData'), 'notifiedDeadlines.json');
}

function readNotifiedKeys(): Set<string> {
  try {
    const raw = fs.readFileSync(notifiedFilePath(), 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function writeNotifiedKeys(keys: Set<string>): void {
  const filePath = notifiedFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify([...keys], null, 2), 'utf-8');
}

function todayIso(): string {
  return localIsoDate();
}

function daysUntil(dueDate: string, referenceDate: string): number {
  const a = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const b = new Date(`${dueDate}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** How far ahead of a due date the notification fires — 2 weeks, matching the red highlight
 * already used for deadlines throughout the app (Client Management, Calendar). */
const ALERT_WINDOW_DAYS = 14;

/**
 * Checks every client's computed filing deadlines (T2, HST, fiscal year-end) plus their insurance
 * policy expiry date, and fires a native OS notification the first time one comes within 2 weeks
 * of its date — mentions the client name so it's clear at a glance whose filing/policy it is.
 * Never re-fires for the same (client, category, date) combination, so it alerts once per
 * occurrence rather than every app launch; a recurring deadline (e.g. quarterly HST) gets a fresh
 * due date each cycle, so the next occurrence still alerts normally. Clicking the notification
 * brings the app to the front and opens Client Management, where the full list lives.
 */
export function checkAndNotifyDeadlines(mainWindow: BrowserWindow): void {
  if (!Notification.isSupported()) return;
  const today = todayIso();
  const notified = readNotifiedKeys();
  let changed = false;

  function maybeNotify(key: string, date: string, title: string): void {
    const days = daysUntil(date, today);
    if (days < 0 || days > ALERT_WINDOW_DAYS) return;
    if (notified.has(key)) return;

    const dueLabel = days === 0 ? 'due today' : `due in ${days} day${days === 1 ? '' : 's'}`;
    const notification = new Notification({ title, body: `${dueLabel} (${date})` });
    notification.on('click', () => {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('menu:navigateToClientHub');
    });
    notification.show();

    notified.add(key);
    changed = true;
  }

  for (const client of registry.listClients()) {
    const deadlines = computeAllDeadlines(
      { fiscalYearEndMonth: client.fiscalYearEndMonth, fiscalYearEndDay: client.fiscalYearEndDay, hstFilingFrequency: client.hstFilingFrequency },
      today,
    );
    for (const deadline of deadlines) {
      maybeNotify(`${client.id}:${deadline.category}:${deadline.dueDate}`, deadline.dueDate, `${client.clientName} — ${deadline.label}`);
    }
    if (client.policyExpiryDate) {
      const products = client.insuranceTypes.join(' / ') || 'Insurance';
      maybeNotify(`${client.id}:PolicyExpiry:${client.policyExpiryDate}`, client.policyExpiryDate, `${client.clientName} — ${products} Policy Expiring`);
    }
  }

  if (changed) writeNotifiedKeys(notified);
}

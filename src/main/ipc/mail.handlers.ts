import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { sendPlatformEmailWithAttachment } from '../email/sendEmail';

/** One door for "email this file to someone", where the file was produced in the renderer rather
 * than by a handler here — a report PDF laid out in the browser, for instance, which is the only
 * way reports can produce a PDF on the web, where Chromium's printToPDF is not reachable.
 *
 * Deliberately generic: any screen that can produce bytes can email them, without each one
 * growing its own handler, its own temp-file dance and its own copy of the relay wiring. */
export async function mailSendAttachment(input: unknown) {
  const { to, subject, body, replyTo, fileName, base64 } = input as {
    to: string; subject: string; body: string; replyTo?: string; fileName: string; base64: string;
  };
  if (!to || !to.trim()) throw new Error('Enter an email address to send to.');
  if (!base64) throw new Error('There is nothing to attach.');

  // The name is used to build a path, so anything that could climb out of the temp directory or
  // break the filename goes first — the renderer supplies it, and a report title is free text.
  const safeName = (fileName || 'attachment.pdf').replace(/[\\/:*?"<>|]/g, '').trim() || 'attachment.pdf';
  const tempPath = path.join(os.tmpdir(), `${crypto.randomUUID()}-${safeName}`);
  fs.writeFileSync(tempPath, Buffer.from(base64, 'base64'));
  await sendPlatformEmailWithAttachment(tempPath, to.trim(), subject, body, replyTo);
  return { sent: true as const };
}

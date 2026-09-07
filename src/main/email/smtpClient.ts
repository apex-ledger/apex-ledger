import net from 'node:net';
import tls from 'node:tls';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * A small SMTP sender: one message, one PDF attachment, STARTTLS or implicit TLS, LOGIN or PLAIN
 * authentication. Enough for Microsoft 365 (smtp.office365.com:587), Gmail with an app password
 * (smtp.gmail.com:587) and any ordinary mail host, without adding a dependency. Nothing here
 * keeps a connection open: connect, send, quit.
 */
export interface SmtpOptions {
  host: string;
  port: number;
  security: 'starttls' | 'tls';
  user: string;
  password: string;
  fromName: string;
  fromAddress: string;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  body: string;
  attachmentPath?: string;
}

class SmtpSession {
  private socket: net.Socket | tls.TLSSocket;
  private buffer = '';
  private waiters: Array<{ resolve: (line: string) => void; reject: (e: Error) => void }> = [];

  constructor(socket: net.Socket | tls.TLSSocket) {
    this.socket = socket;
    this.attach();
  }

  private attach() {
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.flush();
    });
    this.socket.on('error', (err) => this.failAll(err));
    this.socket.on('close', () => this.failAll(new Error('The mail server closed the connection.')));
  }

  private failAll(err: Error) {
    const pending = this.waiters;
    this.waiters = [];
    for (const w of pending) w.reject(err);
  }

  /** A reply is complete when a line reads "250 text" rather than "250-text". */
  private flush() {
    for (;;) {
      const end = this.buffer.indexOf('\r\n');
      if (end < 0) return;
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      if (/^\d{3}-/.test(line)) continue;
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(line);
    }
  }

  read(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.flush();
    });
  }

  async command(text: string, expect: number[]): Promise<string> {
    this.socket.write(`${text}\r\n`);
    const reply = await this.read();
    const code = Number(reply.slice(0, 3));
    if (!expect.includes(code)) throw new Error(`Mail server replied "${reply}" to ${text.split(' ')[0]}.`);
    return reply;
  }

  async upgradeToTls(host: string): Promise<void> {
    const plain = this.socket;
    plain.removeAllListeners('data');
    plain.removeAllListeners('error');
    plain.removeAllListeners('close');
    this.socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
      const secure = tls.connect({ socket: plain, servername: host }, () => resolve(secure));
      secure.once('error', reject);
    });
    this.buffer = '';
    this.attach();
  }

  end(): void {
    this.socket.end();
  }
}

function connect(options: SmtpOptions): Promise<SmtpSession> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Could not reach ${options.host}:${options.port} within 15 seconds.`)), 15_000);
    const done = (socket: net.Socket | tls.TLSSocket) => { clearTimeout(timeout); resolve(new SmtpSession(socket)); };
    if (options.security === 'tls') {
      const socket = tls.connect({ host: options.host, port: options.port, servername: options.host }, () => done(socket));
      socket.once('error', (e) => { clearTimeout(timeout); reject(e); });
    } else {
      const socket = net.connect({ host: options.host, port: options.port }, () => done(socket));
      socket.once('error', (e) => { clearTimeout(timeout); reject(e); });
    }
  });
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function wrap76(base64: string): string {
  return base64.replace(/(.{76})/g, '$1\r\n');
}

export function buildMime(options: SmtpOptions, mail: OutgoingMail): string {
  const boundary = `----=_Apex_${crypto.randomBytes(12).toString('hex')}`;
  const from = options.fromName ? `${encodeHeader(options.fromName)} <${options.fromAddress}>` : options.fromAddress;
  const lines = [
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@apexledger>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(mail.body, 'utf8').toString('base64')),
  ];
  if (mail.attachmentPath) {
    const name = path.basename(mail.attachmentPath).replace(/"/g, '');
    lines.push(
      `--${boundary}`,
      `Content-Type: application/pdf; name="${name}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${name}"`,
      '',
      wrap76(fs.readFileSync(mail.attachmentPath).toString('base64')),
    );
  }
  lines.push(`--${boundary}--`, '');
  // A line that is only a dot would end the message early; SMTP dot-stuffing.
  return lines.join('\r\n').replace(/\r\n\./g, '\r\n..');
}

export async function sendSmtp(options: SmtpOptions, mail: OutgoingMail): Promise<void> {
  if (!options.host || !options.fromAddress) throw new Error('Email is not set up: enter the mail server and the from address in Settings.');
  const session = await connect(options);
  try {
    const greeting = await session.read();
    if (!greeting.startsWith('220')) throw new Error(`Mail server greeting was "${greeting}".`);
    await session.command('EHLO apexledger.local', [250]);
    if (options.security === 'starttls') {
      await session.command('STARTTLS', [220]);
      await session.upgradeToTls(options.host);
      await session.command('EHLO apexledger.local', [250]);
    }
    if (options.user) {
      await session.command('AUTH LOGIN', [334]);
      await session.command(Buffer.from(options.user, 'utf8').toString('base64'), [334]);
      await session.command(Buffer.from(options.password, 'utf8').toString('base64'), [235]);
    }
    await session.command(`MAIL FROM:<${options.fromAddress}>`, [250]);
    await session.command(`RCPT TO:<${mail.to}>`, [250, 251]);
    await session.command('DATA', [354]);
    await session.command(`${buildMime(options, mail)}\r\n.`, [250]);
    await session.command('QUIT', [221]).catch(() => undefined);
  } finally {
    session.end();
  }
}

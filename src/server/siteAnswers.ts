/**
 * Answers a visitor's question from the website's own text, with no outside service.
 *
 * The knowledge (scripts/build-site-knowledge.mjs) is cut into passages: every FAQ question with
 * its answer, and every heading with the lines under it. A question is matched to passages by
 * the words they share, with a small list of synonyms so "cost" finds "price" and "safe" finds
 * "security". The best passage is the answer, quoted as written on the site with a link to the
 * page, so the assistant can never say something the website does not. When nothing matches
 * well enough it says so and the widget offers the email form.
 */
export interface Passage { title: string; url: string; heading: string; body: string; tokens: Set<string> }
export interface LocalAnswer { answer: string; handoff: boolean; url?: string; alsoSee?: { heading: string; url: string }[] }

const STOP = new Set('a an the and or of to in on for with is are was were be been do does did can could i you we it my your our this that these those what how much many where when who which why there here about from as at by into if then than not no yes any some all its it\'s me us they them their have has had will would should get got need needs like just also'.split(' '));
const SYNONYMS: Record<string, string> = {
  cost: 'price', costs: 'price', pricing: 'price', prices: 'price', fee: 'price', fees: 'price', charge: 'price', charges: 'price', pay: 'price', paying: 'price', expensive: 'price', cheap: 'price', dollar: 'price', dollars: 'price', month: 'price', monthly: 'price', rate: 'price', rates: 'price', plan: 'seat', plans: 'seat',
  user: 'seat', users: 'seat', licence: 'seat', license: 'seat', licences: 'seat', licenses: 'seat', person: 'seat', people: 'seat', subscription: 'seat',
  safe: 'security', safety: 'security', secure: 'security', secured: 'security', protect: 'security', protected: 'security', protection: 'security', hack: 'security', hacked: 'security', hackers: 'security', encrypted: 'security', encryption: 'security', privacy: 'security', private: 'security',
  backup: 'backup', backups: 'backup', 'backed': 'backup', restore: 'backup', lose: 'backup', lost: 'backup',
  gst: 'hst', tax: 'hst', taxes: 'hst', return: 'hst', returns: 'hst', remittance: 'remit', remittances: 'remit', pd7a: 'remit',
  qbo: 'quickbooks', quickbook: 'quickbooks', intuit: 'quickbooks', sage: 'quickbooks', xero: 'quickbooks', migrate: 'move', migration: 'move', switch: 'move', switching: 'move', import: 'move', convert: 'move', transfer: 'move',
  employees: 'employee', staff: 'employee', payslip: 'stub', paystub: 'stub', t4s: 't4', roe: 'roe', cpp: 'payroll', ei: 'payroll', wsib: 'payroll', wages: 'payroll', salary: 'payroll', salaries: 'payroll',
  companies: 'company', files: 'file', clients: 'client', customer: 'client', customers: 'client', firm: 'firm', firms: 'firm', accountant: 'accountant', accountants: 'accountant', bookkeeper: 'bookkeeper', bookkeepers: 'bookkeeper', cpa: 'accountant',
  hosted: 'stored', hosting: 'stored', host: 'stored', server: 'stored', servers: 'stored', located: 'stored', location: 'stored', reside: 'stored', canada: 'canada', canadian: 'canada', country: 'canada', usa: 'canada', us: 'canada', american: 'canada',
  trial: 'trial', free: 'trial', demo: 'trial', try: 'trial', start: 'trial', signup: 'trial', 'sign-up': 'trial', register: 'trial', card: 'card', credit: 'card',
  cancel: 'cancel', cancelling: 'cancel', cancellation: 'cancel', quit: 'cancel', leave: 'cancel', stop: 'cancel', refund: 'cancel', contract: 'cancel',
  install: 'install', installation: 'install', download: 'install', desktop: 'install', mac: 'install', windows: 'install', browser: 'install', phone: 'install', mobile: 'install', ipad: 'install', tablet: 'install',
  statement: 'statement', statements: 'statement', pdf: 'statement', csv: 'statement', ofx: 'statement', bank: 'bank', banking: 'bank', reconcile: 'reconcile', reconciliation: 'reconcile',
  invoice: 'invoice', invoices: 'invoice', invoicing: 'invoice', bill: 'bill', bills: 'bill', receipt: 'receipt', receipts: 'receipt', inventory: 'inventory', stock: 'inventory',
  crm: 'crm', deadline: 'deadline', deadlines: 'deadline', reminder: 'reminder', reminders: 'reminder', t2: 'gifi', t1: 't1', corporate: 'gifi', corporation: 'gifi', gifi: 'gifi', 'year-end': 'yearend', yearend: 'yearend', 'sign-off': 'yearend', signoff: 'yearend',
  support: 'contact', help: 'contact', email: 'contact', phone_number: 'contact', talk: 'contact', speak: 'contact', someone: 'contact', human: 'contact', call: 'contact',
  discount: 'founding', promotion: 'founding', offer: 'founding', founding: 'founding', yearly: 'yearly', annual: 'yearly', annually: 'yearly',
  limit: 'limit', limits: 'limit', unlimited: 'limit', maximum: 'limit', many: 'limit',
  quebec: 'province', ontario: 'province', alberta: 'province', bc: 'province', provinces: 'province', provincial: 'province', pst: 'province', qst: 'province',
};

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, '')
    .split(/[^a-z0-9$%/-]+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => SYNONYMS[w] ?? stem(w));
}

function stem(w: string): string {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('es')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

const isHeading = (l: string) => l.length <= 90 && !/[.:;]$/.test(l) && !/^\$|^\d/.test(l) && l.split(' ').length <= 12 && !/\| ApexLedger$/.test(l);

/** Cuts the generated knowledge into FAQ pairs and heading-led chunks. */
export function buildPassages(knowledge: string): Passage[] {
  const out: Passage[] = [];
  const seen = new Set<string>();
  const push = (p: Omit<Passage, 'tokens'>) => {
    const key = p.heading + '|' + p.body;
    if (seen.has(key) || p.body.length < 20) return;
    seen.add(key);
    out.push({ ...p, tokens: new Set(tokens(p.heading + ' ' + p.heading + ' ' + p.body)) });
  };
  for (const block of knowledge.split(/\n(?=### )/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const title = lines[0].replace(/^###\s*/, '');
    const url = (lines[1].match(/^URL:\s*(\S+)/) ?? [])[1] ?? 'https://apexledger.ca/';
    // The page's own title line and the menu that follows it are navigation, not answers.
    const body = lines.slice(2).filter((l) => !/\| ApexLedger$/.test(l) && !/^apex ?ledger \./i.test(l));
    for (let i = 0; i < body.length; i++) {
      const l = body[i];
      if (l.endsWith('?') && i + 1 < body.length) {
        // A question with its answer, the way the FAQ is written.
        let a = body[i + 1];
        if (a.endsWith('?')) continue;
        push({ title, url, heading: l, body: a });
        continue;
      }
      if (isHeading(l) && i + 1 < body.length && !body[i + 1].endsWith('?')) {
        const chunk: string[] = [];
        for (let j = i + 1; j < body.length && chunk.join(' ').length < 520; j++) {
          if (isHeading(body[j]) && chunk.length > 0) break;
          if (body[j].endsWith('?')) break;
          chunk.push(body[j]);
        }
        if (chunk.length) push({ title, url, heading: l, body: chunk.join(' ') });
      }
    }
  }
  return out;
}

function score(q: string[], p: Passage): number {
  if (q.length === 0) return 0;
  const headingTokens = new Set(tokens(p.heading));
  let s = 0;
  for (const t of new Set(q)) {
    if (headingTokens.has(t)) s += 2;
    else if (p.tokens.has(t)) s += 1;
  }
  // A written question-and-answer is the better reply when it scores the same as a heading chunk.
  if (p.heading.endsWith('?') && s > 0) s += 0.5;
  return s / Math.sqrt(new Set(q).size);
}

let cache: { knowledge: string; passages: Passage[] } | null = null;

/** The best-matching passage as the answer, or a hand-off when nothing on the site fits. */
export function answerFromSite(question: string, knowledge: string): LocalAnswer {
  if (!cache || cache.knowledge !== knowledge) cache = { knowledge, passages: buildPassages(knowledge) };
  const q = tokens(question);
  if (q.length === 0) return { answer: 'Ask me about seats and pricing, moving from QuickBooks or Sage, payroll, GST/HST, bank statements, or how your data is protected.', handoff: false };
  const ranked = cache.passages.map((p) => ({ p, s: score(q, p) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s);
  const best = ranked[0];
  const distinct = new Set(q).size;
  // Enough of the question has to be found, and at least one word in the heading or two in the body.
  if (!best || best.s < Math.max(1.4, 0.9 * Math.sqrt(distinct))) {
    return { answer: 'I could not find that on the website. Leave the question with us and a person will answer by email.', handoff: true };
  }
  const also = ranked.slice(1, 4).filter((r) => r.p.url !== best.p.url && r.s >= best.s * 0.6).map((r) => ({ heading: r.p.heading, url: r.p.url }));
  const page = best.p.url === 'https://apexledger.ca/' ? 'home page' : best.p.title;
  const answer = `${best.p.heading.endsWith('?') ? '' : best.p.heading + ': '}${best.p.body}\n\nFrom the ${page}: ${best.p.url}`;
  return { answer, handoff: false, url: best.p.url, alsoSee: also.length ? also : undefined };
}

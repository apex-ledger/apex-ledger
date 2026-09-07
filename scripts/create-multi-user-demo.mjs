import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const root = process.cwd();
const source = path.join(root, 'demo-companies', 'North Ledger Comprehensive Demo.company');
const output = path.join(root, 'demo-companies', 'Apex Ledger Multi-User Test.company');
if (!fs.existsSync(source)) throw new Error(`Missing source demo: ${source}`);
for (const suffix of ['', '-wal', '-shm']) {
  const target = output + suffix;
  if (fs.existsSync(target)) fs.rmSync(target);
}
fs.copyFileSync(source, output);

const db = new Database(output);
db.pragma('foreign_keys = ON');
const migrationDir = path.join(root, 'src', 'main', 'db', 'migrations');
const applied = new Set(db.prepare('SELECT version FROM schema_migrations').all().map((row) => row.version));
for (const name of fs.readdirSync(migrationDir).filter((item) => /^\d+.*\.sql$/.test(item)).sort()) {
  const version = Number(name.slice(0, 4));
  if (applied.has(version)) continue;
  db.transaction(() => {
    db.exec(fs.readFileSync(path.join(migrationDir, name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations(version) VALUES (?)').run(version);
  })();
}

const now = new Date().toISOString();
const users = [
  { first: 'Alex', last: 'Admin', email: 'alex.admin@example.test', role: 'administrator', permissions: ['company','users','sales','purchases','banking','accounting','payroll','tax','inventory'] },
  { first: 'Priya', last: 'Accountant', email: 'priya.accountant@example.test', role: 'accountant', permissions: ['sales','purchases','banking','accounting','tax','inventory'] },
  { first: 'Jordan', last: 'Bookkeeper', email: 'jordan.bookkeeper@example.test', role: 'bookkeeper', permissions: ['sales','purchases','banking','inventory'] },
];

db.transaction(() => {
  db.prepare("UPDATE company_info SET legal_name='Apex Ledger Multi-User TEST Inc.', display_name='Multi-User TEST Company' WHERE id=1").run();
  db.prepare('DELETE FROM company_users').run();
  const insertUser = db.prepare('INSERT INTO company_users(first_name,last_name,email,role,permissions_json,status,invitation_token,invited_at,accepted_at) VALUES(?,?,?,?,?,\'active\',NULL,?,?)');
  for (const user of users) insertUser.run(user.first, user.last, user.email, user.role, JSON.stringify(user.permissions), now, now);

  const accountId = (code) => db.prepare('SELECT id FROM accounts WHERE code=?').get(code).id;
  const insertEntry = db.prepare("INSERT INTO journal_entries(entry_date,memo,reference,status,posted_at,created_by,is_adjusting_entry,source,source_reference) VALUES(?,?,?,'posted',?,?,?,?,?)");
  const insertLine = db.prepare('INSERT INTO journal_entry_lines(journal_entry_id,account_id,debit_cents,credit_cents,description,line_order) VALUES(?,?,?,?,?,?)');
  const insertActivity = db.prepare('INSERT INTO user_activity_log(actor_key,actor_name,actor_email,topic,action,target_reference,changed_at) VALUES(?,?,?,?,?,?,?)');
  const examples = [
    { date: '2026-08-20', name: 'Alex Admin', email: users[0].email, reference: 'MULTI-ALEX', memo: 'Multi-user test — admin income', debit: '1000', credit: '4100', cents: 10000, adjusting: 0 },
    { date: '2026-08-21', name: 'Priya Accountant', email: users[1].email, reference: 'MULTI-PRIYA', memo: 'Multi-user test — accountant adjustment', debit: '5300', credit: '1000', cents: 2000, adjusting: 1 },
    { date: '2026-08-22', name: 'Jordan Bookkeeper', email: users[2].email, reference: 'MULTI-JORDAN', memo: 'Multi-user test — bookkeeping expense', debit: '5100', credit: '1000', cents: 3000, adjusting: 0 },
  ];
  for (const item of examples) {
    const entryId = Number(insertEntry.run(item.date, item.memo, item.reference, `${item.date}T12:00:00Z`, item.name, item.adjusting, 'manual', item.reference).lastInsertRowid);
    insertLine.run(entryId, accountId(item.debit), item.cents, 0, item.memo, 0);
    insertLine.run(entryId, accountId(item.credit), 0, item.cents, item.memo, 1);
    insertActivity.run(`company-user:${users.findIndex((user) => user.email === item.email) + 1}`, item.name, item.email, 'journal', 'Created journal test entry', item.reference, `${item.date}T12:00:00Z`);
  }
})();

const checks = {
  users: db.prepare("SELECT COUNT(*) count FROM company_users WHERE status='active'").get().count,
  actors: db.prepare("SELECT COUNT(DISTINCT created_by) count FROM journal_entries WHERE reference LIKE 'MULTI-%'").get().count,
  activities: db.prepare("SELECT COUNT(*) count FROM user_activity_log WHERE target_reference LIKE 'MULTI-%'").get().count,
  imbalanced: db.prepare("SELECT COUNT(*) count FROM (SELECT je.id FROM journal_entries je JOIN journal_entry_lines l ON l.journal_entry_id=je.id WHERE je.reference LIKE 'MULTI-%' GROUP BY je.id HAVING SUM(l.debit_cents)<>SUM(l.credit_cents))").get().count,
  quickCheck: db.pragma('quick_check')[0].quick_check,
};
if (checks.users !== 3 || checks.actors !== 3 || checks.activities !== 3 || checks.imbalanced !== 0 || checks.quickCheck !== 'ok') throw new Error(`Multi-user demo verification failed: ${JSON.stringify(checks)}`);
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
console.log(JSON.stringify({ output, ...checks }, null, 2));
process.exit(0);

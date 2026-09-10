// Two firms, two people: every way one could reach the other's data, tried and reported.
import fs from 'node:fs';
import path from 'node:path';
const BASE = 'http://localhost:8787';
const admin = fs.readFileSync('D:/Projects/ApexLedger-Claude/web-data/cookies.txt', 'utf8').match(/apex_session\s+(\S+)/)[1];
const J = async (u, o = {}, c) => { const r = await fetch(BASE + u, { ...o, headers: { 'Content-Type': 'application/json', Cookie: 'apex_session=' + c, ...(o.headers || {}) } }); const t = await r.text(); try { return { status: r.status, ...JSON.parse(t) }; } catch { return { status: r.status, raw: t.slice(0, 80) }; } };
const login = async (email) => { const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Welcome-2026' }) }); const j = await r.json(); if (!j.ok) throw new Error(email + ': ' + j.error); const ck = r.headers.get('set-cookie').split(';')[0].split('=')[1]; await J('/api/me/agree', { method: 'POST', body: JSON.stringify({ name: j.data.user.name }) }, ck); return { ck, user: j.data.user, org: j.data.org, call: (ch, ...args) => J('/api/' + encodeURIComponent(ch), { method: 'POST', body: JSON.stringify({ args }) }, ck) }; };
const ok = (label, cond, detail = '') => console.log((cond ? 'PASS ' : 'FAIL ') + label + (detail ? '  [' + String(detail).slice(0, 90) + ']' : ''));

// Firm One owner (created if missing) and Firm Two member.
const orgs = (await J('/api/admin/orgs', {}, admin)).data;
const one = orgs.find((o) => o.slug === 'firm-one'); const two = orgs.find((o) => o.slug === 'firm-two');
const users = (await J('/api/admin/users', {}, admin)).data; const annUser = users.find((u) => u.orgId === one.id && u.role === 'owner');
await J('/api/admin/users/' + annUser.id + '/password', { method: 'POST', body: JSON.stringify({ password: 'Welcome-2026' }) }, admin);
const ann = await login(annUser.email); const kim = await login('kim@firmtwo.ca');
console.log('Ann is', ann.user.role, 'of', ann.org.name, '| Kim is', kim.user.role, 'of', kim.org.name);

// 1. Each sees only their own company files
const la = (await ann.call('company:listRecent')).data; const lk = (await kim.call('company:listRecent')).data;
ok('Ann lists only firm-one files', la.every((p) => p.includes('firm-one')) && la.length > 0, la.map((p) => path.basename(p)).join(', '));
ok('Kim lists only firm-two files', lk.every((p) => p.includes('firm-two')) && lk.length > 0, lk.map((p) => path.basename(p)).join(', '));

// 2. Opening the other firm's file, by full path and by path traversal
const kimFile = lk[0]; const annFile = la[0];
let r = await ann.call('company:open', kimFile); ok('Ann cannot open Firm Two file by path', !r.ok, r.error);
r = await ann.call('company:open', path.join(path.dirname(annFile), '..', 'firm-two', path.basename(kimFile))); ok('Ann cannot open Firm Two file by ../ traversal', !r.ok, r.error);
r = await ann.call('company:open', annFile); ok('Ann opens her own file', r.ok, r.ok ? r.data.company.legalName : r.error);
r = await kim.call('company:open', kimFile); ok('Kim opens her own file', r.ok, r.ok ? r.data.company.legalName : r.error);

// 3. Company-file endpoints across organisations
r = await J('/api/org/companies?org=' + two.id, {}, ann.ck); ok('Ann cannot list Firm Two company files', !r.ok, r.error);
r = await J('/api/org/companies?org=' + two.id, { method: 'PUT', headers: { 'X-File-Name': 'x.company' }, body: Buffer.from('SQLite format 3\0' + 'x'.repeat(600)) }, ann.ck); ok('Ann cannot upload into Firm Two', !r.ok, r.error);
r = await J('/api/org/companies/download?org=' + two.id + '&name=' + encodeURIComponent(path.basename(kimFile)), {}, ann.ck); ok('Ann cannot download a Firm Two file', r.status !== 200 || !r.ok, r.error ?? r.status);
r = await J('/api/org/companies?org=' + one.id, {}, kim.ck); ok('Kim (member, not owner) cannot even list her own firm files via admin route', !r.ok, r.error);

// 4. People and organisations
r = await J('/api/admin/users', {}, ann.ck); ok('Ann sees only Firm One people', r.ok && r.data.every((u) => u.orgId === one.id), r.ok ? r.data.map((u) => u.email).join(', ') : r.error);
r = await J('/api/admin/orgs', {}, ann.ck); ok('Ann sees only her organisation', r.ok && r.data.length === 1 && r.data[0].id === one.id, r.ok ? r.data.map((o) => o.name).join(', ') : r.error);
r = await J('/api/admin/users', { method: 'POST', body: JSON.stringify({ orgId: two.id, name: 'Sneaky', email: 'sneaky@firmone.ca', password: 'Welcome-2026', role: 'member', seatType: 'business' }) }, ann.ck); ok('Ann adding a person "into Firm Two" lands in Firm One instead', r.ok && r.data.orgId === one.id, r.ok ? 'orgId ' + r.data.orgId : r.error);
r = await J('/api/admin/users/' + kim.user.id + '/active', { method: 'POST', body: JSON.stringify({ active: false }) }, ann.ck); ok('Ann cannot deactivate Kim', !r.ok, r.error);
r = await J('/api/admin/users/' + kim.user.id + '/password', { method: 'POST', body: JSON.stringify({ password: 'Hacked-2026' }) }, ann.ck); ok('Ann cannot reset Kim\'s password', !r.ok, r.error);
r = await J('/api/admin/orgs/' + two.id + '/seats', { method: 'POST', body: JSON.stringify({ seats: 99 }) }, ann.ck); ok('Ann cannot change Firm Two seats', !r.ok, r.error);
r = await J('/api/admin/trial-requests', {}, ann.ck); ok('Ann cannot see trial requests', !r.ok, r.error);
r = await J('/api/admin/seat-rates', { method: 'POST', body: JSON.stringify({ seatType: 'full', dollars: 1 }) }, ann.ck); ok('Ann cannot change seat rates', !r.ok, r.error);
r = await J('/api/admin/signin-pause', { method: 'POST', body: JSON.stringify({ paused: true }) }, ann.ck); ok('Ann cannot pause sign-in', !r.ok, r.error);

// 5. Feedback stays within the firm
await J('/api/feedback', { method: 'POST', body: JSON.stringify({ message: 'Kim private note ISOLATION-KIM', page: 'Dashboard' }) }, kim.ck);
r = await J('/api/admin/feedback', {}, ann.ck); ok('Ann does not see Firm Two feedback', r.ok && !JSON.stringify(r.data).includes('ISOLATION-KIM'), r.ok ? r.data.length + ' notes' : r.error);

// 6. Two sessions working at once never swap companies
const mixed = await Promise.all([...Array(10)].flatMap(() => [ann.call('company:get').then((x) => ['ann', x.data?.legalName]), kim.call('company:get').then((x) => ['kim', x.data?.legalName])]));
const annName = mixed.filter((m) => m[0] === 'ann').map((m) => m[1]); const kimName = mixed.filter((m) => m[0] === 'kim').map((m) => m[1]);
ok('20 interleaved requests: Ann always gets her company', new Set(annName).size === 1, annName[0]);
ok('20 interleaved requests: Kim always gets her company', new Set(kimName).size === 1 && kimName[0] !== annName[0], kimName[0]);

// 7. Direct data reads inside the open file belong to that file only
const annCust = (await ann.call('customers:list')).data?.length; const kimCust = (await kim.call('customers:list')).data?.length;
ok('customer lists differ per open file (' + annCust + ' vs ' + kimCust + ')', annCust !== undefined && kimCust !== undefined && annCust !== kimCust);

// 8. A stolen cookie value that is not a real session
r = await J('/api/session', {}, 'not-a-real-token-value-at-all-1234567890'); ok('made-up session token is signed out', r.ok && r.data.signedIn === false);
await J('/api/logout', { method: 'POST' }, ann.ck); await J('/api/logout', { method: 'POST' }, kim.ck);

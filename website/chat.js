/* The question-and-answer assistant on apexledger.ca: a bubble fixed to the right edge, a small
 * panel above it, answers from the website's own text via online.apexledger.ca/api/site-chat, and
 * an email form when the assistant cannot answer (or the visitor prefers a person). Nothing here
 * is required for the page: if the script or the server is unavailable the page reads as before. */
(function () {
  var API = 'https://online.apexledger.ca';
  var KEY = 'apex-chat-v1';
  var css = '' +
    '.ax-fab{position:fixed;right:22px;bottom:22px;z-index:60;display:inline-flex;align-items:center;gap:9px;padding:13px 20px;border-radius:999px;border:1px solid #f7d38a;background:linear-gradient(115deg,#d9aa4e,#ffe7a3 42%,#ebc165 73%,#d6a340);color:#142018;font:700 15px "Segoe UI",Arial,sans-serif;box-shadow:0 12px 30px #1a3a2a33;cursor:pointer}' +
    '.ax-fab svg{width:18px;height:18px}.ax-fab:hover{filter:brightness(1.04)}' +
    '.ax-panel{position:fixed;right:22px;bottom:84px;z-index:61;width:372px;max-width:calc(100vw - 32px);height:540px;max-height:calc(100vh - 110px);display:flex;flex-direction:column;background:#fff;border:1px solid #cfe3d6;border-radius:18px;box-shadow:0 30px 80px #0d241833;overflow:hidden;font:15px/1.5 "Segoe UI",Arial,sans-serif;color:#0d1f15}' +
    '.ax-panel[hidden]{display:none}' +
    '.ax-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px 12px 18px;background:linear-gradient(100deg,#e3f3e9,#eef8f1);border-bottom:1px solid #cfe3d6}' +
    '.ax-head b{color:#1f5a3a;font-size:15px}.ax-head small{display:block;color:#2f4a3b;font-size:12px}' +
    '.ax-x{border:0;background:none;font-size:22px;line-height:1;color:#2f4a3b;cursor:pointer;padding:4px 8px;border-radius:999px}.ax-x:hover{background:#d9f0e2}' +
    '.ax-log{flex:1;overflow:auto;padding:14px 14px 6px;display:flex;flex-direction:column;gap:9px;background:#f7fcf8}' +
    '.ax-m{max-width:88%;padding:9px 13px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}' +
    '.ax-m.u{align-self:flex-end;background:#1f5a3a;color:#fff;border-bottom-right-radius:4px}' +
    '.ax-m.a{align-self:flex-start;background:#fff;border:1px solid #cfe3d6;border-bottom-left-radius:4px}' +
    '.ax-m.a a{color:#8a6412;font-weight:700}' +
    '.ax-m.s{align-self:center;background:none;color:#2f4a3b;font-size:12px;padding:2px}' +
    '.ax-form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #cfe3d6;background:#fff}' +
    '.ax-form input,.ax-hand input,.ax-hand textarea{flex:1;font:inherit;padding:10px 13px;border:1px solid #b9d7c4;border-radius:999px;outline:none;min-width:0}' +
    '.ax-form input:focus,.ax-hand input:focus,.ax-hand textarea:focus{border-color:#b48a24;box-shadow:0 0 0 3px #f2ca7240}' +
    '.ax-send{border:1px solid #f7d38a;background:linear-gradient(115deg,#d9aa4e,#ffe7a3 42%,#ebc165 73%,#d6a340);color:#142018;font:700 14px "Segoe UI",Arial,sans-serif;padding:10px 16px;border-radius:999px;cursor:pointer}' +
    '.ax-send[disabled]{opacity:.55;cursor:default}' +
    '.ax-link{border:0;background:none;color:#8a6412;font:700 13px "Segoe UI",Arial,sans-serif;cursor:pointer;padding:0;text-decoration:underline}' +
    '.ax-hand{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-top:1px solid #cfe3d6;background:#fff}' +
    '.ax-hand textarea{border-radius:14px;min-height:64px;resize:vertical}.ax-hand .ax-row{display:flex;gap:8px;align-items:center;justify-content:space-between}' +
    '.ax-hand p{margin:0;font-size:13px;color:#2f4a3b}' +
    '@media(max-width:480px){.ax-fab{right:12px;bottom:12px;padding:12px 16px}.ax-panel{right:8px;bottom:70px;height:calc(100vh - 90px)}}';

  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var fab = document.createElement('button'); fab.type = 'button'; fab.className = 'ax-fab'; fab.setAttribute('aria-label', 'Ask a question');
  fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Ask a question';
  document.body.appendChild(fab);

  var panel = null, log = null, input = null, send = null, hand = null, busy = false;
  var turns = [];
  try { turns = JSON.parse(sessionStorage.getItem(KEY) || '[]'); if (!Array.isArray(turns)) turns = []; } catch (e) { turns = []; }
  function save() { try { sessionStorage.setItem(KEY, JSON.stringify(turns.slice(-12))); } catch (e) { /* private mode */ } }

  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function linkify(s) { return esc(s).replace(/(https?:\/\/[^\s)]+)/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u.replace(/^https?:\/\//, '') + '</a>'; }); }
  function add(role, text) { var m = document.createElement('div'); m.className = 'ax-m ' + role; if (role === 'a') m.innerHTML = linkify(text); else m.textContent = text; log.appendChild(m); log.scrollTop = log.scrollHeight; return m; }

  function offerEmail(question) {
    if (hand) return;
    hand = document.createElement('div'); hand.className = 'ax-hand';
    hand.innerHTML = '<p>Leave it with us: we reply by email, usually the same business day.</p>' +
      '<input id="ax-name" placeholder="Your name" maxlength="120" autocomplete="name">' +
      '<input id="ax-email" type="email" placeholder="Your email" maxlength="200" autocomplete="email">' +
      '<textarea id="ax-q" maxlength="2000" placeholder="Your question"></textarea>' +
      '<div class="ax-row"><button type="button" class="ax-link" id="ax-hand-cancel">Back to chat</button><button type="button" class="ax-send" id="ax-hand-send">Send to ApexLedger</button></div>';
    panel.appendChild(hand);
    hand.querySelector('#ax-q').value = question || '';
    hand.querySelector('#ax-hand-cancel').onclick = function () { panel.removeChild(hand); hand = null; input.focus(); };
    hand.querySelector('#ax-hand-send').onclick = function () {
      var name = hand.querySelector('#ax-name').value.trim(), email = hand.querySelector('#ax-email').value.trim(), q = hand.querySelector('#ax-q').value.trim();
      if (!email || email.indexOf('@') < 1) { hand.querySelector('#ax-email').focus(); return; }
      if (q.length < 5) { hand.querySelector('#ax-q').focus(); return; }
      var btn = this; btn.disabled = true; btn.textContent = 'Sending…';
      fetch(API + '/api/site-chat/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, email: email, question: q, transcript: turns.slice(-8), page: location.pathname }) })
        .then(function (r) { return r.json(); })
        .then(function (r) {
          if (!r.ok) throw new Error(r.error || 'Could not send.');
          panel.removeChild(hand); hand = null;
          add('s', 'Sent. We will reply to ' + email + '.');
        })
        .catch(function (e) { btn.disabled = false; btn.textContent = 'Send to ApexLedger'; add('s', (e && e.message) || 'Could not send. Email admin@apexledger.ca instead.'); });
    };
    hand.querySelector('#ax-name').focus();
  }

  function ask(text) {
    if (busy) return;
    var q = text.trim(); if (!q) return;
    input.value = ''; busy = true; send.disabled = true;
    add('u', q); turns.push({ role: 'user', content: q }); save();
    var thinking = add('s', 'Thinking…');
    fetch(API + '/api/site-chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: turns.slice(-12), page: location.pathname }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        log.removeChild(thinking);
        if (!r.ok) throw new Error(r.error || 'No answer right now.');
        var d = r.data || {};
        if (d.configured === false) { add('a', 'The assistant is not switched on yet. Leave your question and we will answer by email.'); offerEmail(q); return; }
        add('a', d.answer || 'I am not sure about that one.');
        turns.push({ role: 'assistant', content: d.answer || '' }); save();
        if (d.handoff) { var m = add('s', ''); m.innerHTML = 'Want a person to answer? <button type="button" class="ax-link">Email ApexLedger</button>'; m.querySelector('button').onclick = function () { offerEmail(q); }; }
      })
      .catch(function (e) { if (thinking.parentNode) log.removeChild(thinking); add('s', (e && e.message) || 'No answer right now.'); offerEmail(q); })
      .then(function () { busy = false; send.disabled = false; input.focus(); });
  }

  function open() {
    if (panel) { panel.hidden = !panel.hidden; if (!panel.hidden) input.focus(); return; }
    panel = document.createElement('div'); panel.className = 'ax-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Ask a question');
    panel.innerHTML = '<div class="ax-head"><div><b>Ask ApexLedger</b><small>Answers from this website. For a person, use the email option.</small></div><button type="button" class="ax-x" aria-label="Close">×</button></div>' +
      '<div class="ax-log"></div>' +
      '<form class="ax-form"><input placeholder="Type your question…" maxlength="1000" autocomplete="off"><button type="submit" class="ax-send">Send</button></form>';
    document.body.appendChild(panel);
    log = panel.querySelector('.ax-log'); input = panel.querySelector('input'); send = panel.querySelector('.ax-send');
    panel.querySelector('.ax-x').onclick = function () { panel.hidden = true; fab.focus(); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel && !panel.hidden) panel.hidden = true; });
    panel.querySelector('form').onsubmit = function (e) { e.preventDefault(); ask(input.value); };
    if (turns.length === 0) { add('a', 'Hello. Ask me about seats and pricing, moving from QuickBooks or Sage, payroll, GST/HST, or how your data is protected.'); }
    else { turns.forEach(function (t) { add(t.role === 'user' ? 'u' : 'a', t.content); }); }
    var m = add('s', ''); m.innerHTML = 'Prefer a person? <button type="button" class="ax-link">Email ApexLedger</button>'; m.querySelector('button').onclick = function () { offerEmail(''); };
    input.focus();
  }
  fab.onclick = open;
})();

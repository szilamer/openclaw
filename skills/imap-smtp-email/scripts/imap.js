#!/usr/bin/env node
/**
 * IMAP: unseen list, fetch by UID, triage (fetch + Ollama Stage 1), mark-seen,
 * optional POST to Mission Control /api/emails/intake.
 * Credentials: ../.env (skill root), lásd env.example
 */
'use strict';

const path = require('path');
const fs = require('fs');

const skillRoot = path.join(__dirname, '..');
const envPath = path.join(skillRoot, '.env');
require('dotenv').config({ path: envPath });

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:14b';

function usage() {
  console.error(`
Használat:
  node scripts/imap.js check [--limit N]     # UNSEEN UID-k + rövid előnézet (JSON)
  node scripts/imap.js fetch <uid>           # Teljes levél JSON (stdout)
  node scripts/imap.js intake <uid> [opts]   # fetch + POST /emails/intake
      --mark-seen     # sikeres intake után \\Seen
      --no-task       # auto_create_task: false
  node scripts/imap.js triage [--limit N]    # fetch UNSEEN + Ollama Stage 1 → JSON
  node scripts/imap.js mark-seen <uid> [<uid2> ...]  # Mark message(s) as \\Seen

Környezet: ${envPath} (másolat: env.example)
  OLLAMA_URL     = ${OLLAMA_URL}
  OLLAMA_MODEL   = ${OLLAMA_MODEL}
`);
  process.exit(1);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Hiányzó env: ${name} (${envPath})`);
    process.exit(1);
  }
  return v;
}

function clientFromEnv() {
  return new ImapFlow({
    host: requireEnv('IMAP_HOST'),
    port: Number(process.env.IMAP_PORT || 993),
    secure: process.env.IMAP_TLS !== 'false',
    tls: {
      rejectUnauthorized: process.env.IMAP_REJECT_UNAUTHORIZED === 'true',
    },
    auth: {
      user: requireEnv('IMAP_USER'),
      pass: requireEnv('IMAP_PASS'),
    },
    logger: false,
  });
}

function sourceUid(mailbox, uid) {
  const user = process.env.IMAP_USER || 'user';
  return `imap:${user}:${mailbox}:${uid}`;
}

async function withClient(fn) {
  const client = clientFromEnv();
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout();
  }
}

async function cmdCheck(argv) {
  let limit = 20;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit' && argv[i + 1]) {
      limit = Math.max(1, parseInt(argv[i + 1], 10) || 20);
      i++;
    }
  }
  const mailbox = process.env.IMAP_MAILBOX || 'INBOX';

  const result = await withClient(async (client) => {
    await client.mailboxOpen(mailbox);
    let uids = await client.search({ unseen: true });
    if (!uids || uids.length === 0) {
      return { mailbox, unseen: [], messages: [] };
    }
    uids = uids.slice(-limit);
    const messages = [];
    for await (const msg of client.fetch(uids, {
      uid: true,
      envelope: true,
      internalDate: true,
    })) {
      const env = msg.envelope;
      const from =
        env.from?.[0]?.address ||
        env.from?.[0]?.name ||
        '';
      messages.push({
        uid: msg.uid,
        from,
        subject: env.subject || '',
        date: env.date?.toISOString?.() || msg.internalDate?.toISOString?.() || null,
      });
    }
    return { mailbox, unseen: uids, messages };
  });

  console.log(JSON.stringify(result, null, 2));
}

async function cmdFetch(uidStr) {
  const uid = Number(uidStr, 10);
  if (!Number.isFinite(uid) || uid < 1) {
    console.error('Érvénytelen UID');
    process.exit(1);
  }
  const mailbox = process.env.IMAP_MAILBOX || 'INBOX';

  const data = await withClient(async (client) => {
    await client.mailboxOpen(mailbox);
    for await (const msg of client.fetch(uid, {
      uid: true,
      source: true,
      envelope: true,
      internalDate: true,
    })) {
      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.text || msg.envelope?.from?.[0]?.address || '';
      const to = parsed.to?.text || msg.envelope?.to?.[0]?.address || '';
      const subject = parsed.subject || msg.envelope?.subject || '';
      const date =
        (parsed.date && parsed.date.toISOString()) ||
        msg.internalDate?.toISOString() ||
        new Date().toISOString();
      const body =
        (parsed.text && parsed.text.trim()) ||
        (parsed.html && stripHtml(parsed.html)) ||
        '';

      return {
        uid: msg.uid,
        mailbox,
        from,
        to,
        subject,
        date,
        body,
        source_uid: sourceUid(mailbox, msg.uid),
      };
    }
    return null;
  });

  if (!data) {
    console.error(JSON.stringify({ error: 'not_found', uid }));
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50000);
}

// ────────────────────────────────────────────────────────
// Ollama Stage 1 classification
// ────────────────────────────────────────────────────────

function buildTriagePrompt(email, projectList) {
  const projectSection = projectList && projectList.length > 0
    ? `\nElérhető projektek:\n${projectList.map((p) => `- ${p.projectName} (ID: ${p.projectId})`).join('\n')}\n`
    : '';

  return `Te egy email-triage asszisztens vagy. A feladatod, hogy az alábbi emailt osztályozd.

Válaszolj KIZÁRÓLAG érvényes JSON-nel, más szöveget NE írj:
{
  "classification": "irrelevant" | "relevant_unknown" | "classified",
  "rationale": "rövid indoklás magyarul (max 2 mondat)",
  "project_id": "projekt ID ha classified, egyébként null"
}

Osztályozás szabályai:
- "irrelevant": spam, hírlevél, automatikus értesítés, reklám, noreply, rendszerüzenet
- "relevant_unknown": üzleti/munka email de nem egyértelmű melyik projekthez tartozik
- "classified": egyértelműen besorolható az elérhető projektek egyikébe
${projectSection}
Email:
Feladó: ${email.from}
Címzett: ${email.to}
Tárgy: ${email.subject}
Dátum: ${email.date}
Szöveg (max 3000 karakter):
${(email.body || '').slice(0, 3000)}
`;
}

async function classifyWithOllama(email, projectList) {
  const prompt = buildTriagePrompt(email, projectList);

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 300 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Ollama HTTP ${res.status}: ${errText.slice(0, 200)}`);
      return { classification: 'relevant_unknown', rationale: 'Ollama hiba', project_id: null };
    }

    const data = await res.json();
    const raw = (data.response || '').trim();

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error(`Ollama nem JSON választ adott: ${raw.slice(0, 200)}`);
      return { classification: 'relevant_unknown', rationale: raw.slice(0, 200), project_id: null };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const validClassifications = ['irrelevant', 'relevant_unknown', 'classified'];
    if (!validClassifications.includes(parsed.classification)) {
      parsed.classification = 'relevant_unknown';
    }
    if (parsed.classification !== 'classified') {
      parsed.project_id = null;
    }

    return {
      classification: parsed.classification,
      rationale: String(parsed.rationale || '').slice(0, 500),
      project_id: parsed.project_id || null,
    };
  } catch (err) {
    console.error(`Ollama error: ${err.message}`);
    return { classification: 'relevant_unknown', rationale: `Ollama error: ${err.message}`, project_id: null };
  }
}

async function fetchProjectList() {
  const base = process.env.TASKMANAGER_BASE_URL;
  const token = process.env.TASKMANAGER_AGENT_TOKEN;
  if (!base || !token) return [];

  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/emails/routing-map`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

async function cmdTriage(argv) {
  let limit = 20;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--limit' && argv[i + 1]) {
      limit = Math.max(1, parseInt(argv[i + 1], 10) || 20);
      i++;
    }
  }
  const mailbox = process.env.IMAP_MAILBOX || 'INBOX';

  const projectList = await fetchProjectList();

  const emails = await withClient(async (client) => {
    await client.mailboxOpen(mailbox);
    let uids = await client.search({ unseen: true });
    if (!uids || uids.length === 0) return [];
    uids = uids.slice(-limit);

    const results = [];
    for await (const msg of client.fetch(uids, {
      uid: true,
      source: true,
      envelope: true,
      internalDate: true,
    })) {
      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.text || msg.envelope?.from?.[0]?.address || '';
      const to = parsed.to?.text || msg.envelope?.to?.[0]?.address || '';
      const subject = parsed.subject || msg.envelope?.subject || '';
      const date =
        (parsed.date && parsed.date.toISOString()) ||
        msg.internalDate?.toISOString() ||
        new Date().toISOString();
      const body =
        (parsed.text && parsed.text.trim()) ||
        (parsed.html && stripHtml(parsed.html)) ||
        '';

      results.push({
        uid: msg.uid,
        mailbox,
        from,
        to,
        subject,
        date,
        body,
        source_uid: sourceUid(mailbox, msg.uid),
      });
    }
    return results;
  });

  if (emails.length === 0) {
    console.log(JSON.stringify({ mailbox, count: 0, emails: [] }, null, 2));
    return;
  }

  console.error(`Triage: ${emails.length} email feldolgozása Ollama-val (${OLLAMA_MODEL})...`);

  const triaged = [];
  for (const email of emails) {
    const stage1 = await classifyWithOllama(email, projectList);
    triaged.push({
      ...email,
      stage1: {
        classification: stage1.classification,
        model: OLLAMA_MODEL,
        rationale: stage1.rationale,
        project_id: stage1.project_id,
      },
    });
    console.error(`  UID ${email.uid}: ${stage1.classification} — ${stage1.rationale?.slice(0, 80)}`);
  }

  console.log(JSON.stringify({ mailbox, count: triaged.length, emails: triaged }, null, 2));
}

// ────────────────────────────────────────────────────────
// Mark messages as \Seen
// ────────────────────────────────────────────────────────

async function cmdMarkSeen(argv) {
  if (argv.length === 0) {
    console.error('mark-seen: legalább egy UID szükséges');
    process.exit(1);
  }
  const uids = argv.map((s) => Number(s, 10)).filter((n) => Number.isFinite(n) && n > 0);
  if (uids.length === 0) {
    console.error('mark-seen: érvénytelen UID-k');
    process.exit(1);
  }
  const mailbox = process.env.IMAP_MAILBOX || 'INBOX';

  await withClient(async (client) => {
    await client.mailboxOpen(mailbox);
    for (const uid of uids) {
      await client.messageFlagsAdd({ uid }, ['\\Seen']);
    }
  });

  console.log(JSON.stringify({ ok: true, marked: uids }, null, 2));
}

async function cmdIntake(argv) {
  const uidStr = argv[0];
  if (!uidStr) usage();
  let markSeen = false;
  let autoCreateTask = true;
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--mark-seen') markSeen = true;
    if (argv[i] === '--no-task') autoCreateTask = false;
  }

  const base = process.env.TASKMANAGER_BASE_URL;
  const token = process.env.TASKMANAGER_AGENT_TOKEN;
  if (!base || !token) {
    console.error(
      'TASKMANAGER_BASE_URL és TASKMANAGER_AGENT_TOKEN kell az intake-hoz (.env)',
    );
    process.exit(1);
  }

  const mailbox = process.env.IMAP_MAILBOX || 'INBOX';
  const payload = await withClient(async (client) => {
    await client.mailboxOpen(mailbox);
    for await (const msg of client.fetch(Number(uidStr, 10), {
      uid: true,
      source: true,
      envelope: true,
      internalDate: true,
    })) {
      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.text || msg.envelope?.from?.[0]?.address || '';
      const to = parsed.to?.text || msg.envelope?.to?.[0]?.address || '';
      const subject = parsed.subject || msg.envelope?.subject || '';
      const date =
        (parsed.date && parsed.date.toISOString()) ||
        msg.internalDate?.toISOString() ||
        new Date().toISOString();
      const body =
        (parsed.text && parsed.text.trim()) ||
        (parsed.html && stripHtml(parsed.html)) ||
        '';

      if (markSeen) {
        await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen']);
      }

      return {
        from,
        to,
        subject,
        date,
        body,
        source_uid: sourceUid(mailbox, msg.uid),
        auto_create_task: autoCreateTask,
      };
    }
    return null;
  });

  if (!payload) {
    console.error(JSON.stringify({ error: 'not_found', uid: uidStr }));
    process.exit(1);
  }

  const url = `${base.replace(/\/$/, '')}/emails/intake`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    console.error(
      JSON.stringify({ error: 'intake_failed', status: res.status, body: json }, null, 2),
    );
    process.exit(1);
  }
  console.log(JSON.stringify({ ok: true, intake: json }, null, 2));
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (!cmd) usage();

  if (!fs.existsSync(envPath)) {
    console.error(
      `Nincs .env fájl: ${envPath}\nMásold az env.example-t .env néven és töltsd ki.`,
    );
    process.exit(1);
  }

  try {
    if (cmd === 'check') await cmdCheck(rest);
    else if (cmd === 'fetch') {
      if (!rest[0]) usage();
      await cmdFetch(rest[0]);
    } else if (cmd === 'intake') {
      if (!rest[0]) usage();
      await cmdIntake(rest);
    } else if (cmd === 'triage') await cmdTriage(rest);
    else if (cmd === 'mark-seen') await cmdMarkSeen(rest);
    else usage();
  } catch (e) {
    console.error(
      JSON.stringify(
        { error: e.message, stack: process.env.DEBUG ? e.stack : undefined },
        null,
        2,
      ),
    );
    process.exit(1);
  }
}

main();

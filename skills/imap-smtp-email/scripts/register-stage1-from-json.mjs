#!/usr/bin/env node
/**
 * stdin: imap.js triage JSON { mailbox, count, emails: [...] }
 * Minden emailre POST /emails/triage/register (csak Stage 1, awaiting_sophon).
 * Siker után: imap.js mark-seen <uid>... (újra nem dolgozza fel).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.join(__dirname, '..');
dotenv.config({ path: path.join(skillRoot, '.env') });

async function main() {
  const chunks = [];
  for await (const ch of process.stdin) chunks.push(ch);
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    console.error('register-stage1-from-json: üres stdin');
    process.exit(0);
  }
  const data = JSON.parse(raw);
  const emails = data.emails || [];
  const base = process.env.TASKMANAGER_BASE_URL?.replace(/\/$/, '');
  const token = process.env.TASKMANAGER_AGENT_TOKEN;
  if (!base || !token) {
    console.error(
      'TASKMANAGER_BASE_URL és TASKMANAGER_AGENT_TOKEN kell (.env)',
    );
    process.exit(2);
  }

  const uids = [];
  for (const email of emails) {
    const s1 = email.stage1 || {};
    const body = (email.body || '').slice(0, 20000);
    const payload = {
      source_uid: email.source_uid,
      mailbox: email.mailbox || 'INBOX',
      from: email.from,
      to: email.to,
      subject: email.subject,
      date: email.date,
      body: body || undefined,
      stage1_classification: s1.classification,
      stage1_model: s1.model,
      stage1_rationale: s1.rationale,
      stage1_project_id: s1.project_id || undefined,
    };
    const res = await fetch(`${base}/emails/triage/register`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(
        `Register UID ${email.uid} HTTP ${res.status}: ${text.slice(0, 300)}`,
      );
      process.exit(1);
    }
    console.error(`OK triage register UID ${email.uid}`);
    uids.push(email.uid);
  }

  if (uids.length === 0) {
    console.error('Nincs regisztrálandó email.');
    return;
  }

  const r = spawnSync(
    process.execPath,
    [path.join(__dirname, 'imap.js'), 'mark-seen', ...uids.map(String)],
    { stdio: 'inherit', env: process.env, cwd: skillRoot },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.error(`mark-seen: ${uids.length} levél`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

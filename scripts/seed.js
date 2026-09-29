// Наполняет локальную базу ДЕМО-данными. Все офисы, люди и реквизиты вымышлены.
// Реальные данные сети сюда не кладём — они придут отдельным импортом после
// переезда на закрытый хостинг (см. docs/ROADMAP.md, этап 1).
//
// Пароли генерируются случайно при каждом запуске и записываются в
// data/dev-credentials.txt (папка data/ не попадает в git).

import { readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { openDb, transaction, ROOT, DEFAULT_DB_PATH } from '../server/db.js';
import { hashPassword } from '../server/auth.js';

export function seedDemo(db, { passwords = {} } = {}) {
  const week = JSON.parse(readFileSync(join(ROOT, 'seed', 'week.json'), 'utf8'));
  const content = JSON.parse(readFileSync(join(ROOT, 'seed', 'demo-content.json'), 'utf8'));
  const credentials = [];

  transaction(db, () => {
    const addUser = db.prepare('INSERT INTO users (login, display_name, role, editor_scope, password_hash) VALUES (?, ?, ?, ?, ?)');
    const userIds = {};
    for (const u of content.users) {
      const password = passwords[u.login] || randomBytes(12).toString('base64url');
      userIds[u.login] = Number(addUser.run(u.login, u.displayName, u.role, u.editorScope || null, hashPassword(password)).lastInsertRowid);
      credentials.push({ login: u.login, role: u.role, password });
    }

    const addOffice = db.prepare(`INSERT INTO offices (name, city, address, office_group, status, opened_on, royalty_rate, phone, email)
                                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const addReq = db.prepare(`INSERT INTO office_requisites (office_id, legal_name, inn, ogrn, bank_name, bik, account, corr_account)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const addMember = db.prepare('INSERT INTO office_memberships (user_id, office_id, role) VALUES (?, ?, ?)');
    for (const o of content.offices) {
      const id = Number(addOffice.run(o.name, o.city, o.address, o.group || 'main', o.status || 'active', o.openedOn || null,
        o.royaltyRate ?? null, o.phone || null, o.email || null).lastInsertRowid);
      if (o.requisites) {
        const r = o.requisites;
        addReq.run(id, r.legalName, r.inn, r.ogrn, r.bankName, r.bik, r.account, r.corrAccount);
      }
      for (const [login, role] of Object.entries(o.members || {})) addMember.run(userIds[login], id, role);
    }

    const addArticle = db.prepare(`INSERT INTO articles (slug, section, title, summary, body, audience, version, author_id, updated_at, reviewed_at, source)
                                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), datetime('now', ?), ?)`);
    for (const a of content.articles) {
      addArticle.run(a.slug, a.section, a.title, a.summary, a.body, a.audience || 'all', a.version || 1,
        userIds[a.author] ?? null, `-${a.daysAgo || 0} days`, `-${a.daysAgo || 0} days`, a.source || null);
    }

    const addAnn = db.prepare("INSERT INTO announcements (title, body, requires_ack, published_at, author_id) VALUES (?, ?, ?, datetime('now', ?), ?)");
    for (const a of content.announcements) addAnn.run(a.title, a.body, a.requiresAck ? 1 : 0, `-${a.daysAgo || 0} days`, userIds.franchise);

    const addEvent = db.prepare("INSERT INTO events (title, starts_at, kind, place) VALUES (?, datetime('now', ?, 'start of day', ?), ?, ?)");
    // В базе время хранится в UTC, а в сидах час указан по Москве (UTC+3).
    for (const e of content.events) addEvent.run(e.title, `+${e.inDays} days`, `${e.hour - 3} hours`, e.kind, e.place || null);

    const addDay = db.prepare('INSERT INTO week_days (id, position, short, name, title, subtitle, result, message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const addTask = db.prepare('INSERT INTO task_templates (id, weekday, position, label, helper, done_when) VALUES (?, ?, ?, ?, ?, ?)');
    for (const d of week.days) {
      addDay.run(d.id, d.position, d.short, d.name, d.title, d.subtitle, d.result, d.message);
      d.tasks.forEach((t, i) => addTask.run(t.id, d.id, i, t.label, t.helper, t.doneWhen));
    }

    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded_at', datetime('now')), ('seed_kind', 'demo')").run();
  });

  return credentials;
}

// Запуск из командной строки
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reset = process.argv.includes('--reset');
  if (reset) {
    for (const suffix of ['', '-wal', '-shm']) rmSync(DEFAULT_DB_PATH + suffix, { force: true });
  } else if (existsSync(DEFAULT_DB_PATH)) {
    const db = openDb();
    if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n) {
      console.error('База уже наполнена. Для пересоздания: npm run reset');
      process.exit(1);
    }
    db.close();
  }

  const db = openDb();
  const credentials = seedDemo(db);
  db.close();

  const file = join(ROOT, 'data', 'dev-credentials.txt');
  writeFileSync(file, [
    'Домиан Hub — локальные ДЕМО-учётки. Файл не коммитится (папка data/ в .gitignore).',
    'Пароли меняются при каждом «npm run reset».',
    'В поле «Логин» вводится первая колонка (не роль!).',
    '',
    `${'ЛОГИН'.padEnd(12)} ${'ПАРОЛЬ'.padEnd(18)} РОЛЬ (для справки)`,
    ...credentials.map((c) => `${c.login.padEnd(12)} ${c.password.padEnd(18)} ${c.role}`),
    '',
  ].join('\n'));
  console.log(`База создана: ${DEFAULT_DB_PATH}`);
  console.log(`Логины и пароли: ${file}`);
}

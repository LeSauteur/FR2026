import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openDb, ROOT } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seedDemo } from '../scripts/seed.js';
import { moscowDate, weekdayId } from '../shared/dates.js';

const PASS = 'test-password-123';
let server;
let base;
let db;

before(async () => {
  db = openDb(':memory:');
  const logins = ['admin', 'franchise', 'editor-hr', 'owner1', 'owner2', 'manager1'];
  seedDemo(db, { passwords: Object.fromEntries(logins.map((l) => [l, PASS])) });
  server = createServer(createApp(db));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

async function call(path, { method = 'GET', body, cookie, origin = base, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(method !== 'GET' && origin ? { Origin: origin } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
}

async function login(loginName) {
  const res = await call('/api/login', { method: 'POST', body: { login: loginName, password: PASS } });
  assert.equal(res.status, 200, `вход ${loginName}`);
  return res.headers.get('set-cookie').split(';')[0];
}

const officeId = (name) => db.prepare('SELECT id FROM offices WHERE name = ?').get(name).id;

test('без входа API закрыт', async () => {
  assert.equal((await call('/api/me')).status, 401);
  assert.equal((await call('/api/offices')).status, 401);
  assert.equal((await call('/api/network')).status, 401);
});

test('неверный пароль — 401, cookie сессии HttpOnly и SameSite=Strict', async () => {
  assert.equal((await call('/api/login', { method: 'POST', body: { login: 'owner1', password: 'wrong-password' } })).status, 401);
  const res = await call('/api/login', { method: 'POST', body: { login: 'owner1', password: PASS } });
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.equal(res.data.user.password_hash, undefined);
});

test('перебор пароля блокируется', async () => {
  for (let i = 0; i < 5; i += 1) {
    await call('/api/login', { method: 'POST', body: { login: 'editor-hr', password: 'nope-nope-nope' } });
  }
  const res = await call('/api/login', { method: 'POST', body: { login: 'editor-hr', password: PASS } });
  assert.equal(res.status, 429);
});

test('выход уничтожает сессию', async () => {
  const cookie = await login('owner2');
  assert.equal((await call('/api/logout', { method: 'POST', cookie })).status, 200);
  assert.equal((await call('/api/me', { cookie })).status, 401);
});

test('собственник видит только свои офисы', async () => {
  const cookie = await login('owner1');
  const { data } = await call('/api/offices', { cookie });
  assert.equal(data.scope, 'mine');
  assert.deepEqual(data.offices.map((o) => o.name).sort(), ['Демо-Север', 'Демо-Центр']);
});

test('чужой офис для собственника не существует (404), свой — с реквизитами', async () => {
  const cookie = await login('owner2');
  assert.equal((await call(`/api/offices/${officeId('Демо-Центр')}`, { cookie })).status, 404);
  const own = await call(`/api/offices/${officeId('Демо-Юг')}`, { cookie });
  assert.equal(own.status, 200);
  assert.equal(own.data.requisites.legal_name, 'ООО «Демо Юг»');
});

test('франшизный отдел видит все офисы, включая архив', async () => {
  const cookie = await login('franchise');
  const { data } = await call('/api/offices', { cookie });
  assert.equal(data.scope, 'all');
  assert.equal(data.offices.length, 5);
});

test('справочник сети: только действующие офисы и без реквизитов/собственников', async () => {
  const cookie = await login('owner2');
  const { data } = await call('/api/network', { cookie });
  assert.equal(data.offices.length, 4);
  for (const o of data.offices) {
    assert.deepEqual(Object.keys(o).sort(), ['address', 'city', 'id', 'name', 'phone']);
  }
});

test('просмотр реквизитов пишется в журнал аудита', async () => {
  const cookie = await login('manager1');
  await call(`/api/offices/${officeId('Демо-Центр')}`, { cookie });
  const row = db.prepare("SELECT * FROM audit_log WHERE action = 'requisites.view' ORDER BY id DESC").get();
  assert.equal(row.entity_id, String(officeId('Демо-Центр')));
});

test('служебная статья скрыта от собственника и видна отделу', async () => {
  const owner = await login('owner1');
  assert.equal((await call('/api/articles/reviziya-papki', { cookie: owner })).status, 404);
  const list = await call('/api/articles', { cookie: owner });
  assert.ok(!list.data.articles.some((a) => a.slug === 'reviziya-papki'));
  const staff = await login('franchise');
  assert.equal((await call('/api/articles/reviziya-papki', { cookie: staff })).status, 200);
});

test('поиск по базе знаний и отметка «прочитано»', async () => {
  const cookie = await login('owner1');
  const found = await call('/api/articles?q=' + encodeURIComponent('роялти'), { cookie });
  assert.ok(found.data.articles.some((a) => a.slug === 'royalty-2026'));
  assert.ok(found.data.articles.find((a) => a.slug === 'royalty-2026').unread);
  await call('/api/articles/royalty-2026', { cookie });
  const again = await call('/api/articles?q=' + encodeURIComponent('роялти'), { cookie });
  assert.ok(!again.data.articles.find((a) => a.slug === 'royalty-2026').unread);
  const cyr = await call('/api/articles?q=' + encodeURIComponent('СТИПЕНДИЯ'), { cookie });
  assert.ok(cyr.data.articles.some((a) => a.slug === 'motivation-2026'), 'поиск по кириллице без учёта регистра');
  const wild = await call('/api/articles?q=_', { cookie });
  assert.equal(wild.data.articles.length, 0, '_ ищется как символ, а не как шаблон LIKE');
});

test('журнал аудита доступен только суперадмину', async () => {
  assert.equal((await call('/api/admin/audit', { cookie: await login('franchise') })).status, 403);
  assert.equal((await call('/api/admin/audit', { cookie: await login('admin') })).status, 200);
});

test('изменяющий запрос без своего Origin отклоняется', async () => {
  const cookie = await login('owner1');
  const noOrigin = await call('/api/support', { method: 'POST', cookie, origin: null, body: { category: 'it', subject: 'x', body: 'y' } });
  assert.equal(noOrigin.status, 403);
  const foreign = await call('/api/support', { method: 'POST', cookie, origin: 'http://evil.example', body: { category: 'it', subject: 'x', body: 'y' } });
  assert.equal(foreign.status, 403);
});

test('чужой Host отклоняется (DNS-rebinding)', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: server.address().port, path: '/api/me', headers: { Host: 'evil.example' } },
      (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 421);
});

test('заявка в поддержку: создаёт собственник, статус меняет только отдел', async () => {
  const owner = await login('owner1');
  const created = await call('/api/support', { method: 'POST', cookie: owner, body: { category: 'it', subject: 'Не работает принтер', body: 'Подробности' } });
  assert.equal(created.status, 201);
  assert.equal((await call(`/api/support/${created.data.id}`, { method: 'PATCH', cookie: owner, body: { status: 'done' } })).status, 403);
  const staff = await login('franchise');
  assert.equal((await call(`/api/support/${created.data.id}`, { method: 'PATCH', cookie: staff, body: { status: 'done' } })).status, 200);
  const other = await call('/api/support', { cookie: await login('owner2') });
  assert.ok(!other.data.requests.some((r) => r.id === created.data.id), 'чужие заявки не видны');
});

test('сохранённый расчёт пересчитывается сервером', async () => {
  const cookie = await login('owner1');
  const res = await call('/api/calculations', {
    method: 'POST', cookie,
    body: { calculator: 'royalty', title: 'Август', input: { turnover: 2_540_000 }, result: { royalty: 1 } },
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.result.royalty, 101_600);
  const foreignOffice = await call('/api/calculations', {
    method: 'POST', cookie, body: { calculator: 'royalty', title: 'x', officeId: officeId('Демо-Юг'), input: {} },
  });
  assert.equal(foreignOffice.status, 403);
});

test('7 дней: отметка задачи хранится у пользователя', async () => {
  const cookie = await login('owner1');
  const week = await call('/api/week', { cookie });
  assert.equal(week.data.day.id, weekdayId(moscowDate()));
  const task = week.data.tasks[0];
  await call('/api/week/toggle', { method: 'POST', cookie, body: { templateId: task.id, date: week.data.date, done: true } });
  const after = await call('/api/week', { cookie });
  assert.ok(after.data.tasks[0].done);
  const other = await call('/api/week', { cookie: await login('owner2') });
  assert.ok(!other.data.tasks[0].done, 'у другого пользователя своя отметка');
  const wrongDay = await call('/api/week/toggle', { method: 'POST', cookie, body: { templateId: 'monday:choose-buyer', date: '2026-09-27', done: true } });
  assert.equal(wrongDay.status, 400);
});

test('статика: выход за пределы папки невозможен, заголовки безопасности на месте', async () => {
  const cookie = await login('owner1');
  for (const path of ['/shared/..%2fserver%2fdb.js', '/..%2fdata%2fhub.sqlite', '/shared/%2e%2e/scripts/seed.js']) {
    const res = await call(path, { cookie });
    assert.ok(!String(res.data).includes('DatabaseSync'), path);
    assert.ok(!String(res.data).includes('seedDemo'), path);
  }
  const page = await fetch(base + '/');
  assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
});

test('во фронтенде нет паролей, токенов и реквизитов', () => {
  const files = readdirSync(join(ROOT, 'public'), { recursive: true }).filter((f) => /\.(js|html|css)$/.test(f));
  for (const file of files) {
    const text = readFileSync(join(ROOT, 'public', file), 'utf8');
    assert.doesNotMatch(text, /\b\d{20}\b/, `${file}: похоже на расчётный счёт`);
    assert.doesNotMatch(text, /(ACCESS_CODE|validTokens|const\s+PASSWORD)/i, `${file}: секрет во фронтенде`);
  }
});

import { join } from 'node:path';
import { ROOT, transaction } from './db.js';
import {
  authenticate, createSession, sessionUser, destroySession, createLoginLimiter,
  SESSION_COOKIE, SESSION_TTL_HOURS,
} from './auth.js';
import {
  isStaff, canEditContent, canSeeOffice, canSeeRequisites, canSeeArticle,
  articleAudienceFilter, myOfficeIds,
} from './access.js';
import { audit } from './audit.js';
import {
  HttpError, sendJson, readJson, parseCookies, sessionCookie, serveStatic, clientIp, SECURITY_HEADERS,
} from './http.js';
import { CALCULATORS, POLICIES } from '../shared/calculators.js';
import { moscowDate, isIsoDate, weekdayId } from '../shared/dates.js';

const PUBLIC_DIR = join(ROOT, 'public');
const SHARED_DIR = join(ROOT, 'shared');
const SUPPORT_CATEGORIES = ['it', 'hr', 'pr', 'newbuild', 'franchise', 'finance'];

const text = (value, max, field) => {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) throw new HttpError(400, `Заполните поле «${field}».`);
  if (s.length > max) throw new HttpError(400, `Поле «${field}» длиннее ${max} символов.`);
  return s;
};

const publicUser = (u) => ({ id: u.id, login: u.login, displayName: u.display_name, role: u.role, editorScope: u.editor_scope });

// ---------------- Маршруты ----------------
// auth: true — нужен вход; roles — ограничение по системной роли.

const routes = [];
const route = (method, pattern, handler, options = {}) => {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, regex, keys, handler, auth: options.auth ?? true, roles: options.roles });
};

route('POST', '/api/login', async (ctx) => {
  const body = await readJson(ctx.req);
  const login = String(body.login || '').trim().toLowerCase();
  const key = `${login}|${ctx.ip}`;
  if (ctx.limiter.blocked(key)) throw new HttpError(429, 'Слишком много попыток. Подождите 15 минут.');
  const user = authenticate(ctx.db, login, body.password);
  if (!user) {
    ctx.limiter.fail(key);
    audit(ctx.db, { action: 'login.failed', entity: 'user', entityId: login, ip: ctx.ip });
    throw new HttpError(401, 'Неверный логин или пароль.');
  }
  ctx.limiter.reset(key);
  const token = createSession(ctx.db, user.id);
  audit(ctx.db, { user, action: 'login', ip: ctx.ip });
  return [200, { user: publicUser(user) }, {
    'Set-Cookie': sessionCookie(SESSION_COOKIE, token, { maxAgeSeconds: SESSION_TTL_HOURS * 3600, secure: ctx.secureCookies }),
  }];
}, { auth: false });

route('POST', '/api/logout', (ctx) => {
  destroySession(ctx.db, ctx.token);
  audit(ctx.db, { user: ctx.user, action: 'logout', ip: ctx.ip });
  return [200, { ok: true }, { 'Set-Cookie': sessionCookie(SESSION_COOKIE, '', { maxAgeSeconds: 0, secure: ctx.secureCookies }) }];
});

route('GET', '/api/me', (ctx) => {
  const offices = ctx.db.prepare(`SELECT o.id, o.name, o.city, m.role AS membership
                                  FROM office_memberships m JOIN offices o ON o.id = m.office_id
                                  WHERE m.user_id = ? ORDER BY o.name`).all(ctx.user.id);
  return { user: publicUser(ctx.user), offices, isStaff: isStaff(ctx.user), canEditContent: canEditContent(ctx.user) };
});

route('GET', '/api/dashboard', (ctx) => {
  const { db, user } = ctx;
  const today = moscowDate();
  const day = weekdayId(today);
  const announcements = db.prepare(`SELECT a.id, a.title, a.body, a.requires_ack, a.published_at,
                                           (k.user_id IS NOT NULL) AS acked
                                    FROM announcements a
                                    LEFT JOIN announcement_acks k ON k.announcement_id = a.id AND k.user_id = ?
                                    ORDER BY a.published_at DESC LIMIT 5`).all(user.id);
  const events = db.prepare(`SELECT id, title, starts_at, kind, place FROM events
                             WHERE starts_at >= date('now') AND starts_at < date('now', '+30 days')
                             ORDER BY starts_at LIMIT 5`).all();
  const tasks = db.prepare(`SELECT COUNT(*) AS total,
                                   SUM(CASE WHEN c.user_id IS NOT NULL THEN 1 ELSE 0 END) AS done
                            FROM task_templates t
                            LEFT JOIN task_completions c ON c.template_id = t.id AND c.user_id = ? AND c.work_date = ?
                            WHERE t.weekday = ?`).get(user.id, today, day);
  const weekDay = db.prepare('SELECT id, name, title FROM week_days WHERE id = ?').get(day) || null;
  const changedArticles = db.prepare(`SELECT a.id, a.slug, a.title, a.section, a.updated_at,
                                             (v.version IS NULL) AS is_new
                                      FROM articles a
                                      LEFT JOIN article_views v ON v.article_id = a.id AND v.user_id = ?
                                      WHERE ${articleAudienceFilter(user)} AND (v.version IS NULL OR v.version < a.version)
                                      ORDER BY a.updated_at DESC LIMIT 5`).all(user.id);
  const openRequests = db.prepare(`SELECT COUNT(*) AS n FROM support_requests
                                   WHERE status IN ('new','in_progress') ${isStaff(user) ? '' : 'AND user_id = ?'}`)
    .get(...(isStaff(user) ? [] : [user.id])).n;
  return {
    today, weekDay,
    tasks: { total: tasks.total || 0, done: tasks.done || 0 },
    announcements: announcements.map((a) => ({ ...a, requires_ack: Boolean(a.requires_ack), acked: Boolean(a.acked) })),
    events, changedArticles: changedArticles.map((a) => ({ ...a, is_new: Boolean(a.is_new) })), openRequests,
  };
});

// ----- Офисы -----

route('GET', '/api/offices', (ctx) => {
  const { db, user } = ctx;
  const base = `SELECT o.id, o.name, o.city, o.address, o.office_group, o.status, o.opened_on, o.phone, o.email,
                       (SELECT GROUP_CONCAT(u.display_name, ', ') FROM office_memberships m JOIN users u ON u.id = m.user_id
                        WHERE m.office_id = o.id AND m.role = 'owner') AS owners
                FROM offices o`;
  if (isStaff(user)) return { scope: 'all', offices: db.prepare(`${base} ORDER BY o.status, o.city, o.name`).all() };
  const ids = myOfficeIds(db, user);
  const offices = ids.length
    ? db.prepare(`${base} WHERE o.id IN (${ids.map(() => '?').join(',')}) ORDER BY o.name`).all(...ids)
    : [];
  return { scope: 'mine', offices };
});

// Справочник сети — только публичные контакты действующих офисов, без собственников и реквизитов.
route('GET', '/api/network', (ctx) => ({
  offices: ctx.db.prepare(`SELECT id, name, city, address, phone FROM offices
                           WHERE status = 'active' ORDER BY city, name`).all(),
}));

route('GET', '/api/offices/:id', (ctx) => {
  const { db, user, params } = ctx;
  const id = Number(params.id);
  if (!canSeeOffice(db, user, id)) throw new HttpError(404, 'Офис не найден.');
  const office = db.prepare('SELECT * FROM offices WHERE id = ?').get(id);
  if (!office) throw new HttpError(404, 'Офис не найден.');
  const people = db.prepare(`SELECT u.display_name, m.role FROM office_memberships m JOIN users u ON u.id = m.user_id
                             WHERE m.office_id = ?
                             ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, u.display_name`).all(id);
  let requisites = null;
  if (canSeeRequisites(db, user, id)) {
    requisites = db.prepare('SELECT * FROM office_requisites WHERE office_id = ?').get(id) || null;
    if (requisites) audit(db, { user, action: 'requisites.view', entity: 'office', entityId: id, ip: ctx.ip });
  }
  return { office, people, requisites, requisitesHidden: !canSeeRequisites(db, user, id) };
});

// ----- База знаний -----

route('GET', '/api/articles', (ctx) => {
  const q = (ctx.url.searchParams.get('q') || '').trim().slice(0, 100);
  const section = (ctx.url.searchParams.get('section') || '').trim();
  const where = [articleAudienceFilter(ctx.user)];
  const args = [ctx.user.id];
  if (q) {
    where.push("(ru_lower(title) LIKE ? ESCAPE '\\' OR ru_lower(summary) LIKE ? ESCAPE '\\' OR ru_lower(body) LIKE ? ESCAPE '\\')");
    const like = `%${q.toLowerCase().replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    args.push(like, like, like);
  }
  if (section) { where.push('section = ?'); args.push(section); }
  const articles = ctx.db.prepare(`SELECT a.id, a.slug, a.section, a.title, a.summary, a.updated_at, a.version, a.audience,
                                          (v.version IS NULL OR v.version < a.version) AS unread
                                   FROM articles a
                                   LEFT JOIN article_views v ON v.article_id = a.id AND v.user_id = ?
                                   WHERE ${where.join(' AND ')}
                                   ORDER BY a.section, a.title`).all(...args);
  const sections = ctx.db.prepare(`SELECT section, COUNT(*) AS n FROM articles WHERE ${articleAudienceFilter(ctx.user)}
                                   GROUP BY section ORDER BY section`).all();
  return { articles: articles.map((a) => ({ ...a, unread: Boolean(a.unread) })), sections };
});

route('GET', '/api/articles/:slug', (ctx) => {
  const article = ctx.db.prepare('SELECT * FROM articles WHERE slug = ?').get(ctx.params.slug);
  if (!canSeeArticle(ctx.user, article)) throw new HttpError(404, 'Статья не найдена.');
  ctx.db.prepare(`INSERT INTO article_views (user_id, article_id, version) VALUES (?, ?, ?)
                  ON CONFLICT(user_id, article_id) DO UPDATE SET version = excluded.version, viewed_at = datetime('now')`)
    .run(ctx.user.id, article.id, article.version);
  return { article };
});

// ----- Объявления и события -----

route('GET', '/api/announcements', (ctx) => ({
  announcements: ctx.db.prepare(`SELECT a.id, a.title, a.body, a.requires_ack, a.published_at,
                                        (k.user_id IS NOT NULL) AS acked, k.acked_at
                                 FROM announcements a
                                 LEFT JOIN announcement_acks k ON k.announcement_id = a.id AND k.user_id = ?
                                 ORDER BY a.published_at DESC`).all(ctx.user.id)
    .map((a) => ({ ...a, requires_ack: Boolean(a.requires_ack), acked: Boolean(a.acked) })),
  events: ctx.db.prepare("SELECT * FROM events WHERE starts_at >= date('now', '-1 day') ORDER BY starts_at").all(),
}));

route('POST', '/api/announcements/:id/ack', (ctx) => {
  const id = Number(ctx.params.id);
  const exists = ctx.db.prepare('SELECT id FROM announcements WHERE id = ?').get(id);
  if (!exists) throw new HttpError(404, 'Объявление не найдено.');
  ctx.db.prepare('INSERT OR IGNORE INTO announcement_acks (announcement_id, user_id) VALUES (?, ?)').run(id, ctx.user.id);
  audit(ctx.db, { user: ctx.user, action: 'announcement.ack', entity: 'announcement', entityId: id, ip: ctx.ip });
  return { ok: true };
});

// ----- Моя работа: 7 дней -----

route('GET', '/api/week', (ctx) => {
  const requested = ctx.url.searchParams.get('date');
  const date = isIsoDate(requested) ? requested : moscowDate();
  const days = ctx.db.prepare('SELECT * FROM week_days ORDER BY position').all();
  const day = weekdayId(date);
  const tasks = ctx.db.prepare(`SELECT t.id, t.label, t.helper, t.done_when, (c.user_id IS NOT NULL) AS done
                                FROM task_templates t
                                LEFT JOIN task_completions c ON c.template_id = t.id AND c.user_id = ? AND c.work_date = ?
                                WHERE t.weekday = ? ORDER BY t.position`).all(ctx.user.id, date, day)
    .map((t) => ({ ...t, done: Boolean(t.done) }));
  return { date, today: moscowDate(), day: days.find((d) => d.id === day) || null, days, tasks };
});

route('POST', '/api/week/toggle', async (ctx) => {
  const body = await readJson(ctx.req);
  const date = isIsoDate(body.date) ? body.date : moscowDate();
  const template = ctx.db.prepare('SELECT id, weekday FROM task_templates WHERE id = ?').get(String(body.templateId || ''));
  if (!template || template.weekday !== weekdayId(date)) throw new HttpError(400, 'Задача не относится к этой дате.');
  if (body.done) {
    ctx.db.prepare('INSERT OR IGNORE INTO task_completions (user_id, template_id, work_date) VALUES (?, ?, ?)')
      .run(ctx.user.id, template.id, date);
  } else {
    ctx.db.prepare('DELETE FROM task_completions WHERE user_id = ? AND template_id = ? AND work_date = ?')
      .run(ctx.user.id, template.id, date);
  }
  return { ok: true };
});

// ----- Калькуляторы -----

route('GET', '/api/calculations', (ctx) => ({
  calculations: ctx.db.prepare(`SELECT id, calculator, policy_id, title, input_json, result_json, created_at
                                FROM saved_calculations WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).all(ctx.user.id),
}));

// Сервер пересчитывает результат сам и не доверяет присланному клиентом.
route('POST', '/api/calculations', async (ctx) => {
  const body = await readJson(ctx.req);
  const calc = CALCULATORS[body.calculator];
  if (!calc) throw new HttpError(400, 'Неизвестный калькулятор.');
  const title = text(body.title, 120, 'Название расчёта');
  const officeId = body.officeId ? Number(body.officeId) : null;
  if (officeId && !canSeeOffice(ctx.db, ctx.user, officeId)) throw new HttpError(403, 'Нет доступа к офису.');
  const input = body.input && typeof body.input === 'object' ? body.input : {};
  const result = calc.run(input, POLICIES[calc.policyId]);
  const info = ctx.db.prepare(`INSERT INTO saved_calculations (user_id, office_id, calculator, policy_id, title, input_json, result_json)
                               VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(ctx.user.id, officeId, body.calculator, calc.policyId, title, JSON.stringify(input), JSON.stringify(result));
  return [201, { id: Number(info.lastInsertRowid), result }];
});

route('DELETE', '/api/calculations/:id', (ctx) => {
  const info = ctx.db.prepare('DELETE FROM saved_calculations WHERE id = ? AND user_id = ?').run(Number(ctx.params.id), ctx.user.id);
  if (!info.changes) throw new HttpError(404, 'Расчёт не найден.');
  return { ok: true };
});

// ----- Поддержка -----

route('GET', '/api/support', (ctx) => {
  const staff = isStaff(ctx.user);
  const rows = ctx.db.prepare(`SELECT r.id, r.category, r.subject, r.body, r.status, r.created_at,
                                      u.display_name AS author, o.name AS office
                               FROM support_requests r JOIN users u ON u.id = r.user_id
                               LEFT JOIN offices o ON o.id = r.office_id
                               ${staff ? '' : 'WHERE r.user_id = ?'}
                               ORDER BY r.created_at DESC LIMIT 100`).all(...(staff ? [] : [ctx.user.id]));
  return { requests: rows, categories: SUPPORT_CATEGORIES };
});

route('POST', '/api/support', async (ctx) => {
  const body = await readJson(ctx.req);
  if (!SUPPORT_CATEGORIES.includes(body.category)) throw new HttpError(400, 'Выберите категорию.');
  const subject = text(body.subject, 160, 'Тема');
  const message = text(body.body, 4000, 'Описание');
  const officeId = body.officeId ? Number(body.officeId) : null;
  if (officeId && !canSeeOffice(ctx.db, ctx.user, officeId)) throw new HttpError(403, 'Нет доступа к офису.');
  const info = ctx.db.prepare('INSERT INTO support_requests (user_id, office_id, category, subject, body) VALUES (?, ?, ?, ?, ?)')
    .run(ctx.user.id, officeId, body.category, subject, message);
  audit(ctx.db, { user: ctx.user, action: 'support.create', entity: 'support_request', entityId: info.lastInsertRowid, newValue: { category: body.category, subject }, ip: ctx.ip });
  return [201, { id: Number(info.lastInsertRowid) }];
});

route('PATCH', '/api/support/:id', async (ctx) => {
  const body = await readJson(ctx.req);
  if (!['new', 'in_progress', 'done', 'rejected'].includes(body.status)) throw new HttpError(400, 'Неверный статус.');
  const id = Number(ctx.params.id);
  const before = ctx.db.prepare('SELECT status FROM support_requests WHERE id = ?').get(id);
  if (!before) throw new HttpError(404, 'Заявка не найдена.');
  transaction(ctx.db, () => {
    ctx.db.prepare('UPDATE support_requests SET status = ? WHERE id = ?').run(body.status, id);
    audit(ctx.db, { user: ctx.user, action: 'support.status', entity: 'support_request', entityId: id, oldValue: before.status, newValue: body.status, ip: ctx.ip });
  });
  return { ok: true };
}, { roles: ['superadmin', 'franchise'] });

// ----- Администрирование -----

route('GET', '/api/admin/users', (ctx) => ({
  users: ctx.db.prepare(`SELECT u.id, u.login, u.display_name, u.role, u.is_active, u.last_login_at,
                                (SELECT GROUP_CONCAT(o.name, ', ') FROM office_memberships m JOIN offices o ON o.id = m.office_id
                                 WHERE m.user_id = u.id) AS offices
                         FROM users u ORDER BY u.role, u.display_name`).all(),
}), { roles: ['superadmin', 'franchise'] });

route('GET', '/api/admin/audit', (ctx) => ({
  entries: ctx.db.prepare(`SELECT l.id, l.at, l.action, l.entity, l.entity_id, l.old_value, l.new_value, l.ip,
                                  u.display_name AS user
                           FROM audit_log l LEFT JOIN users u ON u.id = l.user_id
                           ORDER BY l.id DESC LIMIT 200`).all(),
}), { roles: ['superadmin'] });

// ---------------- Обработчик ----------------

export function createApp(db, { allowedHosts = ['localhost', '127.0.0.1'], secureCookies = false } = {}) {
  const limiter = createLoginLimiter();

  return async function handle(req, res) {
    try {
      const host = String(req.headers.host || '').replace(/:\d+$/, '');
      // Защита от DNS-rebinding: сервер отвечает только на свои имена.
      if (!allowedHosts.includes(host)) throw new HttpError(421, 'Неизвестный хост.');
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (url.pathname.startsWith('/api/')) {
        // Изменяющие запросы принимаем только со своей страницы.
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const origin = req.headers.origin;
          if (!origin || new URL(origin).hostname !== host) throw new HttpError(403, 'Запрос с чужого источника отклонён.');
        }
        const token = parseCookies(req.headers.cookie)[SESSION_COOKIE] || null;
        for (const r of routes) {
          if (r.method !== req.method) continue;
          const match = url.pathname.match(r.regex);
          if (!match) continue;
          const user = sessionUser(db, token);
          if (r.auth && !user) throw new HttpError(401, 'Требуется вход.');
          if (r.roles && !r.roles.includes(user.role)) throw new HttpError(403, 'Недостаточно прав.');
          const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(match[i + 1])]));
          const ctx = { req, res, db, url, params, user, token, ip: clientIp(req), limiter, secureCookies };
          const out = await r.handler(ctx);
          const [status, data, headers] = Array.isArray(out) ? out : [200, out, {}];
          return sendJson(res, status, data, headers);
        }
        throw new HttpError(404, 'Метод не найден.');
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Метод не поддерживается.');
      if (url.pathname.startsWith('/shared/')) {
        if (await serveStatic(res, SHARED_DIR, url.pathname.slice('/shared/'.length))) return;
        throw new HttpError(404, 'Файл не найден.');
      }
      if (url.pathname !== '/' && await serveStatic(res, PUBLIC_DIR, url.pathname)) return;
      // SPA: любые «страницы» отдаём оболочкой, данные она получит через API после входа.
      if (!/\.[a-z0-9]+$/i.test(url.pathname) && await serveStatic(res, PUBLIC_DIR, 'index.html')) return;
      throw new HttpError(404, 'Файл не найден.');
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status === 500) console.error(error);
      if (res.headersSent) return res.end();
      if (String(req.url).startsWith('/api/')) {
        return sendJson(res, status, { error: status === 500 ? 'Внутренняя ошибка сервера.' : error.message });
      }
      res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(status === 500 ? 'Внутренняя ошибка сервера.' : error.message);
    }
  };
}

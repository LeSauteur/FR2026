// Адаптер статической демонстрации для GitHub Pages.
// Он повторяет контракты серверного API на вымышленных данных и хранит изменения
// только в localStorage конкретного браузера. Серверный режим его не использует.

import { CALCULATORS, POLICIES } from '../shared/calculators.js';
import { moscowDate, weekdayId } from '../shared/dates.js';

const STORAGE_KEY = 'domian-hub-demo-v1';
const SUPPORT_CATEGORIES = ['it', 'hr', 'pr', 'newbuild', 'franchise', 'finance'];
const STAFF_ROLES = new Set(['superadmin', 'franchise', 'editor']);

let fixturesPromise;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function stateWithDefaults() {
  return {
    login: null,
    completions: {},
    reads: {},
    acks: {},
    calculations: [],
    requests: [],
    audit: [],
    ...loadState(),
  };
}

async function fixtures() {
  if (!fixturesPromise) {
    fixturesPromise = Promise.all([
      fetch(new URL('../demo/demo-content.json', import.meta.url)).then((r) => {
        if (!r.ok) throw new Error('Не удалось загрузить демонстрационные данные.');
        return r.json();
      }),
      fetch(new URL('../demo/week.json', import.meta.url)).then((r) => {
        if (!r.ok) throw new Error('Не удалось загрузить план недели.');
        return r.json();
      }),
    ]).then(([content, week]) => ({ content, week }));
  }
  return fixturesPromise;
}

const isoNow = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

function relativeDate(daysAgo = 0, hour = 9) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - Number(daysAgo || 0));
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function futureDate(inDays = 0, hour = 12) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + Number(inDays || 0));
  date.setUTCHours(Math.max(0, Number(hour || 12) - 3), 0, 0, 0);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

function users(content) {
  return content.users.map((user, index) => ({
    id: index + 1,
    login: user.login,
    display_name: user.displayName,
    role: user.role,
    editor_scope: user.editorScope || null,
    is_active: 1,
  }));
}

function currentUser(content, state) {
  return users(content).find((user) => user.login === state.login) || null;
}

function publicUser(user) {
  return {
    id: user.id,
    login: user.login,
    displayName: user.display_name,
    role: user.role,
    editorScope: user.editor_scope,
  };
}

function isStaff(user) {
  return STAFF_ROLES.has(user.role);
}

function offices(content) {
  return content.offices.map((office, index) => ({
    id: index + 1,
    name: office.name,
    city: office.city,
    address: office.address,
    office_group: office.group || 'main',
    status: office.status || 'active',
    opened_on: office.openedOn || null,
    royalty_rate: office.royaltyRate ?? null,
    phone: office.phone || null,
    email: office.email || null,
    members: office.members || {},
    requisites: office.requisites || null,
  }));
}

function officeRows(content) {
  const names = new Map(content.users.map((u) => [u.login, u.displayName]));
  return offices(content).map((office) => ({
    ...office,
    owners: Object.entries(office.members)
      .filter(([, role]) => role === 'owner')
      .map(([login]) => names.get(login))
      .join(', '),
  }));
}

function allowedOffices(content, user) {
  const all = officeRows(content);
  if (isStaff(user)) return all;
  return all.filter((office) => Object.hasOwn(office.members, user.login));
}

function articleRows(content, user, state) {
  return content.articles
    .filter((article) => article.audience !== 'staff' || isStaff(user))
    .map((article, index) => ({
      id: index + 1,
      slug: article.slug,
      section: article.section,
      title: article.title,
      summary: article.summary,
      body: article.body,
      audience: article.audience || 'all',
      version: article.version || 1,
      updated_at: relativeDate(article.daysAgo),
      reviewed_at: relativeDate(article.daysAgo),
      source: article.source || null,
      unread: !state.reads[`${user.login}|${article.slug}|${article.version || 1}`],
    }));
}

function announcementRows(content, user, state) {
  return content.announcements.map((announcement, index) => {
    const ackedAt = state.acks[`${user.login}|${index + 1}`] || null;
    return {
      id: index + 1,
      title: announcement.title,
      body: announcement.body,
      requires_ack: Boolean(announcement.requiresAck),
      published_at: relativeDate(announcement.daysAgo),
      acked: Boolean(ackedAt),
      acked_at: ackedAt,
    };
  });
}

function eventRows(content) {
  return content.events.map((event, index) => ({
    id: index + 1,
    title: event.title,
    starts_at: futureDate(event.inDays, event.hour),
    kind: event.kind,
    place: event.place || null,
  }));
}

function userOffices(content, user) {
  return allowedOffices(content, user).map((office) => ({
    id: office.id,
    name: office.name,
    city: office.city,
    membership: office.members[user.login] || null,
  }));
}

function requireUser(content, state) {
  const user = currentUser(content, state);
  if (!user) fail(401, 'Требуется вход.');
  return user;
}

function audit(state, user, action, entity = null, entityId = null, oldValue = null, newValue = null) {
  state.audit.unshift({
    id: Date.now(), at: isoNow(), user: user?.display_name || null, action,
    entity, entity_id: entityId === null ? null : String(entityId), old_value: oldValue, new_value: newValue, ip: 'demo',
  });
  state.audit = state.audit.slice(0, 200);
}

export async function demoApi(path, { method = 'GET', body = {} } = {}) {
  const { content, week } = await fixtures();
  const state = stateWithDefaults();
  const url = new URL(path, 'https://demo.invalid');
  const pathname = url.pathname;

  if (method === 'POST' && pathname === '/api/login') {
    const login = String(body?.login || '').trim().toLowerCase();
    const user = users(content).find((candidate) => candidate.login === login);
    if (!user) fail(401, 'Выберите демонстрационный профиль.');
    state.login = user.login;
    audit(state, user, 'login.demo');
    saveState(state);
    return { user: publicUser(user) };
  }

  if (method === 'POST' && pathname === '/api/logout') {
    state.login = null;
    saveState(state);
    return { ok: true };
  }

  const user = requireUser(content, state);

  if (method === 'GET' && pathname === '/api/me') {
    return {
      user: publicUser(user),
      offices: userOffices(content, user),
      isStaff: isStaff(user),
      canEditContent: isStaff(user),
    };
  }

  if (method === 'GET' && pathname === '/api/dashboard') {
    const today = moscowDate();
    const dayId = weekdayId(today);
    const day = week.days.find((item) => item.id === dayId) || null;
    const tasks = day?.tasks || [];
    const done = tasks.filter((task) => state.completions[`${user.login}|${today}|${task.id}`]).length;
    const articles = articleRows(content, user, state).filter((article) => article.unread).slice(0, 5);
    const requests = state.requests.filter((request) => isStaff(user) || request.login === user.login);
    return {
      today,
      weekDay: day ? { id: day.id, name: day.name, title: day.title } : null,
      tasks: { total: tasks.length, done },
      announcements: announcementRows(content, user, state).slice(0, 5),
      events: eventRows(content).slice(0, 5),
      changedArticles: articles.map((article) => ({ ...article, is_new: true })),
      openRequests: requests.filter((request) => ['new', 'in_progress'].includes(request.status)).length,
    };
  }

  if (method === 'GET' && pathname === '/api/offices') {
    return { scope: isStaff(user) ? 'all' : 'mine', offices: allowedOffices(content, user) };
  }

  if (method === 'GET' && pathname === '/api/network') {
    return {
      offices: officeRows(content)
        .filter((office) => office.status === 'active')
        .map(({ id, name, city, address, phone }) => ({ id, name, city, address, phone })),
    };
  }

  const officeMatch = pathname.match(/^\/api\/offices\/(\d+)$/);
  if (method === 'GET' && officeMatch) {
    const id = Number(officeMatch[1]);
    const office = officeRows(content).find((item) => item.id === id);
    if (!office || (!isStaff(user) && !Object.hasOwn(office.members, user.login))) fail(404, 'Офис не найден.');
    const names = new Map(content.users.map((item) => [item.login, item.displayName]));
    const people = Object.entries(office.members).map(([login, role]) => ({ display_name: names.get(login), role }));
    const canSeeRequisites = isStaff(user) || ['owner', 'manager'].includes(office.members[user.login]);
    const source = office.requisites;
    const requisites = source && canSeeRequisites ? {
      legal_name: source.legalName, inn: source.inn, ogrn: source.ogrn, bank_name: source.bankName,
      bik: source.bik, account: source.account, corr_account: source.corrAccount, updated_at: isoNow(),
    } : null;
    if (requisites) {
      audit(state, user, 'requisites.view', 'office', id);
      saveState(state);
    }
    return { office, people, requisites, requisitesHidden: !canSeeRequisites };
  }

  if (method === 'GET' && pathname === '/api/articles') {
    const query = (url.searchParams.get('q') || '').trim().toLocaleLowerCase('ru-RU');
    const section = (url.searchParams.get('section') || '').trim();
    let articles = articleRows(content, user, state);
    if (query) articles = articles.filter((article) => `${article.title} ${article.summary} ${article.body}`.toLocaleLowerCase('ru-RU').includes(query));
    if (section) articles = articles.filter((article) => article.section === section);
    const sections = [...new Set(articleRows(content, user, state).map((article) => article.section))]
      .sort((a, b) => a.localeCompare(b, 'ru'))
      .map((name) => ({ section: name, n: articleRows(content, user, state).filter((article) => article.section === name).length }));
    return { articles, sections };
  }

  const articleMatch = pathname.match(/^\/api\/articles\/([\w-]+)$/);
  if (method === 'GET' && articleMatch) {
    const article = articleRows(content, user, state).find((item) => item.slug === articleMatch[1]);
    if (!article) fail(404, 'Статья не найдена.');
    state.reads[`${user.login}|${article.slug}|${article.version}`] = true;
    saveState(state);
    return { article: { ...article, unread: undefined } };
  }

  if (method === 'GET' && pathname === '/api/announcements') {
    return { announcements: announcementRows(content, user, state), events: eventRows(content) };
  }

  const ackMatch = pathname.match(/^\/api\/announcements\/(\d+)\/ack$/);
  if (method === 'POST' && ackMatch) {
    state.acks[`${user.login}|${Number(ackMatch[1])}`] = isoNow();
    saveState(state);
    return { ok: true };
  }

  if (method === 'GET' && pathname === '/api/week') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '') ? url.searchParams.get('date') : moscowDate();
    const day = week.days.find((item) => item.id === weekdayId(date)) || null;
    return {
      date,
      today: moscowDate(),
      day,
      days: week.days,
      tasks: (day?.tasks || []).map((task) => ({
        ...task,
        done_when: task.doneWhen,
        done: Boolean(state.completions[`${user.login}|${date}|${task.id}`]),
      })),
    };
  }

  if (method === 'POST' && pathname === '/api/week/toggle') {
    const key = `${user.login}|${body.date}|${body.templateId}`;
    if (body.done) state.completions[key] = true;
    else delete state.completions[key];
    saveState(state);
    return { ok: true };
  }

  if (method === 'GET' && pathname === '/api/calculations') {
    return { calculations: state.calculations.filter((item) => item.login === user.login) };
  }

  if (method === 'POST' && pathname === '/api/calculations') {
    const calculator = CALCULATORS[body.calculator];
    if (!calculator) fail(400, 'Неизвестный калькулятор.');
    const result = calculator.run(body.input || {}, POLICIES[calculator.policyId]);
    const item = {
      id: Date.now(), login: user.login, calculator: body.calculator, policy_id: calculator.policyId,
      title: String(body.title || 'Расчёт').slice(0, 120), input_json: JSON.stringify(body.input || {}),
      result_json: JSON.stringify(result), created_at: isoNow(),
    };
    state.calculations.unshift(item);
    saveState(state);
    return { id: item.id, result };
  }

  const calculationMatch = pathname.match(/^\/api\/calculations\/(\d+)$/);
  if (method === 'DELETE' && calculationMatch) {
    const id = Number(calculationMatch[1]);
    state.calculations = state.calculations.filter((item) => !(item.id === id && item.login === user.login));
    saveState(state);
    return { ok: true };
  }

  if (method === 'GET' && pathname === '/api/support') {
    const requests = state.requests
      .filter((request) => isStaff(user) || request.login === user.login)
      .map((request) => ({ ...request, author: request.author, office: request.office || null }));
    return { requests, categories: SUPPORT_CATEGORIES };
  }

  if (method === 'POST' && pathname === '/api/support') {
    if (!SUPPORT_CATEGORIES.includes(body.category)) fail(400, 'Выберите категорию.');
    const office = officeRows(content).find((item) => item.id === Number(body.officeId));
    const request = {
      id: Date.now(), login: user.login, author: user.display_name, office: office?.name || null,
      category: body.category, subject: String(body.subject || '').trim(), body: String(body.body || '').trim(),
      status: 'new', created_at: isoNow(),
    };
    if (!request.subject || !request.body) fail(400, 'Заполните тему и описание.');
    state.requests.unshift(request);
    saveState(state);
    return { id: request.id };
  }

  const supportMatch = pathname.match(/^\/api\/support\/(\d+)$/);
  if (method === 'PATCH' && supportMatch) {
    if (!['superadmin', 'franchise'].includes(user.role)) fail(403, 'Недостаточно прав.');
    const request = state.requests.find((item) => item.id === Number(supportMatch[1]));
    if (!request) fail(404, 'Заявка не найдена.');
    request.status = body.status;
    saveState(state);
    return { ok: true };
  }

  if (method === 'GET' && pathname === '/api/admin/users') {
    if (!['superadmin', 'franchise'].includes(user.role)) fail(403, 'Недостаточно прав.');
    const allOffices = officeRows(content);
    return {
      users: users(content).map((item) => ({
        ...item,
        offices: allOffices.filter((office) => Object.hasOwn(office.members, item.login)).map((office) => office.name).join(', '),
        last_login_at: item.login === state.login ? isoNow() : null,
      })),
    };
  }

  if (method === 'GET' && pathname === '/api/admin/audit') {
    if (user.role !== 'superadmin') fail(403, 'Недостаточно прав.');
    return { entries: state.audit };
  }

  fail(404, 'Метод демонстрационного API не найден.');
}

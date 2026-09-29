import { html, render, api, ApiError, icon, ROLE_LABELS, DEMO_MODE } from './lib.js?v=20260929-2';
import { homeView } from './views/home.js?v=20260929-2';
import { weekView } from './views/work.js?v=20260929-2';
import { officesView, officeView, networkView } from './views/offices.js?v=20260929-2';
import { calculatorsView } from './views/calculators.js?v=20260929-2';
import { knowledgeView, articleView } from './views/knowledge.js?v=20260929-2';
import { announcementsView } from './views/announcements.js?v=20260929-2';
import { supportView } from './views/support.js?v=20260929-2';
import { adminView } from './views/admin.js?v=20260929-2';
import { soonView } from './views/soon.js?v=20260929-2';

const app = document.getElementById('app');
const state = { me: null };

// Карта сервиса. stage — этап дорожной карты, на котором раздел оживёт.
const NAV = [
  { group: null, items: [
    { path: '/', label: 'Главная', icon: 'home' },
    { path: '/work', label: 'Моя работа', icon: 'check' },
  ] },
  { group: 'Офис', items: [
    { path: '/offices', label: 'Мои офисы', icon: 'office' },
    { path: '/network', label: 'Сеть', icon: 'map' },
    { path: '/finance', label: 'Финансы', icon: 'chart', stage: 3 },
  ] },
  { group: 'Инструменты', items: [
    { path: '/calculators', label: 'Калькуляторы', icon: 'calc' },
    { path: '/knowledge', label: 'База знаний', icon: 'book' },
    { path: '/documents', label: 'Документы', icon: 'folder', stage: 4 },
    { path: '/training', label: 'Обучение', icon: 'cap', stage: 2 },
    { path: '/hr', label: 'HR', icon: 'users', stage: 2 },
  ] },
  { group: 'Связь', items: [
    { path: '/announcements', label: 'Объявления', icon: 'bell' },
    { path: '/support', label: 'Поддержка', icon: 'help' },
  ] },
  { group: 'Управление', roles: ['superadmin', 'franchise'], items: [
    { path: '/admin', label: 'Администрирование', icon: 'shield' },
  ] },
];

const ROUTES = [
  [/^\/$/, homeView],
  [/^\/work$/, weekView],
  [/^\/offices$/, officesView],
  [/^\/offices\/(\d+)$/, officeView],
  [/^\/network$/, networkView],
  [/^\/calculators$/, calculatorsView],
  [/^\/knowledge$/, knowledgeView],
  [/^\/knowledge\/([\w-]+)$/, articleView],
  [/^\/announcements$/, announcementsView],
  [/^\/support$/, supportView],
  [/^\/admin$/, adminView],
  [/^\/(finance|documents|training|hr)$/, soonView],
];

const currentPath = () => {
  const hash = location.hash.replace(/^#/, '') || '/';
  return hash.split('?')[0];
};

// ---------- Вход ----------

function showLogin(message = '') {
  document.title = 'Вход — Домиан Hub';
  render(app, html`
    <main class="login">
      <form class="login-card" id="login-form">
        <div class="brand"><span class="brand-mark">Д</span><span>Домиан Hub<small>Кабинет собственника</small></span></div>
        ${DEMO_MODE ? html`
          <label class="field"><span>Демо-профиль</span><select name="login" required autofocus>
            <option value="owner1">Собственник — два офиса</option>
            <option value="owner2">Собственник — один офис</option>
            <option value="manager1">Руководитель офиса</option>
            <option value="franchise">Франшизный отдел</option>
            <option value="editor-hr">Редактор HR</option>
            <option value="admin">Администратор</option>
          </select></label>
          <p class="login-note">Демонстрационный режим: пароль временно отключён. Все данные вымышлены, изменения сохраняются только в этом браузере.</p>`
          : html`
          <label class="field"><span>Логин</span><input name="login" autocomplete="username" required autofocus></label>
          <label class="field"><span>Пароль</span><input name="password" type="password" autocomplete="current-password" required></label>`}
        <p class="error" id="login-error" role="alert">${message}</p>
        <button class="btn primary" type="submit">Войти</button>
        ${DEMO_MODE ? '' : html`<p class="login-note">Нет доступа — обратитесь во франшизный отдел. Каждому сотруднику выдаётся свой вход; пароль не передаётся другим.</p>`}
      </form>
    </main>`);
  app.removeAttribute('aria-busy');
  app.className = '';
  const form = document.getElementById('login-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form));
      await api('/api/login', { method: 'POST', body: data });
      await start();
    } catch (error) {
      document.getElementById('login-error').textContent = error.message;
      button.disabled = false;
    }
  });
}

// ---------- Каркас ----------

function navHtml(path) {
  return NAV.filter((g) => !g.roles || g.roles.includes(state.me.user.role)).map((g) => html`
    ${g.group ? html`<div class="nav-group">${g.group}</div>` : ''}
    ${g.items.map((item) => {
      const active = item.path === '/' ? path === '/' : path.startsWith(item.path);
      return html`<a href="#${item.path}" class="${item.stage ? 'soon' : ''}" ${active ? html`aria-current="page"` : ''}>
        ${icon(item.icon)}<span>${item.label}</span>${item.stage ? html`<span class="tag">этап ${item.stage}</span>` : ''}</a>`;
    })}`);
}

function renderShell() {
  const { user, offices } = state.me;
  render(app, html`
    <div class="shell" id="shell">
      <aside class="side" id="side">
        <a class="brand" href="#/"><span class="brand-mark">Д</span><span>Домиан Hub<small>Кабинет собственника</small></span></a>
        <nav class="nav" id="nav" aria-label="Разделы"></nav>
        <div class="side-foot">
          <div><div class="who">${user.displayName}</div><div class="role">${ROLE_LABELS[user.role]}</div></div>
          <button class="btn sm" id="logout" type="button">${icon('logout')} Выйти</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="btn ghost sm menu-btn" id="menu" type="button" aria-label="Меню" aria-controls="side" aria-expanded="false">${icon('menu')}</button>
          <form class="search" id="search" role="search">
            ${icon('search')}
            <input name="q" type="search" placeholder="Найти инструкцию, документ или тему" aria-label="Поиск по базе знаний">
          </form>
          ${DEMO_MODE ? html`<span class="pill warn">Демо</span>` : ''}
          ${offices.length ? html`<span class="office-pick pill">${offices.length === 1 ? offices[0].name : `Офисов: ${offices.length}`}</span>` : ''}
        </header>
        <main class="content" id="view" tabindex="-1"></main>
      </div>
    </div>`);
  app.removeAttribute('aria-busy');
  app.className = '';

  const shell = document.getElementById('shell');
  const menu = document.getElementById('menu');
  const toggleMenu = (open) => { shell.classList.toggle('nav-open', open); menu.setAttribute('aria-expanded', String(open)); };
  menu.addEventListener('click', () => toggleMenu(!shell.classList.contains('nav-open')));
  document.getElementById('nav').addEventListener('click', () => toggleMenu(false));
  shell.addEventListener('click', (e) => { if (shell.classList.contains('nav-open') && !e.target.closest('.side, #menu')) toggleMenu(false); });
  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    state.me = null;
    location.hash = '#/';
    showLogin();
  });
  document.getElementById('search').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').trim();
    location.hash = `#/knowledge${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  });
}

async function route() {
  if (!state.me) return;
  const path = currentPath();
  render(document.getElementById('nav'), navHtml(path));
  const view = document.getElementById('view');
  const [pattern, viewFn] = ROUTES.find(([re]) => re.test(path)) || [];
  if (!viewFn) {
    render(view, html`<div class="empty">Раздел не найден. <a href="#/">На главную</a></div>`);
    return;
  }
  const params = path.match(pattern).slice(1);
  const query = new URLSearchParams(location.hash.split('?')[1] || '');
  try {
    const result = await viewFn({ params, query, me: state.me, rerender: route });
    if (currentPath() !== path) return; // пользователь уже ушёл на другую страницу
    document.title = `${result.title} — Домиан Hub`;
    render(view, result.body);
    result.mount?.(view);
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) { state.me = null; showLogin('Сессия истекла. Войдите снова.'); return; }
    document.title = 'Домиан Hub';
    render(view, html`<div class="empty">${error.message} <a href="#/">На главную</a></div>`);
  }
}

async function start() {
  try {
    state.me = await api('/api/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return showLogin();
    render(app, html`<div class="boot">Сервер недоступен: ${error.message}</div>`);
    return;
  }
  renderShell();
  route();
}

window.addEventListener('hashchange', route);
start();

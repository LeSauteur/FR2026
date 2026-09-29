// Общие помощники интерфейса. Все данные вставляются через html`` с экранированием.

import { demoApi } from './demo-api.js?v=20260929-2';

export const DEMO_MODE = typeof location !== 'undefined'
  && (location.hostname.endsWith('github.io') || new URLSearchParams(location.search).has('demo'));

class Safe {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

function piece(value) {
  if (value instanceof Safe) return value.value;
  if (Array.isArray(value)) return value.map(piece).join('');
  if (value === null || value === undefined || value === false) return '';
  return escape(value);
}

export function html(strings, ...values) {
  return new Safe(strings.reduce((out, s, i) => out + s + (i < values.length ? piece(values[i]) : ''), ''));
}

export const raw = (s) => new Safe(s);

export function render(target, content) {
  target.innerHTML = piece(content);
  // CSP запрещает атрибут style="…", поэтому ширину полос задаём через CSSOM.
  for (const el of target.querySelectorAll('[data-width]')) el.style.width = `${Number(el.dataset.width) || 0}%`;
}

// ---------- API ----------

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function api(path, { method = 'GET', body } = {}) {
  if (DEMO_MODE) {
    try {
      return await demoApi(path, { method, body });
    } catch (error) {
      throw new ApiError(error.status || 500, error.message || 'Ошибка демонстрационного режима');
    }
  }
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Ошибка ${res.status}`);
  return data;
}

// ---------- Форматирование ----------

const money = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
export const fmtMoney = (n) => `${money.format(Number(n) || 0)} ₽`;
export const fmtPercent = (rate) => `${(rate * 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} %`;

function parseDate(value) {
  if (!value) return null;
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(value) ? value.replace(' ', 'T') + 'Z' : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value, { time = false } = {}) {
  const d = parseDate(value);
  if (!d) return '—';
  return d.toLocaleString('ru-RU', {
    day: 'numeric', month: 'long', timeZone: 'Europe/Moscow',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function greeting() {
  const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Europe/Moscow' }));
  if (hour < 6) return 'Доброй ночи';
  if (hour < 12) return 'Доброе утро';
  if (hour < 18) return 'Добрый день';
  return 'Добрый вечер';
}

export const ROLE_LABELS = {
  superadmin: 'Администратор', franchise: 'Франшизный отдел', editor: 'Редактор раздела',
  owner: 'Собственник', manager: 'Руководитель офиса', readonly: 'Только просмотр',
};
export const MEMBER_LABELS = { owner: 'собственник', manager: 'руководитель', viewer: 'просмотр' };
export const SUPPORT_LABELS = { it: 'IT', hr: 'HR', pr: 'PR', newbuild: 'Новостройки', franchise: 'Франшизный отдел', finance: 'Финансы' };
export const STATUS_LABELS = { new: 'Новая', in_progress: 'В работе', done: 'Решена', rejected: 'Отклонена' };
export const EVENT_LABELS = { meeting: 'Собрание', training: 'Обучение', deadline: 'Срок', corporate: 'Событие' };

// ---------- Иконки (линейные, currentColor) ----------

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  check: 'M4 12.5 9 17.5 20 6.5',
  office: 'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M2 21h20',
  map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14',
  calc: 'M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM8 7h8v3H8zM8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01M16 17.5h.01',
  book: 'M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2zM4 20a2 2 0 0 0 2 2h13v-4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5h.01',
  cap: 'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  shield: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-4.5-4.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  calendar: 'M4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 3v4M16 3v4',
  copy: 'M9 9h10v12H9zM5 15V3h10',
};

export const icon = (name) => raw(
  `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name] || PATHS.help}"/></svg>`,
);

// ---------- Уведомление ----------

let toastTimer;
export function toast(message) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2600);
}

export function paragraphs(text) {
  return String(text || '').split(/\n{2,}/).map((p) => html`<p>${p.split('\n').map((line, i) => [i ? raw('<br>') : '', line])}</p>`);
}

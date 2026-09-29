import { html, api, fmtDate, fmtPercent, toast, icon, MEMBER_LABELS } from '../lib.js?v=20260929-3';

const STATUS = { active: ['Работает', 'ok'], paused: ['Пауза', 'warn'], archived: ['Архив', ''] };
const statusPill = (s) => html`<span class="pill ${STATUS[s]?.[1] || ''}">${STATUS[s]?.[0] || s}</span>`;

export async function officesView({ me }) {
  const { offices, scope } = await api('/api/offices');
  return {
    title: 'Мои офисы',
    body: html`
      <div class="page-head">
        <span class="eyebrow">${scope === 'all' ? 'Все офисы сети' : 'Офисы, к которым у вас есть доступ'}</span>
        <h1>${scope === 'all' ? 'Офисы' : 'Мои офисы'}</h1>
      </div>
      ${offices.length ? html`
        <div class="table-wrap"><table>
          <thead><tr><th>Офис</th><th>Город</th><th>Адрес</th>${me.isStaff ? html`<th>Собственник</th>` : ''}<th>Статус</th></tr></thead>
          <tbody id="rows">${offices.map((o) => html`
            <tr class="clickable" data-id="${o.id}">
              <td><a href="#/offices/${o.id}">${o.name}</a></td><td>${o.city}</td><td>${o.address}</td>
              ${me.isStaff ? html`<td>${o.owners || '—'}</td>` : ''}<td>${statusPill(o.status)}</td>
            </tr>`)}</tbody>
        </table></div>`
        : html`<div class="empty">К вашему профилю не привязан ни один офис. Обратитесь во франшизный отдел.</div>`}`,
    mount(root) {
      root.querySelector('#rows')?.addEventListener('click', (e) => {
        const row = e.target.closest('tr[data-id]');
        if (row && !e.target.closest('a')) location.hash = `#/offices/${row.dataset.id}`;
      });
    },
  };
}

const REQ_FIELDS = [
  ['legal_name', 'Юридическое лицо'], ['inn', 'ИНН'], ['ogrn', 'ОГРН / ОГРНИП'], ['bank_name', 'Банк'],
  ['bik', 'БИК'], ['account', 'Расчётный счёт'], ['corr_account', 'Корр. счёт'],
];

export async function officeView({ params }) {
  const { office: o, people, requisites, requisitesHidden } = await api(`/api/offices/${params[0]}`);
  const tenureYears = o.opened_on ? Math.floor((Date.now() - Date.parse(o.opened_on)) / (365.25 * 864e5)) : null;

  return {
    title: o.name,
    body: html`
      <div class="page-head">
        <span class="eyebrow"><a href="#/offices">Офисы</a> / ${o.city}</span>
        <div class="row"><h1>${o.name}</h1>${statusPill(o.status)}</div>
      </div>
      <section class="grid-2">
        <article class="card">
          <h2>Карточка офиса</h2>
          <dl class="dl">
            <dt>Адрес</dt><dd>${o.city}, ${o.address}</dd>
            <dt>Телефон</dt><dd>${o.phone || '—'}</dd>
            <dt>Эл. почта</dt><dd>${o.email || '—'}</dd>
            <dt>Открыт</dt><dd>${o.opened_on ? `${fmtDate(o.opened_on)} ${o.opened_on.slice(0, 4)}${tenureYears !== null ? ` · стаж ${tenureYears} г.` : ''}` : '—'}</dd>
            <dt>Ставка роялти</dt><dd>${o.royalty_rate ? fmtPercent(o.royalty_rate) : 'по шкале 2026'}</dd>
          </dl>
          <h3>Люди</h3>
          <ul class="list">${people.map((p) => html`<li>${p.display_name} <span class="small muted">${MEMBER_LABELS[p.role]}</span></li>`)}</ul>
        </article>
        <article class="card">
          <div class="card-head"><h2>Реквизиты</h2>${requisites ? html`<button class="btn sm" id="copy-req" type="button">${icon('copy')} Скопировать все</button>` : ''}</div>
          ${requisites ? html`
            <dl class="dl" id="req">${REQ_FIELDS.map(([key, label]) => html`
              <dt>${label}</dt><dd>${requisites[key] || '—'}${requisites[key] ? html`<button class="btn ghost sm copy" type="button" data-copy="${requisites[key]}" aria-label="Скопировать: ${label}">${icon('copy')}</button>` : ''}</dd>`)}</dl>
            <p class="small muted">Просмотр реквизитов фиксируется в журнале аудита. Обновлено ${fmtDate(requisites.updated_at)}.</p>`
            : html`<p class="muted">${requisitesHidden ? 'Реквизиты видны собственнику и руководителю офиса.' : 'Реквизиты ещё не внесены.'}</p>`}
        </article>
      </section>`,
    mount(root) {
      root.querySelector('#req')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-copy]');
        if (!btn) return;
        await navigator.clipboard.writeText(btn.dataset.copy);
        toast('Скопировано');
      });
      root.querySelector('#copy-req')?.addEventListener('click', async () => {
        const text = REQ_FIELDS.filter(([k]) => requisites[k]).map(([k, label]) => `${label}: ${requisites[k]}`).join('\n');
        await navigator.clipboard.writeText(`${o.name}\n${text}`);
        toast('Реквизиты скопированы');
      });
    },
  };
}

export async function networkView() {
  const { offices } = await api('/api/network');
  const cities = [...new Set(offices.map((o) => o.city))];
  return {
    title: 'Сеть',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Справочник сети · ${offices.length} офисов</span>
        <h1>Офисы сети</h1>
        <p class="lead">Адреса и рабочие телефоны действующих офисов. Собственники и реквизиты здесь не показываются.</p>
      </div>
      <label class="field narrow"><span>Фильтр</span><input id="filter" type="search" placeholder="Город, название или адрес"></label>
      <div id="groups" class="stack">${cities.map((city) => html`
        <section class="card" data-city="${city}">
          <h2>${city}</h2>
          <ul class="list">${offices.filter((o) => o.city === city).map((o) => html`
            <li data-text="${`${o.name} ${o.city} ${o.address}`.toLowerCase()}"><b>${o.name}</b>
              <span class="small muted">${o.address}${o.phone ? ` · ${o.phone}` : ''}</span></li>`)}</ul>
        </section>`)}</div>`,
    mount(root) {
      root.querySelector('#filter').addEventListener('input', (e) => {
        const q = e.target.value.trim().toLowerCase();
        for (const section of root.querySelectorAll('[data-city]')) {
          let visible = 0;
          for (const li of section.querySelectorAll('li')) {
            const show = !q || li.dataset.text.includes(q);
            li.hidden = !show;
            visible += show;
          }
          section.hidden = !visible;
        }
      });
    },
  };
}

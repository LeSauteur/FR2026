import { html, api, icon, fmtDate, greeting, EVENT_LABELS } from '../lib.js';

export async function homeView({ me }) {
  const d = await api('/api/dashboard');
  const pct = d.tasks.total ? Math.round((d.tasks.done / d.tasks.total) * 100) : 0;
  const pendingAcks = d.announcements.filter((a) => a.requires_ack && !a.acked);

  return {
    title: 'Главная',
    body: html`
      <div class="page-head">
        <span class="eyebrow">${fmtDate(d.today)}${d.weekDay ? ` · ${d.weekDay.name}` : ''}</span>
        <h1>${greeting()}, ${me.user.displayName.split(' ')[0]}</h1>
        <p class="lead">Что важно сегодня — сверху. Справочники и инструменты — ниже и в меню.</p>
      </div>

      ${pendingAcks.length ? html`<a class="notice" href="#/announcements">Нужно подтвердить ознакомление: ${pendingAcks.map((a) => a.title).join(', ')}</a>` : ''}

      <section class="grid" aria-label="Важно сегодня">
        <article class="card">
          <div class="card-head"><h2>Моя работа</h2><a href="#/work">Открыть</a></div>
          ${d.weekDay ? html`
            <p><b>${d.weekDay.name}.</b> ${d.weekDay.title}</p>
            <div class="row spread small"><span class="muted">Сделано ${d.tasks.done} из ${d.tasks.total}</span><span>${pct} %</span></div>
            <div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span data-width="${pct}"></span></div>`
            : html`<p class="muted">Задачи на сегодня не заданы.</p>`}
        </article>

        <article class="card">
          <div class="card-head"><h2>Ближайшие события</h2><a href="#/announcements">Все</a></div>
          ${d.events.length ? html`<ul class="list">${d.events.map((e) => html`
            <li><span>${e.title}</span><span class="small muted">${fmtDate(e.starts_at, { time: true })} · ${EVENT_LABELS[e.kind] || e.kind}${e.place ? ` · ${e.place}` : ''}</span></li>`)}</ul>`
            : html`<p class="muted">В ближайший месяц событий нет.</p>`}
        </article>

        <article class="card">
          <div class="card-head"><h2>Изменилось в базе знаний</h2><a href="#/knowledge">База</a></div>
          ${d.changedArticles.length ? html`<ul class="list">${d.changedArticles.map((a) => html`
            <li><a href="#/knowledge/${a.slug}">${a.title}</a>
              <span class="small muted">${a.section} · ${a.is_new ? 'новое для вас' : 'обновлено'} ${fmtDate(a.updated_at)}</span></li>`)}</ul>`
            : html`<p class="muted">Вы всё прочитали.</p>`}
        </article>
      </section>

      <section class="grid-2">
        <article class="card">
          <div class="card-head"><h2>Мои офисы</h2><a href="#/offices">Все</a></div>
          ${me.offices.length ? html`<ul class="list">${me.offices.map((o) => html`
            <li><a href="#/offices/${o.id}">${o.name}</a><span class="small muted">${o.city}</span></li>`)}</ul>`
            : html`<p class="muted">${me.isStaff ? 'Вы видите все офисы сети в разделе «Мои офисы».' : 'Офисы не привязаны. Обратитесь во франшизный отдел.'}</p>`}
        </article>
        <article class="card">
          <div class="card-head"><h2>Объявления</h2><a href="#/announcements">Все</a></div>
          <ul class="list">${d.announcements.slice(0, 3).map((a) => html`
            <li><span>${a.title} ${a.requires_ack && !a.acked ? html`<span class="pill red">подтвердить</span>` : ''}</span>
            <span class="small muted">${fmtDate(a.published_at)}</span></li>`)}</ul>
        </article>
      </section>

      <section class="card">
        <h2>Быстрые инструменты</h2>
        <div class="quick">
          <a href="#/calculators">${icon('calc')}Роялти</a>
          <a href="#/calculators">${icon('chart')}Мотивация 2026</a>
          <a href="#/network">${icon('map')}Офисы сети</a>
          <a href="#/support">${icon('help')}Заявка${d.openRequests ? html` <span class="pill">${d.openRequests} открыт.</span>` : ''}</a>
          <a href="#/knowledge">${icon('book')}Инструкции</a>
        </div>
      </section>`,
  };
}

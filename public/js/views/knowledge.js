import { html, api, fmtDate, paragraphs } from '../lib.js';

export async function knowledgeView({ query }) {
  const q = query.get('q') || '';
  const section = query.get('section') || '';
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (section) params.set('section', section);
  const { articles, sections } = await api(`/api/articles?${params}`);
  const link = (s) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (s) p.set('section', s);
    return `#/knowledge${p.size ? `?${p}` : ''}`;
  };

  return {
    title: 'База знаний',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Инструкции и регламенты</span>
        <h1>${q ? `Поиск: «${q}»` : 'База знаний'}</h1>
        <p class="lead">Статьи вместо одной длинной страницы: у каждой есть раздел, версия и дата проверки. Непрочитанные изменения отмечены.</p>
      </div>
      <form class="search narrow" id="kb-search" role="search">
        <input name="q" type="search" value="${q}" placeholder="Поиск по статьям" aria-label="Поиск по статьям">
      </form>
      <div class="chips" id="sections">
        <button type="button" data-href="${link('')}" aria-pressed="${!section}">Все</button>
        ${sections.map((s) => html`<button type="button" data-href="${link(s.section)}" aria-pressed="${s.section === section}">${s.section} · ${s.n}</button>`)}
      </div>
      ${articles.length ? html`<div class="grid">${articles.map((a) => html`
        <a class="card article-link" href="#/knowledge/${a.slug}">
          <div class="row spread"><span class="eyebrow">${a.section}</span>
            ${a.unread ? html`<span class="pill red">новое</span>` : ''}${a.audience === 'staff' ? html`<span class="pill warn">служебное</span>` : ''}</div>
          <h3>${a.title}</h3>
          <p class="small muted">${a.summary}</p>
          <span class="small muted">Обновлено ${fmtDate(a.updated_at)} · версия ${a.version}</span>
        </a>`)}</div>`
        : html`<div class="empty">Ничего не найдено. Попробуйте другое слово или <a href="#/support">задайте вопрос в поддержку</a>.</div>`}`,
    mount(root) {
      root.querySelector('#sections').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-href]');
        if (btn) location.hash = btn.dataset.href;
      });
      root.querySelector('#kb-search').addEventListener('submit', (e) => {
        e.preventDefault();
        const value = new FormData(e.target).get('q').trim();
        const p = new URLSearchParams();
        if (value) p.set('q', value);
        location.hash = `#/knowledge${p.size ? `?${p}` : ''}`;
      });
    },
  };
}

export async function articleView({ params }) {
  const { article: a } = await api(`/api/articles/${params[0]}`);
  return {
    title: a.title,
    body: html`
      <div class="page-head">
        <span class="eyebrow"><a href="#/knowledge">База знаний</a> / ${a.section}</span>
        <h1>${a.title}</h1>
        <p class="small muted">Версия ${a.version} · обновлено ${fmtDate(a.updated_at)} · проверено ${fmtDate(a.reviewed_at)}${a.source ? ` · источник: ${a.source}` : ''}</p>
      </div>
      <article class="article-body">${paragraphs(a.body)}</article>`,
  };
}

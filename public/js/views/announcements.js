import { html, api, fmtDate, paragraphs, toast, EVENT_LABELS } from '../lib.js?v=20260929-2';

export async function announcementsView({ rerender }) {
  const { announcements, events } = await api('/api/announcements');
  return {
    title: 'Объявления',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Объявления и календарь</span>
        <h1>Объявления</h1>
      </div>
      <section class="grid-2">
        <div class="stack" id="ann">${announcements.map((a) => html`
          <article class="card">
            <div class="card-head"><h2>${a.title}</h2><span class="small muted">${fmtDate(a.published_at)}</span></div>
            ${paragraphs(a.body)}
            ${a.requires_ack ? (a.acked
              ? html`<span class="pill ok">Ознакомлен ${fmtDate(a.acked_at, { time: true })}</span>`
              : html`<div><button class="btn primary sm" type="button" data-ack="${a.id}">Ознакомился</button></div>`) : ''}
          </article>`)}</div>
        <article class="card">
          <h2>Календарь</h2>
          ${events.length ? html`<ul class="list">${events.map((e) => html`
            <li><b>${e.title}</b><span class="small muted">${fmtDate(e.starts_at, { time: true })} · ${EVENT_LABELS[e.kind] || e.kind}${e.place ? ` · ${e.place}` : ''}</span></li>`)}</ul>`
            : html`<p class="muted">Событий нет.</p>`}
        </article>
      </section>`,
    mount(root) {
      root.querySelector('#ann').addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-ack]');
        if (!btn) return;
        btn.disabled = true;
        try {
          await api(`/api/announcements/${btn.dataset.ack}/ack`, { method: 'POST', body: {} });
          toast('Отмечено');
          rerender();
        } catch (error) { toast(error.message); btn.disabled = false; }
      });
    },
  };
}

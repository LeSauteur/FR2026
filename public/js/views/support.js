import { html, api, fmtDate, toast, SUPPORT_LABELS, STATUS_LABELS } from '../lib.js';

const STATUS_CLASS = { new: 'red', in_progress: 'warn', done: 'ok', rejected: '' };

export async function supportView({ me, rerender }) {
  const { requests, categories } = await api('/api/support');
  return {
    title: 'Поддержка',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Заявки подразделениям</span>
        <h1>Поддержка</h1>
        <p class="lead">Вместо личных телефонов в инструкциях — одна форма. Заявка попадает в нужное подразделение по категории.</p>
      </div>
      <section class="grid-2">
        <form class="card form" id="new-request">
          <h2>Новая заявка</h2>
          <fieldset class="chips">
            <legend class="small muted">Категория</legend>
            ${categories.map((c, i) => html`<label class="check"><input type="radio" name="category" value="${c}" ${i === 0 ? html`checked` : ''}> ${SUPPORT_LABELS[c]}</label>`)}
          </fieldset>
          ${me.offices.length ? html`<label class="field"><span>Офис</span><select name="officeId"><option value="">—</option>
            ${me.offices.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</select></label>` : ''}
          <label class="field"><span>Тема</span><input name="subject" maxlength="160" required></label>
          <label class="field"><span>Описание</span><textarea name="body" maxlength="4000" required></textarea></label>
          <p class="small muted">Не прикладывайте паспортные данные, СНИЛС и пароли.</p>
          <button class="btn primary" type="submit">Отправить</button>
        </form>
        <article class="card">
          <h2>${me.isStaff ? 'Все заявки' : 'Мои заявки'}</h2>
          ${requests.length ? html`<ul class="list" id="requests">${requests.map((r) => html`
            <li>
              <div class="row spread"><b>${r.subject}</b><span class="pill ${STATUS_CLASS[r.status]}">${STATUS_LABELS[r.status]}</span></div>
              <span class="small muted">${SUPPORT_LABELS[r.category]} · ${fmtDate(r.created_at, { time: true })}${r.office ? ` · ${r.office}` : ''}${me.isStaff ? ` · ${r.author}` : ''}</span>
              ${me.isStaff && ['new', 'in_progress'].includes(r.status) ? html`<div class="row">
                ${r.status === 'new' ? html`<button class="btn sm" type="button" data-id="${r.id}" data-status="in_progress">Взять в работу</button>` : ''}
                <button class="btn sm" type="button" data-id="${r.id}" data-status="done">Решена</button></div>` : ''}
            </li>`)}</ul>`
            : html`<p class="muted">Заявок пока нет.</p>`}
        </article>
      </section>`,
    mount(root) {
      const form = root.querySelector('#new-request');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        try {
          await api('/api/support', { method: 'POST', body: { ...data, officeId: data.officeId || null } });
          toast('Заявка отправлена');
          rerender();
        } catch (error) { toast(error.message); }
      });
      root.querySelector('#requests')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-status]');
        if (!btn) return;
        await api(`/api/support/${btn.dataset.id}`, { method: 'PATCH', body: { status: btn.dataset.status } });
        rerender();
      });
    },
  };
}

import { html, api, fmtDate, toast, DEMO_MODE } from '../lib.js';

// Дата выбранного дня текущей недели (Пн–Вс) относительно сегодняшней московской даты.
function dateForDay(today, position) {
  const base = new Date(`${today}T12:00:00Z`);
  const mondayOffset = (base.getUTCDay() + 6) % 7;
  base.setUTCDate(base.getUTCDate() - mondayOffset + position);
  return base.toISOString().slice(0, 10);
}

export async function weekView({ query, rerender }) {
  const requested = query.get('date');
  const w = await api(`/api/week${requested ? `?date=${encodeURIComponent(requested)}` : ''}`);
  const done = w.tasks.filter((t) => t.done).length;
  const pct = w.tasks.length ? Math.round((done / w.tasks.length) * 100) : 0;

  return {
    title: 'Моя работа',
    body: html`
      <div class="page-head">
        <span class="eyebrow">7 дней эффективной работы</span>
        <h1>${w.day ? `${w.day.name}: ${w.day.title}` : 'Моя работа'}</h1>
        ${w.day?.subtitle ? html`<p class="lead">${w.day.subtitle}</p>` : ''}
      </div>

      <nav class="days" aria-label="Дни недели">${w.days.map((d) => {
        const date = dateForDay(w.today, d.position);
        return html`<a href="#/work?date=${date}" class="${date === w.today ? 'today' : ''}" aria-current="${date === w.date}">
          <b>${d.short}</b><span class="muted">${Number(date.slice(8))}</span></a>`;
      })}</nav>

      <section class="grid-2">
        <article class="card">
          <div class="card-head"><h2>Действия на ${fmtDate(w.date)}</h2><span class="pill ${pct === 100 ? 'ok' : ''}">${done} / ${w.tasks.length}</span></div>
          <div class="progress"><span data-width="${pct}"></span></div>
          <div id="tasks">${w.tasks.map((t) => html`
            <div class="task ${t.done ? 'done' : ''}">
              <input type="checkbox" id="t-${t.id}" data-id="${t.id}" ${t.done ? html`checked` : ''}>
              <div>
                <label for="t-${t.id}">${t.label}</label>
                ${t.helper || t.done_when ? html`<details><summary>Как сделать</summary>
                  ${t.helper ? html`<p>${t.helper}</p>` : ''}
                  ${t.done_when ? html`<p><b>Готово, когда:</b> ${t.done_when}</p>` : ''}</details>` : ''}
              </div>
            </div>`)}</div>
        </article>

        <div class="stack">
          ${w.day?.result ? html`<article class="card"><h2>Результат дня</h2><p>${w.day.result}</p></article>` : ''}
          ${w.day?.message ? html`<article class="card">
            <div class="card-head"><h2>Сообщение агентам</h2><button class="btn sm" id="copy-msg" type="button">Скопировать</button></div>
            <pre class="message" id="msg">${w.day.message}</pre></article>` : ''}
          <p class="small muted">${DEMO_MODE
            ? 'В демо отметки хранятся только в этом браузере. Контент перенесён из «7 дней 2.0».'
            : 'Отметки хранятся в вашем профиле на сервере и видны с любого устройства. Контент перенесён из «7 дней 2.0».'}</p>
        </div>
      </section>`,
    mount(root) {
      root.querySelector('#tasks')?.addEventListener('change', async (e) => {
        const box = e.target.closest('input[data-id]');
        if (!box) return;
        box.disabled = true;
        try {
          await api('/api/week/toggle', { method: 'POST', body: { templateId: box.dataset.id, date: w.date, done: box.checked } });
          rerender();
        } catch (error) {
          box.checked = !box.checked;
          box.disabled = false;
          toast(error.message);
        }
      });
      root.querySelector('#copy-msg')?.addEventListener('click', async () => {
        await navigator.clipboard.writeText(root.querySelector('#msg').textContent);
        toast('Сообщение скопировано');
      });
    },
  };
}

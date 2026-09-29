import { html, api, fmtDate, toast, DEMO_MODE } from '../lib.js?v=20260929-4';

export async function hrView({ me, rerender }) {
  const { stages, stageOwners, candidates, checklists, canAdvance, readOnly } = await api('/api/hr');
  const last = stages.length - 1;
  const active = candidates.filter((c) => c.stage < last);

  return {
    title: 'HR',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Подбор и адаптация</span>
        <h1>HR</h1>
        <p class="lead">Путь нового сотрудника от анкеты до выхода в офис: на каждом шаге виден ответственный. Паспорта и СНИЛС здесь не хранятся.</p>
      </div>
      ${DEMO_MODE ? html`<p class="notice">Раздел этапа 2. Показан пример наполнения; кандидаты вымышлены.</p>` : ''}

      <section class="card">
        <div class="card-head"><h2>Кандидаты в работе</h2><span class="pill">в процессе: ${active.length} · вышли в офис: ${candidates.length - active.length}</span></div>
        ${candidates.length ? html`<div class="pipeline" id="pipeline">${candidates.map((c) => html`
          <div class="candidate">
            <div class="row spread">
              <div><b>${c.name}</b><div class="small muted">${c.position} · ${c.office} · с ${fmtDate(c.started_at)}</div></div>
              ${c.stage >= last ? html`<span class="pill ok">Вышел в офис</span>` : html`<span class="pill warn">${stages[c.stage]}</span>`}
            </div>
            <ol class="steps" aria-label="Этапы">${stages.map((s, i) => html`
              <li class="${i < c.stage || c.stage >= last ? 'done' : i === c.stage ? 'now' : ''}"><span>${s}</span></li>`)}</ol>
            <div class="row spread small"><span class="muted">${c.stage >= last ? 'Адаптация: руководитель офиса' : `Сейчас отвечает: ${stageOwners[c.stage]}`}</span>
              ${canAdvance && c.stage < last ? html`<button class="btn sm" type="button" data-advance="${c.id}">Следующий этап →</button>` : ''}</div>
          </div>`)}</div>` : html`<p class="muted">Кандидатов нет.</p>`}
      </section>

      <section class="grid-2">
        ${!readOnly && me.offices.length ? html`<form class="card form" id="new-candidate">
          <h2>Заявка на нового сотрудника</h2>
          <div class="form-2">
            <label class="field"><span>Имя кандидата</span><input name="name" maxlength="80" required placeholder="Например: Иван П."></label>
            <label class="field"><span>Должность</span><select name="position">
              <option>Агент</option><option>Стажёр</option><option>Администратор</option><option>Руководитель офиса</option></select></label>
          </div>
          <label class="field"><span>Офис</span><select name="officeId">${me.offices.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</select></label>
          <p class="small muted">Только имя и должность. Документы кандидата HR-отдел запросит отдельно по защищённому каналу.</p>
          <button class="btn primary" type="submit">Отправить в HR</button>
        </form>` : ''}
        <div class="stack">${checklists.map((list) => html`
          <article class="card"><h2>${list.title}</h2>
            <ul class="list">${list.items.map((item) => html`<li>${item}</li>`)}</ul></article>`)}</div>
      </section>`,
    mount(root) {
      root.querySelector('#new-candidate')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('/api/hr/candidates', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
          toast('Заявка отправлена в HR');
          rerender();
        } catch (error) { toast(error.message); }
      });
      root.querySelector('#pipeline')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-advance]');
        if (!btn) return;
        try {
          await api(`/api/hr/candidates/${btn.dataset.advance}/advance`, { method: 'POST', body: {} });
          rerender();
        } catch (error) { toast(error.message); }
      });
    },
  };
}

import { html, api, toast, DEMO_MODE } from '../lib.js?v=20260929-4';

const lessonsWord = (n) => {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'урок';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'урока';
  return 'уроков';
};

const hours = (minutes) => (minutes >= 60
  ? `${Math.floor(minutes / 60)} ч${minutes % 60 ? ` ${minutes % 60} мин` : ''}`
  : `${minutes} мин`);

export async function trainingView({ query, rerender }) {
  const { categories, courses, summary } = await api('/api/training');
  const category = query.get('category') || '';
  const open = query.get('course');
  const shown = courses.filter((c) => !category || c.category === category);

  return {
    title: 'Обучение',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Учебный центр</span>
        <h1>Обучение</h1>
        <p class="lead">Курсы для собственника, руководителя и агентов. Обязательные курсы отмечены, прогресс сохраняется в вашем профиле.</p>
      </div>
      ${DEMO_MODE ? html`<p class="notice">Раздел этапа 2. Показан пример наполнения; отметки уроков работают.</p>` : ''}

      <section class="stats">
        <div class="card stat-card"><span class="muted small">Пройдено курсов</span><span class="stat">${summary.completed} из ${courses.length}</span></div>
        <div class="card stat-card"><span class="muted small">В процессе</span><span class="stat">${summary.inProgress}</span></div>
        <div class="card stat-card"><span class="muted small">Обязательных осталось</span><span class="stat">${summary.requiredLeft} из ${summary.requiredTotal}</span></div>
      </section>

      <div class="chips">
        <a class="chip ${!category ? 'on' : ''}" href="#/training">Все</a>
        ${categories.map((c) => html`<a class="chip ${c === category ? 'on' : ''}" href="#/training?category=${encodeURIComponent(c)}">${c}</a>`)}
      </div>

      <div class="grid" id="courses">${shown.map((c) => {
        const pct = Math.round((c.done / c.total) * 100);
        const expanded = open === c.id;
        return html`<article class="card course">
          <div class="row spread"><span class="eyebrow">${c.category}</span>
            ${c.completed ? html`<span class="pill ok">Пройден</span>` : c.required ? html`<span class="pill red">Обязательный</span>` : ''}</div>
          <h3>${c.title}</h3>
          <p class="small muted">${c.description}</p>
          <span class="small muted">${c.format} · ${hours(c.duration)} · ${c.total} ${lessonsWord(c.total)}</span>
          <div class="row spread small"><span>${c.done} из ${c.total}</span><span>${pct} %</span></div>
          <div class="progress"><span data-width="${pct}"></span></div>
          ${expanded ? html`<ol class="lessons">${c.lessons.map((l, i) => html`
            <li><label class="check"><input type="checkbox" data-course="${c.id}" data-index="${i}" ${i < c.done ? html`checked` : ''}> ${l}</label></li>`)}</ol>
            <a class="btn sm" href="#/training${category ? `?category=${encodeURIComponent(category)}` : ''}">Свернуть</a>`
          : html`<a class="btn sm ${c.done ? '' : 'primary'}" href="#/training?${new URLSearchParams({ ...(category ? { category } : {}), course: c.id })}">${c.completed ? 'Повторить' : c.done ? 'Продолжить' : 'Начать'}</a>`}
        </article>`;
      })}</div>`,
    mount(root) {
      root.querySelector('#courses').addEventListener('change', async (e) => {
        const box = e.target.closest('input[data-course]');
        if (!box) return;
        // Уроки проходятся по порядку: отметка урока N означает, что пройдены 1…N.
        const index = Number(box.dataset.index);
        const done = box.checked ? index + 1 : index;
        try {
          await api('/api/training/progress', { method: 'POST', body: { courseId: box.dataset.course, done } });
          rerender();
        } catch (error) { toast(error.message); }
      });
    },
  };
}

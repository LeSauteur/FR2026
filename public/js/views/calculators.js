import { html, render, api, fmtMoney, fmtPercent, fmtDate, toast } from '../lib.js?v=20260929-3';
// Та же формула, что проверяется тестами и пересчитывается сервером при сохранении.
import { calculateRoyalty, calculateMotivation, CALCULATORS } from '../../shared/calculators.js';
import { ROYALTY_POLICY_2026 } from '../../shared/policies/royalty-2026.js';
import { MOTIVATION_POLICY_2026 } from '../../shared/policies/motivation-2026.js';

const readForm = (form) => {
  const data = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    data[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value || 0) : el.value;
  }
  return data;
};

function royaltyResult(r) {
  return html`
    <div class="row spread"><span class="muted">Ставка</span><b>${fmtPercent(r.rate)}</b></div>
    <div class="big">${fmtMoney(r.royalty)}</div>
    <div class="row spread small"><span class="muted">Оборот после роялти</span><span>${fmtMoney(r.remainder)}</span></div>`;
}

function motivationResult(r) {
  return html`
    <div class="row spread"><span class="muted">Итоговый пакет</span><span class="pill red">${r.packageSource === 'tenure' ? 'по стажу' : 'по результату'}</span></div>
    <div class="big">${r.package.label}</div>
    <div class="small">Ставка агента: от ${r.package.floorRate} до ${r.package.maxRate} %</div>
    <div class="small muted">По стажу — ${r.byTenure}. По результату — ${r.byPerformance}. ${r.performanceReason}</div>
    <div class="row spread small"><span class="muted">Уровень квартала / полугодия</span><span>${r.quarterLevel} / ${r.halfYearLevel}</span></div>
    <div class="row spread"><span class="muted">Стипендия в месяц</span><b>${fmtMoney(r.stipendMonthly)}</b></div>
    <div class="small muted">${r.stipendReason}</div>
    <div class="small">${r.travelLevelReached ? '✓ Уровень полугодия достаточен для «Путешествуй с Домиан».' : 'Для «Путешествуй с Домиан» нужен 4-й уровень полугодия.'}</div>`;
}

export async function calculatorsView({ me, rerender }) {
  const { calculations } = await api('/api/calculations');
  const offices = me.offices;
  const officeSelect = offices.length ? html`
    <label class="field"><span>Офис (необязательно)</span><select name="officeId"><option value="">—</option>
      ${offices.map((o) => html`<option value="${o.id}">${o.name}</option>`)}</select></label>` : '';

  return {
    title: 'Калькуляторы',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Формулы с версиями политик</span>
        <h1>Калькуляторы</h1>
        <p class="lead">Считается сразу в браузере. При сохранении сервер пересчитывает результат сам и запоминает версию политики, чтобы в 2027 году старые расчёты не изменились.</p>
      </div>

      <section class="grid-2">
        <form class="card form" id="royalty" data-calc="royalty">
          <div class="card-head"><h2>Роялти</h2><span class="pill">${ROYALTY_POLICY_2026.id}</span></div>
          <label class="field"><span>Комиссионный оборот за месяц, ₽</span><input name="turnover" type="number" min="0" step="1000" value="1200000"></label>
          <div class="result" data-out></div>
          <div class="form-2">${officeSelect}<label class="field"><span>Название</span><input name="title" placeholder="Например: сентябрь 2026"></label></div>
          <button class="btn" type="submit">Сохранить расчёт</button>
        </form>

        <form class="card form" id="motivation" data-calc="motivation">
          <div class="card-head"><h2>Пакет мотивации агента</h2><span class="pill">${MOTIVATION_POLICY_2026.id}</span></div>
          <div class="form-2">
            <label class="field"><span>Статус</span><select name="status"><option value="partner">Партнёр</option><option value="trainee">Стажёр</option></select></label>
            <label class="field"><span>Стаж, полных месяцев</span><input name="tenureMonths" type="number" min="0" value="14"></label>
            <label class="field"><span>Задатки за квартал, ₽</span><input name="quarterDeposits" type="number" min="0" step="10000" value="300000"></label>
            <label class="field"><span>Комиссия за квартал, ₽</span><input name="quarterCommission" type="number" min="0" step="10000" value="650000"></label>
            <label class="field"><span>Комиссия за полугодие, ₽</span><input name="halfYearCommission" type="number" min="0" step="10000" value="1300000"></label>
            <label class="field"><span>Прошлый пакет по результату</span><select name="previousPackage">
              ${MOTIVATION_POLICY_2026.packages.filter((p) => p.status === 'partner').map((p) => html`<option value="${p.id}">${p.label}</option>`)}</select></label>
          </div>
          <label class="check"><input type="checkbox" name="halfYearConfirmed" checked> Результат полугодия подтверждён</label>
          <div class="result" data-out></div>
          <div class="form-2">${officeSelect}<label class="field"><span>Название</span><input name="title" placeholder="Например: агент Иванов, III кв."></label></div>
          <button class="btn" type="submit">Сохранить расчёт</button>
        </form>
      </section>

      <section class="card">
        <h2>Сохранённые расчёты</h2>
        ${calculations.length ? html`<div class="table-wrap"><table>
          <thead><tr><th>Название</th><th>Калькулятор</th><th>Итог</th><th>Политика</th><th>Дата</th><th></th></tr></thead>
          <tbody id="saved">${calculations.map((c) => {
            const r = JSON.parse(c.result_json);
            const summary = c.calculator === 'royalty' ? fmtMoney(r.royalty) : r.package?.label;
            return html`<tr><td>${c.title}</td><td>${CALCULATORS[c.calculator]?.title || c.calculator}</td><td>${summary}</td>
              <td class="small muted">${c.policy_id}</td><td class="small">${fmtDate(c.created_at)}</td>
              <td><button class="btn ghost sm" type="button" data-del="${c.id}">Удалить</button></td></tr>`;
          })}</tbody></table></div>`
          : html`<p class="muted">Пока нет сохранённых расчётов.</p>`}
      </section>

      <p class="small muted">Следующие к переносу из Dom2: экономика офиса A4, ведомость сделок, карьерный отчёт, пеня, план офиса.</p>`,
    mount(root) {
      const runners = { royalty: [calculateRoyalty, royaltyResult], motivation: [calculateMotivation, motivationResult] };
      for (const form of root.querySelectorAll('form[data-calc]')) {
        const [run, view] = runners[form.dataset.calc];
        const update = () => render(form.querySelector('[data-out]'), view(run(readForm(form))));
        form.addEventListener('input', update);
        update();
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const { title, officeId, ...input } = readForm(form);
          try {
            await api('/api/calculations', {
              method: 'POST',
              body: { calculator: form.dataset.calc, title: title || `Расчёт от ${new Date().toLocaleDateString('ru-RU')}`, officeId: officeId || null, input },
            });
            toast('Расчёт сохранён');
            rerender();
          } catch (error) { toast(error.message); }
        });
      }
      root.querySelector('#saved')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-del]');
        if (!btn || !confirm('Удалить расчёт?')) return;
        await api(`/api/calculations/${btn.dataset.del}`, { method: 'DELETE' });
        rerender();
      });
    },
  };
}

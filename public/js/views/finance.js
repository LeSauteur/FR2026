import { html, api, fmtMoney, fmtPercent, DEMO_MODE } from '../lib.js?v=20260929-4';

// 'short' → «авг», 'long' → «Август 2026».
function monthLabel(ym, style = 'short') {
  const date = new Date(`${ym}-15T12:00:00Z`);
  const name = date.toLocaleString('ru-RU', { month: style, timeZone: 'UTC' }).replace('.', '');
  return style === 'long' ? `${name[0].toUpperCase()}${name.slice(1)} ${ym.slice(0, 4)}` : name;
}
const compact = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} млн` : `${Math.round(n / 1e3)} тыс`);
const PAY = { paid: ['Оплачено', 'ok'], partial: ['Частично', 'warn'], due: ['К оплате до 10-го', 'red'] };

function chart(rows) {
  const max = Math.max(...rows.flatMap((r) => [r.turnover, r.plan])) * 1.08;
  const last = rows.length - 1;
  return html`
    <figure class="chart" aria-label="Комиссионный оборот и план по месяцам">
      <div class="chart-legend">
        <span><i class="key-fact"></i>Факт — комиссионный оборот</span>
        <span><i class="key-plan"></i>План</span>
        <span><i class="key-fact miss"></i>План не выполнен</span>
      </div>
      <div class="chart-plot">
        ${rows.map((r, i) => {
          const pct = Math.round((r.turnover / r.plan) * 100);
          return html`
          <div class="chart-col" tabindex="0" aria-label="${monthLabel(r.month, 'long')}: оборот ${fmtMoney(r.turnover)}, план ${fmtMoney(r.plan)}">
            <div class="chart-track">
              <span class="chart-plan" data-bottom="${(r.plan / max) * 100}"></span>
              <span class="chart-bar ${pct >= 100 ? 'hit' : ''}" data-height="${(r.turnover / max) * 100}">
                ${i === last ? html`<b class="chart-label">${compact(r.turnover)}</b>` : ''}
              </span>
            </div>
            <span class="chart-x">${monthLabel(r.month)}</span>
            <div class="chart-tip" role="tooltip">
              <b>${monthLabel(r.month, 'long')}</b>
              <span>Оборот: ${fmtMoney(r.turnover)}</span>
              <span>План: ${fmtMoney(r.plan)} · ${pct} %</span>
              <span>Роялти: ${fmtMoney(r.royalty)}</span>
            </div>
          </div>`;
        })}
      </div>
    </figure>`;
}

export async function financeView({ query }) {
  const { offices } = await api('/api/finance');
  if (!offices.length) {
    return { title: 'Финансы', body: html`<div class="empty">Нет офисов с финансовыми данными.</div>` };
  }
  const selected = offices.find((o) => String(o.id) === query.get('office')) || offices[0];
  const t = selected.totals;
  const lastRow = selected.rows[selected.rows.length - 1];

  return {
    title: 'Финансы',
    body: html`
      <div class="page-head">
        <span class="eyebrow">Финансы офиса · последние ${selected.rows.length} месяцев</span>
        <h1>${selected.name}</h1>
        <p class="lead">Оборот, выполнение плана, роялти и оплаты по месяцам. Роялти рассчитано по шкале 2026 — той же, что в калькуляторе.</p>
      </div>
      ${DEMO_MODE ? html`<p class="notice">Раздел этапа 3. Показан пример наполнения на вымышленных цифрах.</p>` : ''}

      ${offices.length > 1 ? html`<div class="chips" role="tablist">${offices.map((o) => html`
        <a class="chip ${o.id === selected.id ? 'on' : ''}" href="#/finance?office=${o.id}" aria-current="${o.id === selected.id}">${o.name}</a>`)}</div>` : ''}

      <section class="stats">
        <div class="card stat-card"><span class="muted small">Оборот за период</span><span class="stat">${compact(t.turnover)} ₽</span>
          <span class="small ${t.lastMonthGrowthPct >= 0 ? 'up' : 'down'}">${t.lastMonthGrowthPct >= 0 ? '▲' : '▼'} ${Math.abs(t.lastMonthGrowthPct)} % за последний месяц</span></div>
        <div class="card stat-card"><span class="muted small">Выполнение плана</span><span class="stat">${t.planPct} %</span>
          <span class="small muted">план ${compact(t.plan)} ₽</span></div>
        <div class="card stat-card"><span class="muted small">Роялти начислено</span><span class="stat">${compact(t.royalty)} ₽</span>
          <span class="small muted">оплачено ${compact(t.paid)} ₽</span></div>
        <div class="card stat-card"><span class="muted small">К оплате сейчас</span><span class="stat">${fmtMoney(t.debt)}</span>
          <span class="small muted">${t.deals} сделок · средний чек ${compact(t.avgCheck)} ₽</span></div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Оборот и план</h2><span class="small muted">наведите на месяц — подробности</span></div>
        ${chart(selected.rows)}
      </section>

      <section class="card">
        <div class="card-head"><h2>По месяцам</h2><span class="pill ${PAY[lastRow.status][1]}">${monthLabel(lastRow.month, 'long')}: ${PAY[lastRow.status][0]}</span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Месяц</th><th>Оборот</th><th>План</th><th>Выполнение</th><th>Сделки</th><th>Агенты</th><th>Ставка</th><th>Роялти</th><th>Оплата</th></tr></thead>
          <tbody>${[...selected.rows].reverse().map((r) => html`<tr>
            <td>${monthLabel(r.month, 'long')}</td><td class="num">${fmtMoney(r.turnover)}</td><td class="num muted">${fmtMoney(r.plan)}</td>
            <td class="num">${Math.round((r.turnover / r.plan) * 100)} %</td><td class="num">${r.deals}</td><td class="num">${r.agents}</td>
            <td class="num">${fmtPercent(r.rate)}</td><td class="num">${fmtMoney(r.royalty)}</td>
            <td><span class="pill ${PAY[r.status][1]}">${PAY[r.status][0]}</span></td></tr>`)}</tbody>
        </table></div>
      </section>`,
  };
}

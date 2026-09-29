// Разделы этапов 2–4 (финансы, документы, обучение, HR) на демо-данных seed/demo-sections.json.
// Чистые функции: одинаково работают в браузерном демо и на локальном сервере.

import { calculateRoyalty } from './calculators.js';

// Последние n закрытых месяцев до даты today (YYYY-MM-DD), от старого к новому: ['2026-01', …].
export function closedMonths(today, n) {
  const [year, month] = today.split('-').map(Number);
  const out = [];
  for (let i = n; i >= 1; i -= 1) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// Финансы офиса по месяцам: оборот, план, роялти по действующей шкале, статус оплаты.
export function officeFinance(data, today) {
  if (!data) return null;
  const months = closedMonths(today, data.turnover.length);
  const rows = months.map((month, i) => {
    const r = calculateRoyalty({ turnover: data.turnover[i] });
    const status = data.paid[i] || 'due';
    const paid = status === 'paid' ? r.royalty : status === 'partial' ? Math.round(r.royalty / 2) : 0;
    return {
      month, turnover: data.turnover[i], plan: data.plan[i], deals: data.deals[i], agents: data.agents[i],
      rate: r.rate, royalty: r.royalty, paid, status, policyId: r.policyId,
    };
  });
  const sum = (key) => rows.reduce((total, row) => total + row[key], 0);
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  return {
    rows,
    totals: {
      turnover: sum('turnover'), plan: sum('plan'), royalty: sum('royalty'), paid: sum('paid'),
      debt: sum('royalty') - sum('paid'), deals: sum('deals'),
      planPct: Math.round((sum('turnover') / sum('plan')) * 100),
      lastMonthGrowthPct: prev ? Math.round(((last.turnover - prev.turnover) / prev.turnover) * 100) : 0,
      avgCheck: Math.round(sum('turnover') / Math.max(1, sum('deals'))),
    },
  };
}

export function daysAgoIso(daysAgo, now = new Date()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - Number(daysAgo || 0));
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

export function documentsView(docs, now) {
  return {
    folders: docs.folders.map((f) => ({ ...f, count: docs.items.filter((i) => i.folder === f.id).length })),
    items: docs.items.map((item, index) => ({
      id: index + 1, folder: item.folder, title: item.title, type: item.type, size: item.size,
      version: item.version, owner: item.owner, status: item.status, updated_at: daysAgoIso(item.daysAgo, now),
    })),
  };
}

// progress: { courseId: пройдено уроков }.
export function trainingView(training, progress = {}) {
  const courses = training.courses.map((c) => {
    const done = Math.min(c.lessons.length, Number(progress[c.id]) || 0);
    return { ...c, done, total: c.lessons.length, completed: done >= c.lessons.length };
  });
  const required = courses.filter((c) => c.required);
  return {
    categories: training.categories,
    courses,
    summary: {
      completed: courses.filter((c) => c.completed).length,
      inProgress: courses.filter((c) => c.done > 0 && !c.completed).length,
      requiredLeft: required.filter((c) => !c.completed).length,
      requiredTotal: required.length,
    },
  };
}

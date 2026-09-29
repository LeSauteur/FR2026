import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../server/db.js';
import { closedMonths, officeFinance, trainingView, documentsView } from '../shared/sections.js';
import { calculateRoyalty } from '../shared/calculators.js';

const sections = JSON.parse(readFileSync(join(ROOT, 'seed', 'demo-sections.json'), 'utf8'));
const content = JSON.parse(readFileSync(join(ROOT, 'seed', 'demo-content.json'), 'utf8'));

test('закрытые месяцы: последние N до текущего, через границу года', () => {
  assert.deepEqual(closedMonths('2026-09-29', 3), ['2026-06', '2026-07', '2026-08']);
  assert.deepEqual(closedMonths('2026-02-10', 3), ['2025-11', '2025-12', '2026-01']);
});

test('финансы: роялти по той же шкале, что калькулятор; оплаты и долг сходятся', () => {
  const f = officeFinance(sections.finance.offices['Демо-Центр'], '2026-09-29');
  assert.equal(f.rows.length, 8);
  assert.equal(f.rows.at(-1).month, '2026-08');
  for (const row of f.rows) assert.equal(row.royalty, calculateRoyalty({ turnover: row.turnover }).royalty);
  assert.equal(f.totals.debt, f.totals.royalty - f.totals.paid);
  assert.equal(f.rows.at(-1).status, 'due');
});

test('демо-разделы: офисы финансов и HR существуют, массивы одинаковой длины', () => {
  const names = new Set(content.offices.map((o) => o.name));
  for (const [name, data] of Object.entries(sections.finance.offices)) {
    assert.ok(names.has(name), name);
    const n = data.turnover.length;
    for (const key of ['plan', 'deals', 'agents', 'paid']) assert.equal(data[key].length, n, `${name}.${key}`);
  }
  for (const c of sections.hr.candidates) {
    assert.ok(names.has(c.office), c.office);
    assert.ok(c.stage >= 0 && c.stage < sections.hr.stages.length);
    assert.match(c.name, /демо/, 'кандидаты явно помечены как вымышленные');
  }
});

test('обучение и документы: сводка и счётчики папок', () => {
  const t = trainingView(sections.training, { 'owner-start': 99 });
  assert.equal(t.courses.find((c) => c.id === 'owner-start').done, 6, 'прогресс не больше числа уроков');
  assert.equal(t.summary.completed, 1);
  const d = documentsView(sections.documents);
  assert.equal(d.folders.reduce((n, f) => n + f.count, 0), d.items.length);
  assert.ok(d.items.every((i) => sections.documents.folders.some((f) => f.id === i.folder)));
});

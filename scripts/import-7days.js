// Переносит контент «7 дней» из репозитория-донора domian-7-days в seed/week.json.
// Использование: npm run import:7days -- <путь к domian-7-days/data/days.js>

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = process.argv[2];
if (!source) {
  console.error('Укажите путь к domian-7-days/data/days.js');
  process.exit(1);
}

const window = {};
runInNewContext(readFileSync(source, 'utf8'), { window });

const days = window.WEEK_DAYS.map((day, position) => {
  const content = window.DAY_CONTENT[day.id] || {};
  return {
    id: day.id,
    position,
    short: day.short,
    name: day.name,
    title: day.headerTitle || day.title,
    subtitle: content.subtitle || day.promise || '',
    result: content.result || '',
    message: content.message || '',
    tasks: (content.checklist || []).map((item) => ({
      id: `${day.id}:${item.id}`,
      label: item.label,
      helper: item.helper || null,
      doneWhen: item.doneWhen || null,
    })),
  };
});

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'week.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ contentVersion: window.CONTENT_VERSION, source: 'domian-7-days/data/days.js', days }, null, 2) + '\n');
console.log(`Готово: ${days.length} дней, ${days.reduce((n, d) => n + d.tasks.length, 0)} задач → seed/week.json`);

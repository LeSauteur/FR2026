import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../server/db.js';

test('ES-модули используют пути, совместимые с подпапкой GitHub Pages', () => {
  const demo = readFileSync(join(ROOT, 'public', 'js', 'demo-api.js'), 'utf8');
  const calculators = readFileSync(join(ROOT, 'public', 'js', 'views', 'calculators.js'), 'utf8');

  assert.match(demo, /from '\.\.\/shared\/calculators\.js'/);
  assert.doesNotMatch(demo, /from '\.\.\/\.\.\/shared\//);
  assert.match(calculators, /from '\.\.\/\.\.\/shared\/calculators\.js'/);
  assert.doesNotMatch(calculators, /from '\.\.\/\.\.\/\.\.\/shared\//);
});

test('точки загрузки демо-модулей версионированы против кэша Pages', () => {
  const index = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8');
  const app = readFileSync(join(ROOT, 'public', 'js', 'app.js'), 'utf8');
  const lib = readFileSync(join(ROOT, 'public', 'js', 'lib.js'), 'utf8');

  assert.match(index, /\.\/js\/app\.js\?v=\d{8}-\d+/);
  assert.match(app, /\.\/lib\.js\?v=\d{8}-\d+/);
  assert.match(app, /\.\/views\/calculators\.js\?v=\d{8}-\d+/);
  assert.match(lib, /\.\/demo-api\.js\?v=\d{8}-\d+/);

  const appViewImports = [...app.matchAll(/from '\.\/views\/[^']+'/g)].map((match) => match[0]);
  assert.ok(appViewImports.length >= 9);
  assert.ok(appViewImports.every((statement) => /\?v=\d{8}-\d+'$/.test(statement)));

  for (const file of ['admin', 'announcements', 'calculators', 'home', 'knowledge', 'offices', 'support', 'finance', 'documents', 'training', 'hr', 'work']) {
    const view = readFileSync(join(ROOT, 'public', 'js', 'views', `${file}.js`), 'utf8');
    assert.match(view, /from '\.\.\/lib\.js\?v=\d{8}-\d+'/);
  }
});

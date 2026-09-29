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

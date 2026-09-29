import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'demo'), { recursive: true });
cpSync(join(root, 'public'), dist, { recursive: true });
cpSync(join(root, 'shared'), join(dist, 'shared'), { recursive: true });
cpSync(join(root, 'seed', 'demo-content.json'), join(dist, 'demo', 'demo-content.json'));
cpSync(join(root, 'seed', 'week.json'), join(dist, 'demo', 'week.json'));
writeFileSync(join(dist, '.nojekyll'), '');

console.log(`GitHub Pages demo assembled in ${dist}`);

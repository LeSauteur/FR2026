import { createServer } from 'node:http';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { purgeExpiredSessions } from './auth.js';

const PORT = Number(process.env.PORT || 5180);
// Только локально: наружу сервер не слушает, пока нет нормального хостинга с HTTPS.
const HOST = '127.0.0.1';

const db = openDb();
const users = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
if (!users) {
  console.error('База пустая. Сначала выполните: npm run seed');
  process.exit(1);
}

purgeExpiredSessions(db);
setInterval(() => purgeExpiredSessions(db), 60 * 60 * 1000).unref();

createServer(createApp(db)).listen(PORT, HOST, () => {
  console.log(`Домиан Hub: http://localhost:${PORT}`);
});

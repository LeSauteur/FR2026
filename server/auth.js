// Пароли — scrypt с солью, сессии — случайный токен в HttpOnly-cookie,
// в базе хранится только его SHA-256. Никаких паролей и токенов во фронтенде.

import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };
export const SESSION_TTL_HOURS = 12;
export const SESSION_COOKIE = 'hub_sid';

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    throw new Error('Пароль должен быть не короче 10 символов.');
  }
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize('NFKC'), salt, SCRYPT.keylen, SCRYPT);
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export function verifyPassword(password, stored) {
  const [algo, N, r, p, saltB64, hashB64] = String(stored || '').split('$');
  if (algo !== 'scrypt' || typeof password !== 'string') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// Хэш-заглушка, чтобы вход несуществующего логина занимал столько же времени.
const DUMMY_HASH = hashPassword(randomBytes(24).toString('base64'));

const tokenHash = (token) => createHash('sha256').update(token).digest('hex');

export function authenticate(db, login, password) {
  const user = db.prepare('SELECT * FROM users WHERE login = ? AND is_active = 1').get(String(login || '').trim());
  const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
  return ok && user ? user : null;
}

export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare(`INSERT INTO sessions (token_hash, user_id, expires_at)
              VALUES (?, ?, datetime('now', ?))`).run(tokenHash(token), userId, `+${SESSION_TTL_HOURS} hours`);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(userId);
  return token;
}

export function sessionUser(db, token) {
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.login, u.display_name, u.role, u.editor_scope
                     FROM sessions s JOIN users u ON u.id = s.user_id
                     WHERE s.token_hash = ? AND s.expires_at > datetime('now') AND u.is_active = 1`)
    .get(tokenHash(token)) || null;
}

export function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token));
}

export function purgeExpiredSessions(db) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();
}

// Простое ограничение перебора: 5 неудачных попыток на логин+IP за 15 минут.
export function createLoginLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map();
  return {
    blocked(key) {
      const entry = attempts.get(key);
      if (!entry) return false;
      if (Date.now() - entry.first > windowMs) { attempts.delete(key); return false; }
      return entry.count >= max;
    },
    fail(key) {
      const entry = attempts.get(key);
      if (!entry || Date.now() - entry.first > windowMs) attempts.set(key, { first: Date.now(), count: 1 });
      else entry.count += 1;
    },
    reset(key) { attempts.delete(key); },
  };
}

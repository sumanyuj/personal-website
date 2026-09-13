import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import * as db from './db.js';

const scryptAsync = promisify(scrypt);

/**
 * Passwords and sessions.
 *
 * scrypt from node's crypto rather than bcrypt or argon2, so the service keeps
 * its zero-dependency deploy. Parameters are stored alongside each hash, so
 * raising them later does not invalidate existing passwords.
 */

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    // scrypt needs memory proportional to N*r*128; node's default cap is lower.
    maxmem: 256 * 1024 * 1024
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, N, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');

  let actual;
  try {
    actual = await scryptAsync(password, salt, expected.length, {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: 256 * 1024 * 1024
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// MARK: - Sessions

/** Long enough that "it remembers me" means months, not days. */
export const SESSION_TTL_MS = 400 * 24 * 60 * 60 * 1000;
export const COOKIE_NAME = 'bookshelf_session';

const hashToken = (token) => createHash('sha256').update(token).digest('hex');

/**
 * Issues a session. Only the hash is stored: a leaked database backup should
 * not hand someone a working set of session cookies.
 */
export function issueSession(userId, userAgent) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db.createSession(hashToken(token), userId, expiresAt, userAgent);
  return { token, expiresAt };
}

export function resolveSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const session = db.sessionByHash(tokenHash);
  if (!session) return null;

  if (session.expires_at < Date.now()) {
    db.deleteSession(tokenHash);
    return null;
  }

  // Rolling expiry, written at most once a day so an active session is not a
  // write on every request.
  if (Date.now() - session.last_seen > 24 * 60 * 60 * 1000) {
    db.touchSession(tokenHash, Date.now() + SESSION_TTL_MS);
  }

  const user = db.userById(session.user_id);
  return user ? { user, tokenHash } : null;
}

export const revokeSession = (token) => token && db.deleteSession(hashToken(token));

// MARK: - Cookies

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/**
 * `secure` is off only when running plain HTTP locally; a Secure cookie is
 * simply dropped by the browser over http://localhost, which would make the
 * whole thing look broken in development.
 */
export function sessionCookie(token, { maxAge, secure }) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    // Lax rather than Strict: Strict would drop the cookie when arriving from
    // an external link, so the reader would look logged out until they
    // navigated again.
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAge / 1000)}`
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export const clearCookie = ({ secure }) =>
  sessionCookie('', { maxAge: 0, secure }).replace(`${COOKIE_NAME}=`, `${COOKIE_NAME}=`);

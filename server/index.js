import { createServer } from 'node:http';
import { pipeline } from 'node:stream/promises';
import * as auth from './auth.js';
import * as covers from './covers.js';
import * as db from './db.js';

/**
 * The bookshelf API.
 *
 * Node builtins only — no framework, no npm dependencies — so deploying is
 * copying a directory and restarting a unit. Caddy terminates TLS, serves the
 * static site and reverse-proxies /api here, so this never speaks to the
 * internet directly.
 */

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
/** Signup is closed unless a code is configured. */
const SIGNUP_CODE = process.env.BOOKSHELF_SIGNUP_CODE || '';
/** Set when the service sits behind TLS, which decides the cookie's Secure flag. */
const SECURE_COOKIES = process.env.BOOKSHELF_INSECURE_COOKIES !== '1';
/** Requests are same-origin; anything else is refused outright. */
const ORIGIN = process.env.BOOKSHELF_ORIGIN || 'https://sumanyuj.com';

const MAX_JSON_BYTES = 1_000_000;
const MAX_IMAGE_BYTES = 12_000_000;

// MARK: - Helpers

const json = (res, status, body, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(payload);
};

const fail = (res, status, message) => json(res, status, { error: message });

async function readBody(req, limit) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw Object.assign(new Error('payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJSON(req) {
  const body = await readBody(req, MAX_JSON_BYTES);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid JSON'), { status: 400 });
  }
}

/**
 * SameSite=Lax already blocks cross-site form posts, but it does not cover
 * every browser or every request shape, so state-changing requests must also
 * carry a same-origin Origin header.
 */
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // non-browser client, or a same-origin GET
  return origin === ORIGIN || /^http:\/\/localhost(:\d+)?$/.test(origin);
}

// MARK: - Login throttling

/** Per-username and per-address, so one account cannot be ground down. */
const attempts = new Map();
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

function tooManyAttempts(key) {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > ATTEMPT_WINDOW_MS) {
    attempts.set(key, { first: Date.now(), count: 1 });
    return;
  }
  entry.count += 1;
}

const clearAttempts = (key) => attempts.delete(key);

// MARK: - Auth routes

async function register(req, res) {
  const { username, password, code } = await readJSON(req);

  if (!SIGNUP_CODE) return fail(res, 403, 'Signups are closed');
  if (code !== SIGNUP_CODE) return fail(res, 403, 'That signup code is not right');

  const name = String(username ?? '').trim();
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(name)) {
    return fail(res, 400, 'Username must be 3–32 characters: letters, numbers, . _ or -');
  }
  if (String(password ?? '').length < 8) {
    return fail(res, 400, 'Password must be at least 8 characters');
  }
  if (db.findUser(name)) return fail(res, 409, 'That username is taken');

  const userId = db.createUser(name, await auth.hashPassword(password));
  const { token } = auth.issueSession(userId, req.headers['user-agent']);
  return json(
    res,
    201,
    { user: { id: userId, username: name } },
    {
      'set-cookie': auth.sessionCookie(token, {
        maxAge: auth.SESSION_TTL_MS,
        secure: SECURE_COOKIES
      })
    }
  );
}

async function login(req, res) {
  const { username, password } = await readJSON(req);
  const name = String(username ?? '').trim();
  const key = `${name.toLowerCase()}|${req.socket.remoteAddress}`;

  if (tooManyAttempts(key)) {
    return fail(res, 429, 'Too many attempts. Try again in a few minutes.');
  }

  const user = db.findUser(name);
  // Verify even when the user is unknown, so a missing account and a wrong
  // password take the same time to answer.
  const ok = await auth.verifyPassword(
    String(password ?? ''),
    user?.password_hash ?? 'scrypt$32768$8$1$AAAA$AAAA'
  );

  if (!user || !ok) {
    recordAttempt(key);
    return fail(res, 401, 'Wrong username or password');
  }

  clearAttempts(key);
  const { token } = auth.issueSession(user.id, req.headers['user-agent']);
  return json(
    res,
    200,
    { user: { id: user.id, username: user.username } },
    {
      'set-cookie': auth.sessionCookie(token, {
        maxAge: auth.SESSION_TTL_MS,
        secure: SECURE_COOKIES
      })
    }
  );
}

function logout(req, res, session, token) {
  auth.revokeSession(token);
  return json(
    res,
    200,
    { ok: true },
    {
      'set-cookie': auth.sessionCookie('', { maxAge: 0, secure: SECURE_COOKIES })
    }
  );
}

// MARK: - Library routes

const libraryFor = (userId) => ({ books: db.listBooks(userId), lists: db.listLists(userId) });

// MARK: - Router

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`);
  const parts = url.pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean);
  const method = req.method ?? 'GET';

  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(req)) {
    return fail(res, 403, 'Cross-origin requests are not allowed');
  }

  const token = auth.parseCookies(req.headers.cookie)[auth.COOKIE_NAME];
  const session = auth.resolveSession(token);

  // --- Unauthenticated ---
  if (parts[0] === 'auth') {
    if (parts[1] === 'register' && method === 'POST') return register(req, res);
    if (parts[1] === 'login' && method === 'POST') return login(req, res);
    if (parts[1] === 'logout' && method === 'POST') return logout(req, res, session, token);
    if (parts[1] === 'me' && method === 'GET') {
      return session
        ? json(res, 200, { user: { id: session.user.id, username: session.user.username } })
        : json(res, 200, { user: null, signupOpen: Boolean(SIGNUP_CODE) });
    }
    return fail(res, 404, 'No such endpoint');
  }

  if (!session) return fail(res, 401, 'Not signed in');
  const userId = session.user.id;

  // --- Library ---
  if (parts[0] === 'library' && method === 'GET') return json(res, 200, libraryFor(userId));

  if (parts[0] === 'books') {
    const id = parts[1];

    if (!id && method === 'GET') return json(res, 200, { books: db.listBooks(userId) });

    // Bulk upload, used once when an existing local library is adopted.
    if (!id && method === 'POST') {
      const { books = [], lists = [] } = await readJSON(req);
      for (const list of lists) db.upsertList(userId, list);
      for (const book of books) db.upsertBook(userId, book);
      return json(res, 200, libraryFor(userId));
    }

    if (id && parts[2] === 'cover' && method === 'PUT') {
      const variant = url.searchParams.get('variant') === 'thumb' ? 'thumb' : 'master';
      const aspect = Number(url.searchParams.get('aspect')) || null;
      if (!db.getBook(userId, id)) return fail(res, 404, 'No such book');

      const buffer = await readBody(req, MAX_IMAGE_BYTES);
      const etag = await covers.saveCover(userId, id, variant, buffer, req.headers['content-type']);
      // Only the master's bytes decide the etag, so replacing a thumbnail does
      // not invalidate a cached full-resolution cover.
      if (variant === 'master') db.setCoverEtag(userId, id, etag, aspect);
      return json(res, 200, { etag });
    }

    if (id && (parts[2] === 'cover' || parts[2] === 'thumb') && method === 'GET') {
      const found = await covers.findCover(userId, id, parts[2] === 'thumb' ? 'thumb' : 'master');
      if (!found) return fail(res, 404, 'No cover');
      res.writeHead(200, {
        'content-type': covers.contentTypeFor(found.ext),
        'content-length': found.size,
        // The URL carries the etag, so a hit can be cached indefinitely; it is
        // private because it is one account's artwork behind a session.
        'cache-control': 'private, max-age=31536000, immutable'
      });
      if (method === 'HEAD') return res.end();
      return pipeline(found.stream(), res);
    }

    if (id && method === 'PUT') {
      const book = await readJSON(req);
      if (book.id !== id) return fail(res, 400, 'Body id does not match the path');
      return json(res, 200, { book: db.upsertBook(userId, book) });
    }

    if (id && method === 'DELETE') {
      db.deleteBook(userId, id);
      await covers.deleteCovers(userId, id);
      return json(res, 200, { ok: true });
    }
  }

  if (parts[0] === 'lists') {
    const id = parts[1];
    if (!id && method === 'GET') return json(res, 200, { lists: db.listLists(userId) });
    if (id && method === 'PUT') {
      const list = await readJSON(req);
      if (list.id !== id) return fail(res, 400, 'Body id does not match the path');
      return json(res, 200, { list: db.upsertList(userId, list) });
    }
    if (id && method === 'DELETE') {
      db.deleteList(userId, id);
      return json(res, 200, { ok: true });
    }
  }

  return fail(res, 404, 'No such endpoint');
}

// MARK: - Boot

db.initDb();
db.purgeExpiredSessions();
setInterval(db.purgeExpiredSessions, 6 * 60 * 60 * 1000).unref();

createServer((req, res) => {
  route(req, res).catch((error) => {
    const status = error?.status ?? 500;
    if (status >= 500) console.error(`${req.method} ${req.url}`, error);
    if (!res.headersSent) fail(res, status, status >= 500 ? 'Server error' : error.message);
    else res.end();
  });
}).listen(PORT, HOST, () => {
  console.log(
    `bookshelf api on http://${HOST}:${PORT} (signups ${SIGNUP_CODE ? 'open' : 'closed'})`
  );
});

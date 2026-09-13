import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { COVER_DIR } from './db.js';

/**
 * Cover art on disk rather than in SQLite.
 *
 * A full-resolution cover is a few hundred KB and there are two per book; in
 * the database they would bloat every backup and every page of a query that
 * does not want them. On disk they can also be streamed straight to the client
 * without being read into memory first.
 */

const EXT = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Paths are per-user, so one account's id can never address another's file. */
const userDir = (userId) => path.join(COVER_DIR, String(userId));

const fileName = (bookId, variant, ext) => `${bookId}.${variant}.${ext}`;

export const contentTypeFor = (ext) =>
  ({ webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' })[ext] ?? 'application/octet-stream';

export async function saveCover(userId, bookId, variant, buffer, mimeType) {
  const ext = EXT[mimeType];
  if (!ext) throw Object.assign(new Error('unsupported image type'), { status: 415 });

  const dir = userDir(userId);
  await mkdir(dir, { recursive: true });

  // Remove any previous encoding of the same variant, or replacing a WebP with
  // a JPEG would leave both on disk and the old one would win the lookup.
  await Promise.all(
    Object.values(EXT).map((other) =>
      other === ext ? null : rm(path.join(dir, fileName(bookId, variant, other)), { force: true })
    )
  );

  await writeFile(path.join(dir, fileName(bookId, variant, ext)), buffer);
  return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

/** Resolves whichever encoding is actually on disk for this variant. */
export async function findCover(userId, bookId, variant) {
  for (const ext of Object.values(EXT)) {
    const file = path.join(userDir(userId), fileName(bookId, variant, ext));
    try {
      const info = await stat(file);
      return { file, ext, size: info.size, stream: () => createReadStream(file) };
    } catch {
      // Try the next encoding.
    }
  }
  return null;
}

export async function deleteCovers(userId, bookId) {
  await Promise.all(
    ['master', 'thumb'].flatMap((variant) =>
      Object.values(EXT).map((ext) =>
        rm(path.join(userDir(userId), fileName(bookId, variant, ext)), { force: true })
      )
    )
  );
}

import { useEffect, useState } from 'react';
import Sheet from './Sheet.jsx';
import { READ_STATUS, authorLine } from '../model/book.js';
import { getCover } from '../model/db.js';

function Stars({ value, onChange }) {
  return (
    <span className="stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(value === n ? 0 : n)}
        >
          <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
            <path
              d="m10 2.6 2.3 4.7 5.2.75-3.75 3.66.89 5.17L10 14.44l-4.64 2.44.89-5.17L2.5 8.05l5.2-.75z"
              fill={n <= value ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      ))}
    </span>
  );
}

/** Every field is editable — source metadata is good, never perfect. */
export default function BookDetailSheet({
  book,
  coverURL,
  lists,
  onChange,
  onDelete,
  onToggleList,
  onClose
}) {
  const [confirming, setConfirming] = useState(false);
  // The shelf draws a display-sized derivative to keep its memory sane; here the
  // cover is actually looked at, so the full-resolution master is loaded on open
  // and released again on close.
  const [masterURL, setMasterURL] = useState(null);
  const set = (changes) => onChange(book.id, changes);

  useEffect(() => {
    let url = null;
    let cancelled = false;

    getCover(book.id)
      .then((blob) => {
        if (cancelled || !blob) return;
        url = URL.createObjectURL(blob);
        setMasterURL(url);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      setMasterURL(null);
      if (url) URL.revokeObjectURL(url);
    };
  }, [book.id]);

  return (
    <Sheet
      title={book.title}
      onClose={onClose}
      footer={
        confirming ? (
          <button type="button" className="cbtn" onClick={() => onDelete(book.id)}>
            Really remove?
          </button>
        ) : (
          <button type="button" className="cbtn" onClick={() => setConfirming(true)}>
            Remove
          </button>
        )
      }
    >
      <div className="detail__head">
        {masterURL || coverURL ? (
          <img className="detail__cover" src={masterURL ?? coverURL} alt="" />
        ) : (
          <span className="detail__cover" style={{ height: 180 }} />
        )}
        <div style={{ minWidth: 0 }}>
          <h3 className="detail__title">{book.title}</h3>
          <p className="detail__author">{authorLine(book)}</p>
          <Stars value={book.rating} onChange={(rating) => set({ rating })} />
          <div style={{ marginTop: 10 }}>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Status</span>
              <select value={book.readStatus} onChange={(e) => set({ readStatus: e.target.value })}>
                {READ_STATUS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <label className="field">
        <span>Title</span>
        <input value={book.title} onChange={(e) => set({ title: e.target.value })} />
      </label>

      <label className="field">
        <span>Authors</span>
        <input
          value={(book.authors ?? []).join(', ')}
          onChange={(e) =>
            set({
              authors: e.target.value
                .split(',')
                .map((a) => a.trim())
                .filter(Boolean)
            })
          }
        />
      </label>

      <div className="row">
        <label className="field">
          <span>Publisher</span>
          <input
            value={book.publisher ?? ''}
            onChange={(e) => set({ publisher: e.target.value || null })}
          />
        </label>
        <label className="field">
          <span>Published</span>
          <input
            value={book.publishedDate ?? ''}
            onChange={(e) => set({ publishedDate: e.target.value || null })}
          />
        </label>
      </div>

      <div className="row">
        <label className="field">
          <span>Pages</span>
          <input
            type="number"
            min="0"
            value={book.pageCount ?? ''}
            onChange={(e) => set({ pageCount: e.target.value ? Number(e.target.value) : null })}
          />
        </label>
        <label className="field">
          <span>ISBN</span>
          <input
            value={book.isbn13 ?? ''}
            onChange={(e) => set({ isbn13: e.target.value || null })}
          />
        </label>
      </div>

      {lists.length > 0 && (
        <div className="field">
          <span>Collections</span>
          <div className="chips">
            {lists.map((list) => {
              const member = book.listIds?.includes(list.id);
              return (
                <button
                  key={list.id}
                  type="button"
                  className="chip"
                  aria-pressed={member}
                  onClick={() => onToggleList(book.id, list.id, !member)}
                >
                  {list.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label className="field">
        <span>Description</span>
        <textarea
          value={book.description ?? ''}
          onChange={(e) => set({ description: e.target.value || null })}
        />
      </label>

      <p className="result__badge">
        Metadata source: {book.source}
        {book.coverAspect ? ` · cover ${book.coverAspect.toFixed(2)}:1` : ''}
      </p>
    </Sheet>
  );
}

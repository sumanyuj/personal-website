import { useEffect, useRef, useState } from 'react';
import Sheet from './Sheet.jsx';
import { search } from '../metadata/search.js';
import { makeBook } from '../model/book.js';

const SOURCE_LABEL = {
  apple: 'Apple Books',
  openlibrary: 'Open Library',
  'openlibrary+apple': 'Apple + Open Library'
};

function meta(result) {
  return [
    result.authors?.join(', ') || 'Unknown',
    result.publishedDate ? /\d{4}/.exec(result.publishedDate)?.[0] : null,
    result.pageCount ? `${result.pageCount} pages` : null,
    result.publisher
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * One field queries Apple Books and Open Library together and merges them. Apple
 * answers in well under a second and is shown immediately; the merged,
 * edition-resolved result replaces it a few seconds later.
 */
export default function AddBookSheet({ onAdd, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [state, setState] = useState('idle'); // idle | searching | refining | done
  const [adding, setAdding] = useState(null);
  const controller = useRef(null);

  useEffect(() => () => controller.current?.abort(), []);

  // Debounced so typing does not fan out a request per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setState('idle');
      return undefined;
    }

    const timer = setTimeout(() => {
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      setState('searching');

      search(q, {
        signal: ac.signal,
        onPartial: (partial) => {
          if (ac.signal.aborted) return;
          setResults(partial);
          setState('refining');
        }
      })
        .then((merged) => {
          if (ac.signal.aborted) return;
          setResults(merged);
          setState('done');
        })
        .catch(() => {
          if (!ac.signal.aborted) setState('done');
        });
    }, 320);

    return () => clearTimeout(timer);
  }, [query]);

  const addManually = async () => {
    const title = query.trim();
    if (!title) return;
    await onAdd(makeBook({ title, source: 'manual' }));
    onClose();
  };

  return (
    <Sheet title="Add a Book" onClose={onClose} linen>
      <div className="searchfield">
        <input
          type="search"
          value={query}
          placeholder="Title, author or ISBN"
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search for a book"
        />
      </div>

      {state === 'searching' && !results.length && <p className="hint">Searching…</p>}

      {state !== 'idle' && !results.length && state !== 'searching' && (
        <p className="hint">
          Nothing found.{' '}
          <button type="button" className="chip" onClick={addManually}>
            Add “{query.trim()}” anyway
          </button>
        </p>
      )}

      <ul className="results">
        {results.map((result) => (
          <li key={result.id}>
            <button
              type="button"
              className="result"
              disabled={adding === result.id}
              onClick={async () => {
                setAdding(result.id);
                await onAdd(result);
                onClose();
              }}
            >
              {result.coverURL ? (
                <img className="result__cover" src={result.coverURL} alt="" loading="lazy" />
              ) : (
                <span className="result__cover" />
              )}
              <span className="result__text">
                <span className="result__title">{result.title}</span>
                <span className="result__meta">{meta(result)}</span>
                {result.source && (
                  <span className="result__badge">
                    {SOURCE_LABEL[result.source] ?? result.source}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {state === 'refining' && (
        <p className="hint">
          Refining with Open Library — page counts and publishers are still arriving…
        </p>
      )}
    </Sheet>
  );
}

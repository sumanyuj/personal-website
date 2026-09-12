import { memo } from 'react';
import { authorLine, year } from '../model/book.js';

const COLUMNS = [
  { id: 'title', label: 'Title' },
  { id: 'author', label: 'Author' },
  { id: 'recent', label: 'Added' },
  { id: 'pages', label: 'Pages', numeric: true },
  { id: 'rating', label: 'Rating', numeric: true }
];

/** List view, sortable by title, author, date added, page count or rating. */
function LibraryList({ books, coverURLs, sortOrder, onSort, onOpen }) {
  return (
    <div className="listview">
      <table>
        <thead>
          <tr>
            <th style={{ width: 40 }} aria-label="Cover" />
            {COLUMNS.map((column) => (
              <th
                key={column.id}
                className={column.numeric ? 'num' : undefined}
                aria-sort={sortOrder === column.id ? 'ascending' : 'none'}
                onClick={() => onSort(column.id)}
              >
                {column.label}
                {sortOrder === column.id ? ' ▾' : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {books.map((book) => (
            <tr key={book.id} onClick={() => onOpen(book)}>
              <td>
                {coverURLs.get(book.id) ? (
                  <img
                    className="listview__cover"
                    src={coverURLs.get(book.id)}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="listview__cover" style={{ display: 'inline-block' }} />
                )}
              </td>
              <td>
                <strong>{book.title}</strong>
                {year(book) ? (
                  <span style={{ color: 'var(--ink-soft)' }}> · {year(book)}</span>
                ) : null}
              </td>
              <td>{authorLine(book)}</td>
              <td>{new Date(book.dateAdded).toLocaleDateString()}</td>
              <td className="num">{book.pageCount ?? '—'}</td>
              <td className="num">{book.rating ? '★'.repeat(book.rating) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default memo(LibraryList);

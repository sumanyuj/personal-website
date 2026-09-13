import { memo } from 'react';
import {
  BigBookIcon,
  CollectionsIcon,
  GridIcon,
  ListIcon,
  PlusIcon,
  SignOutIcon,
  SmallBookIcon
} from './icons.jsx';
import { METRICS } from '../model/layout.js';

export const ChromeToolbar = memo(function ChromeToolbar({
  title,
  bookCount,
  viewMode,
  onViewMode,
  editing,
  onToggleEditing,
  onAdd,
  onCollections,
  search,
  onSearch,
  username,
  onSignOut
}) {
  return (
    <header className="chrome">
      <button type="button" className="cbtn" onClick={onCollections}>
        <CollectionsIcon />
        <span className="cbtn__label">Collections</span>
      </button>

      <div className="chrome__title">
        <strong>{title}</strong>
        <span>
          {bookCount} {bookCount === 1 ? 'book' : 'books'}
        </span>
      </div>

      <span className="chrome__spacer" />

      <input
        type="search"
        className="chrome__search"
        placeholder="Filter"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        aria-label="Filter the library"
      />

      <span className="cbtn__group">
        <button
          type="button"
          className="cbtn cbtn--icon"
          aria-pressed={viewMode === 'shelf'}
          aria-label="Shelf view"
          onClick={() => onViewMode('shelf')}
        >
          <GridIcon />
        </button>
        <button
          type="button"
          className="cbtn cbtn--icon"
          aria-pressed={viewMode === 'list'}
          aria-label="List view"
          onClick={() => onViewMode('list')}
        >
          <ListIcon />
        </button>
      </span>

      <button type="button" className="cbtn cbtn--icon" onClick={onAdd} aria-label="Add a book">
        <PlusIcon />
      </button>

      <button type="button" className="cbtn" aria-pressed={editing} onClick={onToggleEditing}>
        {editing ? 'Done' : 'Edit'}
      </button>

      <button
        type="button"
        className="cbtn"
        onClick={onSignOut}
        title={`Signed in as ${username} — sign out`}
      >
        <span className="cbtn__label">{username}</span>
        <SignOutIcon />
      </button>
    </header>
  );
});

export const ShelfBottomBar = memo(function ShelfBottomBar({
  zoom,
  onZoom,
  pageCount,
  page,
  onPage,
  showPages
}) {
  return (
    <footer className="bottombar">
      <span className="bottombar__zoom">
        <SmallBookIcon />
        <input
          type="range"
          min={METRICS.minZoom}
          max={METRICS.maxZoom}
          step={0.01}
          value={zoom}
          onChange={(event) => onZoom(Number(event.target.value))}
          aria-label="Book size"
        />
        <BigBookIcon />
      </span>

      {showPages && pageCount > 1 && (
        <nav className="pagedots" aria-label="Shelf pages">
          {Array.from({ length: pageCount }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-current={i === page}
              aria-label={`Page ${i + 1}`}
              onClick={() => onPage(i)}
            />
          ))}
        </nav>
      )}
    </footer>
  );
});

export const EditBar = memo(function EditBar({ count, lists, onDelete, onAddToList, onClear }) {
  return (
    <footer className="bottombar">
      <span style={{ font: '600 13px/1.2 var(--ui)' }}>{count} selected</span>
      <span className="chrome__spacer" />
      {lists.length > 0 && (
        <select
          value=""
          onChange={(event) => {
            if (event.target.value) onAddToList(event.target.value);
            event.target.value = '';
          }}
          aria-label="Add selection to a collection"
          disabled={count === 0}
          style={{
            padding: '5px 8px',
            borderRadius: 5,
            border: '1px solid rgba(0,0,0,0.45)',
            background: 'rgba(0,0,0,0.22)',
            color: '#fff',
            font: '600 12px/1.2 var(--ui)'
          }}
        >
          <option value="">Add to collection…</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      )}
      <button type="button" className="cbtn" onClick={onClear} disabled={count === 0}>
        Clear
      </button>
      <button type="button" className="cbtn" onClick={onDelete} disabled={count === 0}>
        Remove
      </button>
    </footer>
  );
});

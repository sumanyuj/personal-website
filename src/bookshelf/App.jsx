import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChromeToolbar, EditBar, ShelfBottomBar } from './components/Chrome.jsx';
import AddBookSheet from './components/AddBookSheet.jsx';
import BookDetailSheet from './components/BookDetailSheet.jsx';
import CollectionsSheet from './components/CollectionsSheet.jsx';
import LibraryList from './components/LibraryList.jsx';
import Shelf, { BackPanel } from './components/Shelf.jsx';
import { BooksIcon, OfflineIcon } from './components/icons.jsx';
import useElementSize from './hooks/useElementSize.js';
import useStoredState from './hooks/useStoredState.js';
import useLibrary, { useVisibleBooks } from './model/useLibrary.js';
import useSession from './hooks/useSession.js';
import LoginScreen from './components/LoginScreen.jsx';
import { coverURL } from './api.js';
import { clearPrivateCaches } from './serviceWorker.js';
import { chunk, clampZoom, shelfLayout } from './model/layout.js';

const COMPACT_BREAKPOINT = 700;

export default function App() {
  const session = useSession();
  const library = useLibrary(session.user);
  const { books, lists, coverURLs } = library;

  const [zoom, setZoom] = useStoredState('bookshelf:zoom', 1);
  const [viewMode, setViewMode] = useStoredState('bookshelf:view', 'shelf');
  const [sortOrder, setSortOrder] = useStoredState('bookshelf:sort', 'custom');

  const [listId, setListId] = useState(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(false);
  const [selection, setSelection] = useState(() => new Set());
  const [sheet, setSheet] = useState(null); // 'add' | 'collections' | null
  const [detailId, setDetailId] = useState(null);
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState(null);

  const [caseRef, { width, height }, caseNode] = useElementSize();
  const compact = width > 0 && width < COMPACT_BREAKPOINT;

  const visible = useVisibleBooks(books, { listId, query, sortOrder });
  const layout = useMemo(
    () => shelfLayout({ width, height, compact, zoom }),
    [width, height, compact, zoom]
  );

  const pageCount = compact ? 1 : Math.max(1, chunk(visible, layout.perPage).length);
  const detailBook = books.find((b) => b.id === detailId) ?? null;
  const listName = listId ? (lists.find((l) => l.id === listId)?.name ?? 'Books') : 'Books';

  const flash = useCallback((message) => setToast(message), []);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  // A page that no longer exists after a filter change would otherwise leave the
  // case scrolled past its own content.
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  const openBook = useCallback(
    (book) => {
      if (editing) {
        setSelection((current) => {
          const next = new Set(current);
          if (next.has(book.id)) next.delete(book.id);
          else next.add(book.id);
          return next;
        });
      } else {
        setDetailId(book.id);
      }
    },
    [editing]
  );

  // Trackpad pinch and ctrl+wheel arrive as wheel events with ctrlKey set.
  useEffect(() => {
    if (!caseNode || viewMode !== 'shelf') return undefined;

    const onWheel = (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom((current) => clampZoom(current * (1 - event.deltaY * 0.01)));
    };
    caseNode.addEventListener('wheel', onWheel, { passive: false });
    return () => caseNode.removeEventListener('wheel', onWheel);
  }, [caseNode, viewMode, setZoom]);

  // Gated before the shelf mounts, so nothing that needs an account is ever
  // rendered without one.
  if (session.checking) return <div className="app app--booting" />;

  if (!session.user) {
    return (
      <LoginScreen
        signupOpen={session.signupOpen}
        onSignIn={session.signIn}
        onSignUp={session.signUp}
      />
    );
  }

  return (
    <div className="app">
      <ChromeToolbar
        title={listName}
        bookCount={visible.length}
        viewMode={viewMode}
        onViewMode={setViewMode}
        editing={editing}
        onToggleEditing={() => {
          if (library.readOnly) return;
          setEditing((e) => !e);
          setSelection(new Set());
        }}
        onAdd={() => setSheet('add')}
        onCollections={() => setSheet('collections')}
        readOnly={library.readOnly}
        search={query}
        onSearch={setQuery}
        username={session.user.username}
        onSignOut={async () => {
          // The next person to open this device must not find the cached
          // shelf of the last one.
          await session.signOut();
          await clearPrivateCaches();
        }}
      />

      {library.readOnly && (
        <div className="offline-bar" role="status">
          <OfflineIcon />
          Offline — showing your shelf as it was. Changes need a connection.
        </div>
      )}

      <div className="case" ref={caseRef}>
        <BackPanel />

        {library.loading ? null : library.importing ? (
          <div className="empty">
            <BooksIcon />
            <h2>Moving your shelf up</h2>
            <p>Books saved on this device are being copied to your account.</p>
          </div>
        ) : library.error ? (
          <div className="empty">
            <BooksIcon />
            <h2>Could not load your library</h2>
            <p>
              {library.error?.message ?? 'The server did not answer.'} Reloading usually clears it;
              if it does not, the service may be down.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <BooksIcon />
            <h2>
              {books.length === 0
                ? library.readOnly
                  ? 'Nothing saved offline'
                  : 'No books yet'
                : 'Nothing matches'}
            </h2>
            <p>
              {books.length === 0
                ? 'Search for a book and it will appear on the shelf, with its cover, publisher and page count.'
                : 'Try a different filter or collection.'}
            </p>
            {books.length === 0 && (
              <button type="button" className="cbtn" onClick={() => setSheet('add')}>
                Add a Book
              </button>
            )}
          </div>
        ) : viewMode === 'shelf' ? (
          <Shelf
            books={visible}
            layout={layout}
            compact={compact}
            coverURLs={coverURLs}
            selection={selection}
            editing={editing}
            onOpen={openBook}
            page={page}
            onPageChange={setPage}
          />
        ) : (
          <LibraryList
            books={visible}
            coverURLs={coverURLs}
            sortOrder={sortOrder}
            onSort={setSortOrder}
            onOpen={openBook}
          />
        )}

        {toast && <div className="toast">{toast}</div>}
      </div>

      {viewMode === 'shelf' && (
        <ShelfBottomBar
          zoom={zoom}
          onZoom={setZoom}
          pageCount={pageCount}
          page={page}
          onPage={setPage}
          showPages={!compact}
        />
      )}

      {editing && (
        <EditBar
          count={selection.size}
          lists={lists}
          onClear={() => setSelection(new Set())}
          onAddToList={(id) => {
            library.setMembership([...selection], id, true);
            flash(`Added to ${lists.find((l) => l.id === id)?.name ?? 'collection'}`);
          }}
          onDelete={() => {
            library.removeBooks([...selection]);
            flash(
              selection.size === 1 ? 'Removed from library' : `Removed ${selection.size} books`
            );
            setSelection(new Set());
          }}
        />
      )}

      {sheet === 'add' && (
        <AddBookSheet
          onAdd={async (result) => {
            await library.addBook(result);
            flash('Added to library');
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === 'collections' && (
        <CollectionsSheet
          lists={lists}
          books={books}
          selectedListId={listId}
          onSelect={(id) => {
            setListId(id);
            setPage(0);
          }}
          onCreate={library.createList}
          onRename={library.renameList}
          onDelete={(id) => {
            library.removeList(id);
            if (listId === id) setListId(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {detailBook && (
        <BookDetailSheet
          book={detailBook}
          coverURL={coverURLs.get(detailBook.id)}
          masterURL={coverURL(detailBook)}
          lists={lists}
          readOnly={library.readOnly}
          onChange={library.updateBook}
          onToggleList={(bookId, id, member) => library.setMembership([bookId], id, member)}
          onDelete={(id) => {
            library.removeBooks([id]);
            setDetailId(null);
            flash('Removed from library');
          }}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

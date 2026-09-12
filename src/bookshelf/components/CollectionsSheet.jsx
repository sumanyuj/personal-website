import { useState } from 'react';
import Sheet from './Sheet.jsx';

/** Any book can sit in several collections at once; this manages the list itself. */
export default function CollectionsSheet({
  lists,
  books,
  selectedListId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onClose
}) {
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);

  const countIn = (id) => books.filter((b) => b.listIds?.includes(id)).length;

  return (
    <Sheet title="Collections" onClose={onClose} linen>
      <ul className="results">
        <li>
          <button
            type="button"
            className="result"
            aria-current={!selectedListId}
            onClick={() => {
              onSelect(null);
              onClose();
            }}
          >
            <span className="result__text">
              <span className="result__title">All Books</span>
              <span className="result__meta">{books.length} books</span>
            </span>
          </button>
        </li>

        {lists.map((list) => (
          <li key={list.id}>
            {editingId === list.id ? (
              <form
                style={{ display: 'flex', gap: 8, padding: 8 }}
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = new FormData(event.currentTarget).get('name').trim();
                  if (value) onRename(list.id, value);
                  setEditingId(null);
                }}
              >
                <input
                  name="name"
                  defaultValue={list.name}
                  style={{ flex: 1 }}
                  aria-label="Collection name"
                />
                <button type="submit" className="chip">
                  Save
                </button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  type="button"
                  className="result"
                  aria-current={selectedListId === list.id}
                  onClick={() => {
                    onSelect(list.id);
                    onClose();
                  }}
                >
                  <span className="result__text">
                    <span className="result__title">{list.name}</span>
                    <span className="result__meta">{countIn(list.id)} books</span>
                  </span>
                </button>
                <button type="button" className="chip" onClick={() => setEditingId(list.id)}>
                  Rename
                </button>
                <button
                  type="button"
                  className="chip danger"
                  style={{ marginLeft: 6, marginRight: 6 }}
                  onClick={() => onDelete(list.id)}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <form
        style={{ display: 'flex', gap: 8, marginTop: 16 }}
        onSubmit={(event) => {
          event.preventDefault();
          const value = name.trim();
          if (!value) return;
          onCreate(value);
          setName('');
        }}
      >
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New collection"
          aria-label="New collection name"
          style={{ flex: 1, padding: '7px 9px', border: '1px solid var(--rule)', borderRadius: 5 }}
        />
        <button type="submit" className="chip">
          Create
        </button>
      </form>
    </Sheet>
  );
}

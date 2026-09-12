import { useEffect, useRef } from 'react';

/**
 * A modal sheet. Traps focus, restores it on close, and closes on Escape —
 * everything the native sheet got from the platform and the web does not.
 */
export default function Sheet({ title, onClose, children, footer, linen }) {
  const ref = useRef(null);
  const restoreTo = useRef(null);

  useEffect(() => {
    restoreTo.current = document.activeElement;
    const sheet = ref.current;
    // Prefer a field over a button: the close button comes first in DOM order,
    // and focusing it sends the reader's first keystrokes nowhere.
    const target =
      sheet?.querySelector('input, textarea, select') ?? sheet?.querySelector('button');
    target?.focus();

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !sheet) return;

      const focusable = [
        ...sheet.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      restoreTo.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`sheet${linen ? ' sheet--linen' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="sheet__bar">
          <button type="button" className="cbtn" onClick={onClose}>
            Close
          </button>
          <h2>{title}</h2>
          {footer ?? <span style={{ width: 62 }} />}
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}

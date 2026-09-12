import { memo } from 'react';

const TITLE_LINES = ['Hello,', 'Sumanyu.'];

// Built once at module scope: the result never varies, so there is nothing for
// a memo hook to recompute or for React to re-run per mount.
function buildTitleItems(lines) {
  const items = [];
  let letterIndex = 0;

  lines.forEach((line, lineIndex) => {
    for (const char of line) {
      if (char === ' ') {
        items.push({ type: 'space', key: `space-${lineIndex}-${letterIndex}` });
      } else {
        items.push({
          type: 'letter',
          char,
          letterIndex,
          key: `letter-${letterIndex}`
        });
        letterIndex += 1;
      }
    }
    if (lineIndex < lines.length - 1) {
      items.push({ type: 'break', key: `break-${lineIndex}` });
    }
  });

  return items;
}

export const TITLE_ITEMS = buildTitleItems(TITLE_LINES);
export const TITLE_TEXT = TITLE_LINES.join(' ');
export const LETTER_ITEMS = TITLE_ITEMS.filter((item) => item.type === 'letter');

/**
 * The heading is rendered twice.
 *
 * `ghostRef` elements stay in normal flow and define where each letter belongs;
 * once the physics layer takes over they are made transparent but keep their
 * boxes, so they remain the source of truth for re-anchoring on resize.
 *
 * `letterRef` elements are fixed-position clones the simulation moves. They are
 * the only things that animate, which keeps the real heading out of the
 * per-frame work entirely.
 */
function Title({ ghostRef, letterRef }) {
  return (
    <>
      <h1 className="epic epic--ghost" aria-label={TITLE_TEXT}>
        {TITLE_ITEMS.map((item) => {
          if (item.type === 'break') return <br key={item.key} />;
          if (item.type === 'space') return <span key={item.key}>&nbsp;</span>;
          return (
            <span
              key={item.key}
              className="title-ghost-letter"
              ref={(el) => {
                ghostRef.current[item.letterIndex] = el;
              }}
            >
              {item.char}
            </span>
          );
        })}
      </h1>

      <div className="title-physics epic" aria-hidden="true">
        {LETTER_ITEMS.map((item) => (
          <span
            key={item.key}
            className="title-letter"
            ref={(el) => {
              letterRef.current[item.letterIndex] = el;
            }}
          >
            {item.char}
          </span>
        ))}
      </div>
    </>
  );
}

export default memo(Title);

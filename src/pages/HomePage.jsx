import { useCallback, useRef, useState } from 'react';
import Books, { BOOKS } from '../components/Books.jsx';
import Bookshelf from '../components/Bookshelf.jsx';
import SocialLinks from '../components/SocialLinks.jsx';
import Title from '../components/Title.jsx';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import usePodsPhysics from '../physics/usePodsPhysics.js';

const BOOKSHELF_URL = '/bookshelf/';

export default function HomePage() {
  const pointerRef = useRef(null);
  const bookRef = useRef([]);
  const ghostLetterRef = useRef([]);
  const physicsLetterRef = useRef([]);
  const slotRef = useRef([]);

  const reduceMotion = usePrefersReducedMotion();
  const [lettersReady, setLettersReady] = useState(false);
  const [lettersCleared, setLettersCleared] = useState(false);
  const [armedSlot, setArmedSlot] = useState(null);
  /** Slot index per book, or null while the book is still loose. */
  const [shelved, setShelved] = useState(() => BOOKS.map(() => null));

  const onLettersReady = useCallback(() => setLettersReady(true), []);
  const onLettersCleared = useCallback(() => setLettersCleared(true), []);

  const enter = useCallback(() => {
    window.location.href = BOOKSHELF_URL;
  }, []);

  // Measured from the DOM on demand: the shelf is positioned in viewport units,
  // so cached rectangles would be stale after a resize.
  const getSlots = useCallback(
    () =>
      slotRef.current.map((element, slot) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          taken: shelved.includes(slot)
        };
      }),
    [shelved]
  );

  const onShelve = useCallback(
    (bookIndex, slot) => {
      setShelved((current) => {
        if (current[bookIndex] !== null) return current;
        const next = [...current];
        next[bookIndex] = slot;
        // Shelving the last book is itself the way in — no extra click needed.
        if (next.every((s) => s !== null)) {
          window.setTimeout(enter, 620);
        }
        return next;
      });
    },
    [enter]
  );

  usePodsPhysics({
    pointerRef,
    podRef: bookRef,
    ghostLetterRef,
    physicsLetterRef,
    reduceMotion,
    onLettersReady,
    onLettersCleared,
    getSlots,
    onArmSlot: setArmedSlot,
    onShelve
  });

  return (
    <>
      {/* Carries the drag interaction that the Matter.Render canvas used to.
          It paints nothing, so it costs one element instead of a full-screen
          repaint every frame. */}
      <div ref={pointerRef} className="pointer-layer" aria-hidden="true" />

      {/* The one class that flips drives both the handoff from the real heading
          to the physics letters and the visibility of the physics layer, so the
          children below stay memoised and never re-render. */}
      <main className={`hero${lettersReady ? ' hero--letters-ready' : ''}`}>
        <Title ghostRef={ghostLetterRef} letterRef={physicsLetterRef} />
        <SocialLinks />
      </main>

      <Books bookRef={bookRef} />

      <Bookshelf
        visible={lettersCleared}
        shelved={shelved}
        armedSlot={armedSlot}
        onEnter={enter}
        slotRef={slotRef}
      />
    </>
  );
}

import { useCallback, useRef, useState } from 'react';
import Pods from '../components/Pods.jsx';
import SocialLinks from '../components/SocialLinks.jsx';
import Title from '../components/Title.jsx';
import usePrefersReducedMotion from '../hooks/usePrefersReducedMotion.js';
import usePodsPhysics from '../physics/usePodsPhysics.js';

export default function HomePage() {
  const pointerRef = useRef(null);
  const podRef = useRef([]);
  const ghostLetterRef = useRef([]);
  const physicsLetterRef = useRef([]);

  const reduceMotion = usePrefersReducedMotion();
  const [lettersReady, setLettersReady] = useState(false);
  const onLettersReady = useCallback(() => setLettersReady(true), []);

  usePodsPhysics({
    pointerRef,
    podRef,
    ghostLetterRef,
    physicsLetterRef,
    reduceMotion,
    onLettersReady
  });

  return (
    <>
      {/* Carries the drag interaction that the Matter.Render canvas used to.
          It paints nothing, so it costs one element instead of a full-screen
          repaint every frame. */}
      <div ref={pointerRef} className="pointer-layer" aria-hidden="true" />

      {/* The one class that flips drives both the handoff from the real
          heading to the physics letters and the visibility of the physics
          layer, so the children below stay memoised and never re-render. */}
      <main className={`hero${lettersReady ? ' hero--letters-ready' : ''}`}>
        <Title ghostRef={ghostLetterRef} letterRef={physicsLetterRef} />
        <SocialLinks />
      </main>

      <Pods podRef={podRef} />
    </>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import usePodsPhysics from '../physics/usePodsPhysics.js';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function HomePage() {
  usePodsPhysics();

  const reduceMotion = useMemo(() => prefersReducedMotion(), []);
  const [showButton, setShowButton] = useState(reduceMotion);

  useEffect(() => {
    if (reduceMotion) return;
    const timeoutId = window.setTimeout(() => setShowButton(true), 250);
    return () => window.clearTimeout(timeoutId);
  }, [reduceMotion]);

  return (
    <>
      <main className="hero">
        <h1 className="epic">
          Hello, <br />
          Sumanyu.
        </h1>

        <nav className="social" aria-label="Social links">
          <a
            href="https://linkedin.com/in/sumanyuj"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="LinkedIn"
          >
            <i className="fab fa-linkedin" aria-hidden="true"></i>
          </a>
          <a
            href="https://github.com/sumanyuj"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
          >
            <i className="fab fa-github" aria-hidden="true"></i>
          </a>
        </nav>

        <div className="actions">
          <a
            className={`elegant-button ${showButton ? 'visible' : ''}`}
            href="https://sumanyuj.com/one-thing"
          >
            <em>One Thing</em>
          </a>
        </div>
      </main>

      <div id="pod1" className="pod" aria-hidden="true">
        Spring Boot
      </div>
      <div id="pod2" className="pod" aria-hidden="true">
        Python
      </div>
      <div id="pod3" className="pod" aria-hidden="true">
        React
      </div>
      <div id="pod4" className="pod" aria-hidden="true">
        Java
      </div>
    </>
  );
}

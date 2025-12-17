import React, { useEffect, useMemo, useState } from 'react';
import usePodsPhysics from '../physics/usePodsPhysics.js';

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const titleLines = ['Hello,', 'Sumanyu.'];

function buildTitleItems(lines) {
  let letterIndex = 0;
  const items = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    for (const ch of line) {
      if (ch === ' ') {
        items.push({ type: 'space', key: `space-${lineIndex}-${letterIndex}` });
        continue;
      }
      items.push({ type: 'letter', ch, letterIndex, key: `l-${letterIndex}` });
      letterIndex += 1;
    }
    if (lineIndex < lines.length - 1) items.push({ type: 'br', key: `br-${lineIndex}` });
  }
  return items;
}

export default function HomePage() {
  usePodsPhysics();

  const reduceMotion = useMemo(() => prefersReducedMotion(), []);
  const [showButton, setShowButton] = useState(reduceMotion);
  const titleItems = useMemo(() => buildTitleItems(titleLines), []);

  useEffect(() => {
    if (reduceMotion) return;
    const timeoutId = window.setTimeout(() => setShowButton(true), 250);
    return () => window.clearTimeout(timeoutId);
  }, [reduceMotion]);

  return (
    <>
      <main className="hero">
        <h1 className="epic epic--ghost" aria-label="Hello, Sumanyu.">
          {titleItems.map((item) => {
            if (item.type === 'br') return <br key={item.key} />;
            if (item.type === 'space') return <span key={item.key}>&nbsp;</span>;
            return (
              <span
                key={item.key}
                className="title-ghost-letter"
                data-title-ghost-letter={item.letterIndex}
              >
                {item.ch}
              </span>
            );
          })}
        </h1>

        <div id="titlePhysicsLayer" className="title-physics epic" aria-hidden="true">
          {titleItems.map((item) => {
            if (item.type !== 'letter') return null;
            return (
              <span
                key={item.key}
                className="title-letter"
                data-title-phys-letter={item.letterIndex}
              >
                {item.ch}
              </span>
            );
          })}
        </div>

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

import { useEffect, useRef } from 'react';

const CATEGORY = { POD: 0x0001, LETTER: 0x0002, WALL: 0x0004 };
const COLLIDES_WITH_EVERYTHING = CATEGORY.POD | CATEGORY.LETTER | CATEGORY.WALL;

const BOUNDARY_THICKNESS = 140;
const MAX_LINEAR_SPEED = 70;
const MAX_ANGULAR_SPEED = 0.45;
const OUT_OF_BOUNDS_PADDING = 300;
const POD_DROP_DELAYS_MS = [200, 600, 1000, 1400];
const RESIZE_DEBOUNCE_MS = 150;

// Movement below this cannot change a rendered pixel, so the style write is
// skipped. Once the scene settles the render loop writes nothing at all.
const MIN_VISIBLE_MOVE_PX = 0.01;
const MIN_VISIBLE_ROTATION_RAD = 0.0005;

function createBoundaries(Bodies, width, height) {
  const options = { isStatic: true, render: { visible: false } };
  const ground = Bodies.rectangle(
    width / 2,
    height + BOUNDARY_THICKNESS / 2,
    width + BOUNDARY_THICKNESS * 2,
    BOUNDARY_THICKNESS,
    options
  );
  const ceiling = Bodies.rectangle(
    width / 2,
    -BOUNDARY_THICKNESS / 2,
    width + BOUNDARY_THICKNESS * 2,
    BOUNDARY_THICKNESS,
    options
  );
  const leftWall = Bodies.rectangle(
    -BOUNDARY_THICKNESS / 2,
    height / 2,
    BOUNDARY_THICKNESS,
    height + BOUNDARY_THICKNESS * 2,
    options
  );
  const rightWall = Bodies.rectangle(
    width + BOUNDARY_THICKNESS / 2,
    height / 2,
    BOUNDARY_THICKNESS,
    height + BOUNDARY_THICKNESS * 2,
    options
  );

  const walls = [ground, ceiling, leftWall, rightWall];
  for (const wall of walls) {
    wall.collisionFilter.category = CATEGORY.WALL;
    wall.collisionFilter.mask = CATEGORY.POD | CATEGORY.LETTER;
  }
  ground.plugin = { type: 'ground' };
  return { walls, ground, ceiling, leftWall, rightWall };
}

/**
 * Writes body positions to elements as a single compositor-only transform.
 *
 * The previous implementation set `left`/`top` alongside `transform`, which
 * invalidates layout for every element on every frame. Folding the position
 * into the transform keeps the whole loop off the layout and paint paths.
 */
function createTransformWriter(elements) {
  const written = elements.map(() => ({ x: NaN, y: NaN, angle: NaN }));

  return function write(index, body) {
    const element = elements[index];
    if (!element) return;

    const previous = written[index];
    const { x, y } = body.position;
    const { angle } = body;

    if (
      Math.abs(x - previous.x) < MIN_VISIBLE_MOVE_PX &&
      Math.abs(y - previous.y) < MIN_VISIBLE_MOVE_PX &&
      Math.abs(angle - previous.angle) < MIN_VISIBLE_ROTATION_RAD
    ) {
      return;
    }

    previous.x = x;
    previous.y = y;
    previous.angle = angle;
    element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) rotate(${angle}rad)`;
  };
}

/**
 * Runs the simulation against plain DOM elements and returns a teardown.
 *
 * Deliberately free of React: everything it needs arrives as arguments, so the
 * hook below is only responsible for lifecycle.
 */
function startSimulation(
  Matter,
  {
    pointerElement,
    podElements,
    ghostElements,
    letterElements,
    reduceMotion,
    onLettersReady,
    onLettersCleared,
    getSlots,
    onArmSlot,
    onShelve
  }
) {
  const { Bodies, Body, Composite, Constraint, Engine, Events, Mouse, MouseConstraint, Runner } =
    Matter;

  let viewportWidth = window.innerWidth;
  let viewportHeight = window.innerHeight;

  const engine = Engine.create();
  engine.positionIterations = 10;
  engine.velocityIterations = 8;
  engine.constraintIterations = 4;
  engine.gravity.x = 0;
  engine.gravity.y = 1;
  engine.gravity.scale = 0.001;

  const world = engine.world;
  const boundaries = createBoundaries(Bodies, viewportWidth, viewportHeight);
  Composite.add(world, boundaries.walls);

  // --- Pods ---------------------------------------------------------------
  const podBodies = podElements.map((element, index) => {
    const body = Bodies.rectangle(
      (viewportWidth * (index + 1)) / (podElements.length + 1),
      -100 - index * 80,
      element.offsetWidth || 120,
      element.offsetHeight || 50,
      {
        restitution: 0.93,
        friction: 0.02,
        frictionStatic: 0,
        frictionAir: 0.01,
        render: { visible: false }
      }
    );
    body.plugin = { type: 'pod', index, landed: false };
    body.collisionFilter.category = CATEGORY.POD;
    body.collisionFilter.mask = COLLIDES_WITH_EVERYTHING;
    return body;
  });

  const podsInWorld = new Set();
  const writePod = createTransformWriter(podElements);
  const writeLetter = createTransformWriter(letterElements);

  const dropDelays = reduceMotion ? podBodies.map(() => 0) : POD_DROP_DELAYS_MS;
  const timeouts = podBodies.map((body, index) =>
    window.setTimeout(() => {
      const spawnX = (viewportWidth * (index + 1)) / (podBodies.length + 1);
      const minY = 60;
      const maxY = Math.max(minY, viewportHeight * 0.45);
      const stepY = (maxY - minY) / Math.max(1, podBodies.length - 1);

      Body.setPosition(body, { x: spawnX, y: minY + index * stepY });
      Composite.add(world, body);
      podsInWorld.add(body);
      podElements[index].style.visibility = 'visible';

      Body.setVelocity(body, {
        x: (Math.random() - 0.5) * 1.2,
        y: 1.2 + Math.random() * 0.6
      });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.035);
    }, dropDelays[index] ?? 0)
  );

  // --- Letters ------------------------------------------------------------
  const letterBodies = [];
  const letterAnchors = [];
  let lettersArmed = false;
  let cancelled = false;

  const fontsReady = document.fonts?.ready ?? Promise.resolve();
  fontsReady.then(() => {
    if (cancelled) return;
    if (!ghostElements.length || ghostElements.length !== letterElements.length) return;

    // Measure every ghost before touching the world: interleaving reads and
    // writes here would thrash layout once per letter.
    const boxes = ghostElements.map((element) => element.getBoundingClientRect());

    boxes.forEach((box, index) => {
      const body = Bodies.rectangle(
        box.left + box.width / 2,
        box.top + box.height / 2,
        Math.max(6, box.width),
        Math.max(10, box.height),
        {
          isSensor: true,
          restitution: 0.9,
          friction: 0.02,
          frictionAir: 0.02,
          density: 0.001,
          render: { visible: false }
        }
      );
      body.plugin = { type: 'letter', index, dislodged: false };
      body.collisionFilter.category = CATEGORY.LETTER;
      body.collisionFilter.mask = COLLIDES_WITH_EVERYTHING;
      letterBodies.push(body);
    });

    Composite.add(world, letterBodies);

    for (const body of letterBodies) {
      const anchor = Constraint.create({
        pointA: { x: body.position.x, y: body.position.y },
        bodyB: body,
        pointB: { x: 0, y: 0 },
        length: 0,
        stiffness: 1,
        damping: 0.9
      });
      anchor.render.visible = false;
      letterAnchors[body.plugin.index] = anchor;
      Composite.add(world, anchor);
    }

    onLettersReady();
  });

  // --- Interaction --------------------------------------------------------
  // Matter's Mouse works against any element. Previously this was a
  // full-screen canvas owned by Matter.Render, which cleared and repainted at
  // devicePixelRatio every frame while drawing nothing, because every body is
  // invisible. A plain div carries the pointer events at no per-frame cost.
  const mouse = Mouse.create(pointerElement);
  const mouseConstraint = MouseConstraint.create(engine, {
    mouse,
    collisionFilter: { mask: CATEGORY.POD },
    constraint: { stiffness: 0.35, damping: 0.12, render: { visible: false } }
  });
  Composite.add(world, mouseConstraint);

  let dislodgedCount = 0;
  let cleared = false;

  const dislodgeLetter = (letterBody, impactingBody) => {
    if (!lettersArmed || letterBody.plugin.dislodged) return;
    letterBody.plugin.dislodged = true;
    dislodgedCount += 1;
    // The whole heading being knocked apart is what reveals the bookshelf.
    if (!cleared && letterBodies.length > 0 && dislodgedCount === letterBodies.length) {
      cleared = true;
      onLettersCleared?.();
    }

    const anchor = letterAnchors[letterBody.plugin.index];
    if (anchor) {
      Composite.remove(world, anchor);
      letterAnchors[letterBody.plugin.index] = null;
    }

    const dx = letterBody.position.x - impactingBody.position.x;
    const dy = letterBody.position.y - impactingBody.position.y;
    const magnitude = Math.hypot(dx, dy) || 1;
    const nx = dx / magnitude;
    const ny = dy / magnitude;

    Body.setPosition(letterBody, {
      x: letterBody.position.x + nx * 10,
      y: letterBody.position.y + ny * 10
    });

    letterBody.isSensor = false;
    for (const part of letterBody.parts) part.isSensor = false;
    letterBody.collisionFilter.mask = COLLIDES_WITH_EVERYTHING;
    letterBody.restitution = 1.12;
    letterBody.frictionAir = 0.003;
    letterBody.friction = 0.01;

    const relativeSpeed = Math.hypot(
      impactingBody.velocity.x - letterBody.velocity.x,
      impactingBody.velocity.y - letterBody.velocity.y
    );
    const launch = Math.max(14, relativeSpeed * 7);

    Body.setVelocity(letterBody, {
      x: impactingBody.velocity.x * 1.5 + nx * launch,
      y: impactingBody.velocity.y * 1.5 + ny * launch
    });
    Body.setAngularVelocity(letterBody, (Math.random() - 0.5) * 0.5);
  };

  const onCollisionStart = (event) => {
    for (const { bodyA, bodyB } of event.pairs) {
      const typeA = bodyA.plugin?.type;
      const typeB = bodyB.plugin?.type;

      if (typeA === 'ground' && typeB === 'pod') bodyB.plugin.landed = true;
      else if (typeB === 'ground' && typeA === 'pod') bodyA.plugin.landed = true;

      if (!lettersArmed && podBodies.every((pod) => pod.plugin.landed)) {
        lettersArmed = true;
      }

      if (typeA === 'letter' && typeB === 'pod') dislodgeLetter(bodyA, bodyB);
      else if (typeB === 'letter' && typeA === 'pod') dislodgeLetter(bodyB, bodyA);
    }
  };

  const constrainBody = (body) => {
    const { x: vx, y: vy } = body.velocity;
    const speed = Math.hypot(vx, vy);
    if (speed > MAX_LINEAR_SPEED) {
      const scale = MAX_LINEAR_SPEED / speed;
      Body.setVelocity(body, { x: vx * scale, y: vy * scale });
    }
    if (Math.abs(body.angularVelocity) > MAX_ANGULAR_SPEED) {
      Body.setAngularVelocity(body, Math.sign(body.angularVelocity) * MAX_ANGULAR_SPEED);
    }

    const { x, y } = body.position;
    if (
      x < -OUT_OF_BOUNDS_PADDING ||
      x > viewportWidth + OUT_OF_BOUNDS_PADDING ||
      y < -OUT_OF_BOUNDS_PADDING ||
      y > viewportHeight + OUT_OF_BOUNDS_PADDING
    ) {
      Body.setPosition(body, { x: viewportWidth / 2, y: viewportHeight / 3 });
      Body.setVelocity(body, { x: 0, y: 0 });
      Body.setAngularVelocity(body, 0);
    }
  };

  // Iterates in place. The previous version built a fresh array of dynamic
  // bodies on every physics tick, and read window.innerWidth/innerHeight with
  // it; the viewport is now cached and only recomputed on resize.
  const onBeforeUpdate = () => {
    for (const body of podBodies) {
      if (podsInWorld.has(body)) constrainBody(body);
    }
    for (const body of letterBodies) {
      if (body.plugin.dislodged) constrainBody(body);
    }
  };

  // --- Shelving ------------------------------------------------------------
  // The second way into the app: drag the books into the shelf. Slot rectangles
  // come from the DOM each time rather than being cached, because the shelf is
  // positioned with viewport units and moves when the window resizes.
  const shelved = new Set();

  const slotUnder = (body) => {
    const slots = getSlots?.() ?? [];
    let best = null;
    for (let slot = 0; slot < slots.length; slot++) {
      const rect = slots[slot];
      if (!rect || rect.taken) continue;
      const dx = body.position.x - (rect.left + rect.width / 2);
      const dy = body.position.y - (rect.top + rect.height / 2);
      const distance = Math.hypot(dx, dy);
      // Generous, and scaled to the slot, so a roughly-aimed drop still lands.
      const reach = Math.max(rect.width, rect.height) * 1.15;
      if (distance < reach && (!best || distance < best.distance)) best = { slot, distance };
    }
    return best;
  };

  let armedSlot = null;
  const armSlot = (slot) => {
    if (slot === armedSlot) return;
    armedSlot = slot;
    onArmSlot?.(slot);
  };

  const onDragMove = () => {
    const body = mouseConstraint.body;
    if (!body || body.plugin?.type !== 'pod') return armSlot(null);
    armSlot(slotUnder(body)?.slot ?? null);
  };

  const onDragEnd = (event) => {
    const body = event.body;
    armSlot(null);
    if (!body || body.plugin?.type !== 'pod' || shelved.has(body.plugin.index)) return;

    const target = slotUnder(body);
    if (!target) return;

    // The book leaves the simulation entirely and is re-rendered inside the
    // slot, so it cannot be knocked back out by a later collision.
    shelved.add(body.plugin.index);
    Composite.remove(world, body);
    podsInWorld.delete(body);
    const element = podElements[body.plugin.index];
    if (element) element.style.visibility = 'hidden';
    onShelve?.(body.plugin.index, target.slot);
  };

  Events.on(mouseConstraint, 'mousemove', onDragMove);
  Events.on(mouseConstraint, 'enddrag', onDragEnd);

  Events.on(engine, 'collisionStart', onCollisionStart);
  Events.on(engine, 'beforeUpdate', onBeforeUpdate);

  const runner = Runner.create();
  Runner.run(runner, engine);

  // --- Render loop --------------------------------------------------------
  let frameId = 0;
  const renderFrame = () => {
    for (let i = 0; i < podBodies.length; i++) writePod(i, podBodies[i]);
    for (let i = 0; i < letterBodies.length; i++) writeLetter(i, letterBodies[i]);
    frameId = window.requestAnimationFrame(renderFrame);
  };
  frameId = window.requestAnimationFrame(renderFrame);

  // --- Resize -------------------------------------------------------------
  let resizeTimer = 0;
  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      // A hidden or not-yet-laid-out tab reports zero. Rebuilding the walls at
      // that size collapses the world, so wait for a real measurement instead.
      if (!window.innerWidth || !window.innerHeight) return;

      viewportWidth = window.innerWidth;
      viewportHeight = window.innerHeight;

      const next = createBoundaries(Bodies, viewportWidth, viewportHeight);
      for (const key of ['ground', 'ceiling', 'leftWall', 'rightWall']) {
        Body.setPosition(boundaries[key], next[key].position);
        Body.setVertices(boundaries[key], next[key].vertices);
      }

      if (letterBodies.length !== ghostElements.length) return;

      // Same read-then-write split as the initial measure.
      const boxes = ghostElements.map((element) => element.getBoundingClientRect());
      boxes.forEach((box, index) => {
        const body = letterBodies[index];
        if (body.plugin.dislodged) return;

        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const shape = Bodies.rectangle(x, y, Math.max(6, box.width), Math.max(10, box.height), {
          isStatic: true,
          render: { visible: false }
        });

        Body.setPosition(body, { x, y });
        Body.setAngle(body, 0);
        Body.setVelocity(body, { x: 0, y: 0 });
        Body.setAngularVelocity(body, 0);
        Body.setVertices(body, shape.vertices);

        const anchor = letterAnchors[index];
        if (anchor) anchor.pointA = { x, y };
      });
    }, RESIZE_DEBOUNCE_MS);
  };

  // A ResizeObserver rather than a window resize listener: it also fires when
  // the page finally gets a size after mounting in a hidden tab, which a resize
  // event does not cover.
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(document.documentElement);

  return () => {
    cancelled = true;
    resizeObserver.disconnect();
    window.clearTimeout(resizeTimer);
    for (const timeout of timeouts) window.clearTimeout(timeout);
    window.cancelAnimationFrame(frameId);

    Events.off(engine, 'collisionStart', onCollisionStart);
    Events.off(engine, 'beforeUpdate', onBeforeUpdate);
    Events.off(mouseConstraint, 'mousemove', onDragMove);
    Events.off(mouseConstraint, 'enddrag', onDragEnd);
    Mouse.clearSourceEvents(mouse);
    Runner.stop(runner);
    Composite.clear(world, false);
    Engine.clear(engine);
  };
}

/**
 * Drops the pods into the page and lets them knock the heading apart.
 *
 * DOM access is entirely through the refs passed in; the hook never queries the
 * document. Element positions are written directly rather than through state:
 * routing sixty frames a second through React would re-render the tree for
 * changes that only ever touch one CSS property.
 *
 * matter-js is loaded on demand. It is roughly two fifths of the bundle and
 * nothing on screen needs it to paint, so keeping it off the critical path lets
 * the heading render while the engine is still arriving.
 */
export default function usePodsPhysics({
  pointerRef,
  podRef,
  ghostLetterRef,
  physicsLetterRef,
  reduceMotion,
  onLettersReady,
  onLettersCleared,
  getSlots,
  onArmSlot,
  onShelve
}) {
  // The callbacks are read through a ref so their identity never reaches the
  // effect's dependencies. getSlots in particular has to close over which slots
  // are already filled, so it changes on every shelved book — and listing it as
  // a dependency tore down and rebuilt the whole simulation mid-drag, dropping
  // the books from the top again and re-anchoring the letters.
  const handlers = useRef(null);
  handlers.current = { onLettersReady, onLettersCleared, getSlots, onArmSlot, onShelve };

  const stable = useRef(null);
  if (!stable.current) {
    stable.current = {
      onLettersReady: () => handlers.current.onLettersReady?.(),
      onLettersCleared: () => handlers.current.onLettersCleared?.(),
      getSlots: () => handlers.current.getSlots?.() ?? [],
      onArmSlot: (slot) => handlers.current.onArmSlot?.(slot),
      onShelve: (book, slot) => handlers.current.onShelve?.(book, slot)
    };
  }

  useEffect(() => {
    const pointerElement = pointerRef.current;
    const podElements = podRef.current.filter(Boolean);
    const ghostElements = ghostLetterRef.current.filter(Boolean);
    const letterElements = physicsLetterRef.current.filter(Boolean);

    if (!pointerElement || podElements.length === 0) return undefined;

    let stop = null;
    let cancelled = false;

    import('matter-js').then(({ default: Matter }) => {
      // The effect can be torn down before the chunk lands — in development
      // StrictMode guarantees it — so the result is discarded rather than
      // leaving an orphaned engine running.
      if (cancelled) return;
      stop = startSimulation(Matter, {
        pointerElement,
        podElements,
        ghostElements,
        letterElements,
        reduceMotion,
        ...stable.current
      });
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [pointerRef, podRef, ghostLetterRef, physicsLetterRef, reduceMotion]);
}

import { useEffect } from 'react';
import Matter from 'matter-js';

export default function usePodsPhysics() {
  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const podIds = ['pod1', 'pod2', 'pod3', 'pod4'];
    const podEls = podIds.map((id) => document.getElementById(id));
    if (podEls.some((el) => !el)) return;

    const { Engine, Render, World, Bodies, Runner, Body, Mouse, MouseConstraint, Events, Constraint } =
      Matter;

    const engine = Engine.create();
    engine.positionIterations = 10;
    engine.velocityIterations = 8;
    engine.constraintIterations = 4;
    engine.gravity.x = 0;
    engine.gravity.y = 1;
    engine.gravity.scale = 0.001;
    const render = Render.create({
      element: document.body,
      engine,
      options: {
        width: window.innerWidth,
        height: window.innerHeight,
        wireframes: false,
        background: 'transparent',
        pixelRatio: window.devicePixelRatio || 1
      }
    });

    render.canvas.style.position = 'fixed';
    render.canvas.style.top = '0';
    render.canvas.style.left = '0';
    render.canvas.style.zIndex = '0';
    render.canvas.style.pointerEvents = 'auto';
    render.canvas.style.touchAction = 'none';
    render.canvas.style.webkitUserSelect = 'none';

    const POD_CATEGORY = 0x0001;
    const LETTER_CATEGORY = 0x0002;
    const WALL_CATEGORY = 0x0004;

    const podBodies = podEls.map((el, index) => {
      const width = el.offsetWidth || 120;
      const height = el.offsetHeight || 50;
      const startX = (window.innerWidth * (index + 1)) / (podEls.length + 1);
      const startY = -100 - index * 80;

      const body = Bodies.rectangle(startX, startY, width, height, {
        restitution: 0.93,
        friction: 0.02,
        frictionStatic: 0,
        frictionAir: 0.01,
        render: { visible: false }
      });
      body.plugin = { type: 'pod', index, landed: false };
      body.collisionFilter.category = POD_CATEGORY;
      body.collisionFilter.mask = POD_CATEGORY | LETTER_CATEGORY | WALL_CATEGORY;
      return body;
    });

    for (const el of podEls) {
      el.style.visibility = 'hidden';
    }

    const ghostLetterEls = Array.from(
      document.querySelectorAll('[data-title-ghost-letter]')
    ).sort(
      (a, b) =>
        Number(a.getAttribute('data-title-ghost-letter')) -
        Number(b.getAttribute('data-title-ghost-letter'))
    );
    const physLetterEls = Array.from(
      document.querySelectorAll('[data-title-phys-letter]')
    ).sort(
      (a, b) =>
        Number(a.getAttribute('data-title-phys-letter')) -
        Number(b.getAttribute('data-title-phys-letter'))
    );
    const titlePhysicsLayer = document.getElementById('titlePhysicsLayer');
    const letterBodies = [];
    const letterAnchors = [];

    const boundaryThickness = 140;
    const createBoundaries = (width, height) => {
      const ground = Bodies.rectangle(
        width / 2,
        height + boundaryThickness / 2,
        width + boundaryThickness * 2,
        boundaryThickness,
        { isStatic: true, render: { visible: false } }
      );
      const ceiling = Bodies.rectangle(
        width / 2,
        -boundaryThickness / 2,
        width + boundaryThickness * 2,
        boundaryThickness,
        { isStatic: true, render: { visible: false } }
      );
      const leftWall = Bodies.rectangle(
        -boundaryThickness / 2,
        height / 2,
        boundaryThickness,
        height + boundaryThickness * 2,
        { isStatic: true, render: { visible: false } }
      );
      const rightWall = Bodies.rectangle(
        width + boundaryThickness / 2,
        height / 2,
        boundaryThickness,
        height + boundaryThickness * 2,
        { isStatic: true, render: { visible: false } }
      );
      for (const wall of [ground, ceiling, leftWall, rightWall]) {
        wall.collisionFilter.category = WALL_CATEGORY;
        wall.collisionFilter.mask = POD_CATEGORY | LETTER_CATEGORY;
      }
      return { ground, ceiling, leftWall, rightWall };
    };

    const boundaries = createBoundaries(window.innerWidth, window.innerHeight);
    boundaries.ground.plugin = { type: 'ground' };
    World.add(engine.world, [
      boundaries.ground,
      boundaries.ceiling,
      boundaries.leftWall,
      boundaries.rightWall
    ]);

    const cancelledRef = { current: false };
    let lettersArmed = false;
    const fontsReady = document.fonts?.ready ?? Promise.resolve();
    fontsReady.then(() => {
      if (cancelledRef.current) return;
      if (!ghostLetterEls.length || ghostLetterEls.length !== physLetterEls.length) return;

      for (let i = 0; i < ghostLetterEls.length; i++) {
        const rect = ghostLetterEls[i].getBoundingClientRect();
        const width = Math.max(6, rect.width);
        const height = Math.max(10, rect.height);
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const body = Bodies.rectangle(x, y, width, height, {
          isSensor: true,
          restitution: 0.9,
          friction: 0.02,
          frictionAir: 0.02,
          density: 0.001,
          render: { visible: false }
        });
        body.plugin = { type: 'letter', index: i, dislodged: false };
        body.collisionFilter.category = LETTER_CATEGORY;
        body.collisionFilter.mask = POD_CATEGORY | LETTER_CATEGORY | WALL_CATEGORY;
        letterBodies.push(body);
      }

      World.add(engine.world, letterBodies);
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
        World.add(engine.world, anchor);
      }
      if (titlePhysicsLayer) titlePhysicsLayer.style.visibility = 'visible';
      document.documentElement.classList.add('title-ready');
    });

    const inWorld = new Set();

    const podDelaysMs = reduceMotion ? [0, 0, 0, 0] : [200, 600, 1000, 1400];
    const timeouts = [];
    podBodies.forEach((body, i) => {
      timeouts.push(
        window.setTimeout(() => {
          const width = window.innerWidth;
          const height = window.innerHeight;
          const spawnX = (width * (i + 1)) / (podBodies.length + 1);
          const minY = 60;
          const maxY = Math.max(minY, height * 0.45);
          const stepY = (maxY - minY) / Math.max(1, podBodies.length - 1);
          const spawnY = minY + i * stepY;
          Body.setPosition(body, { x: spawnX, y: spawnY });

          World.add(engine.world, body);
          inWorld.add(body);
          if (podEls[i]) podEls[i].style.visibility = 'visible';
          Body.setVelocity(body, {
            x: (Math.random() - 0.5) * 1.2,
            y: 1.2 + Math.random() * 0.6
          });
          Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.035);
        }, podDelaysMs[i] ?? 0)
      );
    });

    const mouse = Mouse.create(render.canvas);
    const mouseConstraint = MouseConstraint.create(engine, {
      mouse,
      collisionFilter: { mask: POD_CATEGORY },
      constraint: {
        stiffness: 0.35,
        damping: 0.12,
        render: { visible: false }
      }
    });
    World.add(engine.world, mouseConstraint);
    render.mouse = mouse;

    const dislodgeLetter = (letterBody, impactingBody) => {
      if (letterBody.plugin?.type !== 'letter' || letterBody.plugin.dislodged) return;
      if (!lettersArmed) return;
      letterBody.plugin.dislodged = true;

      const anchor = letterAnchors[letterBody.plugin.index];
      if (anchor) {
        World.remove(engine.world, anchor);
        letterAnchors[letterBody.plugin.index] = null;
      }

      const dx = letterBody.position.x - impactingBody.position.x;
      const dy = letterBody.position.y - impactingBody.position.y;
      const mag = Math.hypot(dx, dy) || 1;
      const nx = dx / mag;
      const ny = dy / mag;
      Body.setPosition(letterBody, {
        x: letterBody.position.x + nx * 10,
        y: letterBody.position.y + ny * 10
      });

      letterBody.isSensor = false;
      for (const part of letterBody.parts) part.isSensor = false;
      letterBody.collisionFilter.mask = POD_CATEGORY | LETTER_CATEGORY | WALL_CATEGORY;
      letterBody.restitution = 1.12;
      letterBody.frictionAir = 0.003;
      letterBody.friction = 0.01;

      const relVx = impactingBody.velocity.x - letterBody.velocity.x;
      const relVy = impactingBody.velocity.y - letterBody.velocity.y;
      const relSpeed = Math.hypot(relVx, relVy);
      const launch = Math.max(14, relSpeed * 7.0);
      Body.setVelocity(letterBody, {
        x: impactingBody.velocity.x * 1.5 + nx * launch,
        y: impactingBody.velocity.y * 1.5 + ny * launch
      });
      Body.setAngularVelocity(letterBody, (Math.random() - 0.5) * 0.5);
    };

    Events.on(engine, 'collisionStart', (event) => {
      for (const pair of event.pairs) {
        const a = pair.bodyA;
        const b = pair.bodyB;
        if (a.plugin?.type === 'ground' && b.plugin?.type === 'pod') {
          b.plugin.landed = true;
        } else if (b.plugin?.type === 'ground' && a.plugin?.type === 'pod') {
          a.plugin.landed = true;
        }

        if (!lettersArmed && podBodies.length && podBodies.every((p) => p.plugin?.landed)) {
          lettersArmed = true;
        }

        if (a.plugin?.type === 'letter' && b.plugin?.type === 'pod') {
          dislodgeLetter(a, b);
        } else if (b.plugin?.type === 'letter' && a.plugin?.type === 'pod') {
          dislodgeLetter(b, a);
        }
      }
    });

    const maxLinearSpeed = 70;
    const maxAngularSpeed = 0.45;
    Events.on(engine, 'beforeUpdate', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      const dynamicBodies = [];
      for (const body of podBodies) if (inWorld.has(body)) dynamicBodies.push(body);
      for (const body of letterBodies) if (body.plugin?.dislodged) dynamicBodies.push(body);

      for (const body of dynamicBodies) {
        const vx = body.velocity.x;
        const vy = body.velocity.y;
        const speed = Math.hypot(vx, vy);
        if (speed > maxLinearSpeed) {
          const scale = maxLinearSpeed / speed;
          Body.setVelocity(body, { x: vx * scale, y: vy * scale });
        }
        if (Math.abs(body.angularVelocity) > maxAngularSpeed) {
          Body.setAngularVelocity(
            body,
            Math.sign(body.angularVelocity) * maxAngularSpeed
          );
        }

        const padding = 300;
        if (
          body.position.x < -padding ||
          body.position.x > width + padding ||
          body.position.y < -padding ||
          body.position.y > height + padding
        ) {
          Body.setPosition(body, { x: width / 2, y: height / 3 });
          Body.setVelocity(body, { x: 0, y: 0 });
          Body.setAngularVelocity(body, 0);
        }
      }
    });

    const runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    let rafId = 0;
    const updatePods = () => {
      for (let i = 0; i < podEls.length; i++) {
        const el = podEls[i];
        const body = podBodies[i];
        el.style.left = `${body.position.x}px`;
        el.style.top = `${body.position.y}px`;
        el.style.transform = `translate(-50%, -50%) rotate(${body.angle}rad)`;
      }

      for (let i = 0; i < physLetterEls.length; i++) {
        const el = physLetterEls[i];
        const body = letterBodies[i];
        if (!el || !body) continue;
        el.style.left = `${body.position.x}px`;
        el.style.top = `${body.position.y}px`;
        el.style.transform = `translate(-50%, -50%) rotate(${body.angle}rad)`;
      }
      rafId = window.requestAnimationFrame(updatePods);
    };
    rafId = window.requestAnimationFrame(updatePods);

    let resizeTimer = null;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const width = window.innerWidth;
        const height = window.innerHeight;

        if (Render.setPixelRatio) Render.setPixelRatio(render, window.devicePixelRatio || 1);
        if (Render.setSize) {
          Render.setSize(render, width, height);
        } else {
          render.bounds.max.x = width;
          render.bounds.max.y = height;
          render.options.width = width;
          render.options.height = height;
          render.canvas.width = width * render.options.pixelRatio;
          render.canvas.height = height * render.options.pixelRatio;
          render.canvas.style.width = `${width}px`;
          render.canvas.style.height = `${height}px`;
        }

        const next = createBoundaries(width, height);

        Body.setPosition(boundaries.ground, next.ground.position);
        Body.setVertices(boundaries.ground, next.ground.vertices);

        Body.setPosition(boundaries.ceiling, next.ceiling.position);
        Body.setVertices(boundaries.ceiling, next.ceiling.vertices);

        Body.setPosition(boundaries.leftWall, next.leftWall.position);
        Body.setVertices(boundaries.leftWall, next.leftWall.vertices);

        Body.setPosition(boundaries.rightWall, next.rightWall.position);
        Body.setVertices(boundaries.rightWall, next.rightWall.vertices);

        if (letterBodies.length && ghostLetterEls.length === letterBodies.length) {
          for (let i = 0; i < letterBodies.length; i++) {
            const body = letterBodies[i];
            if (body.plugin?.dislodged) continue;
            const rect = ghostLetterEls[i].getBoundingClientRect();
            const w = Math.max(6, rect.width);
            const h = Math.max(10, rect.height);
            const x = rect.left + rect.width / 2;
            const y = rect.top + rect.height / 2;

            const tmp = Bodies.rectangle(x, y, w, h, { isStatic: true, render: { visible: false } });
            Body.setPosition(body, { x, y });
            Body.setAngle(body, 0);
            Body.setVelocity(body, { x: 0, y: 0 });
            Body.setAngularVelocity(body, 0);
            Body.setVertices(body, tmp.vertices);

            const anchor = letterAnchors[i];
            if (anchor) anchor.pointA = { x, y };
          }
        }
      }, 150);
    };

    window.addEventListener('resize', onResize);

    return () => {
      cancelledRef.current = true;
      document.documentElement.classList.remove('title-ready');
      window.removeEventListener('resize', onResize);
      if (resizeTimer) window.clearTimeout(resizeTimer);
      for (const t of timeouts) window.clearTimeout(t);
      if (rafId) window.cancelAnimationFrame(rafId);
      Render.stop(render);
      Runner.stop(runner);
      World.clear(engine.world, false);
      Engine.clear(engine);
      render.canvas.remove();
      render.textures = {};
    };
  }, []);
}

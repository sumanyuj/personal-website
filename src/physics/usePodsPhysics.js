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

    const { Engine, Render, World, Bodies, Runner, Body, Mouse, MouseConstraint, Events } = Matter;

    const engine = Engine.create();
    engine.positionIterations = 10;
    engine.velocityIterations = 8;
    engine.constraintIterations = 4;
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

    const podBodies = podEls.map((el, index) => {
      const width = el.offsetWidth || 120;
      const height = el.offsetHeight || 50;
      const startX = (window.innerWidth * (index + 1)) / (podEls.length + 1);
      const startY = -100 - index * 80;

      return Bodies.rectangle(startX, startY, width, height, {
        restitution: 0.93,
        friction: 0.02,
        frictionStatic: 0,
        frictionAir: 0.01,
        render: { visible: false }
      });
    });

    for (const el of podEls) {
      el.style.visibility = 'hidden';
    }

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
      return { ground, ceiling, leftWall, rightWall };
    };

    const boundaries = createBoundaries(window.innerWidth, window.innerHeight);
    World.add(engine.world, [
      boundaries.ground,
      boundaries.ceiling,
      boundaries.leftWall,
      boundaries.rightWall
    ]);

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
      constraint: {
        stiffness: 0.35,
        damping: 0.12,
        render: { visible: false }
      }
    });
    World.add(engine.world, mouseConstraint);
    render.mouse = mouse;

    const maxLinearSpeed = 26;
    const maxAngularSpeed = 0.25;
    Events.on(engine, 'beforeUpdate', () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      for (const body of podBodies) {
        if (!inWorld.has(body)) continue;

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
      }, 150);
    };

    window.addEventListener('resize', onResize);

    return () => {
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

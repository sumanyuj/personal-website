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

    const { Engine, Render, World, Bodies, Runner, Body, Mouse, MouseConstraint } = Matter;

    const engine = Engine.create();
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
    render.canvas.style.pointerEvents = 'none';

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

    const boundaryThickness = 100;
    const createBoundaries = (width, height) => {
      const ground = Bodies.rectangle(
        width / 2,
        height + boundaryThickness / 2,
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
      return { ground, leftWall, rightWall };
    };

    const boundaries = createBoundaries(window.innerWidth, window.innerHeight);
    World.add(engine.world, [boundaries.ground, boundaries.leftWall, boundaries.rightWall]);

    const podDelaysMs = reduceMotion ? [0, 0, 0, 0] : [200, 600, 1000, 1400];
    const timeouts = [];
    podBodies.forEach((body, i) => {
      timeouts.push(
        window.setTimeout(() => {
          World.add(engine.world, body);
          Body.setVelocity(body, {
            x: (Math.random() - 0.5) * 1.2,
            y: 1.2 + Math.random() * 0.6
          });
          Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.035);
        }, podDelaysMs[i] ?? 0)
      );
    });

    const mouse = Mouse.create(document.body);
    mouse.pixelRatio = window.devicePixelRatio || 1;
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

document.addEventListener('DOMContentLoaded', () => {
  console.log('Your web page is loaded and ready!');
});

(() => {
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initButtons() {
    const myButton = document.getElementById('myButton');
    const newButton = document.getElementById('newButton');
    if (!myButton || !newButton) return;

    const delay = reduceMotion ? 0 : 500;
    const stagger = reduceMotion ? 0 : 600;

    window.setTimeout(() => {
      myButton.classList.add('visible');
      window.setTimeout(() => newButton.classList.add('visible'), stagger);
    }, delay);
  }

  function initPodsPhysics() {
    if (typeof Matter === 'undefined') return;

    const podIds = ['pod1', 'pod2', 'pod3', 'pod4'];
    const podEls = podIds.map((id) => document.getElementById(id));
    if (podEls.some((el) => !el)) return;

    const { Engine, Render, World, Bodies, Runner, Body } = Matter;

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
        restitution: 0.9,
        friction: 0.02,
        frictionStatic: 0,
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
    podBodies.forEach((body, i) => {
      window.setTimeout(() => World.add(engine.world, body), podDelaysMs[i] ?? 0);
    });

    const runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    const updatePods = () => {
      for (let i = 0; i < podEls.length; i++) {
        const el = podEls[i];
        const body = podBodies[i];
        el.style.left = `${body.position.x}px`;
        el.style.top = `${body.position.y}px`;
        el.style.transform = `translate(-50%, -50%) rotate(${body.angle}rad)`;
      }
      window.requestAnimationFrame(updatePods);
    };
    window.requestAnimationFrame(updatePods);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
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
    });
  }

  initButtons();
  initPodsPhysics();
})();


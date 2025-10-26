// The Room — Dummy fisico in una "stanza" con lancio a trascinamento
// Modello: masse puntiformi + molle (Hooke) + gravità + attrito viscoso + urti con pareti e attrito parete
// Invarianti: tema b/n, nessuna dipendenza esterna

(function () {
  'use strict';

  // Canvas bootstrap
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function resize() {
    const r = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.floor(cssW * r);
    canvas.height = Math.floor(cssH * r);
    ctx.setTransform(r, 0, 0, r, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // HUD
  const elKE = document.getElementById('ke');
  const elPE = document.getElementById('pe');
  const elET = document.getElementById('etot');
  const elVL = document.getElementById('vlaunch');

  // Parametri fisici
  const P = {
    g: 2200,                // gravità px/s^2
    airDrag: 1.1,           // coefficiente attrito aria (F = -c * v)
    wallRestitution: 0.18,  // restituzione pareti [0..1]
    wallFriction: 0.25,     // attrito tangenziale parete [0..1] semplice
    k: 14000,               // costante molla N/m (unità pixel-timestep)
    damp: 60,               // smorzamento nei vincoli
    substeps: 2             // integrazione più stabile
  };

  // Stato simulazione
  const nodes = []; // {x,y,vx,vy,m,r}
  const springs = []; // {i,j,L,k,d}
  let lastTime = performance.now();
  let acc = 0;
  const DT = 1 / 120; // fisso
  const MAX_ACC = 0.25;

  // Utility
  const V2 = {
    len2: (x, y) => x * x + y * y,
    len: (x, y) => Math.hypot(x, y),
    clamp: (v, min, max) => Math.max(min, Math.min(max, v))
  };

  function addNode(x, y, m, r) {
    nodes.push({ x, y, vx: 0, vy: 0, m, r });
    return nodes.length - 1;
  }
  function addSpring(i, j, k = P.k, d = P.damp) {
    const dx = nodes[j].x - nodes[i].x;
    const dy = nodes[j].y - nodes[i].y;
    springs.push({ i, j, L: Math.hypot(dx, dy), k, d });
  }

  // Build dummy: 11 nodi
  function buildDummy() {
    nodes.length = 0;
    springs.length = 0;

    const cx = canvas.width / (window.devicePixelRatio || 1) / 2;
    const cy = canvas.height / (window.devicePixelRatio || 1) / 3;

    // masse e raggi
    const R = {
      head: 16, torso: 14, pelvis: 14,
      uArm: 8, lArm: 8,
      uLeg: 10, lLeg: 10
    };
    const M = {
      head: 5, torso: 12, pelvis: 10,
      uArm: 3, lArm: 2.5,
      uLeg: 7, lLeg: 6
    };

    // Nodi
    const n = {};
    n.head   = addNode(cx, cy - 56, M.head, R.head);
    n.chest  = addNode(cx, cy - 26, M.torso, R.torso);
    n.pelvis = addNode(cx, cy +  6, M.pelvis, R.pelvis);

    n.luArm  = addNode(cx - 30, cy - 26, M.uArm, R.uArm);
    n.llArm  = addNode(cx - 58, cy - 26, M.lArm, R.lArm);
    n.ruArm  = addNode(cx + 30, cy - 26, M.uArm, R.uArm);
    n.rlArm  = addNode(cx + 58, cy - 26, M.lArm, R.lArm);

    n.luLeg  = addNode(cx - 14, cy + 32, M.uLeg, R.uLeg);
    n.llLeg  = addNode(cx - 14, cy + 70, M.lLeg, R.lLeg);
    n.ruLeg  = addNode(cx + 14, cy + 32, M.uLeg, R.uLeg);
    n.rlLeg  = addNode(cx + 14, cy + 70, M.lLeg, R.lLeg);

    // Vincoli principali
    addSpring(n.head, n.chest);
    addSpring(n.chest, n.pelvis);

    addSpring(n.chest, n.luArm);
    addSpring(n.luArm, n.llArm);
    addSpring(n.chest, n.ruArm);
    addSpring(n.ruArm, n.rlArm);

    addSpring(n.pelvis, n.luLeg);
    addSpring(n.luLeg, n.llLeg);
    addSpring(n.pelvis, n.ruLeg);
    addSpring(n.ruLeg, n.rlLeg);

    // Cross bracing per stabilità
    addSpring(n.head, n.luArm, P.k * 0.6, P.damp);
    addSpring(n.head, n.ruArm, P.k * 0.6, P.damp);
    addSpring(n.chest, n.luLeg, P.k * 0.6, P.damp);
    addSpring(n.chest, n.ruLeg, P.k * 0.6, P.damp);
    addSpring(n.luLeg, n.ruLeg, P.k * 0.4, P.damp);

    // ritorno
    return n;
  }
  const parts = buildDummy();

  // Input: drag + lancio
  const pointer = {
    active: false,
    id: null,
    x: 0, y: 0,
    vx: 0, vy: 0,
    history: [],
    targetIndex: -1
  };

  function pointerFromEvent(e) {
    let x, y, id = 'mouse';
    if (e.touches && e.touches.length) {
      const t = e.touches[0];
      id = t.identifier;
      const rect = canvas.getBoundingClientRect();
      x = (t.clientX - rect.left);
      y = (t.clientY - rect.top);
    } else {
      const rect = canvas.getBoundingClientRect();
      x = (e.clientX - rect.left);
      y = (e.clientY - rect.top);
    }
    return { x, y, id };
  }

  function onDown(e) {
    const p = pointerFromEvent(e);
    pointer.active = true;
    pointer.id = p.id;
    pointer.x = p.x; pointer.y = p.y;
    pointer.vx = 0; pointer.vy = 0;
    pointer.history.length = 0;

    // pick: nodo più vicino entro r*1.2
    const idx = pickNode(p.x, p.y);
    pointer.targetIndex = idx;

    // reset history
    const t = performance.now();
    pointer.history.push({ x: p.x, y: p.y, t });

    e.preventDefault();
  }

  function onMove(e) {
    if (!pointer.active) return;
    const p = pointerFromEvent(e);
    const t = performance.now();

    // velocità media su finestra temporale breve
    pointer.history.push({ x: p.x, y: p.y, t });
    while (pointer.history.length > 0 && (t - pointer.history[0].t) > 90) {
      pointer.history.shift();
    }
    if (pointer.history.length >= 2) {
      const a = pointer.history[0];
      const b = pointer.history[pointer.history.length - 1];
      const dt = Math.max(1, b.t - a.t) / 1000;
      pointer.vx = (b.x - a.x) / dt;
      pointer.vy = (b.y - a.y) / dt;
    }

    pointer.x = p.x; pointer.y = p.y;
  }

  function onUp() {
    if (!pointer.active) return;

    // Impulso di lancio: trasferisco v del puntatore all'intero dummy
    const vx = pointer.vx, vy = pointer.vy;
    for (const nd of nodes) {
      nd.vx += vx;
      nd.vy += vy;
    }
    // KPI
    const vmod = Math.hypot(vx, vy);
    if (elVL) elVL.textContent = vmod.toFixed(1);

    pointer.active = false;
    pointer.id = null;
    pointer.targetIndex = -1;
    pointer.history.length = 0;
  }

  canvas.addEventListener('mousedown', onDown, { passive: false });
  canvas.addEventListener('mousemove', onMove, { passive: false });
  window.addEventListener('mouseup', onUp, { passive: false });

  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp, { passive: false });

  function pickNode(px, py) {
    let best = -1;
    let bestD2 = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      const nd = nodes[i];
      const dx = px - nd.x;
      const dy = py - nd.y;
      const d2 = dx * dx + dy * dy;
      const hitR = nd.r * 1.4;
      if (d2 < hitR * hitR && d2 < bestD2) {
        bestD2 = d2; best = i;
      }
    }
    return best;
  }

  // Loop
  function frame(now) {
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    // cap per tab in ritardo
    dt = Math.min(dt, 0.05);
    acc += dt;
    acc = Math.min(acc, MAX_ACC);

    const steps = P.substeps;
    const h = DT / steps;

    while (acc >= DT) {
      for (let s = 0; s < steps; s++) {
        step(h);
      }
      acc -= DT;
    }

    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function step(dt) {
    // Forze puntuali
    for (const nd of nodes) {
      // gravità
      let fx = 0;
      let fy = nd.m * P.g;

      // attrito aria: -c * v
      fx += -P.airDrag * nd.vx;
      fy += -P.airDrag * nd.vy;

      // integrazione semi-implicita
      nd.vx += (fx / nd.m) * dt;
      nd.vy += (fy / nd.m) * dt;
    }

    // Vincoli elastici + smorzamento relativo
    for (const sp of springs) {
      const a = nodes[sp.i], b = nodes[sp.j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1e-6;
      const nx = dx / dist, ny = dy / dist;

      // Forza di molla
      const ext = dist - sp.L;
      const fSpring = sp.k * ext;

      // Smorzamento lungo l'asse del vincolo
      const relV = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      const fDamp = sp.d * relV;

      const f = fSpring + fDamp;

      const fx = f * nx;
      const fy = f * ny;

      // Aggiorna velocità per azione-reazione
      a.vx += ( fx / a.m) * dt;
      a.vy += ( fy / a.m) * dt;
      b.vx += (-fx / b.m) * dt;
      b.vy += (-fy / b.m) * dt;
    }

    // Forza molla verso puntatore se dragging un nodo
    if (pointer.active && pointer.targetIndex >= 0) {
      const idx = pointer.targetIndex;
      const nd = nodes[idx];
      const dx = pointer.x - nd.x;
      const dy = pointer.y - nd.y;
      const dist = Math.hypot(dx, dy);
      const nx = dist ? dx / dist : 0;
      const ny = dist ? dy / dist : 0;
      const kMouse = P.k * 2.0;
      const dMouse = P.damp * 1.5;

      // Componente lungo il vettore verso il puntatore
      const relV = (pointer.vx - nd.vx) * nx + (pointer.vy - nd.vy) * ny;
      const f = kMouse * dist + dMouse * relV;

      nd.vx += (f * nx / nd.m) * dt;
      nd.vy += (f * ny / nd.m) * dt;
    }

    // Integrazione posizioni
    for (const nd of nodes) {
      nd.x += nd.vx * dt;
      nd.y += nd.vy * dt;

      // Collisioni con pareti del box
      collideWalls(nd);
    }
  }

  function collideWalls(nd) {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    const e = P.wallRestitution;
    const mu = P.wallFriction;

    // Sinistra
    if (nd.x - nd.r < 0) {
      nd.x = nd.r;
      nd.vx = Math.abs(nd.vx) * e;
      // attrito tangenziale: riduci vy
      nd.vy *= (1 - mu);
    }
    // Destra
    if (nd.x + nd.r > w) {
      nd.x = w - nd.r;
      nd.vx = -Math.abs(nd.vx) * e;
      nd.vy *= (1 - mu);
    }
    // Alto
    if (nd.y - nd.r < 0) {
      nd.y = nd.r;
      nd.vy = Math.abs(nd.vy) * e;
      nd.vx *= (1 - mu);
    }
    // Basso
    if (nd.y + nd.r > h) {
      nd.y = h - nd.r;
      nd.vy = -Math.abs(nd.vy) * e;
      nd.vx *= (1 - mu);
    }
  }

  // Energia
  function computeEnergies() {
    const hFloor = canvas.height / (window.devicePixelRatio || 1);
    let KE = 0, PE = 0;
    for (const nd of nodes) {
      KE += 0.5 * nd.m * (nd.vx * nd.vx + nd.vy * nd.vy);
      const yRef = hFloor - Math.min(nd.y, hFloor); // quota sopra il pavimento
      PE += nd.m * P.g * Math.max(0, yRef);
    }
    if (elKE) elKE.textContent = KE.toFixed(1);
    if (elPE) elPE.textContent = PE.toFixed(1);
    if (elET) elET.textContent = (KE + PE).toFixed(1);
  }

  // Render
  function render() {
    // pulizia
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // griglia leggera
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#ffffff';
    for (let x = 0; x < canvas.width; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    ctx.restore();

    // molle (ossa)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
    for (const sp of springs) {
      const a = nodes[sp.i], b = nodes[sp.j];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // nodi (giunti/arti)
    for (const nd of nodes) {
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, nd.r, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(nd.x, nd.y, Math.max(1, nd.r - 3), 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();
    }

    // feedback drag
    if (pointer.active) {
      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // traiettoria di lancio (linea velocità)
      ctx.beginPath();
      ctx.moveTo(pointer.x, pointer.y);
      ctx.lineTo(pointer.x + pointer.vx * 0.06, pointer.y + pointer.vy * 0.06);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    computeEnergies();
  }

  // API di reset se ridimensioni forte
  window.addEventListener('resize', () => {
    // ricostruisci dummy per coerenza delle lunghezze
    const vx = 0, vy = 0;
    buildDummy();
    for (const nd of nodes) { nd.vx = vx; nd.vy = vy; }
  });

})();

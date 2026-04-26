'use strict';

/* ══════════════════════════════════════════════════════════
   AUTOMYX v2 — main.js
   Interactive draggable neural net · Sky aesthetic · Flow animations
   ══════════════════════════════════════════════════════════ */

/* ── Utilities ──────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist2(ax, ay, bx, by) { const dx = ax-bx, dy = ay-by; return dx*dx+dy*dy; }

/* ══════════════════════════════════════════════════════════
   1. LOADER
   ══════════════════════════════════════════════════════════ */
(function initLoader() {
  const loader = $('loader');
  if (!loader) return;

  // inject SVG gradient defs inline
  const svg = loader.querySelector('.loader-logo-svg');
  if (svg) {
    const defs = document.createElementNS('http://www.w3.org/2000/svg','defs');
    defs.innerHTML = `<linearGradient id="loaderGrad" x1="0" y1="0" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7dd3fc"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>`;
    svg.prepend(defs);
  }

  const hide = () => loader.classList.add('gone');
  window.addEventListener('load', () => setTimeout(hide, 2300));
  setTimeout(hide, 3500);
})();

/* ══════════════════════════════════════════════════════════
   2. INTERACTIVE NEURAL CANVAS WITH DRAGGABLE NODES
   ══════════════════════════════════════════════════════════ */
(function initHeroCanvas() {
  const canvas = $('hero-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H;
  let nodes = [];
  let raf;
  let mouse = { x: -999, y: -999, down: false };
  let dragging = null;   // node being dragged
  let repelRadius = 120; // passive mouse repel when not dragging
  let hovered = null;

  /* ─ Node class ─ */
  class Node {
    constructor(id) {
      this.id = id;
      this.x  = Math.random() * W;
      this.y  = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.3;
      this.vy = (Math.random() - 0.5) * 0.3;
      this.baseR = Math.random() < 0.15 ? 6 : (Math.random() < 0.4 ? 4 : 2.5);
      this.r     = this.baseR;
      this.targetR = this.baseR;
      this.hue     = Math.random() < 0.6 ? 200 : 220; // sky blues
      this.lit     = false;
      this.label   = Math.random() < 0.08 ? ['Input','Hidden','Output','Layer','Bias','Weight'][Math.floor(Math.random()*6)] : null;
      this.activity = 0; // 0..1 activation animation
      this.actDir   = 0; // pulse direction
    }

    // soft bounce off walls
    bounceWalls() {
      const pad = 30;
      if (this.x < pad)  { this.vx += 0.05; }
      if (this.x > W-pad){ this.vx -= 0.05; }
      if (this.y < pad)  { this.vy += 0.05; }
      if (this.y > H-pad){ this.vy -= 0.05; }
    }

    update(dt) {
      if (this === dragging) return;

      // passive mouse repel
      const mdx = this.x - mouse.x, mdy = this.y - mouse.y;
      const md2 = mdx*mdx + mdy*mdy;
      if (md2 < repelRadius*repelRadius && md2 > 0) {
        const md = Math.sqrt(md2);
        const strength = (1 - md/repelRadius) * 1.2;
        this.vx += (mdx/md) * strength;
        this.vy += (mdy/md) * strength;
      }

      // node-node repulsion (light)
      for (let j = 0; j < nodes.length; j++) {
        if (j === this.id) continue;
        const o = nodes[j];
        const nx = this.x - o.x, ny = this.y - o.y;
        const d2 = nx*nx+ny*ny;
        if (d2 < 2500 && d2 > 0) { // 50px
          const d = Math.sqrt(d2);
          const f = (1 - d/50) * 0.4;
          this.vx += (nx/d)*f; this.vy += (ny/d)*f;
        }
      }

      this.bounceWalls();

      // damping
      this.vx *= 0.96;
      this.vy *= 0.96;
      this.vx = clamp(this.vx, -3, 3);
      this.vy = clamp(this.vy, -3, 3);

      this.x += this.vx * dt * 60;
      this.y += this.vy * dt * 60;

      // activity pulse
      this.activity += this.actDir * dt * 0.8;
      if (this.activity >= 1) { this.activity = 1; this.actDir = -1; }
      if (this.activity <= 0) { this.activity = 0; this.actDir = 0; }

      // spontaneous activation
      if (this.actDir === 0 && Math.random() < 0.002) {
        this.actDir = 1;
      }

      // radius lerp
      this.targetR = this.baseR + this.activity * 3;
      this.r = lerp(this.r, this.targetR, 0.1);
    }

    isNear(px, py) {
      return dist2(this.x, this.y, px, py) < (this.r + 10) * (this.r + 10);
    }
  }

  /* ─ Init ─ */
  function init() {
    W = canvas.width  = canvas.parentElement.offsetWidth;
    H = canvas.height = canvas.parentElement.offsetHeight;
    repelRadius = Math.min(W, H) * 0.15;
    const count = clamp(Math.floor((W * H) / 14000), 30, 75);
    nodes = Array.from({length: count}, (_, i) => new Node(i));
  }

  /* ─ Draw edges ─ */
  function drawEdges() {
    const maxDist  = Math.min(W, H) * 0.22;
    const maxDist2 = maxDist * maxDist;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i+1; j < nodes.length; j++) {
        const b = nodes[j];
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 > maxDist2) continue;

        const d = Math.sqrt(d2);
        const proximity = 1 - d/maxDist;
        const lift = (a.activity + b.activity) * 0.5;
        const baseAlpha = proximity * 0.18;
        const alpha = clamp(baseAlpha + lift * 0.3, 0, 0.7);

        // gradient edge based on proximity to dragged node
        let liftColor = false;
        if (dragging && (a === dragging || b === dragging)) liftColor = true;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);

        // slight curve for organic feel
        const cx = (a.x + b.x) / 2 + (Math.sin(a.id + b.id) * 20 * proximity);
        const cy = (a.y + b.y) / 2 + (Math.cos(a.id * b.id) * 15 * proximity);
        ctx.quadraticCurveTo(cx, cy, b.x, b.y);

        if (liftColor) {
          ctx.strokeStyle = `rgba(125,211,252,${clamp(alpha*2.5, 0, 0.9)})`;
          ctx.lineWidth   = proximity * 1.8;
        } else {
          const r = Math.round(lerp(56,  14, 1-proximity));
          const g = Math.round(lerp(189, 165, 1-proximity));
          const bl= Math.round(lerp(248, 233, 1-proximity));
          ctx.strokeStyle = `rgba(${r},${g},${bl},${alpha})`;
          ctx.lineWidth   = proximity * 1.2;
        }
        ctx.stroke();

        // signal travelling along an active edge
        if (lift > 0.4 && d < maxDist * 0.7) {
          const t = (Date.now() % 2000) / 2000;
          const sx = a.x + (b.x - a.x) * t;
          const sy = a.y + (b.y - a.y) * t;
          ctx.beginPath();
          ctx.arc(sx, sy, 2, 0, Math.PI*2);
          ctx.fillStyle = `rgba(125,211,252,${lift * 0.7})`;
          ctx.fill();
        }
      }
    }
  }

  /* ─ Draw nodes ─ */
  function drawNodes() {
    nodes.forEach(n => {
      const isDragged  = n === dragging;
      const isHovered  = n === hovered;
      const highlight  = isDragged || isHovered;

      // outer glow
      if (highlight || n.activity > 0.2) {
        const glowR = n.r * (highlight ? 5 : 3 + n.activity * 3);
        const glowA = highlight ? 0.25 : n.activity * 0.18;
        const grd   = ctx.createRadialGradient(n.x, n.y, n.r*0.5, n.x, n.y, glowR);
        grd.addColorStop(0, `rgba(56,189,248,${glowA})`);
        grd.addColorStop(1, `rgba(56,189,248,0)`);
        ctx.beginPath(); ctx.arc(n.x, n.y, glowR, 0, Math.PI*2);
        ctx.fillStyle = grd; ctx.fill();
      }

      // ring for large nodes
      if (n.baseR >= 5) {
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r + 5, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(56,189,248,${0.15 + n.activity*0.2})`;
        ctx.lineWidth = 1; ctx.stroke();
      }

      // node body
      const nodeGrd = ctx.createRadialGradient(n.x-n.r*0.3, n.y-n.r*0.3, n.r*0.1, n.x, n.y, n.r);
      if (isDragged) {
        nodeGrd.addColorStop(0, '#e0f2fe');
        nodeGrd.addColorStop(1, '#38bdf8');
      } else {
        const base = highlight ? 0.95 : (0.5 + n.activity * 0.4);
        const l    = Math.round(base * 248);
        nodeGrd.addColorStop(0, `rgba(${l},${l},${l},0.95)`);
        nodeGrd.addColorStop(1, `rgba(56,189,248,${0.6 + n.activity*0.4})`);
      }
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
      ctx.fillStyle = nodeGrd; ctx.fill();

      // label for special nodes
      if (n.label && (isHovered || isDragged || n.baseR >= 5)) {
        ctx.font = `${clamp(n.r * 1.8, 9, 12)}px Inter, sans-serif`;
        ctx.fillStyle = `rgba(125,211,252,${isHovered||isDragged?0.9:0.4})`;
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y - n.r - 6);
      }
    });
  }

  /* ─ Render loop ─ */
  let last = 0;
  function render(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    ctx.clearRect(0, 0, W, H);
    nodes.forEach(n => n.update(dt));
    drawEdges();
    drawNodes();

    raf = requestAnimationFrame(render);
  }

  /* ─ Mouse / Touch events ─ */
  function getCanvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  function findNodeAt(px, py) {
    // closest node within hit radius
    let best = null, bestD = Infinity;
    nodes.forEach(n => {
      const d2 = dist2(n.x, n.y, px, py);
      if (n.isNear(px, py) && d2 < bestD) { best = n; bestD = d2; }
    });
    return best;
  }

  canvas.addEventListener('mousemove', e => {
    const {x, y} = getCanvasPos(e);
    mouse.x = x; mouse.y = y;
    if (dragging) {
      dragging.x = x; dragging.y = y;
      dragging.vx = 0; dragging.vy = 0;
      document.body.classList.add('cur-drag');
    } else {
      hovered = findNodeAt(x, y);
      document.body.classList.toggle('cur-hover', !!hovered);
      document.body.classList.remove('cur-drag');
    }
  }, {passive: true});

  canvas.addEventListener('mousedown', e => {
    const {x, y} = getCanvasPos(e);
    dragging = findNodeAt(x, y);
    if (dragging) {
      dragging.vx = 0; dragging.vy = 0;
      dragging.activity = 1; dragging.actDir = -1;
      document.body.classList.add('cur-drag');
      e.preventDefault();
    }
  });

  window.addEventListener('mouseup', () => {
    if (dragging) {
      // fling on release
      dragging.vx = (mouse.x - dragging.x) * 0.05;
      dragging.vy = (mouse.y - dragging.y) * 0.05;
      dragging = null;
    }
    document.body.classList.remove('cur-drag');
  });

  canvas.addEventListener('mouseleave', () => {
    mouse.x = -999; mouse.y = -999;
    hovered = null;
  });

  // Touch support
  canvas.addEventListener('touchstart', e => {
    const {x,y} = getCanvasPos(e);
    dragging = findNodeAt(x,y);
    if (dragging) { dragging.vx=0; dragging.vy=0; e.preventDefault(); }
  }, {passive:false});

  canvas.addEventListener('touchmove', e => {
    const {x,y} = getCanvasPos(e);
    mouse.x=x; mouse.y=y;
    if (dragging) { dragging.x=x; dragging.y=y; e.preventDefault(); }
  }, {passive:false});

  canvas.addEventListener('touchend', () => { dragging = null; });

  // Double-click: spawn a new node
  canvas.addEventListener('dblclick', e => {
    const {x,y} = getCanvasPos(e);
    if (nodes.length < 80) {
      const n = new Node(nodes.length);
      n.x = x; n.y = y; n.activity = 1; n.actDir = -1;
      nodes.push(n);
    }
  });

  /* ─ Resize ─ */
  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(raf);
    init();
    raf = requestAnimationFrame(render);
  });
  ro.observe(canvas.parentElement);

  // Pause when hero not visible
  const io = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      if (!raf) raf = requestAnimationFrame(render);
    } else {
      cancelAnimationFrame(raf); raf = null;
    }
  }, {threshold: 0});
  io.observe(canvas);

  init();
  raf = requestAnimationFrame(render);
})();

/* ══════════════════════════════════════════════════════════
   3. CUSTOM CURSOR
   ══════════════════════════════════════════════════════════ */
(function initCursor() {
  const dot  = $('cursor');
  const ring = $('cursor-ring');
  if (!dot || !ring) return;
  if (window.matchMedia('(pointer:coarse)').matches) return;

  let mx=-100,my=-100, rx=-100,ry=-100;

  document.addEventListener('mousemove', e => { mx=e.clientX; my=e.clientY; }, {passive:true});

  function loop() {
    dot.style.left = mx+'px'; dot.style.top = my+'px';
    rx = lerp(rx,mx,0.14); ry = lerp(ry,my,0.14);
    ring.style.left = rx+'px'; ring.style.top = ry+'px';
    requestAnimationFrame(loop);
  }
  loop();

  $$('a,button,.svc-card,.proj-card,.testi-card,.why-feat').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cur-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cur-hover'));
  });
})();

/* ══════════════════════════════════════════════════════════
   4. SCROLL PROGRESS
   ══════════════════════════════════════════════════════════ */
(function initProgress() {
  const bar = $('scroll-progress');
  if (!bar) return;
  const update = () => {
    const pct = window.scrollY / (document.body.scrollHeight - innerHeight);
    bar.style.transform = `scaleX(${clamp(pct,0,1)})`;
  };
  window.addEventListener('scroll', update, {passive:true});
})();

/* ══════════════════════════════════════════════════════════
   5. NAVBAR
   ══════════════════════════════════════════════════════════ */
(function initNav() {
  const nav  = $('navbar');
  const ham  = $('hamburger');
  const menu = $('nav-links');
  if (!nav) return;

  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 30), {passive:true});

  // Active link
  const sections = $$('section[id]');
  const links    = $$('.nl');
  const linkMap  = {};
  links.forEach(l => { const h=l.getAttribute('href'); if(h) linkMap[h.slice(1)]=l; });

  new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        links.forEach(l=>l.classList.remove('active'));
        const l = linkMap[e.target.id];
        if (l) l.classList.add('active');
      }
    });
  }, {threshold:0.4}).observe(document.getElementById('hero') ?? sections[0]);
  sections.forEach(s => {
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        links.forEach(l=>l.classList.remove('active'));
        const l = linkMap[entries[0].target.id];
        if(l) l.classList.add('active');
      }
    }, {threshold:0.3}).observe(s);
  });

  // Mobile menu
  if (ham && menu) {
    ham.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      ham.classList.toggle('open', open);
      ham.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      menu.classList.remove('open');
      ham.classList.remove('open');
      ham.setAttribute('aria-expanded','false');
      document.body.style.overflow='';
    }));
  }
})();

/* ══════════════════════════════════════════════════════════
   6. SCROLL REVEAL
   ══════════════════════════════════════════════════════════ */
(function initReveal() {
  const els = $$('.reveal-up,.reveal-left,.reveal-right,.reveal-scale');
  const io  = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        io.unobserve(e.target);
      }
    });
  }, {threshold:0.12, rootMargin:'0px 0px -30px 0px'});
  els.forEach(el => io.observe(el));
})();

/* ══════════════════════════════════════════════════════════
   7. STAT COUNTERS
   ══════════════════════════════════════════════════════════ */
(function initCounters() {
  $$('[data-target]').forEach(el => {
    new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      const target = +el.dataset.target;
      const dur    = 1600;
      const start  = performance.now();
      const tick   = now => {
        const p = Math.min((now-start)/dur, 1);
        const e = 1 - Math.pow(1-p, 3);
        el.textContent = Math.floor(e * target);
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target;
      };
      requestAnimationFrame(tick);
    }, {threshold:0.5}).observe(el);
  });
})();

/* ══════════════════════════════════════════════════════════
   8. SMOOTH ANCHOR SCROLL
   ══════════════════════════════════════════════════════════ */
(function initScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href').slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      e.preventDefault();
      const offset = ($('navbar')?.offsetHeight ?? 70) + 8;
      window.scrollTo({top: el.getBoundingClientRect().top + scrollY - offset, behavior:'smooth'});
    });
  });
})();

/* ══════════════════════════════════════════════════════════
   9. PROCESS STEPS — staggered animation
   ══════════════════════════════════════════════════════════ */
(function initProcess() {
  const steps = $$('.proc-step');
  steps.forEach((s,i) => {
    s.style.opacity = '0';
    s.style.transform = 'translateY(24px)';
    s.style.transition = `opacity 0.65s ${0.1*i}s ease, transform 0.65s ${0.1*i}s ease`;
    new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) {
        s.style.opacity='1'; s.style.transform='none';
      }
    }, {threshold:0.2}).observe(s);
  });
})();

/* ══════════════════════════════════════════════════════════
   10. WHY FEATS — hover line lift
   ══════════════════════════════════════════════════════════ */
(function initWhyFeats() {
  $$('.why-feat').forEach(f => {
    f.addEventListener('mouseenter', () => {
      const num = f.querySelector('.wf-num');
      if (num) num.style.opacity='1';
    });
    f.addEventListener('mouseleave', () => {
      const num = f.querySelector('.wf-num');
      if (num) num.style.opacity='';
    });
  });
})();

/* ══════════════════════════════════════════════════════════
   11. CONTACT FORM
   ══════════════════════════════════════════════════════════ */
(function initForm() {
  const form = $('contact-form');
  const msg  = $('form-msg');
  const btn  = $('form-submit');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.className = 'form-msg';

    const name  = $('cf-name').value.trim();
    const email = $('cf-email').value.trim();
    const text  = $('cf-message').value.trim();

    if (!name)  return showMsg('Please enter your name.', 'err');
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                return showMsg('Please enter a valid email.', 'err');
    if (!text)  return showMsg('Please enter a message.', 'err');

    btn.disabled = true;
    btn.querySelector('span').textContent = 'Sending…';
    await new Promise(r => setTimeout(r, 1600));
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Send Message';
    form.reset();
    showMsg('✓ Message sent! We\'ll be in touch within 24 hours.', 'ok');
  });

  function showMsg(text, cls) {
    msg.textContent = text;
    msg.className   = `form-msg ${cls}`;
  }
})();

/* ══════════════════════════════════════════════════════════
   12. CHAT WIDGET
   ══════════════════════════════════════════════════════════ */
(function initChat() {
  const w = $('chat-widget');
  if (!w) return;
  const go = () => $('contact')?.scrollIntoView({behavior:'smooth', block:'start'});
  w.addEventListener('click', go);
  w.addEventListener('keydown', e => (e.key==='Enter'||e.key===' ') && go());
})();

/* ══════════════════════════════════════════════════════════
   13. FOOTER YEAR
   ══════════════════════════════════════════════════════════ */
(function initYear() {
  const el = $('yr');
  if (el) el.textContent = new Date().getFullYear();
})();

/* ══════════════════════════════════════════════════════════
   14. HERO PARALLAX (subtle depth on content)
   ══════════════════════════════════════════════════════════ */
(function initParallax() {
  const heroContent = document.querySelector('.hero-content');
  if (!heroContent) return;
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    requestAnimationFrame(() => {
      const y   = window.scrollY;
      const max = document.getElementById('hero')?.offsetHeight || 0;
      if (y < max) {
        heroContent.style.transform = `translateY(${y * 0.15}px)`;
        heroContent.style.opacity   = `${clamp(1 - y/max * 1.4, 0, 1)}`;
      }
      ticking = false;
    });
    ticking = true;
  }, {passive:true});
})();

/* ══════════════════════════════════════════════════════════
   15. SERVICES CARD GLOW FOLLOW MOUSE
   ══════════════════════════════════════════════════════════ */
(function initCardGlow() {
  $$('.svc-card, .proj-card, .testi-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
      const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
      card.style.background = `radial-gradient(circle at ${x}% ${y}%, rgba(56,189,248,0.07) 0%, transparent 60%), var(--bg-card, rgba(7,30,54,0.6))`;
    });
    card.addEventListener('mouseleave', () => {
      card.style.background = '';
    });
  });
})();

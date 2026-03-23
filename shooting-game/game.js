// ============================================================
//  Galaxy Shooter — game.js
//  Pure JS game engine. Alpine.js is used ONLY for UI binding.
// ============================================================

(function () {
  'use strict';

  // ---------- constants ----------
  const CW = 480;
  const CH = 640;
  const PLAYER_W = 32;
  const PLAYER_H = 32;
  const PLAYER_SPEED = 5;
  const BULLET_W = 4;
  const BULLET_H = 12;
  const BULLET_SPEED = 8;
  const SHOOT_COOLDOWN = 180;          // ms
  const ENEMY_BASE_SPEED = 1.5;
  const ENEMY_SPAWN_BASE = 900;        // ms
  const STAR_COUNT = 100;
  const BOMB_MAX = 3;
  const POWERUP_CHANCE = 0.12;
  const COMBO_TIMEOUT = 1500;          // ms

  // enemy templates
  const ENEMY_DEFS = [
    { w: 28, h: 28, hp: 1, score: 10, color: '#ef4444', char: '👾' },
    { w: 32, h: 28, hp: 2, score: 25, color: '#f97316', char: '🛸' },
    { w: 36, h: 32, hp: 3, score: 50, color: '#a855f7', char: '👹' },
    { w: 40, h: 36, hp: 5, score: 100, color: '#ec4899', char: '🐙' },
  ];

  // powerup types
  const PU = {
    life:   { char: '❤️', color: '#f43f5e' },
    triple: { char: '🔱', color: '#6366f1' },
    bomb:   { char: '💣', color: '#f59e0b' },
    speed:  { char: '⚡', color: '#eab308' },
    shield: { char: '🛡️', color: '#3b82f6' },
  };
  const PU_KEYS = Object.keys(PU);

  // ---------- canvas ----------
  const canvas = document.getElementById('gameCanvas');
  canvas.width = CW;
  canvas.height = CH;
  const ctx = canvas.getContext('2d');

  // ---------- input ----------
  const keys = {};
  document.addEventListener('keydown', e => { keys[e.code] = true; });
  document.addEventListener('keyup',   e => { keys[e.code] = false; });

  // touch proxy (written by Alpine)
  const touchInput = { left: false, right: false, fire: false };

  function isDown(action) {
    switch (action) {
      case 'left':  return keys['ArrowLeft']  || keys['KeyA'] || touchInput.left;
      case 'right': return keys['ArrowRight'] || keys['KeyD'] || touchInput.right;
      case 'fire':  return keys['Space'] || touchInput.fire;
      case 'bomb':  return keys['KeyZ'];
    }
    return false;
  }

  // ---------- stars background ----------
  const stars = Array.from({ length: STAR_COUNT }, () => ({
    x: Math.random() * CW,
    y: Math.random() * CH,
    s: 0.5 + Math.random() * 1.5,
    b: Math.random(),
  }));

  // ---------- game state ----------
  let g = null;   // game object — created on start()

  function newGame() {
    return {
      player: {
        x: CW / 2 - PLAYER_W / 2,
        y: CH - 60,
        w: PLAYER_W,
        h: PLAYER_H,
        speed: PLAYER_SPEED,
        lastShot: 0,
        tripleUntil: 0,
        speedUntil: 0,
        shieldUntil: 0,
        invUntil: 0,
      },
      bullets: [],
      enemies: [],
      particles: [],
      powerups: [],
      floatTexts: [],

      score: 0,
      combo: 0,
      comboTimer: 0,
      lives: 3,
      bombs: 1,
      level: 1,
      levelTimer: 0,

      spawnTimer: 0,
      spawnInterval: ENEMY_SPAWN_BASE,
      enemySpeed: ENEMY_BASE_SPEED,

      running: true,
      time: performance.now(),
    };
  }

  // ---------- spawn helpers ----------
  function spawnEnemy() {
    const levelIdx = Math.min(g.level - 1, ENEMY_DEFS.length - 1);
    const pool = ENEMY_DEFS.slice(0, levelIdx + 1);
    // bias toward higher tier at higher levels
    const def = pool[Math.floor(Math.random() * pool.length)];
    const x = Math.random() * (CW - def.w);
    g.enemies.push({
      x, y: -def.h,
      w: def.w, h: def.h,
      hp: def.hp + Math.floor(g.level / 4),
      maxHp: def.hp + Math.floor(g.level / 4),
      speed: g.enemySpeed * (0.8 + Math.random() * 0.5),
      score: def.score,
      color: def.color,
      char: def.char,
      anim: Math.random() * Math.PI * 2,
      wobble: Math.random() < 0.3 ? (Math.random() - 0.5) * 2 : 0,
    });
  }

  function spawnPowerup(x, y) {
    const key = PU_KEYS[Math.floor(Math.random() * PU_KEYS.length)];
    g.powerups.push({
      x, y, w: 20, h: 20,
      type: key,
      vy: 1.5,
      anim: 0,
    });
  }

  function spawnParticles(x, y, color, n, type) {
    for (let i = 0; i < n; i++) {
      g.particles.push({
        x, y, color,
        vx: (Math.random() - 0.5) * (type === 'explode' ? 6 : 3),
        vy: (Math.random() - 0.5) * (type === 'explode' ? 6 : 3),
        life: 0.4 + Math.random() * 0.4,
        size: 1.5 + Math.random() * 3,
      });
    }
  }

  function addFloatText(x, y, text, color) {
    g.floatTexts.push({ x, y, text, color, life: 0.8 });
  }

  // ---------- update ----------
  function update(dt) {
    if (!g || !g.running) return;
    const p = g.player;
    const now = performance.now();

    // -- player movement --
    let speed = p.speed;
    if (now < p.speedUntil) speed *= 1.6;
    if (isDown('left'))  p.x -= speed;
    if (isDown('right')) p.x += speed;
    p.x = Math.max(0, Math.min(CW - p.w, p.x));

    // -- shooting --
    if (isDown('fire') && now - p.lastShot > SHOOT_COOLDOWN) {
      p.lastShot = now;
      const cx = p.x + p.w / 2;
      g.bullets.push({ x: cx - BULLET_W / 2, y: p.y - BULLET_H, w: BULLET_W, h: BULLET_H });
      if (now < p.tripleUntil) {
        g.bullets.push({ x: cx - BULLET_W / 2 - 12, y: p.y - BULLET_H + 4, w: BULLET_W, h: BULLET_H, angle: -0.15 });
        g.bullets.push({ x: cx - BULLET_W / 2 + 12, y: p.y - BULLET_H + 4, w: BULLET_W, h: BULLET_H, angle: 0.15 });
      }
    }

    // -- bomb --
    if (isDown('bomb') && g.bombs > 0 && !g._bombCooldown) {
      g._bombCooldown = true;
      g.bombs--;
      // kill all on screen
      for (const e of g.enemies) {
        g.score += e.score;
        spawnParticles(e.x + e.w / 2, e.y + e.h / 2, e.color, 10, 'explode');
      }
      g.enemies = [];
      // flash
      g._flashTimer = 0.25;
      setTimeout(() => { g._bombCooldown = false; }, 500);
    }
    if (!isDown('bomb')) g._bombCooldown = false;

    // -- bullets --
    for (const b of g.bullets) {
      const angle = b.angle || 0;
      b.x += Math.sin(angle) * BULLET_SPEED;
      b.y -= Math.cos(angle) * BULLET_SPEED;
    }
    g.bullets = g.bullets.filter(b => b.y + b.h > -10 && b.x > -20 && b.x < CW + 20);

    // -- enemy spawn --
    g.spawnTimer -= dt * 1000;
    if (g.spawnTimer <= 0) {
      g.spawnTimer = g.spawnInterval;
      spawnEnemy();
    }

    // -- enemies --
    for (const e of g.enemies) {
      e.y += e.speed;
      e.anim += dt * 3;
      e.x += Math.sin(e.anim) * e.wobble;
    }

    // -- bullet ↔ enemy --
    const deadBullets = new Set();
    const deadEnemies = new Set();
    for (let bi = 0; bi < g.bullets.length; bi++) {
      const b = g.bullets[bi];
      for (let ei = 0; ei < g.enemies.length; ei++) {
        const e = g.enemies[ei];
        if (deadEnemies.has(ei)) continue;
        if (aabb(b, e)) {
          deadBullets.add(bi);
          e.hp--;
          spawnParticles(b.x, b.y, '#fbbf24', 3, 'spark');
          if (e.hp <= 0) {
            deadEnemies.add(ei);
            // combo
            g.combo++;
            g.comboTimer = COMBO_TIMEOUT;
            const mult = Math.min(g.combo, 10);
            const pts = e.score * mult;
            g.score += pts;
            addFloatText(e.x + e.w / 2, e.y, `+${pts}`, mult > 3 ? '#fbbf24' : '#fff');
            if (g.combo > 3) addFloatText(e.x + e.w / 2, e.y - 14, `x${g.combo} COMBO!`, '#f472b6');
            spawnParticles(e.x + e.w / 2, e.y + e.h / 2, e.color, 12, 'explode');
            // chance powerup
            if (Math.random() < POWERUP_CHANCE) spawnPowerup(e.x + e.w / 2, e.y + e.h / 2);
          }
          break;
        }
      }
    }
    g.bullets = g.bullets.filter((_, i) => !deadBullets.has(i));
    g.enemies = g.enemies.filter((_, i) => !deadEnemies.has(i));

    // -- combo timer --
    if (g.combo > 0) {
      g.comboTimer -= dt * 1000;
      if (g.comboTimer <= 0) g.combo = 0;
    }

    // -- enemy ↔ player --
    const shielded = now < p.shieldUntil;
    const inv = now < p.invUntil;
    for (let i = g.enemies.length - 1; i >= 0; i--) {
      const e = g.enemies[i];
      if (aabb(p, e)) {
        spawnParticles(e.x + e.w / 2, e.y + e.h / 2, e.color, 10, 'explode');
        g.enemies.splice(i, 1);
        if (inv) continue;
        if (shielded) { p.shieldUntil = 0; spawnParticles(p.x + p.w / 2, p.y, '#3b82f6', 12, 'explode'); continue; }
        g.lives--;
        g.combo = 0;
        p.invUntil = now + 1500;
        spawnParticles(p.x + p.w / 2, p.y + p.h / 2, '#ef4444', 15, 'explode');
        if (g.lives <= 0) { g.running = false; return; }
      }
    }

    // -- enemies off screen --
    g.enemies = g.enemies.filter(e => e.y < CH + 40);

    // -- powerups --
    for (const pu of g.powerups) { pu.y += pu.vy; pu.anim += dt * 4; }
    for (let i = g.powerups.length - 1; i >= 0; i--) {
      const pu = g.powerups[i];
      if (aabb(p, pu)) {
        g.powerups.splice(i, 1);
        applyPowerup(pu.type, now);
        spawnParticles(pu.x + pu.w / 2, pu.y + pu.h / 2, PU[pu.type].color, 8, 'explode');
        addFloatText(pu.x, pu.y, PU[pu.type].char, PU[pu.type].color);
      }
    }
    g.powerups = g.powerups.filter(pu => pu.y < CH + 30);

    // -- particles --
    for (const pt of g.particles) {
      pt.x += pt.vx; pt.y += pt.vy; pt.life -= dt;
    }
    g.particles = g.particles.filter(pt => pt.life > 0);

    // -- float texts --
    for (const ft of g.floatTexts) { ft.y -= 40 * dt; ft.life -= dt; }
    g.floatTexts = g.floatTexts.filter(ft => ft.life > 0);

    // -- flash --
    if (g._flashTimer > 0) g._flashTimer -= dt;

    // -- difficulty scaling --
    g.levelTimer += dt;
    if (g.levelTimer > 15) {
      g.levelTimer = 0;
      g.level++;
      g.spawnInterval = Math.max(250, g.spawnInterval - 80);
      g.enemySpeed = Math.min(5, g.enemySpeed + 0.2);
      addFloatText(CW / 2, CH / 2, `⬆ Lv.${g.level}`, '#a5b4fc');
    }
  }

  function applyPowerup(type, now) {
    const p = g.player;
    switch (type) {
      case 'life':   g.lives = Math.min(g.lives + 1, 5); break;
      case 'triple': p.tripleUntil = now + 6000; break;
      case 'bomb':   g.bombs = Math.min(g.bombs + 1, BOMB_MAX); break;
      case 'speed':  p.speedUntil = now + 5000; break;
      case 'shield': p.shieldUntil = now + 7000; break;
    }
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // ---------- render ----------
  function render() {
    ctx.clearRect(0, 0, CW, CH);

    // bg
    ctx.fillStyle = '#06060f';
    ctx.fillRect(0, 0, CW, CH);

    // stars
    for (const s of stars) {
      s.y += s.s * 0.6;
      if (s.y > CH) { s.y = 0; s.x = Math.random() * CW; }
      s.b += 0.02;
      ctx.globalAlpha = 0.3 + Math.sin(s.b) * 0.3;
      ctx.fillStyle = '#fff';
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    if (!g) return;

    // bomb flash
    if (g._flashTimer > 0) {
      ctx.fillStyle = `rgba(255,255,255,${g._flashTimer * 2})`;
      ctx.fillRect(0, 0, CW, CH);
    }

    // powerups
    ctx.font = '18px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const pu of g.powerups) {
      const scale = 1 + Math.sin(pu.anim) * 0.15;
      ctx.save();
      ctx.translate(pu.x + pu.w / 2, pu.y + pu.h / 2);
      ctx.scale(scale, scale);
      ctx.fillText(PU[pu.type].char, 0, 0);
      ctx.restore();
      // glow
      ctx.fillStyle = PU[pu.type].color + '22';
      ctx.beginPath();
      ctx.arc(pu.x + pu.w / 2, pu.y + pu.h / 2, 14, 0, Math.PI * 2);
      ctx.fill();
    }

    // bullets
    for (const b of g.bullets) {
      // glow
      const grd = ctx.createRadialGradient(b.x + b.w / 2, b.y, 1, b.x + b.w / 2, b.y, 10);
      grd.addColorStop(0, 'rgba(99,230,255,.5)');
      grd.addColorStop(1, 'transparent');
      ctx.fillStyle = grd;
      ctx.fillRect(b.x - 8, b.y - 8, b.w + 16, b.h + 16);
      // core
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = '#fff';
      ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    }

    // enemies
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const e of g.enemies) {
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fillRect(e.x + 2, e.y + 2, e.w, e.h);
      // emoji
      ctx.font = `${e.w}px serif`;
      ctx.fillText(e.char, e.x + e.w / 2, e.y + e.h / 2);
      // hp bar (if > 1 max hp)
      if (e.maxHp > 1) {
        const bw = e.w;
        const bh = 3;
        const by = e.y - 6;
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        ctx.fillRect(e.x, by, bw, bh);
        ctx.fillStyle = e.color;
        ctx.fillRect(e.x, by, bw * (e.hp / e.maxHp), bh);
      }
    }

    // player
    const p = g.player;
    const now = performance.now();
    const blink = now < p.invUntil && Math.floor(now / 80) % 2;
    if (!blink) {
      // engine glow
      const eGlow = ctx.createRadialGradient(p.x + p.w / 2, p.y + p.h + 4, 1, p.x + p.w / 2, p.y + p.h + 4, 14);
      eGlow.addColorStop(0, 'rgba(251,191,36,.6)');
      eGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = eGlow;
      ctx.beginPath();
      ctx.arc(p.x + p.w / 2, p.y + p.h + 4, 14 + Math.sin(now * 0.01) * 3, 0, Math.PI * 2);
      ctx.fill();
      // body triangle
      ctx.fillStyle = now < p.tripleUntil ? '#818cf8' : '#6366f1';
      ctx.beginPath();
      ctx.moveTo(p.x + p.w / 2, p.y);
      ctx.lineTo(p.x, p.y + p.h);
      ctx.lineTo(p.x + p.w, p.y + p.h);
      ctx.closePath();
      ctx.fill();
      // cockpit
      ctx.fillStyle = '#c7d2fe';
      ctx.beginPath();
      ctx.moveTo(p.x + p.w / 2, p.y + 6);
      ctx.lineTo(p.x + p.w * 0.35, p.y + p.h * 0.65);
      ctx.lineTo(p.x + p.w * 0.65, p.y + p.h * 0.65);
      ctx.closePath();
      ctx.fill();
      // wings
      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(p.x - 6, p.y + p.h * 0.6, 8, 4);
      ctx.fillRect(p.x + p.w - 2, p.y + p.h * 0.6, 8, 4);
      // shield effect
      if (now < p.shieldUntil) {
        ctx.strokeStyle = `rgba(59,130,246,${0.4 + Math.sin(now * 0.005) * 0.2})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x + p.w / 2, p.y + p.h / 2, p.w * 0.8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // particles
    for (const pt of g.particles) {
      ctx.globalAlpha = Math.max(0, pt.life * 2);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * pt.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // float texts
    ctx.textAlign = 'center';
    for (const ft of g.floatTexts) {
      ctx.globalAlpha = Math.min(1, ft.life * 2);
      ctx.font = 'bold 14px "Segoe UI", sans-serif';
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- game loop ----------
  let rafId = null;

  function loop(ts) {
    rafId = requestAnimationFrame(loop);
    if (!g) { render(); return; }

    const dt = Math.min((ts - g.time) / 1000, 0.05);
    g.time = ts;

    if (g.running) {
      update(dt);
      syncAlpine();
    }
    render();

    if (!g.running) {
      syncAlpine();
      // show game over by setting Alpine state
      if (window._alpineUI) window._alpineUI.onGameOver();
    }
  }

  function syncAlpine() {
    if (!window._alpineUI || !g) return;
    const a = window._alpineUI;
    a.score = g.score;
    a.lives = g.lives;
    a.level = g.level;
    a.combo = g.combo;
  }

  // start render loop immediately (stars bg)
  rafId = requestAnimationFrame(loop);

  // ---------- Alpine component ----------
  document.addEventListener('alpine:init', () => {
    Alpine.data('gameUI', () => ({
      state: 'menu',
      score: 0,
      lives: 3,
      level: 1,
      combo: 0,
      best: +localStorage.getItem('shooter_best') || 0,
      isNewRecord: false,
      touchInput,

      init() {
        window._alpineUI = this;
      },

      start() {
        g = newGame();
        this.state = 'playing';
        this.score = 0;
        this.lives = 3;
        this.level = 1;
        this.combo = 0;
        this.isNewRecord = false;
      },

      onGameOver() {
        this.state = 'gameover';
        if (this.score > this.best) {
          this.best = this.score;
          this.isNewRecord = true;
          localStorage.setItem('shooter_best', String(this.best));
        }
      },
    }));
  });

  // keyboard shortcuts at menu/gameover
  document.addEventListener('keydown', e => {
    if (!window._alpineUI) return;
    const a = window._alpineUI;
    if (e.key === 'Escape' && a.state === 'playing') { g.running = false; }
    if ((e.key === 'Enter' || e.code === 'Space') && (a.state === 'menu' || a.state === 'gameover')) {
      e.preventDefault(); a.start();
    }
  });
})();

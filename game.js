// Dungeon Looter — a small top-down dungeon crawler with a loot system.
(function () {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const TILE = 32;
  const MAP_W = 40;
  const MAP_H = 30;

  const TILE_WALL = 0;
  const TILE_FLOOR = 1;
  const TILE_STAIRS = 2;

  const RARITY_COLOR = {
    common: "#cfcfcf",
    uncommon: "#57d16a",
    rare: "#4aa3ff",
    epic: "#c060ff",
  };

  // ---------- Utility ----------
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

  function hexToRgb(hex) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `${r},${g},${b}`;
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function weightedPick(list) {
    const total = list.reduce((s, i) => s + i.weight, 0);
    let r = rand(0, total);
    for (const item of list) {
      if (r < item.weight) return item;
      r -= item.weight;
    }
    return list[list.length - 1];
  }

  let logSeq = 0;
  function log(msg) {
    const el = document.getElementById("logList");
    const div = document.createElement("div");
    div.textContent = msg;
    el.appendChild(div);
    logSeq++;
    while (el.children.length > 40) el.removeChild(el.firstChild);
  }

  // ---------- Loot ----------
  const LOOT_TABLE = [
    { name: "Gold Pouch", type: "gold", rarity: "common", weight: 40, min: 5, max: 20 },
    { name: "Health Potion", type: "potion", rarity: "common", weight: 26, heal: 30 },
    { name: "Rusty Sword", type: "weapon", rarity: "common", weight: 16, atk: 2 },
    { name: "Wooden Buckler", type: "armor", rarity: "common", weight: 14, def: 2 },
    { name: "Steel Sword", type: "weapon", rarity: "uncommon", weight: 9, atk: 5 },
    { name: "Chainmail Vest", type: "armor", rarity: "uncommon", weight: 8, def: 4 },
    { name: "Greater Health Potion", type: "potion", rarity: "uncommon", weight: 7, heal: 60 },
    { name: "Enchanted Blade", type: "weapon", rarity: "rare", weight: 3, atk: 10 },
    { name: "Knight's Plate", type: "armor", rarity: "rare", weight: 3, def: 9 },
    { name: "Dragonfang", type: "weapon", rarity: "epic", weight: 1, atk: 18 },
    { name: "Dragon Scale Armor", type: "armor", rarity: "epic", weight: 1, def: 16 },
  ];

  let itemUid = 1;
  function rollLoot() {
    const base = weightedPick(LOOT_TABLE);
    const item = { uid: itemUid++, name: base.name, type: base.type, rarity: base.rarity };
    if (base.type === "gold") item.amount = randInt(base.min, base.max);
    if (base.type === "potion") item.heal = base.heal;
    if (base.type === "weapon") item.atk = base.atk;
    if (base.type === "armor") item.def = base.def;
    return item;
  }

  // ---------- Effects (particles, screen shake, transitions) ----------
  let particles = [];
  const shake = { time: 0, magnitude: 0 };
  let transitionAlpha = 0;
  const ATTACK_ANIM_DURATION = 0.22;

  function spawnParticles(x, y, count, opts) {
    const {
      colors = ["255,255,255"],
      speed = 60,
      life = 0.4,
      size = 3,
      gravity = 0,
      spread = Math.PI * 2,
      angle = 0,
    } = opts;
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spread / 2, spread / 2);
      const s = rand(speed * 0.4, speed);
      particles.push({
        type: "dot",
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life, maxLife: life,
        size: rand(size * 0.6, size * 1.4),
        color: colors[randInt(0, colors.length - 1)],
        gravity,
      });
    }
  }

  function spawnText(x, y, text, color) {
    particles.push({
      type: "text",
      x, y,
      vx: rand(-8, 8),
      vy: -42,
      life: 0.8,
      maxLife: 0.8,
      text,
      color,
      gravity: 60,
    });
  }

  function triggerShake(magnitude, duration) {
    shake.magnitude = Math.max(shake.magnitude, magnitude);
    shake.time = Math.max(shake.time, duration);
  }

  function updateEffects(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);

    if (shake.time > 0) {
      shake.time -= dt;
      if (shake.time <= 0) { shake.time = 0; shake.magnitude = 0; }
    }

    if (transitionAlpha > 0) transitionAlpha = Math.max(0, transitionAlpha - dt / 0.4);
  }

  function renderParticles(camX, camY) {
    for (const p of particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      const sx = p.x - camX;
      const sy = p.y - camY;
      ctx.globalAlpha = alpha;
      if (p.type === "text") {
        ctx.fillStyle = p.color;
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(p.text, sx, sy);
      } else {
        ctx.fillStyle = `rgb(${p.color})`;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- Dungeon generation ----------
  function createGrid(w, h, fill) {
    const grid = [];
    for (let y = 0; y < h; y++) {
      grid.push(new Array(w).fill(fill));
    }
    return grid;
  }

  function carveRoom(grid, room) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        grid[y][x] = TILE_FLOOR;
      }
    }
  }

  function carveCorridor(grid, x1, y1, x2, y2) {
    let x = x1, y = y1;
    const horizontalFirst = Math.random() < 0.5;
    if (horizontalFirst) {
      while (x !== x2) { grid[y][x] = TILE_FLOOR; x += x < x2 ? 1 : -1; }
      while (y !== y2) { grid[y][x] = TILE_FLOOR; y += y < y2 ? 1 : -1; }
    } else {
      while (y !== y2) { grid[y][x] = TILE_FLOOR; y += y < y2 ? 1 : -1; }
      while (x !== x2) { grid[y][x] = TILE_FLOOR; x += x < x2 ? 1 : -1; }
    }
    grid[y][x] = TILE_FLOOR;
  }

  function roomsOverlap(a, b, pad) {
    return (
      a.x - pad < b.x + b.w &&
      a.x + a.w + pad > b.x &&
      a.y - pad < b.y + b.h &&
      a.y + a.h + pad > b.y
    );
  }

  function generateDungeon(depth) {
    const grid = createGrid(MAP_W, MAP_H, TILE_WALL);
    const rooms = [];
    const maxRooms = 9;
    let attempts = 0;

    while (rooms.length < maxRooms && attempts < 200) {
      attempts++;
      const w = randInt(4, 8);
      const h = randInt(4, 7);
      const x = randInt(1, MAP_W - w - 2);
      const y = randInt(1, MAP_H - h - 2);
      const room = { x, y, w, h };
      if (rooms.some((r) => roomsOverlap(room, r, 1))) continue;
      carveRoom(grid, room);
      if (rooms.length > 0) {
        const prev = rooms[rooms.length - 1];
        const cx1 = Math.floor(prev.x + prev.w / 2);
        const cy1 = Math.floor(prev.y + prev.h / 2);
        const cx2 = Math.floor(room.x + room.w / 2);
        const cy2 = Math.floor(room.y + room.h / 2);
        carveCorridor(grid, cx1, cy1, cx2, cy2);
      }
      rooms.push(room);
    }

    const startRoom = rooms[0];
    const stairsRoom = rooms[rooms.length - 1];
    const stairsX = Math.floor(stairsRoom.x + stairsRoom.w / 2);
    const stairsY = Math.floor(stairsRoom.y + stairsRoom.h / 2);
    grid[stairsY][stairsX] = TILE_STAIRS;

    const chests = [];
    const enemies = [];
    const enemyTypes = [
      { name: "Rat", hp: 12, atk: 2, color: "#8a7358", speed: 60 },
      { name: "Skeleton", hp: 20, atk: 4, color: "#d8d3c4", speed: 50 },
      { name: "Goblin", hp: 16, atk: 3, color: "#5fa864", speed: 70 },
      { name: "Ogre", hp: 40, atk: 7, color: "#7a4a4a", speed: 40 },
    ];

    rooms.forEach((room, idx) => {
      if (idx === 0) return; // no loot/enemies in start room
      if (Math.random() < 0.55) {
        chests.push({
          id: "chest_" + idx,
          x: (room.x + randInt(1, room.w - 2)) * TILE + TILE / 2,
          y: (room.y + randInt(1, room.h - 2)) * TILE + TILE / 2,
          opened: false,
        });
      }
      const enemyCount = randInt(0, room === stairsRoom ? 2 : 1) + (depth > 2 ? 1 : 0);
      for (let i = 0; i < enemyCount; i++) {
        const typeIndex = Math.min(enemyTypes.length - 1, randInt(0, Math.floor(depth / 2)));
        const t = enemyTypes[typeIndex];
        const scale = 1 + (depth - 1) * 0.25;
        enemies.push({
          uid: "enemy_" + idx + "_" + i,
          name: t.name,
          color: t.color,
          colorRgb: hexToRgb(t.color),
          x: (room.x + randInt(1, room.w - 2)) * TILE + TILE / 2,
          y: (room.y + randInt(1, room.h - 2)) * TILE + TILE / 2,
          hp: Math.round(t.hp * scale),
          maxHp: Math.round(t.hp * scale),
          atk: Math.round(t.atk * scale),
          speed: t.speed,
          radius: 12,
          attackCooldown: 0,
          alive: true,
          hitFlash: 0,
        });
      }
    });

    return {
      grid,
      rooms,
      chests,
      enemies,
      startX: (startRoom.x + Math.floor(startRoom.w / 2)) * TILE + TILE / 2,
      startY: (startRoom.y + Math.floor(startRoom.h / 2)) * TILE + TILE / 2,
      stairsX: stairsX * TILE + TILE / 2,
      stairsY: stairsY * TILE + TILE / 2,
    };
  }

  function isWall(grid, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    return grid[ty][tx] === TILE_WALL;
  }

  // ---------- Player ----------
  const player = {
    x: 0, y: 0,
    radius: 12,
    speed: 160,
    hp: 30,
    maxHp: 30,
    baseAtk: 3,
    baseDef: 0,
    gold: 0,
    inventory: [],
    equippedWeapon: null,
    equippedArmor: null,
    attackCooldown: 0,
    attackAnimTimer: 0,
    invulnerable: 0,
    facing: { x: 0, y: 1 },
    animTime: 0,
    isMoving: false,
  };

  function playerAtk() { return player.baseAtk + (player.equippedWeapon ? player.equippedWeapon.atk : 0); }
  function playerDef() { return player.baseDef + (player.equippedArmor ? player.equippedArmor.def : 0); }

  function addToInventory(item) {
    if (item.type === "gold") {
      player.gold += item.amount;
      log(`Picked up ${item.amount} gold.`);
      spawnText(player.x, player.y - 22, `+${item.amount}g`, "#f0c419");
      spawnParticles(player.x, player.y, 8, { colors: ["240,196,25"], speed: 70, life: 0.35, size: 2 });
      return;
    }
    if (item.type === "potion") {
      const existing = player.inventory.find((i) => i.type === "potion" && i.name === item.name);
      if (existing) { existing.qty += 1; }
      else { item.qty = 1; player.inventory.push(item); }
      log(`Found ${item.name}.`);
      spawnParticles(player.x, player.y, 8, { colors: ["120,220,120"], speed: 60, life: 0.4, size: 2.5 });
      return;
    }
    player.inventory.push(item);
    log(`Found ${item.name} (${item.rarity}).`);
    spawnParticles(player.x, player.y, 10, { colors: [hexToRgb(RARITY_COLOR[item.rarity])], speed: 75, life: 0.45, size: 2.5 });
  }

  function useItem(uid) {
    const idx = player.inventory.findIndex((i) => i.uid === uid);
    if (idx === -1) return;
    const item = player.inventory[idx];
    if (item.type === "potion") {
      player.hp = clamp(player.hp + item.heal, 0, player.maxHp);
      log(`Drank ${item.name}, healed ${item.heal} HP.`);
      item.qty -= 1;
      if (item.qty <= 0) player.inventory.splice(idx, 1);
      spawnText(player.x, player.y - 22, `+${item.heal} HP`, "#7ee787");
      spawnParticles(player.x, player.y, 12, { colors: ["120,230,140"], speed: 55, life: 0.5, size: 2.5, gravity: -30 });
    } else if (item.type === "weapon") {
      const old = player.equippedWeapon;
      player.equippedWeapon = item;
      player.inventory.splice(idx, 1);
      if (old) player.inventory.push(old);
      log(`Equipped ${item.name}.`);
      spawnParticles(player.x, player.y, 8, { colors: [hexToRgb(RARITY_COLOR[item.rarity])], speed: 50, life: 0.35, size: 2 });
    } else if (item.type === "armor") {
      const old = player.equippedArmor;
      player.equippedArmor = item;
      player.inventory.splice(idx, 1);
      if (old) player.inventory.push(old);
      log(`Equipped ${item.name}.`);
      spawnParticles(player.x, player.y, 8, { colors: [hexToRgb(RARITY_COLOR[item.rarity])], speed: 50, life: 0.35, size: 2 });
    }
    refreshUI();
  }
  window.useItem = useItem;

  // ---------- Game state ----------
  let depth = 1;
  let dungeon = generateDungeon(depth);
  player.x = dungeon.startX;
  player.y = dungeon.startY;

  const keys = {};
  window.addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (e.code === "Space") { e.preventDefault(); tryAttack(); }
    if (e.code === "KeyE") { tryInteract(); }
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  function tileAt(px, py) {
    return { tx: Math.floor(px / TILE), ty: Math.floor(py / TILE) };
  }

  function moveEntity(entity, dx, dy, dt) {
    const moveX = dx * entity.speed * dt;
    const moveY = dy * entity.speed * dt;

    let nx = entity.x + moveX;
    if (!collides(nx, entity.y, entity.radius)) entity.x = nx;
    let ny = entity.y + moveY;
    if (!collides(entity.x, ny, entity.radius)) entity.y = ny;
  }

  function collides(px, py, radius) {
    const left = Math.floor((px - radius) / TILE);
    const right = Math.floor((px + radius) / TILE);
    const top = Math.floor((py - radius) / TILE);
    const bottom = Math.floor((py + radius) / TILE);
    for (let ty = top; ty <= bottom; ty++) {
      for (let tx = left; tx <= right; tx++) {
        if (isWall(dungeon.grid, tx, ty)) return true;
      }
    }
    return false;
  }

  function tryAttack() {
    if (player.attackCooldown > 0) return;
    player.attackCooldown = 0.4;
    player.attackAnimTimer = ATTACK_ANIM_DURATION;
    const range = 40;
    let hitAny = false;
    for (const enemy of dungeon.enemies) {
      if (!enemy.alive) continue;
      if (dist(player.x, player.y, enemy.x, enemy.y) <= range) {
        hitAny = true;
        const dmg = Math.max(1, playerAtk() - Math.floor(Math.random() * 2));
        enemy.hp -= dmg;
        enemy.hitFlash = 0.15;
        spawnText(enemy.x, enemy.y - 14, `-${dmg}`, "#ffdd55");
        spawnParticles(enemy.x, enemy.y, 6, { colors: ["255,255,255", "255,210,120"], speed: 90, life: 0.25, size: 2.5 });
        if (enemy.hp <= 0) {
          enemy.alive = false;
          log(`Defeated ${enemy.name}!`);
          spawnParticles(enemy.x, enemy.y, 16, { colors: [enemy.colorRgb, "255,255,255"], speed: 130, life: 0.5, size: 3, gravity: 60 });
          if (Math.random() < 0.7) {
            const loot = rollLoot();
            addToInventory(loot);
          }
        }
      }
    }
    if (hitAny) triggerShake(2, 0.08);
  }

  function tryInteract() {
    for (const chest of dungeon.chests) {
      if (chest.opened) continue;
      if (dist(player.x, player.y, chest.x, chest.y) <= 36) {
        chest.opened = true;
        spawnParticles(chest.x, chest.y, 14, { colors: ["230,190,60", "255,215,80"], speed: 90, life: 0.5, size: 3, gravity: 100 });
        const rolls = randInt(1, 3);
        for (let i = 0; i < rolls; i++) addToInventory(rollLoot());
        log("Opened a chest.");
        refreshUI();
        return;
      }
    }
    if (dist(player.x, player.y, dungeon.stairsX, dungeon.stairsY) <= 36) {
      descend();
    }
  }

  function descend() {
    depth += 1;
    dungeon = generateDungeon(depth);
    player.x = dungeon.startX;
    player.y = dungeon.startY;
    document.getElementById("depthLabel").textContent = `Depth ${depth}`;
    log(`Descended to depth ${depth}.`);
    transitionAlpha = 1;
  }

  function updateEnemies(dt) {
    for (const enemy of dungeon.enemies) {
      if (!enemy.alive) continue;
      if (enemy.hitFlash > 0) enemy.hitFlash -= dt;
      if (enemy.attackCooldown > 0) enemy.attackCooldown -= dt;

      const d = dist(enemy.x, enemy.y, player.x, player.y);
      if (d < 220 && d > 30) {
        const dx = (player.x - enemy.x) / d;
        const dy = (player.y - enemy.y) / d;
        const moveX = dx * enemy.speed * dt;
        const moveY = dy * enemy.speed * dt;
        if (!collides(enemy.x + moveX, enemy.y, enemy.radius)) enemy.x += moveX;
        if (!collides(enemy.x, enemy.y + moveY, enemy.radius)) enemy.y += moveY;
      } else if (d <= 30 && enemy.attackCooldown <= 0 && player.invulnerable <= 0) {
        enemy.attackCooldown = 1.0;
        const dmg = Math.max(1, enemy.atk - playerDef());
        player.hp -= dmg;
        player.invulnerable = 0.5;
        log(`${enemy.name} hits you for ${dmg}.`);
        spawnText(player.x, player.y - 22, `-${dmg}`, "#ff6b6b");
        spawnParticles(player.x, player.y, 6, { colors: ["255,90,90"], speed: 80, life: 0.25, size: 2.5 });
        triggerShake(4, 0.2);
      }
    }
  }

  // ---------- Main loop ----------
  let lastTime = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (player.hp > 0) {
      update(dt);
    }
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    let dx = 0, dy = 0;
    if (keys["KeyW"] || keys["ArrowUp"]) dy -= 1;
    if (keys["KeyS"] || keys["ArrowDown"]) dy += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) dx -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) dx += 1;
    player.isMoving = dx !== 0 || dy !== 0;
    if (player.isMoving) {
      const len = Math.hypot(dx, dy);
      dx /= len; dy /= len;
      player.facing = { x: dx, y: dy };
      moveEntity(player, dx, dy, dt);
      player.animTime += dt;
    }

    if (player.attackCooldown > 0) player.attackCooldown -= dt;
    if (player.attackAnimTimer > 0) player.attackAnimTimer = Math.max(0, player.attackAnimTimer - dt);
    if (player.invulnerable > 0) player.invulnerable -= dt;

    updateEnemies(dt);
    updateEffects(dt);

    if (player.hp <= 0) {
      player.hp = 0;
      log("You have died. Refresh to try again.");
    }

    refreshUI();
  }

  // ---------- Rendering ----------
  function drawPlayerSprite(cx, cy, facing, moving, animTime, attackTimer, invulnerable, weapon) {
    const angle = Math.atan2(facing.y, facing.x);
    const perp = { x: -facing.y, y: facing.x };

    // shadow
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 12, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // feet (alternate stepping while moving)
    const stepPhase = moving ? Math.sin(animTime * 12) : 0;
    for (const side of [-1, 1]) {
      const fx = cx + perp.x * 6 * side + facing.x * (side * stepPhase * 4);
      const fy = cy + perp.y * 6 * side + facing.y * (side * stepPhase * 4) + 9;
      ctx.fillStyle = "#2c2418";
      ctx.beginPath();
      ctx.ellipse(fx, fy, 3.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const bounce = moving ? Math.abs(Math.sin(animTime * 12)) * 2 : 0;
    const bodyCy = cy - bounce;
    const flash = invulnerable > 0 && Math.floor(invulnerable * 20) % 2 === 0;

    // body (tunic)
    ctx.fillStyle = flash ? "#ffffff" : "#4aa3ff";
    ctx.strokeStyle = "#173350";
    ctx.lineWidth = 2;
    roundRect(ctx, cx - 9, bodyCy - 9, 18, 20, 6);
    ctx.fill();
    ctx.stroke();

    // head
    ctx.fillStyle = flash ? "#ffffff" : "#e8b98c";
    ctx.beginPath();
    ctx.arc(cx, bodyCy - 12, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#5c3d28";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // eyes, looking in the facing direction
    ctx.fillStyle = "#241a12";
    const eyeOffsetX = facing.x * 3;
    const eyeOffsetY = facing.y * 3;
    ctx.beginPath();
    ctx.arc(cx - 2.5 + eyeOffsetX, bodyCy - 12 + eyeOffsetY, 1.3, 0, Math.PI * 2);
    ctx.arc(cx + 2.5 + eyeOffsetX, bodyCy - 12 + eyeOffsetY, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // weapon: rests at an idle angle, swings through an arc on attack
    const armLen = 20;
    let weaponAngle = angle + 0.5;
    if (attackTimer > 0) {
      const t = 1 - attackTimer / ATTACK_ANIM_DURATION;
      weaponAngle = angle + (-1 + 2 * t) * 1.1;
    }
    const handX = cx + facing.x * 6 - perp.x * 6;
    const handY = bodyCy + facing.y * 6 - perp.y * 6;
    const tipX = handX + Math.cos(weaponAngle) * armLen;
    const tipY = handY + Math.sin(weaponAngle) * armLen;
    ctx.strokeStyle = weapon ? RARITY_COLOR[weapon.rarity] : "#9a9a9a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(handX, handY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = "#4a3a2a";
    ctx.beginPath();
    ctx.arc(handX, handY, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let camX = clamp(player.x - canvas.width / 2, 0, MAP_W * TILE - canvas.width);
    let camY = clamp(player.y - canvas.height / 2, 0, MAP_H * TILE - canvas.height);
    if (shake.time > 0) {
      camX += rand(-1, 1) * shake.magnitude;
      camY += rand(-1, 1) * shake.magnitude;
    }

    const startTx = Math.floor(camX / TILE);
    const endTx = Math.ceil((camX + canvas.width) / TILE);
    const startTy = Math.floor(camY / TILE);
    const endTy = Math.ceil((camY + canvas.height) / TILE);

    for (let ty = startTy; ty <= endTy; ty++) {
      for (let tx = startTx; tx <= endTx; tx++) {
        if (ty < 0 || tx < 0 || ty >= MAP_H || tx >= MAP_W) continue;
        const tile = dungeon.grid[ty][tx];
        const sx = tx * TILE - camX;
        const sy = ty * TILE - camY;
        if (tile === TILE_WALL) {
          ctx.fillStyle = "#17130f";
        } else if (tile === TILE_STAIRS) {
          ctx.fillStyle = "#8a6f2b";
        } else {
          ctx.fillStyle = "#3a3128";
        }
        ctx.fillRect(sx, sy, TILE, TILE);
        ctx.strokeStyle = "rgba(0,0,0,0.15)";
        ctx.strokeRect(sx, sy, TILE, TILE);
      }
    }

    // chests
    for (const chest of dungeon.chests) {
      const sx = chest.x - camX;
      const sy = chest.y - camY;
      ctx.fillStyle = chest.opened ? "#5a4a30" : "#c9a13b";
      ctx.fillRect(sx - 10, sy - 8, 20, 16);
      ctx.strokeStyle = "#3a2c14";
      ctx.strokeRect(sx - 10, sy - 8, 20, 16);
    }

    // enemies
    for (const enemy of dungeon.enemies) {
      if (!enemy.alive) continue;
      const sx = enemy.x - camX;
      const sy = enemy.y - camY;
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.beginPath();
      ctx.ellipse(sx, sy + enemy.radius * 0.8, enemy.radius * 0.9, enemy.radius * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      const squash = enemy.hitFlash > 0 ? 1 + (enemy.hitFlash / 0.15) * 0.3 : 1;
      ctx.fillStyle = enemy.hitFlash > 0 ? "#ffffff" : enemy.color;
      ctx.beginPath();
      ctx.ellipse(sx, sy, enemy.radius / squash, enemy.radius * squash, 0, 0, Math.PI * 2);
      ctx.fill();
      // hp bar
      const w = 24;
      ctx.fillStyle = "#000";
      ctx.fillRect(sx - w / 2, sy - enemy.radius - 10, w, 4);
      ctx.fillStyle = "#d63b3b";
      ctx.fillRect(sx - w / 2, sy - enemy.radius - 10, w * clamp(enemy.hp / enemy.maxHp, 0, 1), 4);
    }

    // player
    const psx = player.x - camX;
    const psy = player.y - camY;
    drawPlayerSprite(psx, psy, player.facing, player.isMoving, player.animTime, player.attackAnimTimer, player.invulnerable, player.equippedWeapon);

    renderParticles(camX, camY);

    if (transitionAlpha > 0) {
      ctx.fillStyle = `rgba(0,0,0,${transitionAlpha})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (player.hp <= 0) {
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e8dfce";
      ctx.font = "32px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("You Died", canvas.width / 2, canvas.height / 2);
      ctx.font = "16px sans-serif";
      ctx.fillText("Refresh the page to play again", canvas.width / 2, canvas.height / 2 + 30);
    }
  }

  // ---------- UI ----------
  let lastUISig = "";
  function refreshUI() {
    document.getElementById("hpFill").style.width = `${clamp((player.hp / player.maxHp) * 100, 0, 100)}%`;
    document.getElementById("hpText").textContent = `${Math.max(0, Math.round(player.hp))}/${player.maxHp}`;
    document.getElementById("atkText").textContent = playerAtk();
    document.getElementById("defText").textContent = playerDef();
    document.getElementById("goldText").textContent = player.gold;

    document.getElementById("equipWeapon").innerHTML = player.equippedWeapon
      ? `Weapon: <span class="rarity-${player.equippedWeapon.rarity}">${player.equippedWeapon.name}</span> (+${player.equippedWeapon.atk} atk)`
      : "Weapon: <em>none</em>";
    document.getElementById("equipArmor").innerHTML = player.equippedArmor
      ? `Armor: <span class="rarity-${player.equippedArmor.rarity}">${player.equippedArmor.name}</span> (+${player.equippedArmor.def} def)`
      : "Armor: <em>none</em>";

    const sig = JSON.stringify(player.inventory.map((i) => [i.uid, i.qty])) + player.equippedWeapon?.uid + player.equippedArmor?.uid;
    if (sig === lastUISig) return;
    lastUISig = sig;

    const invList = document.getElementById("invList");
    invList.innerHTML = "";
    if (player.inventory.length === 0) {
      const note = document.createElement("div");
      note.className = "empty-note";
      note.textContent = "Empty — go find some loot.";
      invList.appendChild(note);
    }
    for (const item of player.inventory) {
      const row = document.createElement("div");
      row.className = "item";
      let label = `<span class="rarity-${item.rarity}">${item.name}</span>`;
      if (item.type === "weapon") label += ` <span class="qty">+${item.atk} atk</span>`;
      if (item.type === "armor") label += ` <span class="qty">+${item.def} def</span>`;
      if (item.type === "potion") label += ` <span class="qty">x${item.qty} (+${item.heal} hp)</span>`;
      row.innerHTML = label;
      row.addEventListener("click", () => useItem(item.uid));
      invList.appendChild(row);
    }
  }

  document.getElementById("depthLabel").textContent = `Depth ${depth}`;
  refreshUI();
  requestAnimationFrame(loop);
})();

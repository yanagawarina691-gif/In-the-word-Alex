const CONFIG = {
  char: 22,
  line: 46,
  gridX: 30,
  gridY: 310,
  playerSize: 16,
  walkCharsPerSecond: 6,
  seaWalkCharsPerSecond: 7.2,
  rows: [
    "春江潮水连海平，海上明月共潮生。",
    "滟滟随波千万里，何处春江无月明。"
  ]
};

const els = {
  paper: document.getElementById("paper"),
  paperTint: document.getElementById("paperTint"),
  fx: document.getElementById("fx"),
  meta: document.getElementById("meta"),
  moon: document.getElementById("moon"),
  moonReflection: document.getElementById("moonReflection"),
  hint: document.getElementById("hint"),
  poem: document.getElementById("poem"),
  seaLine: document.getElementById("seaLine"),
  player: document.getElementById("player"),
  nextTransition: document.getElementById("nextTransition"),
  resetButton: document.getElementById("resetButton"),
};

const ctx = els.fx.getContext("2d");

let state;
let keys;
let lastTime = 0;
let hintTimer = 0;
let rafId = 0;

function freshState() {
  return {
    row: 0,
    col: 0,
    seaCol: 0,
    mode: "poem",
    direction: 0,
    yLift: 0,
    jumpVelocity: 0,
    isJumping: false,
    touched: new Set(),
    flags: {
      seaPreview: false,
      moonEcho: false,
      tideAwake: false,
      wavePush: false,
      wideBoost: false,
      moonBright: false,
      seaFinale: false,
      ended: false
    },
    seaGlyphs: [],
    clearedGaps: new Set(),
    seaProgress: 0,
    steps: 0,
    startedAt: performance.now(),
    pushUntil: 0,
    speedBoostUntil: 0,
    lastCrossed: null,
    lastHint: ""
  };
}

function boot() {
  keys = { left: false, right: false };
  buildPoem();
  bindInput();
  reset();
}

function reset() {
  cancelAnimationFrame(rafId);
  clearGeneratedSea();
  state = freshState();
  lastTime = performance.now();
  hintTimer = 0;
  els.paperTint.style.background = "#f7f6f2";
  els.meta.style.opacity = "1";
  els.meta.style.transform = "translateY(0)";
  els.moon.className = "moon arrived";
  els.moonReflection.className = "moon-reflection";
  els.poem.className = "poem";
  els.seaLine.className = "sea-line";
  els.player.className = "player";
  els.player.style.opacity = "";
  els.poem.style.opacity = "1";
  els.poem.style.transform = "";
  els.nextTransition.className = "next-transition";
  els.nextTransition.setAttribute("aria-hidden", "true");
  setHint("按住左右两侧，开始走", 2200);
  updateRows();
  updatePlayer();
  drawFx(0);
  rafId = requestAnimationFrame(loop);
}

function buildPoem() {
  els.poem.innerHTML = "";
  CONFIG.rows.forEach((line, rowIndex) => {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.row = String(rowIndex);
    [...line].forEach((char, colIndex) => {
      const span = document.createElement("span");
      span.className = "char";
      span.dataset.row = String(rowIndex);
      span.dataset.col = String(colIndex);
      span.textContent = char;
      row.appendChild(span);
    });
    els.poem.appendChild(row);
  });
}

function bindInput() {
  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      keys.left = true;
      event.preventDefault();
    }
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      keys.right = true;
      event.preventDefault();
    }
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w" || event.key === " ") {
      jump();
      event.preventDefault();
    }
    if (event.key.toLowerCase() === "r") reset();
  });

  window.addEventListener("keyup", (event) => {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") keys.left = false;
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") keys.right = false;
  });

  let touchStart = null;
  els.paper.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    els.paper.setPointerCapture(event.pointerId);
    touchStart = { x: event.clientX, y: event.clientY };
    setTouchDirection(event.clientX);
  });

  els.paper.addEventListener("pointermove", (event) => {
    if (!touchStart) return;
    const dx = event.clientX - touchStart.x;
    const dy = event.clientY - touchStart.y;
    if (Math.abs(dy) > 30 && Math.abs(dy) > Math.abs(dx) * 1.8 && dy < 0) {
      jump();
      touchStart = null;
      keys.left = false;
      keys.right = false;
      return;
    }
    setTouchDirection(event.clientX);
  });

  els.paper.addEventListener("pointerup", () => {
    touchStart = null;
    keys.left = false;
    keys.right = false;
  });

  els.paper.addEventListener("pointercancel", () => {
    touchStart = null;
    keys.left = false;
    keys.right = false;
  });

  els.resetButton.addEventListener("click", reset);
}

function setTouchDirection(clientX) {
  const rect = els.paper.getBoundingClientRect();
  const x = clientX - rect.left;
  keys.left = x < rect.width / 2;
  keys.right = !keys.left;
}

function jump() {
  if (state.mode !== "sea" || state.isJumping || state.flags.ended) return;
  state.jumpVelocity = 330;
  state.isJumping = true;
  els.player.classList.add("jump");
}

function loop(now) {
  const dt = Math.min(0.032, (now - lastTime) / 1000);
  lastTime = now;
  update(dt, now);
  render(now);
  rafId = requestAnimationFrame(loop);
}

function update(dt, now) {
  if (state.flags.ended) return;

  let input = Number(keys.right) - Number(keys.left);
  if (now < state.pushUntil) input = 1;
  state.direction = input;

  if (state.mode === "poem") updatePoemMovement(dt, now, input);
  if (state.mode === "sea") updateSeaMovement(dt, now, input);

  if (state.isJumping) {
    state.yLift += state.jumpVelocity * dt;
    state.jumpVelocity -= 920 * dt;
    if (state.yLift <= 0) {
      state.yLift = 0;
      state.jumpVelocity = 0;
      state.isJumping = false;
      els.player.classList.remove("jump");
    }
  }

  if (hintTimer && now > hintTimer) hideHint();
}

function updatePoemMovement(dt, now, input) {
  if (!input) return;
  const before = state.col;
  let speed = CONFIG.walkCharsPerSecond;
  if (now < state.speedBoostUntil) speed *= 1.3;
  state.col += input * speed * dt;

  const max = CONFIG.rows[state.row].length - 1;
  if (state.row === 1 && state.col > max) state.col = max;
  if (state.row === 0 && state.col > max) {
    if (state.flags.tideAwake) {
      state.row = 1;
      state.col = 0;
      state.lastCrossed = null;
      updateRows();
      setHint("随波去。", 1600);
    } else {
      state.col = max;
      setHint("潮还没有生。", 1600);
    }
  }
  if (state.row === 1 && state.col < 0) {
    state.row = 0;
    state.col = max;
    state.lastCrossed = null;
  }
  if (state.row === 0 && state.col < 0) state.col = 0;

  countSteps(before, state.col);
  detectCrossings(before, state.col, input, now);
}

function updateSeaMovement(dt, now, input) {
  if (!input) return;
  if (input < 0 && state.seaCol <= 0) return;
  const before = state.seaCol;
  state.seaCol = Math.max(0, state.seaCol + input * CONFIG.seaWalkCharsPerSecond * dt);
  countSteps(before, state.seaCol);
  state.seaProgress = Math.max(state.seaProgress, state.seaCol / 30);
  if (state.seaCol >= 30 && !state.flags.ended) beginNextTransition();
}

function detectCrossings(before, after, input, now) {
  if (!input) return;
  const min = Math.min(before, after);
  const max = Math.max(before, after);
  for (let col = Math.floor(min); col <= Math.ceil(max); col += 1) {
    if (col < min - 0.5 || col > max + 0.5) continue;
    if (input > 0 && before < col && after >= col) triggerAt(state.row, col, now);
    if (input < 0 && before > col && after <= col) triggerAt(state.row, col, now);
  }
}

function triggerAt(row, col, now) {
  const key = `${row}:${col}`;
  if (state.lastCrossed === key) return;
  state.lastCrossed = key;

  if (row === 0 && col === 5 && !state.flags.seaPreview) {
    state.flags.seaPreview = true;
    hitChars(0, [5, 6]);
    els.seaLine.classList.add("visible");
  }

  if (row === 0 && (col === 10 || col === 11) && !state.flags.moonEcho) {
    state.flags.moonEcho = true;
    hitChars(0, [10, 11]);
    pulseMoon("这一轮，刚才撞下来过", 2600);
  }

  if (row === 0 && (col === 13 || col === 14) && !state.flags.tideAwake) {
    state.flags.tideAwake = true;
    hitChars(0, [13, 14]);
    els.poem.classList.add("tide");
    updateRows();
    setHint("潮生了。", 1600);
  }

  if (row === 1 && (col === 2 || col === 3) && !state.flags.wavePush) {
    state.flags.wavePush = true;
    hitChars(1, [2, 3]);
    state.pushUntil = now + 1000;
  }

  if (row === 1 && (col === 4 || col === 5 || col === 6) && !state.flags.wideBoost) {
    state.flags.wideBoost = true;
    hitChars(1, [4, 5, 6]);
    state.speedBoostUntil = now + 1200;
  }

  if (row === 1 && (col === 13 || col === 14) && !state.flags.moonBright) {
    state.flags.moonBright = true;
    hitChars(1, [13, 14]);
    pulseMoon("回到海上。", 2400);
  }

  if (row === 0 && col === 8 && state.flags.moonBright && !state.flags.seaFinale) {
    startSeaFinale();
  }
}

function startSeaFinale() {
  state.flags.seaFinale = true;
  state.mode = "sea";
  state.seaCol = 0;
  state.col = 8;
  state.row = 0;
  state.lastCrossed = null;
  els.poem.classList.remove("tide");
  els.moon.classList.add("sea");
  els.moonReflection.classList.add("visible");
  els.player.classList.add("sea");
  createSeaGlyphBurst();
  setHint("一直游下去。", 2600);
}

function createSeaGlyphBurst() {
  const offsets = [
    { x: 0, y: 0, r: -8 },
    { x: 20, y: -8, r: 6 },
    { x: 42, y: 6, r: -4 },
    { x: 66, y: -12, r: 10 },
    { x: 94, y: 8, r: -12 }
  ];
  offsets.forEach((offset, index) => {
    const span = document.createElement("span");
    span.className = "sea-char";
    span.textContent = isGap(index) ? "" : "海";
    span.style.left = `${CONFIG.gridX + 8 * CONFIG.char + offset.x}px`;
    span.style.top = `${CONFIG.gridY + offset.y}px`;
    span.style.opacity = "0.68";
    span.style.transform = `rotate(${offset.r}deg) scale(${1 - index * 0.05})`;
    els.paper.appendChild(span);
    state.seaGlyphs.push(span);
    requestAnimationFrame(() => {
      span.style.transition = "transform 1900ms ease, opacity 1900ms ease, color 1200ms ease";
      span.style.opacity = "0";
      span.style.color = "#176b9b";
      span.style.transform = `translate(${20 + index * 18}px, ${18 + Math.sin(index) * 12}px) rotate(${offset.r + 18}deg) scale(0.48)`;
    });
  });
}

function clearGeneratedSea() {
  for (const span of state?.seaGlyphs || []) span.remove();
}

function isGap(index) {
  return false;
}

function seaColorFor(index) {
  if (index < 8) return "#20201e";
  if (index >= 24) return "#176b9b";
  const t = (index - 8) / 16;
  const from = [32, 32, 30];
  const to = [23, 107, 155];
  const rgb = from.map((v, i) => Math.round(v + (to[i] - v) * t));
  return `rgb(${rgb.join(",")})`;
}

function waveOffset(index) {
  return Math.sin(index * 0.9) * 6;
}

function countSteps(before, after) {
  const crossed = Math.abs(Math.floor(after) - Math.floor(before));
  state.steps += crossed;
}

function updateRows() {
  const rows = els.poem.querySelectorAll(".row");
  rows[1].classList.toggle("locked", !state.flags.tideAwake);
}

function hitChars(row, cols) {
  for (const col of cols) {
    const char = els.poem.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (!char) continue;
    char.classList.add("hit");
    setTimeout(() => char.classList.remove("hit"), 420);
  }
}

function pulseMoon(text, duration) {
  els.moon.classList.add("glow");
  setHint(text, duration);
  setTimeout(() => els.moon.classList.remove("glow"), 900);
}

function setHint(text, duration = 2200) {
  state.lastHint = text;
  els.hint.textContent = text;
  els.hint.classList.add("visible");
  hintTimer = performance.now() + duration;
}

function hideHint() {
  hintTimer = 0;
  els.hint.classList.remove("visible");
}

function updatePlayer() {
  const position = playerPosition();
  els.player.style.transform = `translate3d(${position.x}px, ${position.y - state.yLift}px, 0)`;
}

function playerPosition() {
  if (state.mode === "sea") {
    return {
      x: CONFIG.gridX + (8 + state.seaCol) * CONFIG.char + CONFIG.char / 2 - CONFIG.playerSize / 2,
      y: CONFIG.gridY + CONFIG.line * 0.67 - CONFIG.playerSize / 2
    };
  }
  return {
    x: CONFIG.gridX + state.col * CONFIG.char + CONFIG.char / 2 - CONFIG.playerSize / 2,
    y: CONFIG.gridY + state.row * CONFIG.line + CONFIG.line * 0.67 - CONFIG.playerSize / 2
  };
}

function render(now) {
  if (state.mode === "sea") {
    const t = Math.min(1, state.seaProgress);
    const bg = lerpColor([247, 246, 242], [158, 196, 214], Math.min(1, t * 1.35));
    const deep = lerpColor(bg, [23, 107, 155], Math.max(0, (t - 0.55) / 0.45));
    els.paperTint.style.background = `rgb(${deep.join(",")})`;
    els.meta.style.opacity = String(Math.max(0, 1 - t * 1.8));
    els.meta.style.transform = `translateY(${-18 * t}px)`;
    els.poem.style.transform = `translateX(${-Math.min(210, state.seaCol * CONFIG.char * 0.58)}px)`;
    updateGeneratedSea(now);
  } else {
    els.poem.style.transform = "";
  }
  if (!state.flags.ended) updatePlayer();
  drawFx(now);
}

function updateGeneratedSea(now) {
  for (let i = 0; i < state.seaGlyphs.length; i += 1) {
    const span = state.seaGlyphs[i];
    if (state.seaProgress > 0.65) span.style.opacity = "0";
  }
}

function drawFx(now) {
  ctx.clearRect(0, 0, els.fx.width, els.fx.height);
  if (state.flags.tideAwake && !state.flags.ended) drawTide(now);
  if (state.mode === "sea" || state.flags.ended) drawSeaWash();
}

function drawTide(now) {
  ctx.save();
  ctx.strokeStyle = "rgba(23, 107, 155, 0.22)";
  ctx.lineWidth = 1;
  for (let y = 356; y < 390; y += 12) {
    ctx.beginPath();
    for (let x = 28; x <= 384; x += 8) {
      const wave = Math.sin(x * 0.045 + now * 0.004 + y * 0.02) * 3;
      if (x === 28) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawSeaWash() {
  const t = Math.min(1, state.seaProgress);
  ctx.save();
  const wash = ctx.createLinearGradient(0, 120, 0, 732);
  wash.addColorStop(0, `rgba(158, 196, 214, ${0.06 + t * 0.08})`);
  wash.addColorStop(0.48, `rgba(23, 107, 155, ${0.08 + t * 0.16})`);
  wash.addColorStop(1, `rgba(7, 74, 115, ${0.10 + t * 0.22})`);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 412, 732);

  ctx.strokeStyle = `rgba(7, 74, 115, ${0.08 + t * 0.12})`;
  ctx.lineWidth = 1;
  const baseY = 378 - t * 58;
  for (let line = 0; line < 7; line += 1) {
    const y = baseY + line * 18;
    ctx.beginPath();
    for (let x = 24; x <= 388; x += 8) {
      const wave = Math.sin(x * 0.04 + line * 0.8 + t * 7) * (2.5 + t * 3.5);
      if (x === 24) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function lerpColor(from, to, t) {
  return from.map((value, index) => Math.round(value + (to[index] - value) * t));
}

function beginNextTransition() {
  state.flags.ended = true;
  els.paperTint.style.background = "#176b9b";
  els.meta.style.opacity = "0";
  els.poem.style.opacity = "0";
  state.seaGlyphs.forEach((span) => {
    span.style.opacity = "0";
  });
  els.player.classList.add("sea");
  els.player.classList.add("sink");
  els.moon.classList.add("sink");
  els.moonReflection.classList.add("deep");
  const position = playerPosition();
  els.player.style.transform = `translate3d(${position.x}px, ${position.y + 126}px, 0)`;
  els.nextTransition.classList.add("visible");
  els.nextTransition.setAttribute("aria-hidden", "false");
  hideHint();
  window.dispatchEvent(new CustomEvent("level2:complete", {
    detail: {
      nextLevel: "level3",
      carry: {
        moon: true,
        color: "sea-blue",
        from: "春江花月夜"
      },
      steps: state.steps,
      elapsedMs: Math.round(performance.now() - state.startedAt)
    }
  }));
}

boot();

async function holdFor(direction, ms) {
  keys.left = direction === "left";
  keys.right = direction === "right";
  await new Promise((resolve) => setTimeout(resolve, ms));
  keys.left = false;
  keys.right = false;
}

async function runAutoplayDemo() {
  await new Promise((resolve) => setTimeout(resolve, 700));
  await holdFor("right", 5900);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await holdFor("left", 3700);
  await new Promise((resolve) => setTimeout(resolve, 400));
  keys.right = true;
  const jumpAt = [1550, 2700, 3380];
  for (const ms of jumpAt) {
    setTimeout(jump, ms);
  }
  await new Promise((resolve) => setTimeout(resolve, 4800));
  keys.right = false;
}

if (new URLSearchParams(location.search).has("autoplay")) {
  runAutoplayDemo();
}

if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  window.level2Debug = {
    snapshot() {
      return {
        row: state.row,
        col: Number(state.col.toFixed(2)),
        seaCol: Number(state.seaCol.toFixed(2)),
        mode: state.mode,
        flags: { ...state.flags },
        steps: state.steps,
        hint: state.lastHint
      };
    },
    async hold(direction, ms) {
      await holdFor(direction, ms);
      return this.snapshot();
    },
    jump,
    reset
  };
}

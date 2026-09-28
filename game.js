// ================= TRAMPA MENTAL ⚡ =================
// Juego de reflejos con dificultad progresiva:
// colores, números, efecto Stroop, formas y reglas sorpresa.
// Toca la celda correcta antes de que se acabe el tiempo.

const $ = (id) => document.getElementById(id);

// ---------- DATOS ----------
const COLORS = [
  { name: "ROJO",   hex: "#ff5f5f" },
  { name: "AZUL",   hex: "#4ea8ff" },
  { name: "VERDE",  hex: "#4ade80" },
  { name: "AMARILLO", hex: "#ffd93d" },
  { name: "MORADO", hex: "#c084fc" },
  { name: "NARANJA", hex: "#ff9f1a" },
  { name: "ROSA",   hex: "#ff7ab6" },
  { name: "TURQUESA", hex: "#4ecdc4" },
];

// Formas SVG dibujadas en código (limpias en cualquier pantalla)
const SHAPES = [
  { id: "circle",   name: "CÍRCULO" },
  { id: "triangle", name: "TRIÁNGULO" },
  { id: "star",     name: "ESTRELLA" },
  { id: "square",   name: "CUADRADO" },
  { id: "diamond",  name: "ROMBO" },
];

const shapeSVG = {
  circle:   '<circle cx="50" cy="50" r="34"/>',
  triangle: '<polygon points="50,16 84,80 16,80"/>',
  star:     '<polygon points="50,14 61,42 92,44 68,64 76,94 50,77 24,94 32,64 8,44 39,42"/>',
  square:   '<rect x="18" y="18" width="64" height="64" rx="8"/>',
  diamond:  '<polygon points="50,14 86,50 50,86 14,50"/>',
};

const ROUND_TIME = 30; // segundos de juego
const CORRECT_POINTS = 10;
const START_CELLS = 3;
const MAX_CELLS = 6;

// ---------- NIVELES (dificultad progresiva por puntaje) ----------
// Sube de nivel cada 400 pts: más celdas, menos tiempo para reaccionar
// y retos más confusos (Stroop, reglas trampa...).
const LEVELS = [
  { types: ["color", "number"] },                                                   // 1: básico
  { types: ["colorWord", "number", "stroop"] },                                     // 2: Stroop entra
  { types: ["colorWord", "stroop", "stroopInv", "shape"] },                         // 3: formas + Stroop inverso
  { types: ["colorWord", "stroopInv", "shapeColor", "notColor", "shape"] },         // 4: reglas trampa
  { types: ["colorWord", "stroop", "stroopInv", "shapeColor", "notColor"], shuffle: true },   // 5: caos
  { types: ["colorWord", "stroop", "stroopInv", "shape", "shapeColor", "notColor"], shuffle: true }, // 6: todo
];
function levelFor(scoreNow) {
  const i = Math.min(LEVELS.length - 1, Math.floor(scoreNow / 400));
  return { index: i + 1, cfg: LEVELS[i] };
}
// Celdas: 3 al inicio y +1 cada nivel (hasta 6)
function cellsForLevel(lvl) {
  return Math.min(MAX_CELLS, START_CELLS + (lvl - 1));
}
// Tiempo de reacción permitido: 4s al inicio, baja hasta 2.2s
function reactionMs(lvl) {
  return Math.max(2200, 4000 - (lvl - 1) * 360);
}
function levelFor(scoreNow) {
  let i = 0;
  LEVELS.forEach((L, idx) => { if (scoreNow >= L.min) i = idx; });
  return { index: i + 1, cfg: LEVELS[i] };
}

// ---------- ESTADO ----------
let score = 0;
let hits = 0;
let combo = 0;
let bestCombo = 0;
let timeLeft = ROUND_TIME;
let timerId = null;
let tickId = null;
let round = null;
let playing = false;
let best = Number(localStorage.getItem("rr_best") || 0);
let levelIndex = 0;
let shuffleTimer = null;
let bonusTime = 0; // segundos extra acumulados por rachas largas
let paused = false; // bandera de pausa

// ---------- PANTALLAS ----------
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active");
}

// ---------- RONDA ----------
function newRound() {
  clearShuffle();
  const lvl = levelFor(score);
  if (lvl.index !== levelIndex) {
    levelIndex = lvl.index;
    showLevelUp(levelIndex);
  }

  const n = cellsForLevel(levelIndex);
  const type = lvl.cfg.types[Math.floor(Math.random() * lvl.cfg.types.length)];
  // Se separan variables para que en closures (eventos) siempre valgan lo correcto
  let answerIndex = 0;
  let items = [];

  if (type === "color") {
    // Toca el cuadro del color indicado. La palabra se escribe en OTRO
    // color (Stroop): el texto contradice lo que dice → confunde la mente.
    const chosen = pickDistinct(COLORS, n);
    const target = rand(chosen);
    answerIndex = chosen.indexOf(target);
    const wrongColor = rand(COLORS.filter(c => c.name !== target.name));
    items = chosen.map(c => ({ text: "", bg: c.hex }));
    const p = setPrompt(`Toca el cuadro: ${target.name}`);
    p.style.color = wrongColor.hex;

  } else if (type === "number") {
    // Toca el número más grande O el más chico (se elige al azar)
    const nums = pickUniqueNums(n, 40);
    const wantMax = Math.random() < 0.5;
    const goal = wantMax ? Math.max(...nums) : Math.min(...nums);
    const shuffled = shuffleArr(nums);
    answerIndex = shuffled.indexOf(goal);
    items = shuffled.map(v => ({ text: v, bg: randomCellColor() }));
    setPrompt(wantMax ? "¡Toca el número MÁS GRANDE!" : "¡Toca el número MÁS CHICO!");

  } else if (type === "colorWord") {
    // Stroop clásico: cada cuadro tiene un color, pero la PALABRA escrita
    // dice otro. Hay que tocar el cuadro cuyo color REAL (fondo) es el
    // que pide la instrucción, ignorando el color de las letras.
    const chosen = pickDistinct(COLORS, n);
    const target = rand(chosen);          // color del cuadro correcto
    const word = rand(chosen.filter(c => c.name !== target.name)); // palabra falsa
    answerIndex = chosen.indexOf(target);
    items = chosen.map(c => ({ text: word.name, bg: c.hex, fg: rand(COLORS.filter(x => x.name !== word.name)).hex }));
    setPrompt(`Toca el cuadro: ${target.name}`);

  } else if (type === "stroop") {
    // Stroop: todas las celdas dicen la MISMA palabra, cada una en un color
    // distinto. Hay que tocar el color real de las letras (ignorar el texto).
    const chosen = pickDistinct(COLORS, n);
    const word = rand(chosen); // palabra que se escribe en todas
    const target = rand(chosen.filter(c => c.name !== word.name)); // color correcto
    answerIndex = chosen.indexOf(target);
    items = chosen.map(c => ({ text: word.name, bg: randomCellColor(), fg: c.hex }));
    setPrompt("Toca el color de las LETRAS");

  } else if (type === "stroopInv") {
    // Stroop inverso: cada celda dice su propio nombre, pero TODAS están
    // pintadas del mismo color falso. Hay que tocar la PALABRA correcta.
    const chosen = pickDistinct(COLORS, n);
    const target = rand(chosen);
    const paint = rand(chosen.filter(c => c.name !== target.name));
    answerIndex = chosen.indexOf(target);
    items = chosen.map(c => ({ text: c.name, bg: randomCellColor(), fg: paint.hex }));
    setPrompt(`Toca la palabra: ${target.name}`);

  } else if (type === "shape") {
    // Toca la forma que dice la instrucción
    const chosen = pickDistinct(SHAPES, n);
    const target = rand(chosen);
    answerIndex = chosen.indexOf(target);
    items = chosen.map(s => ({ svg: shapeSVG[s.id], bg: randomCellColor(), tag: s.name }));
    setPrompt(`Toca el ${target.name}`);

  } else if (type === "shapeColor") {
    // Mismo dibujo en todas; toca el cuadro del color de fondo pedido
    const chosen = pickDistinct(COLORS, n);
    const target = rand(chosen);
    const shape = rand(SHAPES);
    answerIndex = chosen.indexOf(target);
    items = chosen.map(c => ({ svg: shapeSVG[shape.id], bg: c.hex }));
    setPrompt(`Toca el cuadro de color: ${target.name}`);

  } else if (type === "notColor") {
    // Regla sorpresa: casi todos son del color "prohibido"; toca el que NO lo es
    const chosen = pickDistinct(COLORS, n);
    const target = rand(chosen);
    const banned = rand(COLORS.filter(c => c.name !== target.name));
    answerIndex = chosen.indexOf(target);
    items = chosen.map(c => ({ text: "", bg: c.hex }));
    items.forEach((it, i) => { if (i !== answerIndex) it.bg = banned.hex; });
    setPrompt(`¡Trampa! Toca el que NO es ${banned.name}`);
  }

  round = { type, answerIndex };
  renderGrid(items);

  // El tiempo de reacción se acorta conforme sube el nivel
  armRoundDeadline(lvl);

  // Nivel difícil: las celdas se acomodan solas
  if (lvl.cfg.shuffle) startShuffle();
}

// ---------- TIEMPO POR RONDA ----------
// Si no tocas a tiempo, pierdes la ronda: así la dificultad SÍ se siente
// crecer cada vez que juegas (más celdas + menos tiempo + retos confusos).
let roundDeadline = null;
function armRoundDeadline(lvl) {
  disarmRoundDeadline();
  const ms = reactionMs(lvl.index);

  // Barra visual en la instrucción que se vacía conforme corre el tiempo
  const old = document.querySelector(".deadline-bar");
  if (old) old.remove();
  const bar = document.createElement("div");
  bar.className = "deadline-bar";
  bar.style.animationDuration = ms + "ms";
  $("prompt").appendChild(bar);

  roundDeadline = setTimeout(() => {
    if (!playing || !round) return;
    round = null;
    combo = 0;
    score = Math.max(0, score - 5);
    promptFlash("⏳ ¡Muy lento! -5", "bad");
    $("game").classList.add("shake");
    setTimeout(() => $("game").classList.remove("shake"), 300);
    vibrate([60, 40, 60]);
    updateHUD();
    setTimeout(() => { if (playing) newRound(); }, 450);
  }, ms);
}
function disarmRoundDeadline() {
  if (roundDeadline) { clearTimeout(roundDeadline); roundDeadline = null; }
  const bar = document.querySelector(".deadline-bar");
  if (bar) bar.remove();
}

function setPrompt(text) {
  const p = $("prompt");
  p.classList.remove("good", "bad");
  p.textContent = text;
  p.style.color = ""; // limpia el color Stroop del round anterior
  return p;
}

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function shuffleArr(a) { return a.sort(() => Math.random() - 0.5); }

function pickDistinct(pool, n) {
  const copy = shuffleArr([...pool]);
  return copy.slice(0, n);
}
function pickUniqueNums(n, max) {
  const set = new Set();
  while (set.size < n) set.add(Math.floor(Math.random() * max) + 1);
  return [...set];
}
function randomCellColor() {
  const palettes = ["#4ea8ff", "#4ade80", "#ffd93d", "#c084fc", "#ff9f1a", "#ff7ab6", "#4ecdc4"];
  return rand(palettes);
}

function renderGrid(items) {
  const grid = $("grid");
  grid.innerHTML = "";
  grid.classList.toggle("cols3", items.length === 6);
  items.forEach((item, i) => {
    const btn = document.createElement("button");
    btn.className = "cell pop";
    btn.style.background = item.bg;
    if (item.fg) btn.style.setProperty("--fg", item.fg); // color de las letras
    if (item.svg) {
      btn.innerHTML = `<svg viewBox="0 0 100 100" fill="rgba(0,0,0,.72)">${item.svg}</svg>`;
      if (item.tag) {
        const tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = item.tag;
        btn.appendChild(tag);
      }
    } else {
      btn.textContent = item.text;
    }
    btn.dataset.index = i;
    // El índice se lee de dataset al momento del tap, así el barajado no lo rompe
    btn.addEventListener("click", () => onCellTap(btn.dataset.index, btn));
    grid.appendChild(btn);
  });
}

// Celdas que se acomodan solas (nivel difícil):
// se intercambian posiciones manteniendo su identidad (data-index)
function startShuffle() {
  shuffleTimer = setInterval(() => {
    const grid = $("grid");
    const cells = [...grid.children];
    if (cells.length < 2) return;
    const a = cells[Math.floor(Math.random() * cells.length)];
    const b = cells[Math.floor(Math.random() * cells.length)];
    if (a === b) return;
    const ia = a.dataset.index, ib = b.dataset.index;
    const na = a.nextSibling === b ? null : a.nextSibling;
    const nb = b.nextSibling === a ? null : b.nextSibling;
    grid.insertBefore(b, na);
    grid.insertBefore(a, nb);
    a.dataset.index = ib;
    b.dataset.index = ia;
    a.classList.add("pop");
    b.classList.add("pop");
  }, 1200);
}
function clearShuffle() {
  if (shuffleTimer) { clearInterval(shuffleTimer); shuffleTimer = null; }
}

// ---------- TAP ----------
function onCellTap(indexStr, el) {
  if (!playing || paused || !round) return;
  disarmRoundDeadline(); // el jugador ya reaccionó
  const index = Number(indexStr);
  const isCorrect = index === round.answerIndex;

  if (isCorrect) {
    combo++;
    hits++;
    bestCombo = Math.max(bestCombo, combo);
    const bonus = combo >= 3 ? CORRECT_POINTS * 2 : CORRECT_POINTS;
    score += bonus;
    if (combo > 0 && combo % 5 === 0) {
      bonusTime += 1; // racha larga = +1 segundo extra
      showCombo("🔥 RACHA x" + combo + "!  +1s ⏱️");
    } else {
      showCombo();
    }
    el.classList.add("good-flash");
    promptFlash(`¡Bien! +${bonus}`, "good");
    vibrate(30);
    updateHUD();
    setTimeout(newRound, 220);
  } else {
    combo = 0;
    score = Math.max(0, score - 5);
    el.classList.add("bad-flash");
    promptFlash("¡Fallaste! -5", "bad");
    $("game").classList.add("shake");
    setTimeout(() => $("game").classList.remove("shake"), 300);
    vibrate([60, 40, 60]);
    updateHUD();
    setTimeout(newRound, 350);
  }
}

function promptFlash(text, cls) {
  const p = $("prompt");
  p.textContent = text;
  p.classList.remove("good", "bad");
  void p.offsetWidth;
  p.classList.add(cls);
}

function showCombo(forcedText) {
  if (combo >= 3 || forcedText) {
    const c = $("combo");
    c.textContent = forcedText || `🔥 RACHA x${combo}!`;
    c.style.animation = "none";
    void c.offsetWidth;
    c.style.animation = "";
  }
}

function showLevelUp(lvl) {
  setPrompt(`⚡ NIVEL ${lvl} ⚡`);
  $("prompt").classList.add("good");
  updateHUD();
  $("game").classList.add("shake");
  setTimeout(() => $("game").classList.remove("shake"), 300);
  vibrate([40, 60, 40]);
}

function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function updateHUD() {
  $("score").textContent = score;
  $("hits").textContent = hits;
  $("best-combo").textContent = bestCombo;
  $("level").textContent = levelIndex || 1;
}

// ---------- TIEMPO ----------
function startTimer() {
  timeLeft = ROUND_TIME;
  bonusTime = 0;
  updateHUD();
  $("time").textContent = timeLeft;
  $("timer-fill").style.width = "100%";

  tickId = setInterval(tickSecond, 1000);
}

// ---------- INICIO / FIN ----------
function startGame() {
  score = 0; hits = 0; combo = 0; bestCombo = 0;
  levelIndex = 1; // primer nivel antes de la primera ronda
  clearShuffle();
  disarmRoundDeadline();
  paused = false;
  playing = true;
  showScreen("screen-game");
  newRound();
  startTimer();
}

function endGame() {
  playing = false;
  clearInterval(tickId);
  clearTimeout(timerId);
  clearShuffle();
  disarmRoundDeadline();

  const isRecord = score > best;
  if (isRecord) {
    best = score;
    localStorage.setItem("rr_best", best);
  }

  $("final-score").textContent = score;
  $("best-final").textContent = best;
  $("new-record").classList.toggle("hidden", !isRecord);
  showScreen("screen-over");
}

// ---------- PAUSA / REINICIO ----------
let pausedAt = 0; // timestamp de cuando se pausó

function pauseGame() {
  if (!playing || paused) return;
  paused = true;
  pausedAt = Date.now();
  clearInterval(tickId);
  clearShuffle();
  disarmRoundDeadline();
  showScreen("screen-pause");
}

function resumeGame() {
  if (!playing || !paused) return;
  paused = false;
  showScreen("screen-game");
  armRoundDeadline(levelFor(score)); // reanudar el reloj de la ronda
  tickId = setInterval(tickSecond, 1000); // reanudar el tiempo total
  // Si estuvo pausado mucho rato, que no le regalen tiempo extra:
  // no hacemos nada con el tiempo pausado porque tickSecond solo corre
  // cuando está despausado (el intervalo se detuvo en pauseGame).
}

function tickSecond() {
  timeLeft--;
  if (bonusTime > 0) { timeLeft++; bonusTime--; }
  $("time").textContent = timeLeft;
  $("timer-fill").style.width = Math.min(100, (timeLeft / ROUND_TIME) * 100) + "%";
  if (timeLeft <= 5) $("time").style.color = "#f87171";
  else $("time").style.color = "";
  if (timeLeft <= 0) endGame();
}

// ---------- EVENTOS ----------
$("btn-play").addEventListener("click", startGame);
$("btn-retry").addEventListener("click", startGame);
$("btn-home").addEventListener("click", () => showScreen("screen-start"));

// Pausa y reinicio (botones del HUD y de la pantalla de pausa)
$("btn-pause").addEventListener("click", pauseGame);
$("btn-resume").addEventListener("click", resumeGame);
$("btn-restart").addEventListener("click", startGame);
$("btn-restart-2").addEventListener("click", startGame);
$("btn-home-2").addEventListener("click", () => { paused = false; showScreen("screen-start"); });

$("best-start").textContent = best;
$("best-score").textContent = best;

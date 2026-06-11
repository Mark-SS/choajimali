"use strict";

/* ============================================================
 * 超级玛丽 · 网页版
 * 纯 Canvas + WebAudio 实现,无外部资源
 * ============================================================ */

const TILE = 32;
const VIEW_W = 960;
const VIEW_H = 540;
const GRAVITY = 2300;
const LEVEL_H = 17;
let levelW = 220; // 当前关卡宽度(瓦片数),由关卡定义决定

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const hudScore = document.getElementById("hud-score");
const hudCoins = document.getElementById("hud-coins");
const hudLives = document.getElementById("hud-lives");
const hudLevel = document.getElementById("hud-level");
const hudTime = document.getElementById("hud-time");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayMsg = document.getElementById("overlay-msg");
const startBtn = document.getElementById("start-btn");

/* ---------------- 音效 (WebAudio) ---------------- */

let actx = null;
function audio() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === "suspended") actx.resume();
  return actx;
}

function tone(freq, dur, { type = "square", vol = 0.15, slideTo = null, delay = 0 } = {}) {
  try {
    const ac = audio();
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) { /* 忽略音频错误 */ }
}

const SFX = {
  jump() { tone(320, 0.18, { slideTo: 660 }); },
  coin() { tone(988, 0.08); tone(1319, 0.25, { delay: 0.08 }); },
  stomp() { tone(280, 0.12, { slideTo: 90, vol: 0.2 }); },
  bump() { tone(140, 0.08, { vol: 0.12 }); },
  break() { tone(180, 0.12, { slideTo: 60, vol: 0.2, type: "sawtooth" }); },
  power() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.1, { delay: i * 0.07 })); },
  hurt() { [600, 400, 250].forEach((f, i) => tone(f, 0.1, { delay: i * 0.08 })); },
  die() { [660, 520, 392, 262, 196].forEach((f, i) => tone(f, 0.16, { delay: i * 0.12, vol: 0.18 })); },
  win() { [523, 587, 659, 784, 880, 1047].forEach((f, i) => tone(f, 0.14, { delay: i * 0.1 })); },
  oneUp() { [660, 784, 1320, 1056, 1188, 1584].forEach((f, i) => tone(f, 0.1, { delay: i * 0.08 })); },
};

/* ---------------- 像素画精灵 ---------------- */

const PAL = {
  R: "#d83a3a", // 红(帽子/衣服)
  N: "#7a4a12", // 棕(头发/鞋)
  S: "#ffcb9c", // 皮肤
  D: "#241810", // 深色(眼睛)
  B: "#2b50d8", // 蓝(背带裤)
  Y: "#ffd866", // 黄(纽扣)
  G: "#b06a30", // 板栗仔身体
  F: "#5c3414", // 板栗仔脚
  W: "#ffffff", // 白
  M: "#e23b3b", // 蘑菇红
  T: "#ffe0b8", // 蘑菇茎
};

const MARIO_STAND = [
  "...RRRRR....",
  "..RRRRRRRRR.",
  "..NNNSSDS...",
  ".NSNSSSDSS..",
  ".NSNNSSSDSSS",
  ".NNSSSSDDDD.",
  "...SSSSSSS..",
  "..RRBRRR....",
  ".RRRBRRBRRR.",
  "RRRRBBBBRRRR",
  "SSRBYBBYBRSS",
  "SSSBBBBBBSSS",
  "SSBBBBBBBBSS",
  "..BBB..BBB..",
  ".NNN....NNN.",
  "NNNN....NNNN",
];

const MARIO_RUN = MARIO_STAND.slice(0, 13).concat([
  "..BBBBBB....",
  ".NNN.NNN....",
  ".NNN...NNNN.",
]);

const GOOMBA_ART = [
  "....GGGG....",
  "..GGGGGGGG..",
  ".GGGGGGGGGG.",
  ".GWWDGGDWWG.",
  "GGWWDGGDWWGG",
  "GGGGGGGGGGGG",
  "GGGGGGGGGGGG",
  ".GGGGGGGGGG.",
  "..GGGGGGGG..",
  ".FFGGGGGGFF.",
  "FFFF....FFFF",
  "FFF......FFF",
];

const MUSHROOM_ART = [
  "....MMMM....",
  "..MMWWWWMM..",
  ".MWWWMMWWWM.",
  ".MWMMMMMMWM.",
  "MMWMMWWMMWMM",
  "MWWMMWWMMWWM",
  "MMMMMMMMMMMM",
  ".TTTTTTTTTT.",
  ".TTDTTTTDTT.",
  ".TTTTTTTTTT.",
  "..TTTTTTTT..",
  "...TTTTTT...",
];

function makeSprite(rows, px, overrides = {}) {
  const c = document.createElement("canvas");
  c.width = rows[0].length * px;
  c.height = rows.length * px;
  const g = c.getContext("2d");
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === ".") continue;
      g.fillStyle = overrides[ch] || PAL[ch] || "#f0f";
      g.fillRect(x * px, y * px, px, px);
    }
  });
  return c;
}

function flipSprite(src) {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d");
  g.translate(src.width, 0);
  g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

const SPR = {
  marioStand: makeSprite(MARIO_STAND, 2),
  marioRun: makeSprite(MARIO_RUN, 2),
  goomba: makeSprite(GOOMBA_ART, 2),
  goombaFast: makeSprite(GOOMBA_ART, 2, { G: "#4a8fd4", F: "#1e3a66" }), // 蓝色快速变种
  mushroom: makeSprite(MUSHROOM_ART, 2),
};
SPR.marioStandL = flipSprite(SPR.marioStand);
SPR.marioRunL = flipSprite(SPR.marioRun);

/* ---------------- 主题与关卡数据 ---------------- */

const THEMES = {
  day: {
    sky: ["#63a6ff", "#8ec5ff", "#b8e0ff"], hill: "#4f9e58", bush: "#3e8e49",
    cloud: 0.92, sun: "#fff3b0", ground: ["#c8794a", "#8a4d2a"],
  },
  underground: {
    sky: ["#0c0c18", "#14142a", "#1c1c36"], hill: "#1d1d3e", bush: "#191936",
    cloud: 0, sun: null, ground: ["#3f74c9", "#27508f"],
  },
  night: {
    sky: ["#0b1030", "#1a2150", "#2a3470"], hill: "#1f5e36", bush: "#1a4e2e",
    cloud: 0.18, moon: true, stars: true, ground: ["#a06038", "#6e3e1e"],
  },
  snow: {
    sky: ["#9fc4e8", "#c6def2", "#e9f5fd"], hill: "#e6eef8", bush: "#c2d6e8",
    cloud: 0.95, sun: "#fff8d0", ice: true, ground: ["#d8e7f4", "#92b4d0"],
  },
  desert: {
    sky: ["#ff9a5c", "#ffc26b", "#ffe2a0"], hill: "#cf9347", bush: "#a8762e",
    cloud: 0.5, sun: "#fff0a0", sunBig: true, ground: ["#e0b35f", "#a87b2f"],
  },
  castle: {
    sky: ["#190a10", "#2a1016", "#3a141a"], hill: "#34161e", bush: null,
    cloud: 0, sun: null, lava: true, ground: ["#8a8a9c", "#555568"],
  },
};

/*
 * 关卡定义说明(均为瓦片坐标,地面顶部在第 15 行):
 *   ground : [起, 止] 地面段,段间即为深坑
 *   pipes  : [x, 高度]
 *   rows   : [x0, x1, y, 瓦片] 横排方块(先铺)
 *   tiles  : [x, y, 瓦片] 单个方块(后铺,可覆盖 rows)
 *   stairs : [x, 高度, 方向] 阶梯,方向 1 升 / -1 降
 *   coins  : [x0, x1, y] 悬浮金币排
 *   enemies: x 或 [x, 1](1 = 蓝色快速变种)
 */
const LEVELS = [
  { // 第 1 关 · 草原
    theme: "day", width: 220, time: 300,
    ground: [[0, 69], [73, 85], [89, 152], [156, 219]],
    pipes: [[18, 2], [28, 3], [39, 4], [47, 4], [110, 3], [147, 2]],
    rows: [[80, 87, 7, "B"], [128, 131, 7, "B"]],
    tiles: [
      [16, 11, "?"], [20, 11, "B"], [21, 11, "?"], [22, 11, "B"], [23, 11, "M"], [24, 11, "B"],
      [22, 7, "?"], [77, 11, "B"], [78, 11, "B"], [79, 11, "?"], [80, 11, "B"],
      [94, 11, "B"], [95, 11, "M"], [96, 11, "B"],
      [118, 11, "?"], [119, 11, "B"], [120, 11, "B"], [121, 11, "?"], [129, 11, "?"],
    ],
    stairs: [[134, 4, 1], [139, 4, -1], [176, 8, 1]],
    coins: [[33, 36, 10], [58, 62, 9], [74, 76, 8], [90, 93, 10], [102, 106, 11], [122, 126, 8], [153, 155, 7], [160, 164, 10]],
    enemies: [22, 25, 31, 43, 52, 55, 80, 83, 97, 105, 113, 120, 126, 142, 160, 163, 170],
    flagX: 192, castleX: 200,
  },
  { // 第 2 关 · 地下洞窟
    theme: "underground", width: 230, time: 300, ceiling: true,
    ground: [[0, 55], [59, 90], [94, 128], [131, 170], [174, 229]],
    pipes: [[14, 3], [36, 2], [120, 4], [150, 3]],
    rows: [
      [20, 30, 11, "B"], [40, 50, 7, "B"],
      [64, 68, 11, "X"], [70, 74, 7, "X"],
      [98, 104, 11, "B"], [135, 142, 11, "B"],
    ],
    tiles: [
      [22, 11, "?"], [25, 11, "M"], [28, 11, "?"], [45, 7, "?"],
      [100, 11, "?"], [102, 11, "?"], [138, 11, "M"], [160, 11, "?"],
    ],
    stairs: [[186, 3, 1], [206, 8, 1]],
    coins: [[65, 67, 10], [71, 73, 6], [91, 93, 9], [105, 109, 10], [129, 130, 9], [152, 156, 9], [171, 173, 9], [178, 182, 11]],
    enemies: [20, 33, [48, 1], 62, 75, 86, 100, [115, 1], 125, 140, 155, [165, 1]],
    flagX: 218, castleX: 223,
  },
  { // 第 3 关 · 星空夜行(坑更多)
    theme: "night", width: 230, time: 300,
    ground: [[0, 30], [34, 60], [65, 85], [90, 120], [124, 150], [154, 180], [184, 229]],
    pipes: [[12, 2], [70, 3], [130, 4]],
    rows: [
      [40, 44, 11, "X"], [95, 99, 11, "X"], [97, 101, 7, "B"],
      [136, 140, 11, "X"], [166, 170, 11, "X"],
    ],
    tiles: [
      [18, 11, "?"], [19, 11, "M"], [50, 11, "?"], [75, 11, "?"],
      [99, 7, "?"], [110, 11, "?"], [112, 11, "?"], [160, 11, "M"],
    ],
    stairs: [[206, 8, 1]],
    coins: [[41, 43, 10], [61, 64, 8], [86, 89, 8], [96, 98, 10], [121, 123, 9], [137, 139, 10], [151, 153, 9], [167, 169, 10], [181, 183, 9]],
    enemies: [16, [26, 1], 45, 55, 72, 80, [100, 1], 108, 115, 128, [135, 1], 145, 160, [168, 1], 175, 190],
    flagX: 218, castleX: 223,
  },
  { // 第 4 关 · 冰雪滑道(地面打滑)
    theme: "snow", width: 240, time: 320,
    ground: [[0, 40], [44, 70], [75, 100], [104, 140], [145, 175], [180, 239]],
    pipes: [[20, 2], [55, 3], [90, 3], [160, 4]],
    rows: [
      [30, 34, 11, "X"], [80, 84, 11, "X"],
      [110, 114, 11, "X"], [116, 120, 7, "B"], [150, 154, 11, "X"],
    ],
    tiles: [
      [15, 11, "?"], [32, 11, "M"], [60, 11, "?"], [82, 11, "?"],
      [112, 11, "?"], [118, 7, "?"], [148, 11, "?"], [165, 11, "M"],
    ],
    stairs: [[128, 3, 1], [214, 8, 1]],
    coins: [[41, 43, 9], [71, 74, 9], [81, 83, 10], [101, 103, 9], [111, 113, 10], [117, 119, 6], [141, 144, 9], [151, 153, 10], [176, 179, 9], [185, 190, 11]],
    enemies: [18, 28, [38, 1], 50, 62, 78, [88, 1], 95, 108, [122, 1], 132, 148, 158, [168, 1], 185, 195],
    flagX: 226, castleX: 231,
  },
  { // 第 5 关 · 黄昏沙漠(金字塔阶梯阵)
    theme: "desert", width: 240, time: 320,
    ground: [[0, 50], [55, 80], [84, 110], [115, 160], [165, 239]],
    pipes: [[40, 3], [75, 2], [145, 3], [170, 4]],
    rows: [],
    tiles: [
      [12, 11, "?"], [35, 11, "M"], [90, 11, "?"], [91, 11, "?"],
      [122, 11, "?"], [152, 11, "?"], [185, 11, "M"],
    ],
    stairs: [
      [20, 4, 1], [25, 4, -1], [60, 4, 1], [65, 4, -1],
      [95, 4, 1], [100, 4, -1], [130, 5, 1], [136, 5, -1],
      [212, 8, 1],
    ],
    coins: [[21, 22, 9], [26, 27, 9], [51, 54, 8], [81, 83, 8], [96, 97, 9], [111, 114, 8], [131, 133, 7], [161, 164, 8], [175, 179, 11]],
    enemies: [15, [24, 1], 30, 45, [58, 1], 68, [72, 1], 88, [98, 1], 105, [120, 1], 125, [142, 1], 150, 155, [175, 1], 182, [192, 1]],
    flagX: 226, castleX: 232,
  },
  { // 第 6 关 · 熔岩城堡(最终关)
    theme: "castle", width: 250, time: 360, ceiling: true,
    ground: [[0, 30], [33, 55], [58, 75], [79, 105], [108, 130], [134, 155], [158, 185], [189, 249]],
    pipes: [],
    rows: [
      [35, 50, 7, "X"], [60, 63, 11, "X"], [82, 100, 7, "X"], [90, 93, 11, "X"],
      [112, 115, 11, "X"], [140, 143, 11, "X"], [160, 180, 7, "X"], [165, 168, 11, "X"],
    ],
    tiles: [
      [25, 11, "?"], [45, 11, "?"], [65, 11, "M"],
      [120, 11, "?"], [146, 11, "?"], [170, 11, "?"],
    ],
    stairs: [[222, 8, 1]],
    coins: [[31, 32, 9], [56, 57, 9], [61, 62, 10], [76, 78, 9], [84, 88, 6], [91, 92, 10], [106, 107, 9], [113, 114, 10], [131, 133, 9], [141, 142, 10], [156, 157, 9], [166, 167, 10], [186, 188, 9], [195, 200, 11]],
    enemies: [[15, 1], 22, [28, 1], 38, [44, 1], 52, 62, [70, 1], 85, [92, 1], 100, [110, 1], 118, [125, 1], 138, [148, 1], 152, [163, 1], 172, [178, 1], 192, [200, 1], 210],
    flagX: 236, castleX: 242,
  },
];

/* ---------------- 关卡构建 ---------------- */

let grid = [];       // 瓦片网格
let pipes = [];      // 水管 {x, h}
let flag = null;     // 旗杆 {x, topRow, slideY}
let castleX = 0;
let theme = THEMES.day;

const SOLID = new Set(["#", "X", "B", "?", "M", "U", "P"]);

function tileAt(cx, cy) {
  if (cx < 0 || cx >= levelW) return "#";
  if (cy < 0 || cy >= LEVEL_H) return ".";
  return grid[cy][cx];
}

function setTile(cx, cy, t) {
  if (cx < 0 || cx >= levelW || cy < 0 || cy >= LEVEL_H) return;
  grid[cy][cx] = t;
}

function buildLevel() {
  const def = LEVELS[state.level];
  levelW = def.width;
  theme = THEMES[def.theme];
  grid = Array.from({ length: LEVEL_H }, () => Array(levelW).fill("."));
  pipes = [];

  for (const [a, b] of def.ground) {
    for (let x = a; x <= b; x++) { setTile(x, 15, "#"); setTile(x, 16, "#"); }
  }

  if (def.ceiling) {
    for (let x = 0; x < levelW; x++) { setTile(x, 0, "#"); setTile(x, 1, "#"); }
  }

  for (const [x, h] of def.pipes) {
    pipes.push({ x, h });
    for (let r = 0; r < h; r++) { setTile(x, 14 - r, "P"); setTile(x + 1, 14 - r, "P"); }
  }

  for (const [x0, x1, y, t] of def.rows) {
    for (let x = x0; x <= x1; x++) setTile(x, y, t);
  }

  for (const [x, y, t] of def.tiles) setTile(x, y, t);

  for (const [x, h, dir] of def.stairs) {
    for (let i = 0; i < h; i++) {
      const hh = dir > 0 ? i + 1 : h - i;
      for (let r = 0; r < hh; r++) setTile(x + i, 14 - r, "X");
    }
  }

  for (const [x0, x1, y] of def.coins) {
    for (let x = x0; x <= x1; x++) setTile(x, y, "o");
  }

  flag = { x: def.flagX, topRow: 4, slideY: 5 * TILE, done: false };
  for (let y = flag.topRow; y <= 14; y++) setTile(flag.x, y, "F");
  castleX = def.castleX;
}

/* ---------------- 游戏状态 ---------------- */

const state = {
  mode: "menu", // menu | playing | dying | win | gameover
  level: 0,
  score: 0,
  coins: 0,
  lives: 3,
  time: 300,
  timeAcc: 0,
  camX: 0,
  winTimer: 0,
};

let pendingAction = "restart"; // 开始按钮行为:restart | next

let player = null;
let enemies = [];
let items = [];      // 蘑菇
let particles = [];  // 碎砖/金币弹出
let texts = [];      // 漂浮得分文字
let bumps = [];      // 顶砖动画 {cx, cy, t}

function resetPlayer() {
  player = {
    x: 2.5 * TILE, y: 13 * TILE,
    vx: 0, vy: 0,
    w: 22, h: 28,
    big: false,
    onGround: false,
    face: 1,
    invuln: 0,
    animT: 0,
    jumpHeld: false,
  };
}

function spawnEnemies() {
  enemies = [];
  for (const def of LEVELS[state.level].enemies) {
    const [tx, fast] = Array.isArray(def) ? def : [def, 0];
    enemies.push({
      x: tx * TILE, y: 13.6 * TILE, vx: -(fast ? 95 : 60), vy: 0,
      w: 24, h: 24, alive: true, squash: 0, active: false, fast: !!fast,
    });
  }
}

function startGame(fullReset) {
  if (fullReset) {
    state.score = 0;
    state.coins = 0;
    state.lives = 3;
  }
  state.time = LEVELS[state.level].time || 300;
  state.timeAcc = 0;
  state.camX = 0;
  state.mode = "playing";
  state.winTimer = 0;
  buildLevel();
  resetPlayer();
  spawnEnemies();
  items = []; particles = []; texts = []; bumps = [];
  overlay.classList.add("hidden");
  syncHUD();
}

function syncHUD() {
  hudScore.textContent = state.score;
  hudCoins.textContent = state.coins;
  hudLives.textContent = state.lives;
  hudLevel.textContent = `${state.level + 1}/${LEVELS.length}`;
  hudTime.textContent = Math.max(0, Math.ceil(state.time));
}

function addScore(n, x, y) {
  state.score += n;
  if (x !== undefined) texts.push({ x, y, t: 0, str: "+" + n });
}

/* ---------------- 输入 ---------------- */

const keys = { left: false, right: false, jump: false, run: false };

const KEYMAP = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "jump", KeyW: "jump", Space: "jump",
  ShiftLeft: "run", ShiftRight: "run",
};

addEventListener("keydown", e => {
  const k = KEYMAP[e.code];
  if (k) { keys[k] = true; e.preventDefault(); }
});
addEventListener("keyup", e => {
  const k = KEYMAP[e.code];
  if (k) { keys[k] = false; e.preventDefault(); }
});

// 触屏按钮
function bindTouch(id, key) {
  const el = document.getElementById(id);
  const on = e => { e.preventDefault(); keys[key] = true; };
  const off = e => { e.preventDefault(); keys[key] = false; };
  el.addEventListener("touchstart", on, { passive: false });
  el.addEventListener("touchend", off, { passive: false });
  el.addEventListener("touchcancel", off, { passive: false });
  el.addEventListener("mousedown", on);
  el.addEventListener("mouseup", off);
}
bindTouch("tc-left", "left");
bindTouch("tc-right", "right");
bindTouch("tc-jump", "jump");

startBtn.addEventListener("click", () => {
  audio();
  if (pendingAction === "next") {
    state.level++;
    startGame(false);
  } else {
    state.level = 0;
    startGame(true);
  }
  pendingAction = "restart";
});

/* ---------------- 物理与碰撞 ---------------- */

function rectVsGrid(ent, dt) {
  // X 轴
  ent.x += ent.vx * dt;
  let cy0 = Math.floor(ent.y / TILE), cy1 = Math.floor((ent.y + ent.h - 1) / TILE);
  if (ent.vx > 0) {
    const cx = Math.floor((ent.x + ent.w) / TILE);
    for (let cy = cy0; cy <= cy1; cy++) {
      if (SOLID.has(tileAt(cx, cy))) {
        ent.x = cx * TILE - ent.w - 0.01;
        ent.hitWall = true;
        ent.vx = ent.bounceWall ? -Math.abs(ent.vx) : 0;
        break;
      }
    }
  } else if (ent.vx < 0) {
    const cx = Math.floor(ent.x / TILE);
    for (let cy = cy0; cy <= cy1; cy++) {
      if (SOLID.has(tileAt(cx, cy))) {
        ent.x = (cx + 1) * TILE + 0.01;
        ent.hitWall = true;
        ent.vx = ent.bounceWall ? Math.abs(ent.vx) : 0;
        break;
      }
    }
  }

  // Y 轴
  ent.vy += GRAVITY * dt;
  ent.y += ent.vy * dt;
  ent.onGround = false;
  const cx0 = Math.floor(ent.x / TILE), cx1 = Math.floor((ent.x + ent.w - 1) / TILE);
  if (ent.vy > 0) {
    const cy = Math.floor((ent.y + ent.h) / TILE);
    for (let cx = cx0; cx <= cx1; cx++) {
      if (SOLID.has(tileAt(cx, cy))) {
        ent.y = cy * TILE - ent.h - 0.01;
        ent.vy = 0;
        ent.onGround = true;
        break;
      }
    }
  } else if (ent.vy < 0) {
    const cy = Math.floor(ent.y / TILE);
    let best = null;
    for (let cx = cx0; cx <= cx1; cx++) {
      if (SOLID.has(tileAt(cx, cy))) {
        // 选取与实体水平重叠最多的方块作为顶撞目标
        const overlap = Math.min(ent.x + ent.w, (cx + 1) * TILE) - Math.max(ent.x, cx * TILE);
        if (!best || overlap > best.overlap) best = { cx, cy, overlap };
      }
    }
    if (best) {
      ent.y = (best.cy + 1) * TILE + 0.01;
      ent.vy = 0;
      ent.headBonk = best;
    }
  }
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/* ---------------- 方块交互 ---------------- */

function hitBlock(cx, cy) {
  const t = tileAt(cx, cy);
  if (t === "?" || t === "M") {
    bumps.push({ cx, cy, t: 0 });
    setTile(cx, cy, "U");
    if (t === "?") {
      SFX.coin();
      state.coins++;
      addScore(200, (cx + 0.5) * TILE, cy * TILE);
      particles.push({
        x: (cx + 0.5) * TILE, y: cy * TILE - 8,
        vx: 0, vy: -560, t: 0, life: 0.55, kind: "coin",
      });
      checkCoinLife();
    } else {
      SFX.power();
      items.push({
        x: cx * TILE + 4, y: cy * TILE - 2, w: 24, h: 24,
        vx: 0, vy: 0, rise: TILE, kind: "mushroom", bounceWall: true,
      });
    }
  } else if (t === "B") {
    if (player.big) {
      SFX.break();
      setTile(cx, cy, ".");
      addScore(50);
      for (let i = 0; i < 4; i++) {
        particles.push({
          x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE,
          vx: (i % 2 ? 1 : -1) * (90 + Math.random() * 130),
          vy: -(260 + Math.random() * 240),
          t: 0, life: 1.1, kind: "brick",
        });
      }
    } else {
      SFX.bump();
      bumps.push({ cx, cy, t: 0 });
    }
  } else if (t === "U" || t === "X" || t === "#" || t === "P") {
    SFX.bump();
  }
}

function checkCoinLife() {
  if (state.coins > 0 && state.coins % 100 === 0) {
    state.lives++;
    SFX.oneUp();
  }
}

/* ---------------- 更新逻辑 ---------------- */

function updatePlayer(dt) {
  const p = player;
  const ice = theme.ice && p.onGround; // 冰面:加速慢、刹不住
  const maxSpeed = keys.run ? 290 : 185;
  const accel = p.onGround ? (ice ? 720 : 1400) : 900;

  if (keys.left && !keys.right) {
    p.vx = Math.max(p.vx - accel * dt, -maxSpeed);
    p.face = -1;
  } else if (keys.right && !keys.left) {
    p.vx = Math.min(p.vx + accel * dt, maxSpeed);
    p.face = 1;
  } else {
    const fric = (p.onGround ? (ice ? 320 : 1600) : 300) * dt;
    if (Math.abs(p.vx) <= fric) p.vx = 0;
    else p.vx -= Math.sign(p.vx) * fric;
  }

  // 跳跃(支持长按跳得更高)
  if (keys.jump && !p.jumpHeld && p.onGround) {
    p.vy = -800;
    p.jumpHeld = true;
    SFX.jump();
  }
  if (!keys.jump) {
    if (p.jumpHeld && p.vy < -260) p.vy = -260; // 提前松手 → 矮跳
    p.jumpHeld = false;
  }

  p.headBonk = null;
  p.hitWall = false;
  rectVsGrid(p, dt);
  if (p.headBonk) hitBlock(p.headBonk.cx, p.headBonk.cy);

  // 左边界
  if (p.x < 0) { p.x = 0; p.vx = Math.max(0, p.vx); }

  // 吃金币(瓦片金币)
  const cx0 = Math.floor(p.x / TILE), cx1 = Math.floor((p.x + p.w - 1) / TILE);
  const cy0 = Math.floor(p.y / TILE), cy1 = Math.floor((p.y + p.h - 1) / TILE);
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (tileAt(cx, cy) === "o") {
        setTile(cx, cy, ".");
        state.coins++;
        addScore(200, (cx + 0.5) * TILE, cy * TILE);
        SFX.coin();
        checkCoinLife();
      }
    }
  }

  // 到达旗杆
  if (p.x + p.w >= flag.x * TILE + 12 && !flag.done) {
    beginWin();
    return;
  }

  // 掉坑
  if (p.y > LEVEL_H * TILE + 80) {
    killPlayer(true);
    return;
  }

  if (p.invuln > 0) p.invuln -= dt;
  p.animT += Math.abs(p.vx) * dt * 0.06;
}

function updateEnemies(dt) {
  for (const e of enemies) {
    if (!e.alive) continue;
    // 进入镜头附近才激活
    if (!e.active) {
      if (e.x < state.camX + VIEW_W + 64) e.active = true;
      else continue;
    }
    if (e.squash > 0) {
      e.squash -= dt;
      if (e.squash <= 0) e.alive = false;
      continue;
    }
    e.bounceWall = true;
    rectVsGrid(e, dt);
    if (e.y > LEVEL_H * TILE + 80) { e.alive = false; continue; }

    // 与玩家碰撞
    const p = player;
    if (state.mode === "playing" && overlaps(p, e)) {
      const stomp = p.vy > 60 && p.y + p.h - e.y < 18;
      if (stomp) {
        e.squash = 0.4;
        e.vx = 0;
        p.vy = -430;
        SFX.stomp();
        addScore(100, e.x + e.w / 2, e.y);
      } else {
        hurtPlayer();
      }
    }
  }
}

function updateItems(dt) {
  for (const it of items) {
    if (it.rise > 0) {
      // 从方块中升起
      const step = 40 * dt;
      it.y -= step;
      it.rise -= step;
      if (it.rise <= 0) it.vx = 95;
      continue;
    }
    rectVsGrid(it, dt);
    if (it.y > LEVEL_H * TILE + 80) { it.dead = true; continue; }
    if (overlaps(player, it)) {
      it.dead = true;
      SFX.power();
      addScore(1000, it.x + 12, it.y);
      if (!player.big) {
        player.big = true;
        player.y -= 28;
        player.h = 56;
        player.w = 24;
      }
    }
  }
  items = items.filter(it => !it.dead);
}

function updateFX(dt) {
  for (const pa of particles) {
    pa.t += dt;
    pa.x += pa.vx * dt;
    pa.vy += GRAVITY * 0.8 * dt;
    pa.y += pa.vy * dt;
  }
  particles = particles.filter(pa => pa.t < pa.life);

  for (const tx of texts) tx.t += dt;
  texts = texts.filter(tx => tx.t < 0.9);

  for (const b of bumps) b.t += dt;
  bumps = bumps.filter(b => b.t < 0.22);
}

function hurtPlayer() {
  const p = player;
  if (p.invuln > 0) return;
  if (p.big) {
    p.big = false;
    p.h = 28;
    p.w = 22;
    p.y += 28;
    p.invuln = 2;
    SFX.hurt();
  } else {
    killPlayer(false);
  }
}

function killPlayer(fell) {
  if (state.mode !== "playing") return;
  state.mode = "dying";
  SFX.die();
  player.vy = fell ? 0 : -700;
  player.vx = 0;
  player.deathT = 0;
}

function beginWin() {
  flag.done = true;
  state.mode = "win";
  state.winTimer = 0;
  player.vx = 0;
  player.x = flag.x * TILE - player.w + 10;
  const bonus = Math.max(200, (14 - Math.floor(player.y / TILE)) * 400);
  addScore(bonus, flag.x * TILE, player.y);
  addScore(Math.ceil(state.time) * 10);
  SFX.win();
}

function updateDying(dt) {
  player.deathT += dt;
  if (player.deathT > 0.4) {
    player.vy += GRAVITY * dt;
    player.y += player.vy * dt;
  }
  if (player.deathT > 2.2) {
    state.lives--;
    if (state.lives <= 0) {
      state.mode = "gameover";
      pendingAction = "restart";
      showOverlay("游戏结束", `最终得分 ${state.score} · 止步第 ${state.level + 1} 关`, "再来一次");
    } else {
      startGame(false);
    }
  }
}

function updateWin(dt) {
  state.winTimer += dt;
  const p = player;
  // 第一阶段:沿旗杆下滑
  const poleBottom = 15 * TILE - p.h;
  if (p.y < poleBottom && state.winTimer < 2) {
    p.y = Math.min(p.y + 260 * dt, poleBottom);
    flag.slideY = Math.min(flag.slideY + 200 * dt, 13 * TILE);
  } else if (state.winTimer < 4.2) {
    // 第二阶段:走向城堡
    p.face = 1;
    p.vx = 140;
    p.vy += GRAVITY * dt;
    rectVsGrid(p, dt);
    p.animT += 8 * dt;
    if (p.x > (castleX + 3) * TILE) p.vx = 0;
  } else {
    state.mode = "menu";
    if (state.level < LEVELS.length - 1) {
      pendingAction = "next";
      const NAMES = ["草原", "地下洞窟", "星空夜行", "冰雪滑道", "黄昏沙漠", "熔岩城堡"];
      showOverlay(
        `第 ${state.level + 1} 关通过!`,
        `当前得分 ${state.score} · 下一关:${NAMES[state.level + 1]}`,
        "进入下一关"
      );
    } else {
      pendingAction = "restart";
      showOverlay("🎉 全部通关!", `最终得分 ${state.score} · 金币 ${state.coins}`, "再玩一次");
    }
  }
}

function showOverlay(title, msg, btn) {
  overlayTitle.textContent = title;
  overlayMsg.textContent = msg;
  startBtn.textContent = btn;
  overlay.classList.remove("hidden");
}

/* ---------------- 渲染 ---------------- */

function drawBackground() {
  // 天空渐变
  const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(0.7, theme.sky[1]);
  sky.addColorStop(1, theme.sky[2]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // 星星(夜晚)
  if (theme.stars) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 70; i++) {
      let sx = (i * 137 + 40 - state.camX * 0.1) % 1000;
      if (sx < 0) sx += 1000;
      const tw = Math.sin(performance.now() / 500 + i) > -0.6 ? 1 : 0;
      if (tw) ctx.fillRect(sx, (i * 67) % 320, 1 + (i % 2), 1 + (i % 2));
    }
  }

  // 月亮 / 太阳
  if (theme.moon) {
    ctx.fillStyle = "#f2efdc";
    ctx.beginPath();
    ctx.arc(820, 80, 32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = theme.sky[0];
    ctx.beginPath();
    ctx.arc(834, 70, 26, 0, Math.PI * 2);
    ctx.fill();
  } else if (theme.sun) {
    ctx.fillStyle = theme.sun;
    ctx.beginPath();
    ctx.arc(820, 80, theme.sunBig ? 54 : 38, 0, Math.PI * 2);
    ctx.fill();
  }

  // 远山 (视差 0.4)
  if (theme.hill) {
    ctx.fillStyle = theme.hill;
    for (let i = 0; i < 30; i++) {
      const hx = i * 460 - (state.camX * 0.4) % 460 - 230;
      ctx.beginPath();
      ctx.moveTo(hx, 480);
      ctx.quadraticCurveTo(hx + 130, 290, hx + 260, 480);
      ctx.fill();
    }
  }

  // 云 (视差 0.6)
  if (theme.cloud > 0.03) {
    ctx.fillStyle = `rgba(255,255,255,${theme.cloud})`;
    for (let i = 0; i < 30; i++) {
      const cx = i * 390 - (state.camX * 0.6) % 390 - 150;
      const cy = 70 + (i * 53 % 90);
      ctx.beginPath();
      ctx.arc(cx, cy, 22, 0, Math.PI * 2);
      ctx.arc(cx + 26, cy - 10, 26, 0, Math.PI * 2);
      ctx.arc(cx + 56, cy, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 灌木 (视差 0.85)
  if (theme.bush) {
    ctx.fillStyle = theme.bush;
    for (let i = 0; i < 40; i++) {
      const bx = i * 310 - (state.camX * 0.85) % 310 - 100;
      ctx.beginPath();
      ctx.arc(bx, 482, 20, Math.PI, 0);
      ctx.arc(bx + 24, 482, 26, Math.PI, 0);
      ctx.arc(bx + 50, 482, 20, Math.PI, 0);
      ctx.fill();
    }
  }

  // 熔岩(城堡关,深坑底部可见)
  if (theme.lava) {
    const ly = 15.35 * TILE;
    const lg = ctx.createLinearGradient(0, ly, 0, VIEW_H);
    lg.addColorStop(0, "#ff9a3c");
    lg.addColorStop(0.35, "#f25c20");
    lg.addColorStop(1, "#8a1408");
    ctx.fillStyle = lg;
    ctx.fillRect(0, ly, VIEW_W, VIEW_H - ly);
    ctx.fillStyle = "#ffc66b";
    for (let i = 0; i < 14; i++) {
      let bx = (i * 211 - state.camX) % 1100;
      if (bx < 0) bx += 1100;
      const r = 3 + Math.abs(Math.sin(performance.now() / 400 + i * 1.7)) * 5;
      ctx.beginPath();
      ctx.arc(bx, ly + 6, r, Math.PI, 0);
      ctx.fill();
    }
  }
}

function bumpOffset(cx, cy) {
  for (const b of bumps) {
    if (b.cx === cx && b.cy === cy) {
      return -Math.sin((b.t / 0.22) * Math.PI) * 8;
    }
  }
  return 0;
}

function drawTile(t, px, py, cx, cy) {
  switch (t) {
    case "#": {
      ctx.fillStyle = theme.ground[0];
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = theme.ground[1];
      ctx.fillRect(px, py, TILE, 3);
      ctx.fillRect(px, py + 16, TILE, 2);
      ctx.fillRect(px + (cy % 2 ? 8 : 20), py + 3, 2, 13);
      ctx.fillRect(px + (cy % 2 ? 22 : 6), py + 18, 2, 14);
      break;
    }
    case "B": {
      ctx.fillStyle = "#b3502e";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#7c2f16";
      for (let r = 0; r < 4; r++) ctx.fillRect(px, py + r * 8, TILE, 2);
      ctx.fillRect(px + 8, py + 2, 2, 6);
      ctx.fillRect(px + 22, py + 10, 2, 6);
      ctx.fillRect(px + 8, py + 18, 2, 6);
      ctx.fillRect(px + 22, py + 26, 2, 6);
      break;
    }
    case "?":
    case "M": {
      ctx.fillStyle = "#ffa216";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#c46a00";
      ctx.strokeStyle = "#c46a00";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 20px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", px + TILE / 2, py + TILE / 2 + 1);
      break;
    }
    case "U": {
      ctx.fillStyle = "#9c6b3c";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = "#6e4622";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
      break;
    }
    case "X": {
      ctx.fillStyle = "#b98e62";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = "#7d5b38";
      ctx.lineWidth = 2;
      ctx.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
      ctx.fillStyle = "#d9b48a";
      ctx.fillRect(px + 4, py + 4, TILE - 8, 4);
      break;
    }
    case "o": {
      const wob = Math.sin(performance.now() / 200 + cx) * 2;
      ctx.fillStyle = "#ffd000";
      ctx.beginPath();
      ctx.ellipse(px + TILE / 2, py + TILE / 2 + wob, 8, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#b8860b";
      ctx.beginPath();
      ctx.ellipse(px + TILE / 2, py + TILE / 2 + wob, 3.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function drawPipes() {
  for (const p of pipes) {
    const px = p.x * TILE - state.camX;
    if (px < -100 || px > VIEW_W + 100) continue;
    const topY = (15 - p.h) * TILE;
    const bodyH = p.h * TILE;
    // 管身
    ctx.fillStyle = "#2e9e3e";
    ctx.fillRect(px + 6, topY + 20, TILE * 2 - 12, bodyH - 20);
    ctx.fillStyle = "#74d362";
    ctx.fillRect(px + 10, topY + 20, 8, bodyH - 20);
    // 管口
    ctx.fillStyle = "#2e9e3e";
    ctx.fillRect(px, topY, TILE * 2, 22);
    ctx.fillStyle = "#74d362";
    ctx.fillRect(px + 4, topY + 3, 10, 16);
    ctx.strokeStyle = "#176b25";
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 1, topY + 1, TILE * 2 - 2, 20);
    ctx.strokeRect(px + 7, topY + 21, TILE * 2 - 14, bodyH - 22);
  }
}

function drawFlag() {
  const px = flag.x * TILE + TILE / 2 - state.camX;
  if (px < -100 || px > VIEW_W + 100) return;
  const topY = flag.topRow * TILE;
  ctx.fillStyle = "#3fb950";
  ctx.fillRect(px - 3, topY, 6, (15 * TILE) - topY);
  ctx.fillStyle = "#ffd866";
  ctx.beginPath();
  ctx.arc(px, topY, 8, 0, Math.PI * 2);
  ctx.fill();
  // 旗帜(通关时下滑)
  const fy = flag.done ? flag.slideY : (flag.topRow + 0.6) * TILE;
  ctx.fillStyle = "#e23b3b";
  ctx.beginPath();
  ctx.moveTo(px - 3, fy - 14);
  ctx.lineTo(px - 3, fy + 14);
  ctx.lineTo(px - 40, fy);
  ctx.closePath();
  ctx.fill();
}

function drawCastle() {
  const px = castleX * TILE - state.camX;
  if (px < -300 || px > VIEW_W + 100) return;
  const gy = 15 * TILE;
  ctx.fillStyle = "#b8b8c8";
  ctx.fillRect(px, gy - 128, 160, 128);
  ctx.fillRect(px + 40, gy - 176, 80, 48);
  // 城垛
  for (let i = 0; i < 5; i++) ctx.fillRect(px + i * 36, gy - 144, 20, 16);
  for (let i = 0; i < 3; i++) ctx.fillRect(px + 42 + i * 30, gy - 192, 18, 16);
  // 门
  ctx.fillStyle = "#3c3242";
  ctx.beginPath();
  ctx.moveTo(px + 60, gy);
  ctx.lineTo(px + 60, gy - 44);
  ctx.arc(px + 80, gy - 44, 20, Math.PI, 0);
  ctx.lineTo(px + 100, gy);
  ctx.fill();
  // 窗
  ctx.fillRect(px + 20, gy - 100, 16, 22);
  ctx.fillRect(px + 124, gy - 100, 16, 22);
  ctx.fillRect(px + 72, gy - 164, 16, 22);
}

function drawTiles() {
  const cx0 = Math.max(0, Math.floor(state.camX / TILE) - 1);
  const cx1 = Math.min(levelW - 1, Math.ceil((state.camX + VIEW_W) / TILE) + 1);
  for (let cy = 0; cy < LEVEL_H; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const t = grid[cy][cx];
      if (t === "." || t === "P" || t === "F") continue;
      drawTile(t, cx * TILE - state.camX, cy * TILE + bumpOffset(cx, cy), cx, cy);
    }
  }
}

function drawPlayer() {
  const p = player;
  if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
  const moving = Math.abs(p.vx) > 20;
  const frame = (!p.onGround || (moving && Math.floor(p.animT) % 2 === 0)) ? "Run" : "Stand";
  const spr = SPR["mario" + frame + (p.face < 0 ? "L" : "")];
  const dw = p.big ? 28 : 24;
  const dh = p.big ? 58 : 32;
  const dx = p.x + p.w / 2 - dw / 2 - state.camX;
  const dy = p.y + p.h - dh;
  if (state.mode === "dying") {
    ctx.save();
    ctx.translate(dx + dw / 2, dy + dh / 2);
    ctx.scale(1, -1);
    ctx.drawImage(spr, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(spr, dx, dy, dw, dh);
  }
}

function drawEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;
    const dx = e.x - state.camX;
    if (dx < -64 || dx > VIEW_W + 64) continue;
    const spr = e.fast ? SPR.goombaFast : SPR.goomba;
    if (e.squash > 0) {
      ctx.drawImage(spr, dx, e.y + e.h - 10, e.w, 10);
    } else {
      const wob = Math.sin(performance.now() / 120) * 1.5;
      ctx.drawImage(spr, dx, e.y + wob, e.w, e.h);
    }
  }
}

function drawItems() {
  for (const it of items) {
    ctx.drawImage(SPR.mushroom, it.x - state.camX, it.y, it.w, it.h);
  }
}

function drawFX() {
  for (const pa of particles) {
    const dx = pa.x - state.camX;
    if (pa.kind === "coin") {
      ctx.fillStyle = "#ffd000";
      ctx.beginPath();
      ctx.ellipse(dx, pa.y, 7, 10, pa.t * 12, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#b3502e";
      ctx.save();
      ctx.translate(dx, pa.y);
      ctx.rotate(pa.t * 9);
      ctx.fillRect(-6, -6, 12, 12);
      ctx.restore();
    }
  }
  ctx.font = "bold 15px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 3;
  for (const tx of texts) {
    const y = tx.y - tx.t * 60;
    ctx.strokeText(tx.str, tx.x - state.camX, y);
    ctx.fillText(tx.str, tx.x - state.camX, y);
  }
}

function draw() {
  drawBackground();
  drawPipes();
  drawCastle();
  drawFlag();
  drawTiles();
  drawItems();
  drawEnemies();
  if (state.mode !== "menu" && state.mode !== "gameover") drawPlayer();
  drawFX();
}

/* ---------------- 主循环 ---------------- */

let lastT = 0;

function frame(now) {
  const dt = Math.min(0.033, (now - lastT) / 1000 || 0.016);
  lastT = now;

  if (state.mode === "playing") {
    updatePlayer(dt);
    updateEnemies(dt);
    updateItems(dt);

    // 倒计时
    state.timeAcc += dt;
    if (state.timeAcc >= 1) {
      state.timeAcc -= 1;
      state.time -= 1;
      if (state.time <= 0) killPlayer(true);
    }
  } else if (state.mode === "dying") {
    updateDying(dt);
  } else if (state.mode === "win") {
    updateWin(dt);
  }

  updateFX(dt);

  // 镜头跟随
  if (player) {
    const target = player.x + player.w / 2 - VIEW_W * 0.4;
    state.camX = Math.max(0, Math.min(target, levelW * TILE - VIEW_W));
  }

  draw();
  syncHUD();
  requestAnimationFrame(frame);
}

buildLevel();
resetPlayer();
requestAnimationFrame(frame);

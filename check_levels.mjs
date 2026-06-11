// 关卡数据自检脚本:node check_levels.mjs
import { readFileSync } from "fs";

// 桩浏览器环境,让 game.js 能在 Node 中加载
const stubEl = () => ({
  getContext: () => new Proxy({}, { get: () => () => null }),
  addEventListener: () => {},
  classList: { add: () => {}, remove: () => {} },
  style: {}, width: 0, height: 0, textContent: "",
});
globalThis.window = globalThis;
globalThis.document = { getElementById: stubEl, createElement: stubEl };
globalThis.addEventListener = () => {};
globalThis.requestAnimationFrame = () => {};
globalThis.performance = { now: () => 0 };

const src = readFileSync("game.js", "utf8");
new Function(src + "\n;globalThis.__LEVELS = LEVELS; globalThis.__build = buildLevel; globalThis.__state = state; globalThis.__grid = () => grid;")();

const LEVELS = globalThis.__LEVELS;
let errors = 0;
const err = (msg) => { console.log("  ✗ " + msg); errors++; };

LEVELS.forEach((def, idx) => {
  console.log(`第 ${idx + 1} 关 (${def.theme}, 宽 ${def.width}):`);

  // 1. 坑宽(跑跳极限约 6 格,要求 ≤5)
  const segs = [...def.ground].sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < segs.length; i++) {
    const gap = segs[i][0] - segs[i - 1][1] - 1;
    if (gap > 5) err(`坑过宽 ${gap} 格 @x=${segs[i - 1][1] + 1}`);
  }
  if (segs[0][0] !== 0) err("起点没有地面");

  const onGround = (x) => segs.some(([a, b]) => x >= a && x <= b);

  // 2. 旗杆、城堡、终点阶梯都要在地面上
  if (!onGround(def.flagX)) err(`旗杆 x=${def.flagX} 悬空`);
  for (let c = def.castleX; c <= def.castleX + 4; c++)
    if (!onGround(c)) err(`城堡 x=${c} 悬空`);
  if (def.castleX + 5 > def.width) err("城堡超出关卡宽度");

  // 3. 水管、阶梯落在地面上
  for (const [x, h] of def.pipes)
    if (!onGround(x) || !onGround(x + 1)) err(`水管 x=${x} 悬空`);
  for (const [x, h] of def.stairs)
    for (let i = 0; i < h; i++) if (!onGround(x + i)) err(`阶梯 x=${x + i} 悬空`);

  // 4. 敌人出生点(允许落坑的极少数会自行消失,但全部检查提示)
  for (const e of def.enemies) {
    const x = Array.isArray(e) ? e[0] : e;
    if (!onGround(x)) err(`敌人 x=${x} 出生在坑上`);
  }

  // 5. 所有瓦片坐标在界内
  const inBounds = (x, y) => x >= 0 && x < def.width && y >= 0 && y < 17;
  for (const [x, y] of def.tiles) if (!inBounds(x, y)) err(`tiles 越界 (${x},${y})`);
  for (const [x0, x1, y] of def.rows) if (!inBounds(x0, y) || !inBounds(x1, y)) err(`rows 越界`);
  for (const [x0, x1, y] of def.coins) if (!inBounds(x0, y) || !inBounds(x1, y)) err(`coins 越界`);

  // 6. 实际构建一次,确认旗杆前没有不可逾越的高墙(粗检:每列可通行空隙 ≥2 格)
  globalThis.__state.level = idx;
  globalThis.__build();
  const grid = globalThis.__grid();
  const solid = new Set(["#", "X", "B", "?", "M", "U", "P"]);
  for (let x = 0; x < def.flagX; x++) {
    let free = 0, maxFree = 0;
    for (let y = 0; y < 17; y++) {
      if (!solid.has(grid[y][x])) { free++; maxFree = Math.max(maxFree, free); }
      else free = 0;
    }
    if (maxFree < 2) err(`x=${x} 列被完全堵死`);
  }

  if (!errors) console.log("  ✓ 通过");
});

console.log(errors ? `\n共 ${errors} 个问题` : "\n全部关卡校验通过 ✓");
process.exit(errors ? 1 : 0);

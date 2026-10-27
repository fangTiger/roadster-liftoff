// 仅用 IEEE 754 基本运算；多项式按固定顺序求值，禁止交给宿主三角函数。
const PI = Math.PI, TAU = PI * 2;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(lo, hi, x) { const t = clamp((x - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t); }
export function wrapAngle(a) { return a - TAU * Math.floor((a + PI) / TAU); }
export function sin(a) {
  let x = wrapAngle(a);
  if (x > PI / 2) x = PI - x;
  else if (x < -PI / 2) x = -PI - x;
  const q = x * x;
  return x * (1 + q * (-1 / 6 + q * (1 / 120 + q * (-1 / 5040 + q * (1 / 362880 + q * (-1 / 39916800 + q * (1 / 6227020800 + q * (-1 / 1307674368000))))))));
}
export const cos = a => sin(a + PI / 2);
export function atan2(y, x) {
  if (x === 0 && y === 0) return 0;
  const ax = Math.abs(x), ay = Math.abs(y), swap = ay > ax;
  let t = swap ? ax / ay : ay / ax, offset = 0;
  if (t > .41421356237309503) { t = (t - 1) / (t + 1); offset = PI / 4; }
  const q = t * t;
  let p = 1 / 21;
  for (let n = 19; n >= 1; n -= 2) p = ((n & 3) === 1 ? 1 : -1) / n + q * p;
  let a = offset + t * p;
  if (swap) a = PI / 2 - a;
  if (x < 0) a = PI - a;
  return y < 0 || Object.is(y, -0) ? -a : a;
}
export function hash2(ix, iz, seed = 0) {
  let h = Math.imul(ix | 0, 0x1f123bb5) ^ Math.imul(iz | 0, 0x5f356495) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return (h ^ (h >>> 16)) >>> 0;
}
export function valueNoise2(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), u = smoothstep(0, 1, x - ix), v = smoothstep(0, 1, z - iz);
  return lerp(lerp(hash2(ix, iz, seed), hash2(ix + 1, iz, seed), u), lerp(hash2(ix, iz + 1, seed), hash2(ix + 1, iz + 1, seed), u), v) / 4294967295;
}
export function fbm2(x, z, seed = 0, octaves = 4) {
  let sum = 0, weight = 0, amp = 1;
  for (let i = 0; i < octaves; i++) { sum += valueNoise2(x, z, seed + i) * amp; weight += amp; x *= 2; z *= 2; amp *= .5; }
  return weight ? sum / weight : 0;
}

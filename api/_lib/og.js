import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// @vercel/og 1.0.3 内嵌的 HarfBuzz 在 Node ESM 下仍访问 CommonJS 全局量，并从 __dirname 读取 hb.wasm。
// 用 new URL(字面量, import.meta.url) 写出 wasm 位置：Vercel 打包追踪能识别这种写法并带上文件，
// 不依赖运行时解析 harfbuzzjs 包（线上函数包里没有它）。仅补齐缺失值，不覆盖宿主；必须在导入 @vercel/og 之前执行。
const hbWasm = new URL('../../node_modules/harfbuzzjs/hb.wasm', import.meta.url);
globalThis.require ??= createRequire(import.meta.url);
globalThis.__dirname ??= dirname(fileURLToPath(hbWasm));
export const { ImageResponse } = await import('@vercel/og');

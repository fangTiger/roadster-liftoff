import { nftPresentation } from '../../_lib/nft.js';
import { bitsToCount, formatMs, shortAddr } from '../../../src/chain/records.js';
import { getServerConfig, createTokenReader, getTokenId, jsonResponse, tokenErrorResponse } from '../../_lib/chain.js';

// NFT 的 animation_url：赛道底图 + 链上数据信息层。数据在服务器端写入页面，
// 市场的沙箱 iframe 里不需要再请求 RPC。排版与静态图一致（1024 设计单位按视口等比缩放）。
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

export function renderView({ id, owner, record, best, network, siteUrl }) {
  const appearance = nftPresentation(record, best);
  const no = id.toString().padStart(4, '0'), first = Number(record.firstLapMs), bits = Number(record.achievements);
  const ticks = Array.from({ length: 28 }, (_, i) => `<i${bits >> i & 1 ? ' class="on"' : ''} style="--i:${i}"></i>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mars Roadster First Lap #${no}</title>
<style>
:root{--u:calc(min(100vw,100vh)/1024);--dim:#9bb6ca;--accent:${appearance.light};--edge:${appearance.dark};--tint:${appearance.tint}}
*{box-sizing:border-box;margin:0}
html,body{height:100%;background:#030c16;overflow:hidden}
body{display:grid;place-items:center;color:#edf7ff;font-family:sans-serif;font-feature-settings:"tnum"}
.card{position:relative;width:calc(1024*var(--u));height:calc(1024*var(--u));overflow:hidden}
.background,.shade,.tint,.frame{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.art{position:absolute;inset:0;overflow:hidden}
.background{inset:0;width:100%;height:100%;animation:zoom 24s ease-in-out infinite alternate}
@keyframes zoom{to{transform:scale(1.09)}}
.tint{background:var(--tint)}
.frame{pointer-events:none}
.shade{background:linear-gradient(180deg,rgba(1,8,19,.62) 0%,rgba(1,8,19,0) 38%,rgba(1,8,19,.18) 100%)}
.in{opacity:0;transform:translateY(calc(10*var(--u)));animation:in .9s cubic-bezier(.2,.7,.2,1) forwards}
@keyframes in{to{opacity:1;transform:none}}
.head{position:absolute;top:calc(176*var(--u));left:calc(116*var(--u))}
.brand{font-size:calc(19*var(--u));letter-spacing:calc(7*var(--u));color:#c7e3f5}
.title{display:flex;align-items:center;gap:calc(22*var(--u));margin-top:calc(15*var(--u));font-size:calc(30*var(--u));letter-spacing:calc(3*var(--u));font-weight:700}
.panel{position:absolute;left:calc(108*var(--u));right:calc(108*var(--u));bottom:calc(140*var(--u));padding:calc(26*var(--u)) calc(24*var(--u)) calc(20*var(--u));border:1px solid var(--edge);border-radius:calc(6*var(--u));background:${appearance.panelGradient};backdrop-filter:blur(calc(6*var(--u)));overflow:hidden;animation-delay:.25s}
.panel::before{content:"";position:absolute;top:0;left:-40%;width:40%;height:1px;background:linear-gradient(90deg,transparent,var(--accent),transparent);animation:sweep 5s linear 1.4s infinite}
@keyframes sweep{0%{left:-40%}40%,100%{left:100%}}
.row{display:flex;align-items:center;justify-content:space-between}
.label{font-size:calc(12*var(--u));letter-spacing:calc(3*var(--u));color:var(--dim)}
.time{margin-top:calc(4*var(--u));font-size:calc(48*var(--u));font-weight:700;letter-spacing:calc(-2*var(--u));text-shadow:0 0 calc(24*var(--u)) rgba(127,227,255,.35)}
.cols{display:flex;gap:calc(14*var(--u));padding-left:calc(18*var(--u));border-left:1px solid rgba(165,218,255,.25)}
.col .label{letter-spacing:calc(2*var(--u))}
.col div:last-child{margin-top:calc(15*var(--u));font-size:calc(18*var(--u))}
.track{font-size:calc(19*var(--u));margin-top:calc(14*var(--u));color:#c7e3f5}
.ticks{display:flex;gap:calc(5*var(--u));margin-top:calc(16*var(--u))}
.ticks i{flex:1;height:calc(5*var(--u));border-radius:1px;background:rgba(165,218,255,.14)}
.ticks i.on{background:var(--accent);box-shadow:0 0 calc(8*var(--u)) var(--accent);opacity:0;animation:tick .35s ease-out forwards;animation-delay:calc(.9s + var(--i)*.05s)}
@keyframes tick{from{opacity:0;transform:scaleY(2.4)}to{opacity:1;transform:none}}
.foot{margin-top:calc(22*var(--u));padding-top:calc(15*var(--u));border-top:1px solid rgba(165,218,255,.18);font-size:calc(10*var(--u));letter-spacing:calc(2*var(--u));color:#88a6bb}
@media (prefers-reduced-motion:reduce){.in,.ticks i.on{animation:none;opacity:1;transform:none}.panel::before,.background{animation:none}}
</style></head><body>
<div class="card">
<div class="art"><img class="background" src="${esc(siteUrl + appearance.imagePath)}" alt="${esc(appearance.trackName)}"></div>
<div class="tint"></div>
<div class="shade"></div>
<div class="head in"><div class="brand">MARS ROADSTER</div><div class="title">FIRST LAP&nbsp;&nbsp;#${no}</div></div>
<div class="panel in">
<div class="row">
<div><div class="label">FIRST LAP</div><div class="time" data-ms="${first}">${esc(formatMs(first))}</div></div>
<div class="cols">
<div class="col"><div class="label">BEST LAP</div><div>${esc(formatMs(appearance.bestMs))}</div></div>
<div class="col"><div class="label">ACHIEVEMENTS</div><div class="ach" data-n="${bitsToCount(bits)}">${bitsToCount(bits)}/28</div></div>
<div class="col"><div class="label">MINTED</div><div>${new Date(Number(record.mintedAt) * 1000).toISOString().slice(0, 10)}</div></div>
<div class="col"><div class="label">PILOT</div><div>${esc(shortAddr(owner))}</div></div>
</div></div>
<div class="track">${esc(appearance.trackName)}</div>
<div class="ticks">${ticks}</div>
<div class="foot">${appearance.verification} · NON-TRANSFERABLE · ${network === 'mainnet' ? 'ARC' : 'ARC TESTNET'}</div>
</div>
<img class="frame" src="${esc(siteUrl + appearance.framePath)}" alt="${appearance.label.toUpperCase()} ornamental frame">
</div>
<script>
// 成绩和成就数从 0 滚动到链上数值；减少动态效果时直接显示最终值
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const time = document.querySelector('.time'), ach = document.querySelector('.ach');
  const ms = +time.dataset.ms, n = +ach.dataset.n, t0 = performance.now() + 400, dur = 1400;
  const tick = now => {
    const k = Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - k, 3);
    time.textContent = (ms * e / 1000).toFixed(2) + ' s'; ach.textContent = Math.round(n * e) + '/28';
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
</script>
</body></html>`;
}

export function createViewHandler(options = {}) {
  return async request => {
    const id = getTokenId(request);
    if (id === null) return jsonResponse({ error: 'Invalid token ID' }, 400);
    try {
      const config = { ...getServerConfig(), ...options };
      const { owner, record, best } = await (config.readToken || createTokenReader(config))(id);
      return new Response(renderView({ id, owner, record, best, network: config.network, siteUrl: config.siteUrl.replace(/\/+$/, '') }), { headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
        'Access-Control-Allow-Origin': '*',
      } });
    } catch (error) {
      return tokenErrorResponse(error);
    }
  };
}

export async function GET(request) {
  return createViewHandler()(request);
}

// 地址只参与数值种子计算，SVG 不插入任何外部输入或请求。
export function avatarSVG(address) {
  let seed = 2166136261;
  for (const char of String(address).toLowerCase()) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const hue = seed % 360, turn = (seed >>> 8) % 180, inset = 18 + seed % 12;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="a${seed}" x2="1" y2="1"><stop stop-color="hsl(${hue} 70% 60%)"/><stop offset="1" stop-color="hsl(${(hue + 75) % 360} 65% 24%)"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#a${seed})"/><g transform="rotate(${turn} 50 50)" fill="none" stroke="#fff" stroke-width="3"><rect x="${inset}" y="${inset}" width="${100 - inset * 2}" height="${100 - inset * 2}"/><circle cx="50" cy="50" r="${12 + seed % 13}"/><path d="M12 50h76M50 12v76" opacity=".4"/></g></svg>`;
}

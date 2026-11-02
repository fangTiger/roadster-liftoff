const positive=(value,fallback,max=Number.MAX_SAFE_INTEGER)=>{const n=Number(value);return Number.isSafeInteger(n)&&n>0&&n<=max?n:fallback;};
export function readConfig(env=process.env) {
 return {port:positive(env.ROOMS_PORT||env.PORT,8933,65535),host:env.ROOMS_HOST||undefined,
  allowedOrigins:(env.ROOMS_ALLOWED_ORIGINS||'').split(',').map(s=>s.trim()).filter(Boolean),
  maxPerIP:positive(env.ROOMS_MAX_PER_IP,10),maxConnections:positive(env.ROOMS_MAX_CONNECTIONS,500),trustProxy:env.ROOMS_TRUST_PROXY==='true'};
}

function parseOrigin(value) {
 try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&url.origin===value?url:null;}catch{return null;}
}
export function originAllowed(origin,patterns) {
 if(!patterns.length)return true;
 const url=parseOrigin(origin);if(!url||url.hostname.includes('*'))return false;
 return patterns.some(pattern=>{
  const allowed=parseOrigin(pattern);if(!allowed||allowed.protocol!==url.protocol||allowed.port!==url.port)return false;
  const hostname=allowed.hostname.split('*').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^.]+');
  return new RegExp('^'+hostname+'$').test(url.hostname);
 });
}
export function createAdmission({maxPerIP=10,maxConnections=500}={}) {
 const counts=new Map();let total=0;
 return {
  tryAcquire(ip){const count=counts.get(ip)||0;if(total>=maxConnections||count>=maxPerIP)return false;counts.set(ip,count+1);total++;return true;},
  release(ip){const count=counts.get(ip)||0;if(!count)return;if(count===1)counts.delete(ip);else counts.set(ip,count-1);total--;},
 };
}

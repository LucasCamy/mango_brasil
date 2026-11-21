import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
export const hashPassword=(value:string)=>argon2.hash(value,{type:argon2.argon2id,memoryCost:19456,timeCost:2,parallelism:1});
export async function verifyPassword(hash:string,value:string){try{return await argon2.verify(hash,value);}catch{return false;}}
export const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function safeEqual(a:string,b:string){const x=Buffer.from(tokenHash(a)),y=Buffer.from(tokenHash(b));return timingSafeEqual(x,y);}
export function encryptSecret(value:string,key:string){
  const iv=randomBytes(12);const cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv.toString('hex'),cipher.getAuthTag().toString('hex'),data.toString('hex')].join(':');
}
export function decryptSecret(value:string,key:string){
  const [iv,tag,data]=value.split(':'); if(!iv||!tag||data===undefined)throw Error('Invalid encrypted value');
  const cipher=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),Buffer.from(iv,'hex'));cipher.setAuthTag(Buffer.from(tag,'hex'));
  return Buffer.concat([cipher.update(Buffer.from(data,'hex')),cipher.final()]).toString('utf8');
}
export function intentHash(value:unknown):string {
  const canonical=(x:unknown):unknown=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)])):x;
  return tokenHash(JSON.stringify(canonical(value)));
}

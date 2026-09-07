import { createHmac, randomInt } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

const issuer='apex-ledger-api';
const audience='apex-ledger-email-2fa';

export function createEmailOtp():string{return String(randomInt(0,1_000_000)).padStart(6,'0');}
export function hashEmailOtp(secret:string,challengeBinding:string,code:string):string{
  return createHmac('sha256',secret).update(`${challengeBinding}\n${code}`).digest('hex');
}
export async function issueMfaSession(secret:string,objectId:string):Promise<string>{return new SignJWT({factor:'email_otp'})
  .setProtectedHeader({alg:'HS256',typ:'JWT'}).setIssuer(issuer).setAudience(audience).setSubject(objectId).setIssuedAt().setExpirationTime('8h').sign(new TextEncoder().encode(secret));}
export async function verifyMfaSession(secret:string,token:string|undefined,objectId:string):Promise<boolean>{if(!token)return false;try{const{payload}=await jwtVerify(token,new TextEncoder().encode(secret),
  {issuer,audience,algorithms:['HS256']});return payload.sub===objectId&&payload.factor==='email_otp';}catch{return false;}}
export function maskEmail(email:string):string{const[local,domain]=email.split('@');if(!local||!domain)return'verified email';return`${local.slice(0,1)}${'*'.repeat(Math.min(6,Math.max(2,local.length-1)))}@${domain}`;}

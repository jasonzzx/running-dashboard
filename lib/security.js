import {createCipheriv,createDecipheriv,randomBytes,createHash,createHmac} from 'node:crypto';
export const OWNER='jasonzzx@gmail.com';
export function owner(user){return Boolean(user?.emailVerified&&user.email?.toLowerCase()===OWNER);}
export function encrypt(value){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(process.env.CLOUD_ENCRYPTION_KEY,'base64'),iv);const bytes=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final(),cipher.getAuthTag()]);return Buffer.concat([iv,bytes]).toString('base64');}
export function decrypt(value){const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.CLOUD_ENCRYPTION_KEY,'base64'),b.subarray(0,12));d.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]).toString());}
export const digest=value=>createHash('sha256').update(value).digest('hex');
export function workerSignature(body,timestamp){return createHmac('sha256',process.env.CLOUD_WORKER_SECRET).update(timestamp+'.'+body).digest('hex');}
export function validAsset(path){return /^(data|analysis-data|garmin-data|pace-data)\.js$/.test(path)||/^details\/[a-zA-Z0-9_-]+\.js$/.test(path)||/^reports\/analysis-(en|zh)\.html$/.test(path);}
export function sameOrigin(request){return request.headers.get('origin')===new URL(request.url).origin;}

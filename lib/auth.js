import {createNeonAuth} from '@neondatabase/auth/next/server';
import {owner,sameOrigin} from './security';
let instance;
export function auth(){return instance??=createNeonAuth({baseUrl:process.env.NEON_AUTH_BASE_URL,cookies:{secret:process.env.NEON_AUTH_COOKIE_SECRET}});}
export async function requireOwner(request){
 if(request.method!=='GET'&&!sameOrigin(request))throw new Error('Forbidden origin');
 const {data}=await auth().getSession();
 if(!owner(data?.user))throw new Error('Unauthorized');
 return data.user;
}

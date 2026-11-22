import { createClient } from 'redis';
import { hostname } from 'node:os';
const url=process.env.REDIS_URL;if(!url)process.exit(1);
const redis=createClient({url,disableOfflineQueue:true,socket:{connectTimeout:2000,reconnectStrategy:false}});redis.on('error',()=>{});
try{await redis.connect();const value=await redis.get(`worker:heartbeat:${hostname()}`);process.exitCode=value&&Date.now()-Date.parse(value)<45000?0:1;}catch{process.exitCode=1;}finally{await redis.close().catch(()=>{});}

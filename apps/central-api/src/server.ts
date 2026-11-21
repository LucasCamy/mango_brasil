import { createApp } from './app.js';
import { loadConfig } from './config.js';
const config=loadConfig();
const {app}=await createApp(config,{logger:true});
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void app.close();});
await app.listen({port:config.PORT,host:'0.0.0.0'});

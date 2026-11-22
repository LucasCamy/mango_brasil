import { mkdir,open } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { buildEscPos } from './printing.js';
import { persistJournal,recoverPrintJournals,settleJournal,PrintAgentHttpError,type PrintJournal } from './print-journal.js';
import { PrinterFailure,tcpPrint } from './print-transport.js';
const api=process.env.CENTRAL_API_URL??'http://127.0.0.1:4000',token=process.env.PRINT_AGENT_TOKEN;
if(!token||token.length<32)throw Error('Configure PRINT_AGENT_TOKEN.');
const terminalId=process.env.PRINT_TERMINAL_ID??'CAIXA-01';
const transport=process.env.PRINT_TRANSPORT??'tcp';
if(!['tcp','spool'].includes(transport))throw Error('PRINT_TRANSPORT deve ser tcp ou spool.');
if(transport==='spool'&&process.env.NODE_ENV==='production')throw Error('Produção exige transporte TCP ESC/POS. Spool é apenas desenvolvimento.');
if(transport==='tcp'&&!process.env.PRINTER_HOST)throw Error('Configure PRINTER_HOST antes de iniciar o agente TCP.');
const directory=resolve(process.env.PRINT_SPOOL_DIR??'../../.local/print-spool');await mkdir(directory,{recursive:true});
const stop=new AbortController();for(const sig of ['SIGINT','SIGTERM'] as const)process.once(sig,()=>stop.abort());
async function request(path:string,body:unknown){
 const response=await fetch(api+path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify(body),signal:AbortSignal.any([stop.signal,AbortSignal.timeout(5000)])});if(!response.ok)throw new PrintAgentHttpError(response.status);return response.json() as Promise<Record<string,any>>;
}
async function ack(journal:PrintJournal){
 const status=journal.phase==='sending'?'FAILED':journal.status;
 await request(`/api/print-agent/jobs/${journal.jobId}/ack`,{claimToken:journal.claimToken,status,error:journal.error,uncertain:journal.uncertain??false});
}
console.log(`Agente ESC/POS iniciado para ${terminalId}; transporte ${transport}.`);
while(!stop.signal.aborted){
 try{
  const recovery=await recoverPrintJournals(directory,ack);
  if(recovery.needsReview.length)console.error(`Impressões aguardando conferência manual: ${recovery.needsReview.join(', ')}. Consulte arquivos .needs-review no spool.`);
  const result=await request('/api/print-agent/claim',{terminalId}),job=result.job;
  if(!job){await delay(1000,undefined,{signal:stop.signal});continue;}
  let journal:PrintJournal={jobId:job.id,claimToken:job.claimToken,phase:'sending'};await persistJournal(directory,journal);
  try{
   const bytes=buildEscPos(job.payload,transport==='spool');
   if(transport==='spool'){const handle=await open(join(directory,`${job.id}.escpos`),'wx',0o600);try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}}else await tcpPrint(bytes,{host:process.env.PRINTER_HOST??'',port:Number(process.env.PRINTER_PORT??9100),signal:stop.signal});
   journal={...journal,phase:'printed',status:transport==='spool'?'SIMULATED':'PRINTED'};
  }catch(error){journal={...journal,phase:'failed',status:'FAILED',error:error instanceof PrinterFailure?error.message:'Falha ao gravar comprovante.',uncertain:error instanceof PrinterFailure&&error.uncertain};}
  await persistJournal(directory,journal);const outcome=await settleJournal(directory,journal,ack);console.log(`Job ${job.id}: ${journal.status}; confirmação ${outcome}`);
 }catch{if(!stop.signal.aborted){console.error('Agente aguardando reconexão à Central.');await delay(3000,undefined,{signal:stop.signal}).catch(()=>{});}}
}

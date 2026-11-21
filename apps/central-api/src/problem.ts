import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { PaymentGatewayError } from '@totem-pdv/tef-client';
export class Problem extends Error {
  constructor(public status: number, public title: string, detail: string, public code = 'business-rule', public errors?: Record<string,string[]>) { super(detail); }
}
export const badRequest = (detail: string) => new Problem(400,'Entrada inválida',detail,'invalid-input');
export const conflict = (detail: string) => new Problem(409,'Conflito de estado',detail,'state-conflict');
export const notFound = (detail = 'Registro não encontrado.') => new Problem(404,'Não encontrado',detail,'not-found');
export const forbidden = (detail = 'Seu perfil não permite esta ação.') => new Problem(403,'Acesso negado',detail,'forbidden');
export function registerProblems(app: FastifyInstance) {
  app.setNotFoundHandler((request,reply)=>reply.code(404).type('application/problem+json').send({type:'urn:totem:problem:not-found',title:'Rota não encontrada',status:404,detail:'Confira o endereço solicitado.',instance:request.url}));
  app.setErrorHandler((error,request,reply)=>{
    let problem: Problem;
    if (error instanceof Problem) problem=error;
    else if(error instanceof PaymentGatewayError) problem=new Problem(error.code==='NOT_FOUND'?404:['TIMEOUT','ABORTED'].includes(error.code)?503:409,'Pagamento não concluído',error.message,`payment-${error.code.toLowerCase()}`);
    else if(error instanceof ZodError) {
      const errors:Record<string,string[]>={};
      for(const issue of error.issues) (errors[issue.path.join('.') || 'body'] ??= []).push(issue.message);
      problem=new Problem(400,'Entrada inválida','Revise os campos informados.','invalid-input',errors);
    } else if((error as {code?:string}).code==='23505') problem=conflict('Já existe um registro com esta chave.');
    else if((error as {code?:string}).code==='23503') problem=badRequest('Um dos registros referenciados não existe.');
    else if((error as {code?:string}).code==='23514') problem=new Problem(422,'Regra de negócio inválida','Os dados violam uma restrição do domínio.','constraint');
    else if(['57014','55P03','40P01','40001','FST_ERR_HANDLER_TIMEOUT'].includes((error as {code?:string}).code??'')||error instanceof Error&&['AbortError','TimeoutError'].includes(error.name)) problem=new Problem(503,'Operação temporariamente indisponível','Tempo limite ou conflito transacional. Reenvie a mesma chave de idempotência.','timeout');
    else if ((error as {statusCode?:number}).statusCode && (error as {statusCode:number}).statusCode<500) problem=new Problem((error as {statusCode:number}).statusCode,'Requisição não aceita','Confira a autenticação e os dados enviados.','request');
    else {
      request.log.error({err:{name:error instanceof Error?error.name:'Unknown',code:(error as {code?:string}).code},requestId:request.id},'Falha interna');
      problem=new Problem(500,'Falha interna','A operação não foi concluída. Reenvie com a mesma chave de idempotência.','internal');
    }
    reply.code(problem.status).type('application/problem+json').send({type:`urn:totem:problem:${problem.code}`,title:problem.title,status:problem.status,detail:problem.message,instance:request.url,requestId:request.id,...(problem.errors?{errors:problem.errors}:{})});
  });
}

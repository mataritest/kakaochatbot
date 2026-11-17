import http from 'node:http';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {timingSafeEqual} from 'node:crypto';
import {createBot} from './core.mjs';
import {startKeepAlive} from './keepalive.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(await fs.readFile(path.join(root,'content.json'),'utf8'));
let config={};try{config=JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const bot=createBot(data,config);
const port=Number(process.env.PORT??8787),host=process.env.HOST??'127.0.0.1';
const token=process.env.SKILL_TOKEN??'';
let keepAlive={status:{enabled:false,intervalMinutes:9},stop(){}};
if(process.env.NODE_ENV==='production'&&token.length<24)throw new Error('Set SKILL_TOKEN to a random secret of at least 24 characters.');
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"};
function same(a,b){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
function send(res,status,value){res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));}
export const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='GET'&&url.pathname==='/health')return send(res,200,{status:'ok',version:data.meta.version,keepAlive:keepAlive.status});
  if(req.method==='GET'&&/^\/menu-(faq|tests|ivf|consult|pgt|recurrent)\.png$/.test(url.pathname)){
   res.writeHead(200,{...headers,'Cache-Control':'public, max-age=3600','Content-Type':'image/png'});
   res.end(await fs.readFile(path.join(root,url.pathname.slice(1))));return;
  }
  if(req.method==='POST'&&/^\/skill(?:\/[A-Z]-\d\d)?$/.test(url.pathname)){
   if(token&&!same(String(req.headers['x-skill-token']??''),token))return send(res,401,{error:'Unauthorized'});
   if(!String(req.headers['content-type']??'').toLowerCase().startsWith('application/json'))return send(res,415,{error:'application/json required'});
   const chunks=[];let size=0;
   for await(const chunk of req){size+=chunk.length;if(size>32768){send(res,413,{error:'Request too large'});req.resume();return;}chunks.push(chunk);}
   let payload;try{payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(res,400,{error:'Invalid JSON'});}
   if(!payload||typeof payload!=='object'||Array.isArray(payload))return send(res,400,{error:'Invalid payload'});
   const id=url.pathname.split('/')[2];
   if(id&&!bot.byId.has(id))return send(res,404,{error:'Unknown block'});
   // Do not log the request, identifiers, utterance, headers or response.
   return send(res,200,bot.handle(payload,id).response);
  }
  if(req.method==='GET'&&(url.pathname==='/'||url.pathname==='/index.html')){
   res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8'});
   res.end(await fs.readFile(path.join(root,'index.html')));return;
  }
  return send(res,404,{error:'Not found'});
 }catch{if(!res.headersSent)send(res,500,{error:'Internal server error'});else res.end();}
});
server.requestTimeout=5000;server.headersTimeout=6000;
server.listen(port,host,()=>{
 console.log(`Preview: http://${host}:${server.address().port} | Kakao: POST /skill`);
 if(process.env.KEEP_ALIVE_ENABLED!=='false')keepAlive=startKeepAlive({baseUrl:process.env.RENDER_EXTERNAL_URL});
});
server.on('close',()=>keepAlive.stop());

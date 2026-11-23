import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createBot} from './core.mjs';
const data=JSON.parse(await fs.readFile(new URL('./content.json',import.meta.url),'utf8'));
const bot=createBot(data);
const ask=t=>bot.handle({userRequest:{utterance:t}});
test('patient questions and both doctor routes',()=>{
 assert.equal(bot.handle({userRequest:{utterance:'웰컴',block:{name:'웰컴 블록'}}}).id,'S-01');
 assert.equal(bot.handle({userRequest:{utterance:'출혈이 심해요',block:{name:'웰컴 블록'}}}).id,'S-05');
 for(const [q,id] of [
  ['난자 채취는 금식하나요','Q-01'],['이식하고 회사 가도 되나요','Q-02'],
  ['조무성 원장님 상담','B-08'],['유지희 원장님 상담','B-09'],
  ['시험관','E-01'],['반복유산','R-01'],['PGT-A','P-02'],['생리 중에도 가도 되나요','I-02'],
  ['정액검사','D-03'],['예약 취소','H-07'],['처음으로','S-02'],['지원금','G-04'],
  ['이식 후 임신 확인 언제 하나요','Q-03'],['인공수정 시험관 차이','F-05'],['검사 결과 언제 나와요','D-05']
 ])assert.equal(ask(q).id,id,q);
});

test('patient responses omit source boilerplate and explain partner attendance clearly',()=>{
 for(const b of data.blocks)assert.doesNotMatch(JSON.stringify(bot.response(b.id)),/팜플렛|팸플릿|팜플릿|시연|미리보기|기존 채널/);
 const text=ask('배우자 동반이 필요한가요?').block.text;
 assert.match(text,/혼자 내원 가능/);
 assert.match(text,/첫 상담[\s\S]*초음파.*혈액검사/);
 assert.match(text,/난자 채취일.*정자 채취/);
 assert.match(text,/인공수정·시험관 시술 동의서.*부부 서명/);
 assert.match(text,/별도 내원도 가능/);
});
test('safety takes priority over FAQ and explicit target',()=>{
 for(const [q,id] of [
  ['난자 채취 후 숨이 차요','S-05'],['출혈이 심해요','S-05'],['배가 너무 아파요','S-05'],
  ['아스피린 먹어도 되나요','S-07'],['주사 용량을 바꿔도 돼요','S-07'],['이식 후 갈색혈이 보여요','S-07'],
  ['AMH 1.2 정상인가요','S-06'],['hCG 수치로 임신인가요','S-06'],['검사 결과 알려주세요','S-06'],
  ['010-1234-5678 예약','S-08'],['900101-1234567','S-08'],['4111 1111 1111 1111','S-08'],
  ['제가 시험관 할 수 있나요','S-07']
 ]){
  assert.equal(ask(q).id,id,q);
  assert.equal(bot.handle({userRequest:{utterance:q},action:{clientExtra:{targetBlock:'E-01'}}},'E-01').id,id,'target cannot bypass '+q);
 }
});
test('no invented answers, no reservation collection or false completion',()=>{
 assert.equal(ask('내일 비가 오나요').id,'S-03');
 for(const id of ['H-02','H-03','H-04','H-05','H-06'])assert.equal(bot.handle({},id).id,'H-01');
 assert.equal(data.meta.collectReservations,false);
 assert.equal(data.meta.consultationHoursConfirmed,false);
 assert.equal(ask('성공률 알려주세요').id,'S-07');
});
test('all live outputs satisfy Kakao limits and reach home',()=>{
 assert.equal(data.blocks.length,75);
 const reachable=new Set();const todo=['S-02'];while(todo.length){const id=todo.pop();if(reachable.has(id))continue;reachable.add(id);const b=bot.byId.get(id);for(const a of [...b.links,...b.items])if(a.target)todo.push(a.target);}
 for(const b of data.blocks){
  if(!b.enabled)continue;
  const r=bot.response(b.id);
  assert.equal(r.version,'2.0');assert.ok(r.template.outputs.length<=3&&r.template.outputs.length>=1);
  assert.ok(r.template.quickReplies.length<=10);
  for(const q of r.template.quickReplies){assert.ok(['message','block'].includes(q.action));assert.ok(q.label.length<=14);}
  for(const out of r.template.outputs){
   if(out.simpleText)assert.ok(out.simpleText.text.length<=400);
   if(out.textCard){assert.ok(out.textCard.title.length<=50);assert.ok((out.textCard.description??'').length<=230);assert.ok(out.textCard.buttons.length<=3);}
   if(out.basicCard){assert.ok(out.basicCard.title.length<=50);assert.ok((out.basicCard.description??'').length<=230);assert.ok((out.basicCard.buttons??[]).length<=3);assert.match(out.basicCard.thumbnail.imageUrl,/^https:\/\/agaebom-kakaochatbot\.onrender\.com\/menu-/);}
   if(out.listCard){assert.ok(out.listCard.items.length<=5);for(const i of out.listCard.items){assert.ok(i.title.length<=30);assert.ok(!('label'in i));assert.ok(['message','block'].includes(i.action));}}
  }
  assert.ok(Buffer.byteLength(JSON.stringify(r),'utf8')<30720);
  assert.doesNotMatch(b.text,/\d+(?:\.\d+)?\s*%|반드시.*임신|자정부터.*금식/);
  // Every active FAQ is reachable via the navigation or a global safety branch.
  assert.ok(reachable.has(b.id)||b.id.startsWith('S-')||['B-01','C-02'].includes(b.id),'Unreachable '+b.id);
  if(b.id!=='S-02'){
   const seen=new Set();const queue=[b.id];while(queue.length){const id=queue.pop();if(seen.has(id))continue;seen.add(id);for(const a of [...bot.byId.get(id).links,...bot.byId.get(id).items])if(a.target)queue.push(a.target);}
   assert.ok(seen.has('S-02'),'no exit '+b.id);
  }
 }
});
test('real operator button and provided Naver URL',()=>{
 const op=bot.response('B-08').template.outputs[0].basicCard.buttons;
 assert.ok(op.some(x=>x.action==='operator'));
 const nv=bot.response('B-09').template.outputs[0].basicCard.buttons;
 assert.equal(nv[0].webLinkUrl,'http://talk.naver.com/WFMOB5L');
});
test('every button target carries a reliable target and safety still applies',()=>{
 for(const b of data.blocks)for(const a of [...b.links,...b.items])if(a.target){
  assert.ok(bot.byId.has(a.target),b.id+' -> '+a.target);
  const selected=bot.handle({userRequest:{utterance:a.label},action:{clientExtra:{targetBlock:a.target}}});
  assert.equal(selected.id,bot.byId.get(a.target).enabled?a.target:'H-01',b.id+' '+a.label);
 }
 const mapped=createBot(data,{blockIds:{'E-04':'realKakaoBlock'}}).response('E-01');
 const actions=[...mapped.template.quickReplies,...mapped.template.outputs.flatMap(o=>(o.basicCard??o.textCard)?.buttons??[])];
 assert.ok(actions.some(a=>a.blockId==='realKakaoBlock'&&a.action==='block'));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startKeepAlive,PING_INTERVAL_MS} from './keepalive.mjs';
test('health pings at nine-minute interval, recovers after failure, never sends patient data',async()=>{
 let tick,interval,fail=true;const calls=[];
 const k=startKeepAlive({baseUrl:'https://example.onrender.com/skill',
  schedule:(callback,ms)=>{tick=callback;interval=ms;return {unref(){}};},log:()=>{},
  fetchFn:async(url,options)=>{calls.push({url,options});if(fail)throw Error('offline');return new Response('{"status":"ok"}',{status:200});}});
 await new Promise(r=>setImmediate(r));assert.equal(k.status.lastOk,false);
 assert.equal(interval,540000);assert.equal(interval,PING_INTERVAL_MS);
 fail=false;tick();await new Promise(r=>setImmediate(r));
 assert.equal(k.status.lastOk,true);assert.ok(k.status.lastSuccess);
 assert.equal(calls[1].url,'https://example.onrender.com/health');
 assert.ok(!calls[1].options.body);assert.deepEqual(Object.keys(calls[1].options.headers),['User-Agent']);
 k.stop();tick();await new Promise(r=>setImmediate(r));assert.equal(calls.length,2);
});
test('no ping outside Render, HTTPS required',()=>{
 assert.equal(startKeepAlive().status.enabled,false);
 assert.throws(()=>startKeepAlive({baseUrl:'http://example.com'}),/HTTPS/);
});

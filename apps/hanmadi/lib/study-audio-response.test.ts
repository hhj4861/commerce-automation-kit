import test from "node:test";
import assert from "node:assert/strict";
import {createStudySpeechResponses} from "./study-audio-response";
const response=()=>new Response(new Uint8Array([1,2,3]),{headers:{"Content-Type":"audio/mpeg"}});
test("speech forwards early bytes and caches only completed authored audio",async()=>{
 const serve=createStudySpeechResponses();let upstream!:ReadableStreamDefaultController<Uint8Array>,calls=0;
 const synth=async()=>{calls++;return new Response(new ReadableStream<Uint8Array>({start(c){upstream=c}}),{headers:{"Content-Type":"audio/mpeg"}})};
 const r=await serve("public-lesson",synth),reader=r.body!.getReader();upstream.enqueue(new Uint8Array([1]));
 assert.deepEqual((await reader.read()).value,new Uint8Array([1]));
 upstream.enqueue(new Uint8Array([2]));upstream.close();await reader.read();assert.equal((await reader.read()).done,true);
 const hit=await serve("public-lesson",synth);assert.equal(hit.headers.get("x-hanmadi-audio"),"lesson-cache");assert.equal((await hit.arrayBuffer()).byteLength,2);assert.equal(calls,1);
});
test("private text is never shared; public cache has byte, TTL and model-key bounds",async()=>{
 let calls=0,now=0;const serve=createStudySpeechResponses({maxBytes:3,ttlMs:10,now:()=>now});const synth=async()=>{calls++;return response()};
 for(let i=0;i<2;i++)await(await serve(null,synth)).arrayBuffer();assert.equal(calls,2);
 await(await serve("modelA:text",synth)).arrayBuffer();await(await serve("modelA:text",synth)).arrayBuffer();assert.equal(calls,3);
 await(await serve("modelB:text",synth)).arrayBuffer();await(await serve("modelA:text",synth)).arrayBuffer();assert.equal(calls,5);
 now=11;await(await serve("modelA:text",synth)).arrayBuffer();assert.equal(calls,6);
});
test("interrupted or oversized speech is not published to the cache",async()=>{
 const serve=createStudySpeechResponses();let calls=0;
 const broken=async()=>{calls++;return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));setTimeout(()=>c.error(new Error("lost")),0)}}),{headers:{"Content-Type":"audio/mpeg"}})};
 await assert.rejects((await serve("a",broken)).arrayBuffer(),/lost/);
 await assert.rejects((await serve("a",broken)).arrayBuffer(),/lost/);assert.equal(calls,2);
 await assert.rejects((await serve("large",async()=>new Response(new Uint8Array(5_000_001),{headers:{"Content-Type":"audio/mpeg"}}))).arrayBuffer(),/size limit/);
});
test("browser cancellation cancels the upstream stream",async()=>{
 let cancelled=false;const serve=createStudySpeechResponses();
 const r=await serve(null,async()=>new Response(new ReadableStream({cancel(){cancelled=true}}),{headers:{"Content-Type":"audio/mpeg"}}));
 await r.body!.cancel();assert.equal(cancelled,true);
});

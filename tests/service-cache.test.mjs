import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
const source = await readFile(new URL('../lib/service-cache.ts', import.meta.url),'utf8');
const compiled = ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022});
const moduleUrl = 'data:text/javascript;base64,'+Buffer.from(compiled).toString('base64');
const {saveServiceSnapshot,clearServiceSnapshot}=await import(moduleUrl);
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('rapid service snapshots finish in order, leaving the newest data',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);const order=[];
 globalThis.caches={open:async()=>({put:async(_key,response)=>{const data=await response.json();if(data.version===1)await gate;order.push(data.version);}}),delete:async()=>true};
 const first=saveServiceSnapshot({version:1});const second=saveServiceSnapshot({version:2});
 await tick();assert.deepEqual(order,[]);release();await Promise.all([first,second]);assert.deepEqual(order,[1,2]);
 delete globalThis.caches;
});
test('session clearing waits for in-progress writes and prevents queued data from reappearing',async()=>{
 let release;const gate=new Promise(resolve=>release=resolve);let stored=null;
 globalThis.caches={open:async()=>({put:async(_key,response)=>{const data=await response.json();await gate;stored=data;}}),delete:async()=>{stored=null;return true}};
 const first=saveServiceSnapshot({version:1});const second=saveServiceSnapshot({version:2});await tick();
 const clear=clearServiceSnapshot();release();await Promise.all([first,second,clear]);assert.equal(stored,null);
 delete globalThis.caches;
});

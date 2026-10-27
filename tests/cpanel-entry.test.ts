import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const script=fs.readFileSync(path.resolve('deploy/cpanel-entry.cjs'),'utf8');
function entry(mode='web',id='20261027T184815420Z-cpanel',escaped=false){
 const account=path.resolve('entry-test-account'),releases=path.join(account,'mekteb-releases');
 const env:Record<string,string>={},loaded:string[]=[],changed:string[]=[];
 const context={process:{argv:['node','app-current.cjs',mode],env,chdir:(value:string)=>changed.push(value)},require:(name:string)=>{
  if(name==='node:path')return path;
  if(name==='node:os')return {homedir:()=>account};
  if(name==='node:fs')return {readFileSync:()=>JSON.stringify({id}),realpathSync:(value:string)=>escaped&&value.endsWith('backend')?path.resolve('outside-account'):value};
  loaded.push(name);
 }};
 return {run:()=>vm.runInNewContext(script,context),env,loaded,changed,account,releases,id};
}
test('cPanel entry selects matching web/worker runtime and the stable private configuration',()=>{
 for(const mode of ['web','worker']){const fixture=entry(mode);fixture.run();const backend=path.join(fixture.releases,fixture.id,'backend');assert.deepEqual(fixture.changed,[backend]);assert.deepEqual(fixture.loaded,[path.join(backend,mode==='web'?'dist/index.js':'dist/push-worker.js')]);assert.equal(fixture.env.NODE_ENV,'production');assert.equal(fixture.env.MEKTEB_ENV_FILE,path.join(fixture.account,'mekteb-shared/backend.env'));}
});
test('cPanel entry refuses invalid pointers, directory escapes and unknown modes before loading code',()=>{
 for(const fixture of [entry('web','../../outside'),entry('web',undefined,true),entry('arbitrary')]){assert.throws(fixture.run);assert.deepEqual(fixture.loaded,[]);}
});

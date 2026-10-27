const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');

function verifyRelease(root){
  root=fs.realpathSync(root);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'release-manifest.json'),'utf8'));
  if(manifest.format!==1||!manifest.files?.length)throw new Error('Invalid release manifest');
  for(const file of manifest.files){
    if(!/^[a-zA-Z0-9_./-]+$/.test(file.path)||file.path.split('/').includes('..')||path.isAbsolute(file.path))throw new Error('Invalid manifest path');
    const name=path.join(root,file.path),real=fs.realpathSync(name);
    if(!real.startsWith(root+path.sep)||fs.lstatSync(name).isSymbolicLink())throw new Error('Release path escaped root');
    const bytes=fs.readFileSync(name);
    if(bytes.length!==file.bytes||createHash('sha256').update(bytes).digest('hex')!==file.sha256)throw new Error(`Release checksum mismatch: ${file.path}`);
  }
  return manifest;
}
module.exports={verifyRelease};
if(require.main===module){try{const result=verifyRelease(process.argv[2]??path.resolve(__dirname,'../..'));console.log(`Release verified: ${result.id}; files=${result.files.length}`);}catch(error){console.error(error.message);process.exitCode=1;}}

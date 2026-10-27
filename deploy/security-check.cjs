// No secret values are printed. Scan Git candidates or the exact staged blobs.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const args=process.argv.slice(2),option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
const repo=path.resolve(option('--repo')||process.cwd()),staged=args.includes('--staged');
const git=argv=>execFileSync('git',['-c','safe.directory='+repo.replace(/\\/g,'/'),'-C',repo,...argv],{encoding:'utf8',maxBuffer:100*1024*1024,stdio:['ignore','pipe','pipe']});
const filenames=[...new Set(git(staged?['diff','--cached','--name-only','--diff-filter=ACMR','-z']:['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))];
const references=[];
for(let i=0;i<args.length;i++)if(args[i]==='--reference'){
 const file=path.resolve(args[++i]);
 const parsed=require('dotenv').parse(fs.readFileSync(file));
 for(const [name,value]of Object.entries(parsed))if(/PASS|SECRET|TOKEN|PRIVATE_KEY/i.test(name)&&value.length>=8&&!/^(?:<.*>|replace[-_]|change[-_]|your[-_])/i.test(value))references.push({name,value:Buffer.from(value)});
}
const findings=[];let scanned=0;
for(const filename of filenames){
 const absolute=path.join(repo,filename);if(!staged&&!fs.existsSync(absolute))continue;
 if(/(^|\/)\.env(?:\.|$)/.test(filename)&&!filename.endsWith('.example'))findings.push({file:filename,reason:'private environment file'});
 if(/(^|\/)(?:\.deploy-access|production-backups|node_modules)(\/|$)|\.(?:pem|key|p12|pfx|sql\.gz|dump)$|(^|\/)id_(?:rsa|ed25519|mekteb_)/i.test(filename))findings.push({file:filename,reason:'private credential, backup or dependency path'});
 const data=staged?execFileSync('git',['-c','safe.directory='+repo.replace(/\\/g,'/'),'-C',repo,'show',':'+filename],{maxBuffer:30*1024*1024}):fs.readFileSync(absolute);scanned++;
 for(const reference of references)if(data.includes(reference.value))findings.push({file:filename,reason:'matches protected '+reference.name});
 const text=data.toString('utf8');
 if(/-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/.test(text))findings.push({file:filename,reason:'private key material'});
 if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{35,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,})/.test(text))findings.push({file:filename,reason:'credential token pattern'});
 if(/cpsess\d{6,}/.test(text))findings.push({file:filename,reason:'private cPanel session URL'});
 if(!/(^|\/)tests\//.test(filename)&&/https?:\/\/[^\s/:@]+:[^\s/@]+@/.test(text))findings.push({file:filename,reason:'credential embedded in URL'});
}
console.log(JSON.stringify({repo:path.basename(repo),mode:staged?'staged blobs':'working candidates',scanned,protectedValuesChecked:references.length,findings},null,2));
if(findings.length)process.exitCode=1;

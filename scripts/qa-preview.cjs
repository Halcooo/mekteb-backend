// Run with node --import tsx scripts/qa-preview.cjs against a marked disposable instance only.
const {createQaEnvironment}=require('../tests/support/qaEnvironment.ts');
(async()=>{
 const environment=await createQaEnvironment(5507);
 console.log('QA preview: http://127.0.0.1:5507 (synthetic accounts and data; no push worker)');
 const stop=()=>environment.stop().then(()=>process.exit(0));
 process.stdin.setEncoding('utf8');process.stdin.on('data',data=>{const command=data.trim();if(command==='q')void stop();else if(command.startsWith('fail-')){environment.faults.add(command.slice(5));console.log('Armed one synthetic failure: '+command.slice(5));}});
 process.once('SIGINT',stop);process.once('SIGTERM',stop);
})().catch(error=>{console.error(error.code??error.message);process.exit(1);});

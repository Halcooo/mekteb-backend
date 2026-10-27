export async function runPushPass(processBatch:()=>Promise<number>,options:{maxBatches?:number;budgetMs?:number;now?:()=>number;stopped?:()=>boolean}={}) {
  const {maxBatches=20,budgetMs=45_000,now=Date.now,stopped=()=>false}=options;
  if(!Number.isInteger(maxBatches)||maxBatches<1||budgetMs<1)throw new Error('Invalid push pass bounds');
  const deadline=now()+budgetMs;let batches=0,claimed=0;
  while(batches<maxBatches&&now()<deadline&&!stopped()){
    const count=await processBatch();batches++;claimed+=count;
    if(count===0)break;
  }
  return {batches,claimed};
}

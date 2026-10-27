// Stable private startup file. Deploys change the atomic active-release pointer.
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const accountHome=os.homedir();
const shared=path.join(accountHome,'mekteb-shared');
const active=JSON.parse(fs.readFileSync(path.join(shared,'active-release.json'),'utf8'));
if(!/^\d{8}T\d{9}Z-cpanel$/.test(active.id))throw new Error('Invalid active release');
const releases=fs.realpathSync(path.join(accountHome,'mekteb-releases'));
const backend=fs.realpathSync(path.join(releases,active.id,'backend'));
if(!backend.startsWith(releases+path.sep))throw new Error('Active release escaped the private release directory');
const mode=process.argv[2]??'web';
if(!['web','worker'].includes(mode))throw new Error('Unsupported startup mode');
process.env.NODE_ENV='production';
process.env.MEKTEB_ENV_FILE=path.join(shared,'backend.env');
process.chdir(backend);
require(path.join(backend,mode==='worker'?'dist/push-worker.js':'dist/index.js'));

const fs = require('node:fs');
const path = require('node:path');
const webPush = require('web-push');
const destination = path.resolve(process.cwd(), '.env.web-push.local');
const keys = webPush.generateVAPIDKeys();
fs.writeFileSync(destination, `WEB_PUSH_PUBLIC_KEY=${keys.publicKey}\nWEB_PUSH_PRIVATE_KEY=${keys.privateKey}\nWEB_PUSH_SUBJECT=https://mekteb-pazaric.com\n`, {flag:'wx',mode:0o600});
console.log('Created .env.web-push.local. Copy its values into private deployment configuration. Keep the key pair stable; this command never overwrites it.');

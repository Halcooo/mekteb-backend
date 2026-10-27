// This temporary cPanel process exposes no commands, files or application data.
require('node:http').createServer((_req,res)=>{
  res.writeHead(404,{'Content-Type':'text/plain','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end('Not found');
}).listen(process.env.PORT||3000);

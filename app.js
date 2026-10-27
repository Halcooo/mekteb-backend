// cPanel/Passenger default startup file. Configuration and uploads stay outside
// the public document roots and outside files copied during a release.
process.env.NODE_ENV ??= 'production';
process.chdir(__dirname);
require('./dist/index.js');

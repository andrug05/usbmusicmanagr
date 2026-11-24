'use strict';
var scanner=require('./scanner');
function main() {
  try { process.stdout.write(JSON.stringify(scanner.scanAll({maxFiles:20000}),null,2)+'\n'); }
  catch(e) { process.stderr.write('USB Music Manager scan failed: '+(e&&e.message?e.message:String(e))+'\n'); process.exitCode=1; }
}
if(require.main===module) main();
module.exports={main:main};

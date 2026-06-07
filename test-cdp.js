/**

 */

const http = require('http');

const HOST = '127.0.0.1';
const PORT = 9223;

console.log(`\n🧪 Testing CDP at http://${HOST}:${PORT}/json/version\n`);

const req = http.get(
  { hostname: HOST, port: PORT, path: '/json/version', timeout: 5000 },
  (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('✅ CDP is reachable!');
        console.log(`   Browser   : ${data.Browser}`);
        console.log(`   Protocol  : ${data['Protocol-Version']}`);
        console.log(`   WS URL    : ${data.webSocketDebuggerUrl}`);
      } catch {
        console.log('❌ CDP responded but returned invalid JSON:', body);
      }
    });
  }
);
req.on('error', (e) => {
  console.log(`❌ CDP not reachable: ${e.message}`);
  console.log('   Make sure the Docker container is running:');
  console.log('   docker run -d --rm -p 9223:9223 --shm-size=256m --name bld-session bld-chromium:latest');
});
req.on('timeout', () => { req.destroy(); console.log('❌ CDP timed out.'); });

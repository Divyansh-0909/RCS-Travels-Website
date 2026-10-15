// Trusted fixed-destination database channel. No credentials or arbitrary routing.
import assert from 'node:assert/strict';
import {createServer,createConnection} from 'node:net';
assert.match(process.env.CUSTODY_PROXY_HOST,/^172\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/);
const server=createServer(socket=>{const remote=createConnection({host:process.env.CUSTODY_PROXY_HOST,port:5432});socket.on('error',()=>remote.destroy());remote.on('error',()=>socket.destroy());socket.pipe(remote).pipe(socket);});
server.maxConnections=32;server.listen(5433,'127.0.0.1',()=>process.stdout.write('CUSTODY_PROXY_READY\n'));

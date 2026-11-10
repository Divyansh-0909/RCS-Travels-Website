import {createServer} from 'node:net';
// Synthetic counterfactual control. No secrets, host mounts or external endpoint.
const server=createServer(socket=>{socket.on('error',()=>{});socket.end('synthetic-custody-network-canary');});
server.maxConnections=4;
server.listen(5432,'0.0.0.0',()=>process.stdout.write('CUSTODY_CANARY_READY\n'));

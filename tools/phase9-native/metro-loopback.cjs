const net = require('node:net');
if (process.env.PHASE9_METRO_ISOLATED !== '1' || process.env.EXPO_NO_DOTENV !== '1') {
  throw new Error('Metro loopback guard requires the dedicated Phase9 environment');
}
const listen = net.Server.prototype.listen;
net.Server.prototype.listen = function (...args) {
  if (typeof args[0] === 'object' && args[0] !== null) {
    if (args[0].path) throw new Error('Phase9 Metro requires loopback TCP');
    args[0] = { ...args[0], host: '127.0.0.1' };
  } else if (typeof args[0] === 'number') {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1,0,'127.0.0.1');
  } else throw new Error('Phase9 Metro requires a numeric TCP port');
  return listen.apply(this,args);
};

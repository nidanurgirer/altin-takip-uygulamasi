const { io } = require('socket.io-client');
const sock = io('wss://socket.haremaltin.com', { path: '/socket.io', transports: ['websocket'], secure: true });

sock.on('connect', () => console.log('CONNECTED'));

sock.on('price_changed', (args) => {
  if (!args || !args.data) return;
  const keys = Object.keys(args.data);
  console.log('\n=== ALL KEYS ===');
  console.log(JSON.stringify(keys, null, 2));
  
  // Print first 3 items fully to see field names
  for (const key of keys) {
    const item = args.data[key];
    console.log(`\n--- ${key} ---`);
    console.log(JSON.stringify(item, null, 2));
  }
  
  sock.close();
  process.exit(0);
});

setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 15000);

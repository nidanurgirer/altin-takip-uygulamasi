const https = require('https');
https.get('https://www.haremaltin.com/', (res) => {
  let body = '';
  res.on('data', (c) => body += c);
  res.on('end', () => {
    const matches = [...body.matchAll(/<td[^>]*class=[\"']isim[\"'][^>]*>\s*(?:<span.*?>)?(.*?)(?:<\/span>)?\s*<\/td>/g)];
    const names = matches.map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    console.log(JSON.stringify(names.slice(0, 25), null, 2));
  });
});

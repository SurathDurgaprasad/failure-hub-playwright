const fs = require('node:fs');
const zlib = require('node:zlib');

// 1. Read the raw JSON file
const rawJson = fs.readFileSync('sample-payload.json', 'utf8');

// 2. Compress it (This is what Failure-Hub does under the hood)
const compressed = zlib.gzipSync(rawJson);

console.log(`Original Size: ${rawJson.length} bytes`);
console.log(`Gzipped Size: ${compressed.length} bytes`);
console.log(`Compression ratio: ${Math.round(100 - (compressed.length / rawJson.length * 100))}%`);

// 3. Post it to the Mock Server
fetch('http://localhost:3000/api/ingest', {
  method: 'POST',
  headers: {
    // These two headers are MANDATORY for the server to parse it correctly
    'Content-Encoding': 'gzip',
    'Content-Type': 'application/json'
  },
  body: compressed
})
.then(res => res.json())
.then(data => {
  console.log('Server Response:', data);
  console.log('Success! Check your dashboard at http://localhost:3000');
})
.catch(err => console.error('Failed to post:', err));

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// Keep the source icon reproducible without a graphics tool or a build dependency.
function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, bytes])));
  return Buffer.concat([length, name, bytes, checksum]);
}
function iconPng(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size, ny = y / size;
      let color = [0, 0, 0, 0];
      if (nx > .10 && nx < .90 && ny > .08 && ny < .92) {
        const cornerDistance = Math.hypot(Math.max(.19 - nx, 0, nx - .81), Math.max(.17 - ny, 0, ny - .83));
        if (cornerDistance < .09) color = [255, 222 - Math.round(ny * 12), 128, 255];
        if (nx > .63 && ny > .65 && nx + ny > 1.54) color = [186, 126, 42, 255];
        if (nx > .63 && ny > .65 && nx + ny <= 1.54 && nx + ny > 1.48) color = [255, 238, 181, 255];
        if (nx > .25 && nx < .70 && ((ny > .31 && ny < .34) || (ny > .44 && ny < .47))) color = [105, 78, 38, 255];
        if (nx > .25 && nx < .53 && ny > .57 && ny < .60) color = [105, 78, 38, 255];
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      pixels.set(color, offset);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}
const directory = path.join(__dirname, '..', 'assets');
fs.mkdirSync(directory, {recursive: true});
const png = iconPng(256);
fs.writeFileSync(path.join(directory, 'icon.png'), png);
const icoHeader = Buffer.alloc(22);
icoHeader.writeUInt16LE(1, 2);
icoHeader.writeUInt16LE(1, 4);
icoHeader[8] = 0;
icoHeader.writeUInt16LE(1, 10);
icoHeader.writeUInt16LE(32, 12);
icoHeader.writeUInt32LE(png.length, 14);
icoHeader.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(directory, 'icon.ico'), Buffer.concat([icoHeader, png]));
console.log('Generated assets/icon.png and assets/icon.ico');

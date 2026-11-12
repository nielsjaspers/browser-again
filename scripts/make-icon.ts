import { deflateSync } from "node:zlib";
const size = 1024;
const data = Buffer.alloc((size * 3 + 1) * size);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const circle = Math.hypot(x - 512, y - 512);
    const ring = circle >= 295 && circle <= 316;
    const north = y >= 275 && y <= 540 && Math.abs(x - 512) < (y - 275) * .42;
    const south = y >= 484 && y <= 749 && Math.abs(x - 512) < (749 - y) * .42;
    const color = ring ? [230, 235, 217] : north ? [181, 204, 151] : south ? [95, 123, 80] : [29, 45, 33];
    const offset = y * (size * 3 + 1) + 1 + x * 3;
    data.set(color, offset);
  }
}
function chunk(name: string, bytes: Buffer) {
  const body = Buffer.concat([Buffer.from(name), bytes]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const out = Buffer.alloc(bytes.length + 12);
  out.writeUInt32BE(bytes.length); body.copy(out, 4); out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4);
  return out;
}
const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 2;
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(data)), chunk("IEND", Buffer.alloc(0))]);
await Bun.write(new URL("../Browser Again/Browser Again/Assets.xcassets/AppIcon.appiconset/AppIcon.png", import.meta.url), png);
await Bun.write(new URL("../Browser Again/Browser Again/Assets.xcassets/AppIcon.appiconset/Contents.json", import.meta.url), JSON.stringify({images: [{idiom: "universal", platform: "ios", size: "1024x1024", filename: "AppIcon.png"}], info: {author: "xcode", version: 1}}, null, 2));

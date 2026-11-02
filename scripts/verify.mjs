// 開発用: ディレクトリ内の .fsb をすべて、純 TS 版と vgmstream (.build/wasm/ にビルドしたもの) でデコードして比べる。
// 使い方: pnpm build:wasm && pnpm build && pnpm verify <dir>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { openFSB } from '../dist/index.mjs';
import createVgmstream from '../.build/wasm/vgmstream.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/verify.mjs <dir>');
  process.exit(1);
}

const wasm = await WebAssembly.compile(
  readFileSync(new URL('../.build/wasm/vgmstream-cli.wasm', import.meta.url)),
);

// vgmstream-cli の main は 1 回しか呼べないので、ファイルごとに新しいインスタンスを作る
async function vgmstreamWAV(buf, subsong) {
  const m = await createVgmstream({
    print: () => {},
    printErr: () => {},
    instantiateWasm: (imports, done) => {
      void WebAssembly.instantiate(wasm, imports).then((i) => done(i));
      return {};
    },
  });
  m.FS.writeFile('/in.fsb', buf);
  if (m.callMain(['-i', '-s', String(subsong), '-o', '/out.wav', '/in.fsb']) !== 0)
    throw new Error('vgmstream failed');
  return m.FS.readFile('/out.wav');
}

function findChunk(wav, id) {
  const dv = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
  for (let o = 12; o + 8 <= wav.length; o += 8 + dv.getUint32(o + 4, true)) {
    if (String.fromCharCode(...wav.subarray(o, o + 4)) === id)
      return wav.subarray(o + 8, o + 8 + dv.getUint32(o + 4, true));
  }
  throw new Error(`no ${id} chunk`);
}

function* walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.fsb')) yield p;
  }
}

let ok = 0;
const bad = [];
for (const file of walk(dir)) {
  const buf = readFileSync(file);
  try {
    process.stdout.write(`checking: ${relative(dir, file)}...`);
    const fsb = openFSB(buf);
    for (const s of fsb.streams) {
      const ours = fsb.decode(s.index).toWAV();
      const ref = await vgmstreamWAV(buf, s.index + 1);
      const a = findChunk(ours, 'data');
      const b = findChunk(ref, 'data');
      if (
        !Buffer.from(findChunk(ours, 'fmt ')).equals(Buffer.from(findChunk(ref, 'fmt '))) ||
        !Buffer.from(a).equals(Buffer.from(b))
      ) {
        throw new Error(`mismatch in subsong ${s.index} (${a.length} vs ${b.length} bytes)`);
      }
    }
    ok++;

    console.log('ok');
  } catch (e) {
    bad.push(`${file}: ${e.message}`);
  }
}

console.log(`ok ${ok}, failed ${bad.length}`);
for (const b of bad.slice(0, 20)) console.log('  ' + b);
const reasons = {};
for (const b of bad) {
  const r = b.replace(/^.*?: /, '');
  reasons[r] = (reasons[r] ?? 0) + 1;
}
console.log(reasons);
process.exit(bad.length ? 1 : 0);

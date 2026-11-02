#!/usr/bin/env node
// 使い方: bedrock-fsb <file.fsb> [出力ディレクトリ]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';
import { version } from '../package.json';
import { openFSB } from './index';

const usage = `Usage: bedrock-fsb <file.fsb> [outDir]

Decode a Minecraft Bedrock .fsb (FSB5) file to WAV.
Each subsong is written to outDir (default: current directory).

Options:
  -h, --help     Show this help
  -v, --version  Show version`;

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });
} catch (e) {
  console.error(`${(e as Error).message}\n\n${usage}`);
  process.exit(1);
}

if (args.values.help) {
  console.log(usage);
  process.exit(0);
}
if (args.values.version) {
  console.log(version);
  process.exit(0);
}

const [input, outDir = '.'] = args.positionals;
if (!input) {
  console.error(usage);
  process.exit(1);
}

const fsb = openFSB(await readFile(input));
await mkdir(outDir, { recursive: true });

const stem = basename(input).replace(/\.fsb$/i, '');
for (const s of fsb.streams) {
  // 内部名は ".tmpXXXX" のような作成時の一時名のことがあるので、1 つだけならファイル名を使う
  const name = (fsb.streams.length === 1 ? stem : (s.name ?? `${stem}_${s.index}`)).replace(
    /[\\/:*?"<>|]/g,
    '_',
  );
  const path = join(outDir, `${name}.wav`);
  const pcm = fsb.decode(s.index);
  await writeFile(path, pcm.toWAV());
  console.log(`${path}  ${pcm.duration.toFixed(2)}s  ${pcm.sampleRate}Hz ${pcm.channels}ch`);
}

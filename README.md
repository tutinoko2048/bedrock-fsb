# bedrock-fsb

A library and CLI that decodes Minecraft Bedrock Edition `.fsb` (FMOD FSB5) files to PCM / WAV.
Pure TypeScript with no dependencies. Works in both Node.js and the browser.

Bedrock's audio is FMOD FADPCM (and some PCM16); GCADPCM (Nintendo DSP ADPCM, used by the 3DS edition) is also supported. Other FSB5 codecs are not.
Every `.fsb` in [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples) (4761 files) has been verified to decode byte-for-byte identical to vgmstream's output, as have the 3DS edition's GCADPCM `.fsb` files.

## Usage

```ts
import { openFSB } from 'bedrock-fsb';

const fsb = openFSB(await readFile('click.fsb')); // Uint8Array / ArrayBuffer / Buffer
fsb.streams;
// => [{ index: 0, name: "click", sampleRate: 44100, channels: 1, samples: 5888, loop: undefined }]

const pcm = fsb.decode(0); // { sampleRate, channels, data: Int16Array (interleaved), loop? }
pcm.toWAV(); // Uint8Array (RIFF/WAVE 16-bit)
pcm.toAudioBuffer(audioCtx); // browser: AudioBuffer
```

For data that has lost its methods, such as PCM received from a Worker via `postMessage`, use the standalone functions:

```ts
import { encodeWAV, toAudioBuffer } from 'bedrock-fsb';
encodeWAV({ sampleRate, channels, data });
```

CLI:

```sh
npx bedrock-fsb click.fsb out/
```

## Development

```sh
pnpm install
pnpm build        # vp pack
pnpm check        # vp check (lint + format + type check)
```

Comparing against vgmstream (requires the Emscripten SDK):

```sh
pnpm build:wasm              # builds vgmstream into .build/wasm/ (for verification only; not shipped)
pnpm verify <directory containing .fsb files>
```

## License

MIT. The FSB5 header parser and the FADPCM / DSP ADPCM decoders are ported from [vgmstream](https://github.com/vgmstream/vgmstream); its notice is included in [LICENSE](LICENSE).

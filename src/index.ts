// Minecraft 統合版の .fsb (FSB5) をデコードする。
// 統合版の音声は FMOD FADPCM (一部 PCM16) なので、その 2 つだけに対応している。

import { decodeFADPCM } from './fadpcm';
import { parseFSB5, type FSBStreamHeader } from './fsb5';
import { PCM } from './pcm';

export { encodeWAV, toAudioBuffer, PCM, type PCMLike, type AudioBufferFactory } from './pcm';

export type FSBStream = Omit<FSBStreamHeader, 'dataOffset' | 'dataSize'>;

export interface FSB {
  /** FMOD_SOUND_FORMAT の値 (0x10 = FADPCM) */
  codec: number;
  streams: FSBStream[];
  /** 指定したサブソング (0 始まり) をデコードする */
  decode(index?: number): PCM;
}

const CODEC_NAMES: Record<number, string> = {
  0x01: 'PCM8',
  0x02: 'PCM16',
  0x03: 'PCM24',
  0x04: 'PCM32',
  0x05: 'PCMFLOAT',
  0x06: 'GCADPCM',
  0x07: 'IMAADPCM',
  0x08: 'VAG',
  0x09: 'HEVAG',
  0x0a: 'XMA',
  0x0b: 'MPEG',
  0x0c: 'CELT',
  0x0d: 'AT9',
  0x0e: 'XWMA',
  0x0f: 'VORBIS',
  0x10: 'FADPCM',
  0x11: 'OPUS',
};

function toU8(data: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(data);
}

/** チャンネル交互の 16bit PCM をそのまま読む (足りない分は 0) */
function decodePCM16(
  data: Uint8Array,
  channels: number,
  samples: number,
  bigEndian: boolean,
): Int16Array {
  const out = new Int16Array(samples * channels);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = Math.min(out.length, data.length >> 1);
  for (let i = 0; i < n; i++) out[i] = dv.getInt16(i * 2, !bigEndian);
  return out;
}

/** FSB を開く (ヘッダだけ解析し、デコードは decode() を呼んだときに行う) */
export function openFSB(data: ArrayBuffer | ArrayBufferView): FSB {
  const buf = toU8(data);
  const header = parseFSB5(buf);

  return {
    codec: header.codec,
    streams: header.streams.map(({ dataOffset: _o, dataSize: _s, ...rest }) => rest),
    decode(index = 0) {
      const s = header.streams[index];
      if (!s)
        throw new RangeError(`Subsong ${index} out of range (file has ${header.streams.length})`);
      const data = buf.subarray(s.dataOffset, s.dataOffset + s.dataSize);
      let pcm: Int16Array;
      if (header.codec === 0x10) pcm = decodeFADPCM(data, s.channels, s.samples);
      else if (header.codec === 0x02)
        pcm = decodePCM16(data, s.channels, s.samples, (header.flags & 1) === 1);
      else {
        const name = CODEC_NAMES[header.codec] ?? `0x${header.codec.toString(16)}`;
        throw new Error(`Unsupported codec: ${name} (only FADPCM and PCM16 are supported)`);
      }
      return new PCM(s.sampleRate, s.channels, pcm, s.loop);
    },
  };
}

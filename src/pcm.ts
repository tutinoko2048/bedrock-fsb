// デコード結果の PCM と、WAV / AudioBuffer への変換。
// 関数はただのデータ (PCMLike) を受け取るので、Worker から postMessage で受け取ったものにも使える。

export interface PCMLike {
  sampleRate: number;
  channels: number;
  /** チャンネルを交互に並べた 16bit PCM */
  data: Int16Array;
  loop?: { start: number; end: number };
}

/** AudioContext / OfflineAudioContext の必要な部分だけ (Node で DOM 型を要求しないため) */
export interface AudioBufferFactory<B extends { getChannelData(ch: number): Float32Array }> {
  createBuffer(channels: number, length: number, sampleRate: number): B;
}

/** 16bit PCM の RIFF/WAVE にする */
export function encodeWAV(pcm: PCMLike): Uint8Array {
  const { sampleRate, channels, data } = pcm;
  const bytes = data.length * 2;
  const out = new Uint8Array(44 + bytes);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i);
  };
  str(0, 'RIFF');
  dv.setUint32(4, 36 + bytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * channels * 2, true);
  dv.setUint16(32, channels * 2, true);
  dv.setUint16(34, 16, true);
  str(36, 'data');
  dv.setUint32(40, bytes, true);
  for (let i = 0; i < data.length; i++) dv.setInt16(44 + i * 2, data[i], true);
  return out;
}

/** Web Audio の AudioBuffer にする */
export function toAudioBuffer<B extends { getChannelData(ch: number): Float32Array }>(
  pcm: PCMLike,
  ctx: AudioBufferFactory<B>,
): B {
  const { sampleRate, channels, data } = pcm;
  const length = data.length / channels;
  const ab = ctx.createBuffer(channels, length, sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const dst = ab.getChannelData(ch);
    for (let i = 0; i < length; i++) dst[i] = data[i * channels + ch] / 32768;
  }
  return ab;
}

export class PCM implements PCMLike {
  constructor(
    readonly sampleRate: number,
    readonly channels: number,
    readonly data: Int16Array,
    readonly loop?: { start: number; end: number },
  ) {}

  /** 1 チャンネルあたりのサンプル数 */
  get length(): number {
    return this.data.length / this.channels;
  }

  get duration(): number {
    return this.length / this.sampleRate;
  }

  toWAV(): Uint8Array {
    return encodeWAV(this);
  }

  toAudioBuffer<B extends { getChannelData(ch: number): Float32Array }>(
    ctx: AudioBufferFactory<B>,
  ): B {
    return toAudioBuffer(this, ctx);
  }
}

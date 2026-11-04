// Nintendo DSP ADPCM (FMOD の GCADPCM) デコーダ。vgmstream の src/coding/ngc_dsp_decoder.c の移植。
// 8 バイトのフレーム = 1 バイトのヘッダ (上位 4bit: 係数番号 / 下位 4bit: スケール) + 14 サンプル分のニブル。
// FSB5 では既定で 2 バイトずつチャンネルが交互に並ぶ (flags bit1 が立っているとチャンネルごとに連続)。

const FRAME_SIZE = 0x08;
const FRAME_SAMPLES = 14;
const SUBINTERLEAVE = 0x02;

/**
 * チャンネルを交互に並べた 16bit PCM を返す
 * @param coefs チャンネルごとの係数 16 個 (8 組)
 * @param interleaved true なら 2 バイト単位でチャンネルが交互、false ならチャンネルごとに連続
 */
export function decodeDSP(
  data: Uint8Array,
  channels: number,
  samples: number,
  coefs: Int16Array[],
  interleaved: boolean,
): Int16Array {
  const out = new Int16Array(samples * channels);
  const frames = Math.ceil(samples / FRAME_SAMPLES);
  const chSize = interleaved ? 0 : Math.floor(data.length / channels);
  const frame = new Uint8Array(FRAME_SIZE);

  for (let ch = 0; ch < channels; ch++) {
    const coef = coefs[ch];
    let hist1 = 0;
    let hist2 = 0;
    let pos = 0;

    for (let f = 0; f < frames; f++) {
      // データ末尾が足りない場合は 0 として扱う (vgmstream と同じ)
      for (let i = 0; i < FRAME_SIZE; i++) {
        const o = interleaved
          ? f * FRAME_SIZE * channels +
            Math.floor(i / SUBINTERLEAVE) * SUBINTERLEAVE * channels +
            (i % SUBINTERLEAVE) +
            SUBINTERLEAVE * ch
          : ch * chSize + f * FRAME_SIZE + i;
        frame[i] = o < data.length ? data[o] : 0;
      }

      const scale = 1 << (frame[0] & 0xf);
      const index = Math.min(frame[0] >> 4, 7);
      const coef1 = coef[index * 2];
      const coef2 = coef[index * 2 + 1];

      for (let i = 0; i < FRAME_SAMPLES && pos < samples; i++, pos++) {
        const byte = frame[1 + (i >> 1)];
        // 上位ニブルが先。4bit 符号付きとして読む
        const nibble = ((i & 1 ? byte << 28 : byte << 24) >> 28) * scale;
        // C の int32 演算に合わせるため、和を >> で 32bit に丸める
        let s = ((nibble << 11) + 1024 + coef1 * hist1 + coef2 * hist2) >> 11;
        s = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
        out[pos * channels + ch] = s;
        hist2 = hist1;
        hist1 = s;
      }
    }
  }
  return out;
}

/** FSB5 の追加フラグ 0x07 から、チャンネルごとの係数 (ビッグエンディアン、0x2E 間隔) を読む */
export function readDSPCoefs(buf: Uint8Array, offset: number, channels: number): Int16Array[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const coefs: Int16Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const c = new Int16Array(16);
    for (let i = 0; i < 16; i++) c[i] = dv.getInt16(offset + ch * 0x2e + i * 2, false);
    coefs.push(c);
  }
  return coefs;
}

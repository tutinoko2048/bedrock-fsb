// FMOD FADPCM デコーダ。vgmstream の src/coding/fadpcm_decoder.c の移植 (FMOD とバイト単位で一致)。
// 0x8c バイトのフレーム = 0xc バイトのヘッダ + 256 サンプル分のニブル。複数チャンネルはフレーム単位で交互に並ぶ。

const FRAME_SIZE = 0x8c;
const FRAME_SAMPLES = (FRAME_SIZE - 0xc) * 2;

/** XA/PSX ADPCM の係数を << 6 したもの (インデックス 5 以降は 0) */
const COEFS = [
  [0, 0],
  [60, 0],
  [122, 60],
  [115, 52],
  [98, 55],
  [0, 0],
  [0, 0],
];

/** チャンネルを交互に並べた 16bit PCM を返す */
export function decodeFADPCM(data: Uint8Array, channels: number, samples: number): Int16Array {
  const out = new Int16Array(samples * channels);
  const frames = Math.ceil(samples / FRAME_SAMPLES);
  // データ末尾が足りない場合は 0 埋めとして扱う (vgmstream と同じ)
  const frame = new Uint8Array(FRAME_SIZE);
  const fv = new DataView(frame.buffer);

  for (let f = 0; f < frames; f++) {
    for (let ch = 0; ch < channels; ch++) {
      const start = (f * channels + ch) * FRAME_SIZE;
      frame.fill(0);
      if (start < data.length) frame.set(data.subarray(start, start + FRAME_SIZE));

      const coefs = fv.getUint32(0x00, true);
      const shifts = fv.getUint32(0x04, true);
      let hist1 = fv.getInt16(0x08, true);
      let hist2 = fv.getInt16(0x0a, true);
      let pos = f * FRAME_SAMPLES;

      // 8 グループ × 32 サンプル。グループごとに係数とシフト量を持つ
      for (let i = 0; i < 8; i++) {
        const [coef1, coef2] = COEFS[((coefs >>> (i * 4)) & 0xf) % 7];
        const shift = 22 - ((shifts >>> (i * 4)) & 0xf);

        for (let j = 0; j < 4; j++) {
          const nibbles = fv.getUint32(0x0c + 0x10 * i + 0x04 * j, true);
          for (let k = 0; k < 8; k++, pos++) {
            let s = (((nibbles >>> (k * 4)) & 0xf) << 28) >> shift;
            s = (s - hist2 * coef2 + hist1 * coef1) >> 6;
            s = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
            if (pos < samples) out[pos * channels + ch] = s;
            hist2 = hist1;
            hist1 = s;
          }
        }
      }
    }
  }
  return out;
}

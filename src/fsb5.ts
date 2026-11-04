// FSB5 (FMOD Studio SoundBank) のヘッダ解析。
// レイアウトは vgmstream の src/meta/fsb5.c を参考にしている。

export interface FSBStreamHeader {
  /** 0 始まりのサブソング番号 */
  index: number;
  /** FSB 内のサウンド名 (無い場合は undefined。作成時の一時名 ".tmpXXXX" のこともある) */
  name?: string;
  sampleRate: number;
  channels: number;
  /** 1 チャンネルあたりの総サンプル数 */
  samples: number;
  /** ループ位置 (サンプル単位、end は含まない) */
  loop?: { start: number; end: number };
  /** ファイル先頭からの音声データ位置 */
  dataOffset: number;
  dataSize: number;
  /** GCADPCM の係数 (追加フラグ 0x07) のファイル先頭からの位置 */
  dspCoefsOffset?: number;
}

export interface FSBHeader {
  version: number;
  /** FMOD_SOUND_FORMAT の値 (0x10 = FADPCM) */
  codec: number;
  /** フラグ (bit0: PCM16 がビッグエンディアン / bit1: GCADPCM などがチャンネルごとに連続) */
  flags: number;
  streams: FSBStreamHeader[];
}

const SAMPLE_RATES = [4000, 8000, 11000, 11025, 16000, 22050, 24000, 32000, 44100, 48000, 96000];
const CHANNELS = [1, 2, 6, 8];

export function parseFSB5(buf: Uint8Array): FSBHeader {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.byteLength < 0x3c || dv.getUint32(0, false) !== 0x46534235 /* "FSB5" */) {
    throw new Error('Not an FSB5 file');
  }
  const u32 = (o: number) => dv.getUint32(o, true);

  const version = u32(0x04);
  if (version !== 0 && version !== 1) throw new Error(`Unsupported FSB5 version: ${version}`);
  const total = u32(0x08);
  const sampleHeaderSize = u32(0x0c);
  const nameTableSize = u32(0x10);
  const sampleDataSize = u32(0x14);
  const codec = u32(0x18);
  const flags = version === 1 ? u32(0x20) : 0;
  const baseSize = version === 1 ? 0x3c : 0x40;

  const nameTable = baseSize + sampleHeaderSize;
  const dataStart = nameTable + nameTableSize;
  if (dataStart + sampleDataSize > buf.byteLength) throw new Error('FSB5 file is truncated');

  const streams: FSBStreamHeader[] = [];
  const dataOffsets: number[] = [];
  let off = baseSize;
  for (let i = 0; i < total; i++) {
    // 64bit の sample mode: [63..34] サンプル数 / [33..7] データ位置 / [6..5] ch / [4..1] レート / [0] 追加フラグ有無
    const lo = u32(off);
    const hi = u32(off + 4);
    const samples = hi >>> 2;
    const dataOffset = (((hi & 0x3) * 0x2000000 + (lo >>> 7)) & 0x7ffffff) * 32;
    let channels = CHANNELS[(lo >>> 5) & 0x3];
    let sampleRate = SAMPLE_RATES[(lo >>> 1) & 0xf];
    if (sampleRate === undefined) throw new Error(`Invalid sample rate for subsong ${i}`);
    let loop: FSBStreamHeader['loop'];
    let dspCoefsOffset: number | undefined;
    off += 8;

    // 追加フラグ: [31..25] 種類 / [24..1] サイズ / [0] 続きがあるか
    let more = lo & 1;
    while (more && off < nameTable) {
      const ef = u32(off);
      const type = (ef >>> 25) & 0x7f;
      const size = (ef >>> 1) & 0xffffff;
      more = ef & 1;
      if (type === 0x01) channels = buf[off + 4];
      else if (type === 0x02) sampleRate = dv.getInt32(off + 4, true);
      else if (type === 0x03) {
        const start = dv.getInt32(off + 4, true);
        // 終端は FMOD 上「含む」なので +1 して半開区間にする
        const end = size > 4 ? dv.getInt32(off + 8, true) + 1 : samples;
        loop = { start, end };
      } else if (type === 0x07) dspCoefsOffset = off + 4;
      off += 4 + size;
    }

    dataOffsets.push(dataOffset);
    streams.push({
      index: i,
      sampleRate,
      channels,
      samples,
      loop,
      dataOffset: dataStart + dataOffset,
      dataSize: 0,
      dspCoefsOffset,
    });
  }

  for (let i = 0; i < total; i++) {
    const next = i + 1 < total ? dataOffsets[i + 1] : sampleDataSize;
    streams[i].dataSize = next - dataOffsets[i];
    if (nameTableSize) {
      const p = nameTable + u32(nameTable + 4 * i);
      let e = p;
      while (e < dataStart && buf[e] !== 0) e++;
      const name = new TextDecoder().decode(buf.subarray(p, e));
      if (name) streams[i].name = name;
    }
  }

  return { version, codec, flags, streams };
}

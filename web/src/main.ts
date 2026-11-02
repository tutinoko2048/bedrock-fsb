import './style.css';
import { openFSB } from 'bedrock-fsb';
import { crc32, zip, type ZipEntry } from './zip';

interface Input {
  file: File;
  /** フォルダから読んだときの相対パス (ファイル名を含む) */
  path: string;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const drop = $<HTMLElement>('#drop');
const fileInput = $<HTMLInputElement>('#files');
const dirInput = $<HTMLInputElement>('#dir');
const status = $<HTMLElement>('#status');
const list = $<HTMLTableSectionElement>('#list');
const zipButton = $<HTMLButtonElement>('#zip');
const clearButton = $<HTMLButtonElement>('#clear');

const done: ZipEntry[] = [];
const usedPaths = new Set<string>();
let busy = false;

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}

/** zip 内でパスが重ならないように連番を付ける */
function uniquePath(path: string): string {
  let p = path;
  for (let i = 2; usedPaths.has(p); i++) p = path.replace(/\.wav$/, ` (${i}).wav`);
  usedPaths.add(p);
  return p;
}

const ICONS = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><path d="M7 7h10v10H7z"/></svg>',
  download:
    '<svg viewBox="0 0 24 24"><path d="M12 4v11m-5-5 5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function setIcon(button: HTMLButtonElement, icon: keyof typeof ICONS, label: string) {
  button.innerHTML = ICONS[icon];
  button.title = label;
  button.ariaLabel = label;
}

// 再生は 1 つずつ。別の行を押したら前のは止める
const player = new Audio();
let playing: { button: HTMLButtonElement; url: string } | undefined;

function stopPlaying() {
  if (!playing) return;
  player.pause();
  URL.revokeObjectURL(playing.url);
  setIcon(playing.button, 'play', '再生');
  playing = undefined;
}
player.onended = stopPlaying;

function togglePlay(button: HTMLButtonElement, blob: Blob) {
  const same = playing?.button === button;
  stopPlaying();
  if (same) return;
  playing = { button, url: URL.createObjectURL(blob) };
  player.src = playing.url;
  player.play().catch(stopPlaying);
  setIcon(button, 'stop', '停止');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function addRow(path: string, info: string, entry?: ZipEntry) {
  const tr = list.insertRow();
  tr.insertCell().textContent = path;
  const infoCell = tr.insertCell();
  infoCell.textContent = info;
  const action = tr.insertCell();
  if (entry) {
    const play = document.createElement('button');
    setIcon(play, 'play', '再生');
    play.onclick = () => togglePlay(play, entry.data);
    const save = document.createElement('button');
    setIcon(save, 'download', 'ダウンロード');
    save.onclick = () => download(entry.data, path.split('/').pop()!);
    play.className = save.className = 'icon';
    const size = document.createElement('span');
    size.className = 'size';
    size.textContent = formatSize(entry.data.size);
    action.append(size, play, save);
  } else {
    tr.className = 'error';
  }
}

function updateButtons() {
  zipButton.disabled = busy || done.length === 0;
  clearButton.disabled = busy || list.rows.length === 0;
}

async function convert(inputs: Input[]) {
  const fsbs = inputs.filter((i) => /\.fsb$/i.test(i.file.name));
  if (fsbs.length === 0) {
    status.textContent = '.fsb ファイルが見つかりませんでした';
    return;
  }
  busy = true;
  updateButtons();

  for (const [n, { file, path }] of fsbs.entries()) {
    status.textContent = `変換中… ${n + 1} / ${fsbs.length}`;
    const dir = path.slice(0, path.length - file.name.length);
    const stem = file.name.replace(/\.fsb$/i, '');
    try {
      const fsb = openFSB(await file.arrayBuffer());
      for (const s of fsb.streams) {
        // 内部名は ".tmpXXXX" のような作成時の一時名のことがあるので、1 つだけならファイル名を使う
        const name = (fsb.streams.length === 1 ? stem : (s.name ?? `${stem}_${s.index}`)).replace(
          /[\\/:*?"<>|]/g,
          '_',
        );
        const pcm = fsb.decode(s.index);
        const wav = pcm.toWAV() as Uint8Array<ArrayBuffer>;
        const entry = {
          path: uniquePath(`${dir}${name}.wav`),
          data: new Blob([wav]),
          crc: crc32(wav),
        };
        done.push(entry);
        addRow(
          entry.path,
          `${pcm.duration.toFixed(2)}s · ${pcm.sampleRate}Hz · ${pcm.channels}ch`,
          entry,
        );
      }
    } catch (e) {
      addRow(path, (e as Error).message);
    }
    // 画面が固まらないように 1 ファイルごとに描画を挟む
    await new Promise((r) => setTimeout(r));
  }

  const failed = list.querySelectorAll('tr.error').length;
  status.textContent = `${done.length} 件の WAV${failed ? ` (失敗 ${failed} 件)` : ''}`;
  busy = false;
  updateButtons();
}

/** ドロップされたファイル / フォルダを再帰的に読む */
async function readDropped(entries: FileSystemEntry[]): Promise<Input[]> {
  const out: Input[] = [];
  const walk = async (e: FileSystemEntry): Promise<void> => {
    if (e.isFile) {
      const file = await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej));
      out.push({ file, path: e.fullPath.replace(/^\//, '') });
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      // readEntries は一度に全部返さないので、空になるまで読む
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) =>
          reader.readEntries(res, rej),
        );
        if (batch.length === 0) break;
        for (const c of batch) await walk(c);
      }
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) drop.classList.remove('over');
});
addEventListener('drop', async (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  if (busy || !e.dataTransfer) return;
  // webkitGetAsEntry はイベント中に呼ばないと取れなくなる
  const entries = [...e.dataTransfer.items]
    .map((i) => i.webkitGetAsEntry())
    .filter((x): x is FileSystemEntry => x !== null);
  await convert(await readDropped(entries));
});

for (const input of [fileInput, dirInput]) {
  input.onchange = async () => {
    const files = [...(input.files ?? [])];
    input.value = '';
    if (busy) return;
    await convert(files.map((file) => ({ file, path: file.webkitRelativePath || file.name })));
  };
}

/** 中身 (パス・サイズ・CRC) から決まる短い名前。同じ中身なら同じ名前になる */
function zipName(entries: ZipEntry[]): string {
  const key = entries.map((e) => `${e.path}\0${e.data.size}\0${e.crc}`).join('\n');
  const hash = (crc32(new TextEncoder().encode(key)) % 36 ** 6).toString(36).padStart(6, '0');
  return `fsb2wav-${hash}.zip`;
}

zipButton.onclick = () => {
  try {
    download(zip(done), zipName(done));
  } catch (e) {
    status.textContent = (e as Error).message;
  }
};

clearButton.onclick = () => {
  stopPlaying();
  done.length = 0;
  usedPaths.clear();
  list.replaceChildren();
  status.textContent = '';
  updateButtons();
};

#!/usr/bin/env bash
# vgmstream-cli を Emscripten で wasm にビルドし、.build/wasm/ に配置する (照合専用)。
# 前提: emsdk が有効化済み (source emsdk_env.sh) で emcmake / emcc が PATH にあること。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$ROOT/.build"
# 動作確認済みのコミット (r2168)。更新するときは差し替えて再検証する
VGM_REF="${VGM_REF:-d29ffa6e19a41efb54bfd9f68bd65f93c3d2ab25}"

mkdir -p "$WORK/wasm"
cd "$WORK"

if [ ! -d vgmstream ]; then
  # コミットハッシュでも取れるよう clone ではなく fetch で取得する
  git init -q vgmstream
  git -C vgmstream fetch -q --depth 1 https://github.com/vgmstream/vgmstream.git "$VGM_REF"
  git -C vgmstream checkout -q FETCH_HEAD
fi

# モジュールとして読み込める形でリンクする
LINK_FLAGS="\
 -sMODULARIZE=1 \
 -sEXPORT_ES6=1 \
 -sEXPORT_NAME=createVgmstream \
 -sINVOKE_RUN=0 \
 -sEXIT_RUNTIME=0 \
 -sALLOW_MEMORY_GROWTH=1 \
 -sFORCE_FILESYSTEM=1 \
 -sENVIRONMENT=web,worker,node \
 -sEXPORTED_RUNTIME_METHODS=FS,callMain"

# 統合版バニラの .fsb は FMOD FADPCM (vgmstream 内蔵デコーダ)。FSB5 の Vorbis / PCM も扱えるよう
# Vorbis は残し、外部ライブラリが必要な他コーデックは切ってサイズを抑える。
# Vorbis/Ogg のソースは vgmstream の CMake が自動で取得してビルドする。
emcmake cmake -S vgmstream -B embuild \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_CLI=ON \
  -DBUILD_V123=OFF \
  -DBUILD_AUDACIOUS=OFF \
  -DUSE_VORBIS=ON \
  -DUSE_FFMPEG=OFF \
  -DUSE_MPEG=OFF \
  -DUSE_G7221=OFF \
  -DUSE_G719=OFF \
  -DUSE_ATRAC9=OFF \
  -DUSE_CELT=OFF \
  -DUSE_SPEEX=OFF \
  -DCMAKE_EXE_LINKER_FLAGS="$LINK_FLAGS"

cmake --build embuild -j"$(nproc 2>/dev/null || echo 2)"

cp embuild/cli/vgmstream-cli.js   "$WORK/wasm/vgmstream.mjs"
cp embuild/cli/vgmstream-cli.wasm "$WORK/wasm/vgmstream-cli.wasm"

ls -la "$WORK/wasm"
echo "done: .build/wasm/vgmstream.mjs + .build/wasm/vgmstream-cli.wasm"

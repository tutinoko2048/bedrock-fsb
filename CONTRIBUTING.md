# Contributing

## 開発

```sh
pnpm install
pnpm check   # format + lint + 型チェック
pnpm build   # dist/ に出力
```

デコード結果を変える変更をしたら、vgmstream との照合も通してください (Emscripten SDK と bedrock-samples が必要)。

```sh
pnpm build:wasm                                         # vgmstream を .build/wasm/ にビルド (照合専用)
git clone --depth 1 https://github.com/Mojang/bedrock-samples.git
pnpm verify bedrock-samples/resource_pack/sounds        # 全件一致すれば "failed 0"
```

## リリース

`v*.*.*` のタグを push すると `.github/workflows/release.yml` が動き、npm への公開準備と GitHub Release の下書き作成までを行います。

1. `package.json` の `version` を上げてコミットし、main に push する
2. 同じバージョンのタグを打って push する

   ```sh
   git tag v0.1.0
   git push origin v0.1.0
   ```

   タグと `package.json` のバージョンが一致しないとワークフローは失敗します。

3. ワークフローが `pnpm stage publish --provenance` でパッケージを npm にステージングするので、npmjs.com で承認して公開する
4. GitHub の Releases に下書きができているので、リリースノートを書いて公開する

### 初回だけ必要な設定

- npmjs.com のパッケージ設定で、このリポジトリの `release.yml` を Trusted Publisher として登録する (トークンを使わず OIDC で公開するため)

# Monopost

Monopostは、自分専用のチャットに投稿する感覚でメモを残せるアプリです。Dropboxに接続して使います。

アプリには、ユーザーデータを保存するためのサーバーはありません。あなたのデータは、あなた自身のDropboxアカウントだけに保存されます。

Monopost is a notes app that feels like posting to your own private chat. Connect it to Dropbox to use it.

The app does not have a server for storing user data. Your data is saved only in your own Dropbox account.

## 開発者向け

HTML・CSS・JavaScriptだけで作った、ビルド不要の静的PWAです。GitHub Pagesなどへファイルをそのまま配置できます。UIは英語と日本語に対応しており、初期状態は英語です。アイコンにはLucideをCDN経由で使用しています。

Dropbox上のデータは、アプリフォルダ内に次のJSONファイルとして保存します。

```text
/index.json             メモ一覧（id、title、icon、日時）
/memos/<memo-id>.json   メモ本体（entries、templatesを含む）
```

メモ本体の主な形式は次のとおりです。

```json
{
  "id": "memo-id",
  "title": "タイトル",
  "icon": "message-circle",
  "entries": [{ "id": "entry-id", "text": "本文", "createdAt": "..." }],
  "templates": [{ "id": "template-id", "name": "名前", "text": "定型文" }]
}
```

## ローカルで試す

```sh
python3 -m http.server 8000
```

ブラウザで `http://localhost:8000` を開きます。Dropbox連携も試す場合は、次のようにローカル専用設定を作成します。`config.local.js` はGit管理されません。

```sh
cp config.local.example.js config.local.js
```

作成した `config.local.js` の `PASTE_YOUR_DROPBOX_APP_KEY_HERE` をApp keyへ置き換えてください。未設定でも、**ローカル体験版**として作成・編集・テンプレート操作を試せます（ブラウザ内にのみ保存）。

## Dropbox の設定

1. [Dropbox App Console](https://www.dropbox.com/developers/apps) で **Create app** を選ぶ。
2. API は **Scoped access**、アクセス種別は **App folder** を選び、名前を `Monopost` などにする。
3. **Permissions** で `files.content.read` と `files.content.write` を有効にして保存する。
4. **Settings** の OAuth 2 で Redirect URI に、開発用の `http://localhost:8000/` と公開URL（例: `https://<ユーザー名>.github.io/<リポジトリ名>/`）を**末尾のスラッシュまで完全一致**で登録する。
5. 表示される **App key** は、ローカルでは `config.local.js` にだけ記入する。App secret は静的サイトには置かない。

## GitHub Pages へのデプロイ

このリポジトリには、コードにApp keyを残さず、GitHub Actionsで公開用ファイルだけへ注入するワークフローが含まれています。

1. GitHubリポジトリの **Settings → Secrets and variables → Actions** で、`DROPBOX_APP_KEY` というRepository secretを作成し、DropboxのApp keyを設定する。
2. **Settings → Pages → Build and deployment** のSourceで **GitHub Actions** を選ぶ。
3. `main` ブランチへpushする。ワークフローが静的ファイルをそのままPagesへ配布し、その配布物にだけ `config.local.js` を生成する。

App keyはブラウザへ配布されるOAuthのclient_idなので、公開サイト上では確認できます。一方で、Gitの履歴・ソースコード・ローカル設定ファイルには残りません。App secretや認証トークンをGitHub Secretへ置く必要はありません。

アプリのファイルは Dropbox 内の `Apps/Monopost/`（実際のアプリ名に対応するフォルダ）に `index.json` と `memos/<id>.json` として作成されます。

Dropbox OAuth には、秘密鍵を必要としない PKCE の認可コードフローを使用しています。認可トークンと更新用トークンはこのブラウザ内に保存され、期限切れ時は更新用トークンで自動更新します。

保存時はDropboxの `rev` を使って、別端末の変更を黙って上書きしないようにしています。同じメモが競合した場合は、手元の内容を新しいメモ（競合コピー）として保存します。

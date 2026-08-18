(() => {
  "use strict";
  const APP_KEY = window.MONOPOST_CONFIG?.dropboxAppKey || "";
  const PLACEHOLDER_KEY = "PASTE_YOUR_DROPBOX_APP_KEY_HERE";
  const STORAGE = {
    auth: "monopost.auth",
    local: "monopost.local",
    language: "monopost.language",
  };
  const app = document.querySelector("#app"),
    toast = document.querySelector("#toast");
  // 現在表示中のデータと、非同期保存の状態をまとめて保持する。
  const state = {
    index: { version: 1, memos: [] },
    memo: null,
    editingEntryId: null,
    syncing: 0,
    saveTail: Promise.resolve(),
    local: false,
    revisions: {},
    conflictCopies: {},
    templateTimer: null,
  };
  const copy = {
    en: {
      yourNotes: "Your Notes",
      noMemos: "No Notes yet",
      noMemosText: "Create your first Note.",
      newMemo: "New Note",
      welcome: "Welcome to Monopost",
      welcomeText: "Your private chat.<br>Posts are saved to your Dropbox.",
      connect: "Connect to Dropbox",
      logout: "Log out",
      untitled: "Untitled Note",
      newMemoTitle: "New Note",
      newPost:
        "Start posting.\n\nYour first post becomes the title.\nYou can edit the title later.",
      placeholder: "",
      send: "Send",
      templates: "Templates",
      templatesText: "Reusable text for this Note only.",
      addTemplate: "Add Template",
      noTemplates: "No Templates",
      noTemplatesText: "Add one here or save a post as a template.",
      templateName: "Template name",
      copy: "Copy",
      edit: "Edit",
      duplicate: "Duplicate",
      saveTemplate: "Save as template",
      delete: "Delete",
      close: "Close",
      cancel: "Cancel",
      editTitle: "Edit Note title",
      title: "Note title",
      save: "Save",
      changeIcon: "Change icon",
      deleteEntry: "Delete this post?",
      deleteEntryText: "This will be reflected in Dropbox in the background.",
      deleteMemo: "Delete this Note?",
      deleteMemoText:
        "Are you sure you want to delete this Note? This action cannot be undone.",
      deleteNow: "Delete",
      templatePickerTitle: "Choose a template",
      copied: "Copied",
      editing: "Editing this post",
      duplicateReady: "Ready to post a duplicate",
      templateSaved: "Saved as a template",
      deleted: "Deleted",
      syncError: "Couldn’t save. Check your connection.",
      conflictError: "This Note changed elsewhere. Reload before saving again.",
      conflictCopySaved: "Saved as a conflict copy.",
      conflictCopySuffix: "conflict copy",
      loadError: "Couldn’t load",
      retry: "Retry",
      authError: "Couldn’t connect to Dropbox.",
      relink: "Please connect Dropbox again.",
      connected: "Dropbox connected",
      language: "日本語",
      chooseIcon: "Choose icon",
    },
    ja: {
      yourNotes: "あなたのメモ一覧",
      noMemos: "メモがありません",
      noMemosText: "最初のメモを作りましょう",
      newMemo: "新しいメモ",
      welcome: "Monopost へようこそ",
      welcomeText:
        "あなた専用のチャットです。<br>投稿はあなたのDropboxに保存されます。",
      connect: "Dropbox に接続してログイン",
      logout: "ログアウト",
      untitled: "無題のメモ",
      newMemoTitle: "新しいメモ",
      newPost:
        "投稿をはじめましょう。\n\n最初の投稿はタイトルに使われます。\nタイトルはあとから編集できます。",
      placeholder: "",
      send: "投稿",
      templates: "テンプレート",
      templatesText: "このメモで使う定型文です。",
      addTemplate: "テンプレートを追加",
      noTemplates: "テンプレートがありません",
      noTemplatesText: "ここで追加するか、投稿メニューから登録できます。",
      templateName: "テンプレート名",
      copy: "コピー",
      edit: "編集",
      duplicate: "複製",
      saveTemplate: "テンプレートに追加",
      delete: "削除",
      close: "閉じる",
      cancel: "キャンセル",
      editTitle: "メモのタイトル",
      title: "メモのタイトル",
      save: "保存",
      changeIcon: "アイコンを変更",
      deleteEntry: "この投稿を削除しますか？",
      deleteEntryText: "変更はバックグラウンドで Dropbox に反映されます。",
      deleteMemo: "このメモを削除しますか？",
      deleteMemoText:
        "メモを削除してよろしいですか？この操作は元に戻せません。",
      deleteNow: "削除する",
      templatePickerTitle: "使用するテンプレートを選択",
      copied: "コピーしました",
      editing: "編集モードです",
      duplicateReady: "複製を投稿できます",
      templateSaved: "テンプレートに追加しました",
      deleted: "削除しました",
      syncError: "保存できませんでした。接続を確認してください。",
      conflictError:
        "別の端末で変更されています。再読み込みしてから保存してください。",
      conflictCopySaved: "競合コピーとして保存しました。",
      conflictCopySuffix: "競合コピー",
      loadError: "読み込めませんでした",
      retry: "再試行",
      authError: "Dropbox の認証に失敗しました。",
      relink: "Dropbox に接続し直してください。",
      connected: "Dropbox に接続しました",
      language: "EN",
      chooseIcon: "アイコンを選択",
    },
  };
  // 新規メモ・投稿・テンプレートに使う一意のIDを作る。
  const id = () =>
    crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  // Dropboxへ保存する日時をUTCのISO形式で返す。
  const now = () => new Date().toISOString();

  // 保存キューに渡すデータを、後続の変更から切り離すために複製する。
  const clone = (value) => JSON.parse(JSON.stringify(value));

  // ユーザー入力をHTMLへ埋め込む前にエスケープする。
  const escapeHtml = (value) =>
    String(value).replace(
      /[&<>'"]/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          "'": "&#39;",
          '"': "&quot;",
        })[c],
    );

  // HTML属性へ値を入れるときも同じエスケープを使い、壊れたJSONからの注入を防ぐ。
  const escapeAttr = escapeHtml;

  // Dropbox App keyが設定済みかを判定する。
  const configured = () => APP_KEY && APP_KEY !== PLACEHOLDER_KEY;

  // 言語設定をlocalStorageから読み、未設定時は英語にする。
  const language = () =>
    localStorage.getItem(STORAGE.language) === "ja" ? "ja" : "en";

  // 現在の言語の表示文言を返す。
  const t = (key) => copy[language()][key] ?? key;
  const DEFAULT_ICON = "message-circle";
  const MEMO_ICON_CHOICES = [
    "message-circle",
    "notebook-pen",
    "file-text",
    "clipboard-list",
    "list",
    "bookmark",
    "star",
    "heart",
    "lightbulb",
    "brain",
    "calendar-days",
    "clock",
    "bell",
    "briefcase-business",
    "building-2",
    "house",
    "shopping-cart",
    "wallet",
    "credit-card",
    "circle-dollar-sign",
    "camera",
    "image",
    "book-open",
    "graduation-cap",
    "globe",
    "map-pin",
    "phone",
    "link",
    "wrench",
    "rocket",
  ];
  const UI_ICON_CHOICES = [
    "plus",
    "globe",
    "chevron-left",
    "message-square-text",
    "send",
    "menu",
    "pencil",
    "palette",
    "square-menu",
    "message-circle-x",
    "x",
    "copy",
    "copy-plus",
    "square-plus",
    "arrow-up-from-line",
    "arrow-down-from-line",
    "square-x",
  ];
  const ALLOWED_ICONS = new Set([...MEMO_ICON_CHOICES, ...UI_ICON_CHOICES]);

  // Dropbox上のJSONが壊れていても、Lucide名は許可したものだけを描画する。
  const safeIconName = (name) =>
    ALLOWED_ICONS.has(name) ? name : DEFAULT_ICON;

  // class属性は固定の補助クラスだけを受け付ける。
  const safeClassName = (className) =>
    String(className)
      .split(/\s+/)
      .filter((name) => /^[a-z0-9_-]+$/i.test(name))
      .join(" ");

  // Lucideのアイコン要素をHTML文字列として生成する。
  const icon = (name = DEFAULT_ICON, className = "") => {
    const classes = ["memo-icon", safeClassName(className)]
      .filter(Boolean)
      .join(" ");
    return `<i data-lucide="${safeIconName(name)}" class="${classes}" aria-hidden="true"></i>`;
  };

  // data-lucide属性を実際のSVGアイコンへ置き換える。
  const renderIcons = (root = document) => window.lucide?.createIcons({ root });

  // メモ画面の描画直後に、レイアウト確定を待って投稿一覧の末尾へ移動する。
  function scrollMemoToBottom() {
    const scroll = () => {
      const chat = document.querySelector(".chat");
      if (chat) chat.scrollTop = chat.scrollHeight;
    };

    // Lucide置換やtextarea計算の後でも効くよう、複数タイミングで下端へ寄せる。
    requestAnimationFrame(() => {
      scroll();
      requestAnimationFrame(scroll);
      setTimeout(scroll, 80);
    });
  }

  // 投稿後は再描画で作り直された入力欄へフォーカスを戻す。
  function focusEntryInput(input) {
    requestAnimationFrame(() => {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
      scrollMemoToBottom();
      setTimeout(scrollMemoToBottom, 250);
    });
  }

  // textareaを内容量に合わせて広げ、長すぎる場合だけ上限で止める。
  function fitTextarea(textarea, maxHeight) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }

  // テンプレート本文を、改行を補ったり削ったりせずカーソル位置へ挿入する。
  function insertAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length,
      end = input.selectionEnd ?? input.value.length,
      inserted = String(text || "");

    if (input.setRangeText) {
      input.setRangeText(inserted, start, end, "end");
    } else {
      input.value = `${input.value.slice(0, start)}${inserted}${input.value.slice(end)}`;
      input.selectionStart = input.selectionEnd = start + inserted.length;
    }

    input.dispatchEvent(new Event("input"));
  }

  // テンプレート名が空の既存データでは、本文の先頭行を表示名にする。
  const templateLabel = (template) =>
    String(template.name || "").trim() ||
    String(template.text || "").split("\n")[0]?.trim() ||
    "—";

  // URLハッシュをアプリ内の画面状態へ変換する。
  const routeFromHash = () => {
    const m = location.hash.match(/^#\/memo\/([^/]+)(?:\/(templates))?$/);
    return m
      ? { name: m[2] ? "templates" : "memo", id: decodeURIComponent(m[1]) }
      : { name: "list" };
  };
  // 現在の言語に合わせて投稿日時を短く表示する。
  const formatDate = (date) =>
    new Intl.DateTimeFormat(language() === "ja" ? "ja-JP" : "en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(date));
  // ブラウザに保存したDropbox認証情報を安全に読み込む。
  function auth() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE.auth));
    } catch {
      return null;
    }
  }
  // Dropbox認証情報をブラウザへ保存する。
  const setAuth = (value) =>
    localStorage.setItem(STORAGE.auth, JSON.stringify(value));

  // Dropboxへ接続済みかを、設定・ローカル体験版・認証情報から判定する。
  const isConnected = () => configured() && !state.local && !!auth();

  // Dropboxの409 conflictを判定し、別端末の変更を上書きしないよう通知を分ける。
  const isConflictError = (error) =>
    String(error?.message || error).includes("Dropbox 409");

  // メモ本文ファイルのDropboxパスを一箇所で組み立てる。
  const memoPath = (memoId) => `/memos/${memoId}.json`;

  // 一時的な操作結果をトーストで知らせる。
  function notify(message) {
    // 新しい通知内容で表示時間をリセットする。
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }
  // 通信中の件数を管理し、0件以外ならヘッダーにスピナーを表示する。
  function setSyncing(delta) {
    // 同時通信が終わる順序に関係なく、件数が負にならないようにする。
    state.syncing = Math.max(0, state.syncing + delta);

    // 現在描画されているヘッダーがあれば表示を更新する。
    const el = document.querySelector("#sync-indicator");
    if (el)
      el.innerHTML = state.syncing
        ? '<span class="spinner" aria-label="Saving"></span>'
        : "";
  }
  // 各画面で共通のヘッダーを組み立てる。
  function header({
    back = false,
    title = "Monopost",
    right = "",
    topControls = false,
  } = {}) {
    // 一覧画面だけに言語切り替え・ログアウトを表示する。
    const controls = topControls
      ? `<button class="language-button" data-action="language">${icon("globe", "button-icon")} ${t("language")}</button>${isConnected() ? `<button class="logout-button" data-action="logout">${t("logout")}</button>` : ""}`
      : "";

    // メモ画面だけに戻るボタンを表示する。
    const leading = back
      ? `<button class="icon-button" data-action="back" aria-label="Back">${icon("chevron-left")}</button>`
      : "";
    return `<header class="topbar">${leading}<div class="${title === "Monopost" ? "brand" : "memo-title"}">${escapeHtml(title)}</div><div class="spacer"></div><div class="sync" id="sync-indicator">${state.syncing ? '<span class="spinner"></span>' : ""}</div>${right}${controls}</header>`;
  }
  // Dropbox未設定時の体験版データをlocalStorageから読む。
  function localData() {
    try {
      // 破損した保存値でもアプリが起動できるよう、読み込み失敗時は空データにする。
      return (
        JSON.parse(localStorage.getItem(STORAGE.local)) || {
          index: { version: 1, memos: [] },
          memos: {},
        }
      );
    } catch {
      return { index: { version: 1, memos: [] }, memos: {} };
    }
  }
  // 体験版データをまとめてlocalStorageへ書き込む。
  const saveLocal = (data) =>
    localStorage.setItem(STORAGE.local, JSON.stringify(data));

  // PKCEのcode verifierをDropboxが要求するbase64url形式へハッシュ化する。
  async function sha256base64url(value) {
    // Web Crypto APIでSHA-256のバイナリ値を得る。
    const raw = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value),
    );
    // OAuthで使えるbase64url表現へ変換する。
    return btoa(String.fromCharCode(...new Uint8Array(raw)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  // OAuthでDropboxへ渡す、このページ自身の戻り先URLを作る。
  const redirectUri = () => `${location.origin}${location.pathname}`;
  // PKCEを使った、サーバー不要のDropbox OAuth開始処理。
  async function connectDropbox() {
    // App keyがない開発時はDropboxへ遷移せず、ローカル体験版を起動する。
    if (!configured()) return startLocal();

    // 認可リクエストごとにPKCE verifierとCSRF対策用stateを生成する。
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    const verifier = Array.from(
      crypto.getRandomValues(new Uint8Array(64)),
      (v) => chars[v % chars.length],
    ).join("");
    const oauthState = id();
    sessionStorage.setItem(
      "monopost.pkce",
      JSON.stringify({ verifier, oauthState }),
    );

    // Dropboxの認可画面へ渡すパラメータを組み立てる。
    const params = new URLSearchParams({
      client_id: APP_KEY,
      response_type: "code",
      redirect_uri: redirectUri(),
      code_challenge_method: "S256",
      code_challenge: await sha256base64url(verifier),
      token_access_type: "offline",
      state: oauthState,
    });
    location.assign(`https://www.dropbox.com/oauth2/authorize?${params}`);
  }
  // Dropboxから戻った認可コードを、ブラウザ内でトークンへ交換する。
  async function finishOAuth() {
    // OAuthの戻りでなければ、通常起動として後続の初期化へ進む。
    const params = new URLSearchParams(location.search),
      code = params.get("code");
    if (!code) return false;

    // URLと一時的なPKCE情報を検証して、認可コードのすり替えを防ぐ。
    const clean = () =>
      history.replaceState({}, "", `${location.pathname}${location.hash}`);
    const pending = JSON.parse(
      sessionStorage.getItem("monopost.pkce") || "null",
    );
    if (!pending || pending.oauthState !== params.get("state")) {
      clean();
      throw new Error(t("relink"));
    }

    // 認可コードとverifierをDropboxへ送って、更新可能なトークンを得る。
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: APP_KEY,
      redirect_uri: redirectUri(),
      code_verifier: pending.verifier,
    });
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      // 失敗理由を可能な範囲で表示し、同じURLで再試行し続けないよう掃除する。
      let detail = "";
      try {
        const result = await response.json();
        detail = result.error_description || result.error || "";
      } catch {}
      sessionStorage.removeItem("monopost.pkce");
      clean();
      throw new Error(`${t("authError")} ${detail}`);
    }

    // 認証情報はこのブラウザだけに保存し、URLとPKCE一時情報を片付ける。
    const result = await response.json();
    setAuth({
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: Date.now() + (result.expires_in || 14400) * 1000,
    });
    sessionStorage.removeItem("monopost.pkce");
    clean();
    return true;
  }

  // 期限が近いアクセストークンを、保存済みのリフレッシュトークンで更新する。
  async function refreshAccessToken(saved) {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: saved.refreshToken,
      client_id: APP_KEY,
    });
    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) {
      localStorage.removeItem(STORAGE.auth);
      throw new Error(t("relink"));
    }
    const result = await response.json(),
      renewed = {
        ...saved,
        accessToken: result.access_token,
        refreshToken: result.refresh_token || saved.refreshToken,
        expiresAt: Date.now() + (result.expires_in || 14400) * 1000,
      };
    setAuth(renewed);
    return renewed.accessToken;
  }

  // 有効なアクセストークンを返す。必要なら更新または再認可を始める。
  async function token() {
    const saved = auth();

    // 未認証なら認可画面へ遷移する。
    if (!saved) {
      if (configured()) {
        await connectDropbox();
        return null;
      }
      return null;
    }

    // 1分以内に期限切れになるトークンは、API呼び出し前に更新する。
    if (saved.expiresAt < Date.now() + 60000) {
      if (saved.refreshToken) return refreshAccessToken(saved);
      await connectDropbox();
      return null;
    }
    return saved.accessToken;
  }
  // Dropbox API呼び出しはここへ集約し、通信中はヘッダーにスピナーを出す。
  async function dbx(endpoint, args, content) {
    // API呼び出しに必要な認証情報を確保する。
    const accessToken = await token();
    if (!accessToken) throw new Error(t("relink"));
    setSyncing(1);
    try {
      // ダウンロード・アップロード・JSON APIで必要なヘッダーと本文を切り替える。
      const headers = { Authorization: `Bearer ${accessToken}` },
        options = { method: "POST", headers };
      if (content !== undefined) {
        headers["Content-Type"] = "application/octet-stream";
        headers["Dropbox-API-Arg"] = JSON.stringify(args);
        options.body = content;
      } else if (endpoint === "files/download") {
        headers["Dropbox-API-Arg"] = JSON.stringify(args);
      } else {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(args);
      }

      // ファイルの送受信だけはcontentサブドメインへ送る。
      const contentHost =
          content !== undefined || endpoint === "files/download",
        response = await fetch(
          `https://${contentHost ? "content" : "api"}.dropboxapi.com/2/${endpoint}`,
          options,
        );
      if (!response.ok) {
        // 認証切れは保存済み情報を消し、次回に接続し直せるようにする。
        const detail = await response.text();
        if (response.status === 401) localStorage.removeItem(STORAGE.auth);
        throw new Error(`Dropbox ${response.status}: ${detail}`);
      }

      // ダウンロード時は本文とrev入りメタデータを一緒に返す。
      if (endpoint === "files/download") {
        const metadata = JSON.parse(
          response.headers.get("Dropbox-API-Result") || "{}",
        );
        return { content: await response.text(), metadata };
      }

      // それ以外のAPIはJSONとして呼び出し元へ返す。
      return response.json();
    } finally {
      // 成否にかかわらず通信中表示を解除する。
      setSyncing(-1);
    }
  }

  // Dropboxまたは体験版ストレージからJSONファイルを読む。
  async function readFile(path) {
    if (state.local)
      return path === "/index.json"
        ? localData().index
        : localData().memos[path.slice(7, -5)];
    const result = await dbx("files/download", { path });
    if (result.metadata?.rev) state.revisions[path] = result.metadata.rev;
    return JSON.parse(result.content);
  }

  // Dropboxまたは体験版ストレージへJSONファイルを書く。
  async function writeFile(path, content) {
    if (state.local) {
      const data = localData();
      if (path === "/index.json") data.index = content;
      else data.memos[path.slice(7, -5)] = content;
      saveLocal(data);
      return;
    }

    // 既存ファイルはrev一致時だけ更新し、別端末の変更を黙って上書きしない。
    const rev = state.revisions[path],
      metadata = await dbx(
        "files/upload",
        {
          path,
          mode: rev ? { ".tag": "update", update: rev } : "add",
          autorename: false,
          mute: true,
          strict_conflict: !!rev,
        },
        JSON.stringify(content, null, 2),
      );
    if (metadata?.rev) state.revisions[path] = metadata.rev;
  }

  // 一覧に保存する1メモ分の要約を作る。
  function summaryForMemo(memo) {
    return {
      id: memo.id,
      title: memo.title || t("newMemoTitle"),
      icon: safeIconName(memo.icon),
      createdAt: memo.createdAt || now(),
      updatedAt: memo.updatedAt || now(),
    };
  }

  // 最新の一覧へ1メモ分の要約を追加または更新する。
  function upsertSummary(index, summary) {
    const normalized = {
      version: index?.version || 1,
      memos: Array.isArray(index?.memos) ? index.memos : [],
    };
    const existing = normalized.memos.find((memo) => memo.id === summary.id);

    // 既存行があれば更新し、なければ先頭に追加する。
    if (existing) Object.assign(existing, summary);
    else normalized.memos.unshift(summary);

    // 一覧は更新日時の新しい順に並べる。
    normalized.memos.sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    );
    return normalized;
  }

  // index.jsonだけが競合した場合は、最新一覧を読み直して対象メモだけをマージする。
  async function mergeMemoIntoLatestIndex(memo, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt += 1) {
      let latest;
      try {
        latest = await readFile("/index.json");
      } catch (error) {
        if (!String(error.message).includes("409")) throw error;
        delete state.revisions["/index.json"];
        latest = { version: 1, memos: [] };
      }

      const merged = upsertSummary(latest, summaryForMemo(memo));
      try {
        await writeFile("/index.json", merged);
        state.index = merged;
        return;
      } catch (error) {
        if (!isConflictError(error) || attempt === retries - 1) throw error;
      }
    }
  }

  // 競合コピーであることが後から見てわかるタイトルにする。
  function conflictCopyTitle(title) {
    const base = title || t("newMemoTitle"),
      suffix =
        language() === "ja"
          ? `（${t("conflictCopySuffix")}）`
          : ` (${t("conflictCopySuffix")})`;
    return base.endsWith(suffix) ? base : `${base}${suffix}`;
  }

  // 元メモの保存が競合したら、手元の内容を新しいメモJSONとして退避する。
  async function saveConflictCopy(memo) {
    const originalId = memo.id,
      copied = clone(memo),
      copiedAt = now();
    copied.id = id();
    copied.title = conflictCopyTitle(copied.title);
    copied.createdAt = copiedAt;
    copied.updatedAt = copiedAt;

    // UUID衝突はほぼ起きないが、addが409になった場合だけIDを作り直す。
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await writeFile(memoPath(copied.id), copied);
        state.conflictCopies[originalId] = copied.id;
        return copied;
      } catch (error) {
        if (!isConflictError(error) || attempt === 2) throw error;
        copied.id = id();
      }
    }
  }

  // 保存キュー上のスナップショットを、通常保存または競合コピーとして保存する。
  async function saveMemoSnapshot(memo) {
    const originalId = memo.id,
      conflictCopyId = state.conflictCopies[originalId],
      target = clone(memo);

    // すでに競合コピー化した元メモの後続保存は、同じコピーへ流す。
    if (conflictCopyId) {
      target.id = conflictCopyId;
      target.title = conflictCopyTitle(target.title);
    }

    try {
      await writeFile(memoPath(target.id), target);
      return {
        memo: target,
        originalId,
        copied: target.id !== originalId,
      };
    } catch (error) {
      if (!isConflictError(error)) throw error;
      return {
        memo: await saveConflictCopy(memo),
        originalId,
        copied: true,
      };
    }
  }

  // index.json保存が競合したら、最新一覧に対象メモだけを合流させる。
  async function saveIndexSnapshot(indexSnapshot, savedMemo) {
    try {
      await writeFile("/index.json", indexSnapshot);
    } catch (error) {
      if (!isConflictError(error) || !savedMemo) throw error;
      await mergeMemoIntoLatestIndex(savedMemo);
    }
  }

  // 競合コピー化したメモを現在開いている場合は、画面もコピー側へ移す。
  function showConflictCopy(saved) {
    if (!saved.copied || state.memo?.id !== saved.originalId) return;

    // 画面上の最新状態を保ったまま、新しいメモIDへ切り替える。
    const visibleMemo = clone(state.memo);
    visibleMemo.id = saved.memo.id;
    visibleMemo.title = conflictCopyTitle(visibleMemo.title);
    visibleMemo.createdAt = saved.memo.createdAt;
    visibleMemo.updatedAt = saved.memo.updatedAt;
    state.memo = visibleMemo;
    state.editingEntryId = null;

    // 一覧にもコピーを反映し、URLをコピー側へ移動する。
    state.index = upsertSummary(state.index, summaryForMemo(visibleMemo));
    location.hash = `#/memo/${encodeURIComponent(visibleMemo.id)}`;
    render();
    notify(t("conflictCopySaved"));
  }

  // Dropboxまたは体験版ストレージからJSONファイルを削除する。
  async function deleteFile(path) {
    if (state.local) {
      const data = localData();
      if (path === "/index.json") data.index = { version: 1, memos: [] };
      else delete data.memos[path.slice(7, -5)];
      saveLocal(data);
      return;
    }
    await dbx("files/delete_v2", { path });
    delete state.revisions[path];
  }

  // メモ一覧を読み、初回利用時は空のindex.jsonを作る。
  async function loadIndex() {
    try {
      state.index = await readFile("/index.json");
    } catch (error) {
      // Dropboxのpath/not_foundだけは初回利用とみなし、空の一覧を作る。
      if (String(error.message).includes("409")) {
        state.index = { version: 1, memos: [] };
        await writeFile("/index.json", state.index);
      } else throw error;
    }
  }
  // 保存時点のスナップショットをキューへ積む。書き込み順を保ち、古い内容で戻らないようにする。
  function queueSave({ memo = null, index = false } = {}) {
    // 呼び出し後にstateが変わっても、保存対象はこの時点の内容に固定する。
    const memoSnapshot = memo && clone(memo),
      indexSnapshot = index && clone(state.index);

    // 直前の保存が失敗していても、次の保存は続行できるようにする。
    state.saveTail = state.saveTail
      .catch(() => {})
      .then(async () => {
        const saved = memoSnapshot
          ? await saveMemoSnapshot(memoSnapshot)
          : null;
        if (indexSnapshot && saved?.copied)
          await mergeMemoIntoLatestIndex(saved.memo);
        else if (indexSnapshot)
          await saveIndexSnapshot(indexSnapshot, saved?.memo || null);
        if (saved) showConflictCopy(saved);
      })
      .catch((error) => {
        // UIはすでに更新済みなので、保存失敗だけを通知する。
        console.error(error);
        notify(t(isConflictError(error) ? "conflictError" : "syncError"));
      });
    return state.saveTail;
  }
  // メモJSONの削除と一覧更新を、他の保存処理と直列に実行する。
  function queueMemoDeletion(memoId) {
    // 削除後の一覧を固定して、後から追加された内容で復活しないようにする。
    const indexSnapshot = clone(state.index);

    // 先行している保存のあとに、メモ本体の削除と一覧更新を続けて行う。
    state.saveTail = state.saveTail
      .catch(() => {})
      .then(async () => {
        await deleteFile(memoPath(memoId));
        await writeFile("/index.json", indexSnapshot);
      })
      .catch((error) => {
        // 削除に失敗しても一覧UIは戻さず、同期失敗だけを通知する。
        console.error(error);
        notify(t(isConflictError(error) ? "conflictError" : "syncError"));
      });
    return state.saveTail;
  }

  // Dropbox未設定時に、データをこのブラウザだけへ保存する体験版を起動する。
  function startLocal() {
    state.local = true;
    state.revisions = {};
    state.conflictCopies = {};
    localStorage.removeItem(STORAGE.auth);
    boot().catch(showError);
  }

  // 現在開いているメモの一覧用サマリーを取得する。
  function currentSummary() {
    return state.index.memos.find((item) => item.id === state.memo?.id);
  }

  // メモ保存前に、一覧に表示するタイトル・アイコン・更新日時を同期する。
  function updateSummary() {
    const summary = currentSummary();

    // 開いているメモが一覧に存在する場合だけ、表示用サマリーを更新する。
    if (summary && state.memo) {
      const updatedAt = now();
      state.memo.updatedAt = updatedAt;
      summary.title = state.memo.title;
      summary.icon = safeIconName(state.memo.icon);
      summary.updatedAt = updatedAt;

      // 最近更新したメモが先頭になるよう一覧を並べ替える。
      state.index.memos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
  }

  // メモ本体と一覧を同じ保存キューへ追加する。
  function saveMemo() {
    updateSummary();
    queueSave({ memo: state.memo, index: true });
  }

  // テンプレート入力中は少し待ち、連続入力ごとの保存を避ける。
  function scheduleTemplateSave() {
    clearTimeout(state.templateTimer);
    state.templateTimer = setTimeout(saveMemo, 450);
  }

  // 指定されたメモJSONを読み、編集中のメモとしてstateへセットする。
  async function loadMemo(memoId) {
    state.memo = await readFile(memoPath(memoId));
  }
  // URLハッシュに応じて、一覧・メモ・テンプレート管理を描画する。
  function render() {
    // 一覧画面はメモ本文を読む必要がないため、すぐ描画する。
    const route = routeFromHash();
    if (route.name === "list") return renderList();

    // 目的のメモが未読なら、読み込み中表示を出してから再描画する。
    if (!state.memo || state.memo.id !== route.id) {
      app.innerHTML = `<section class="shell">${header()}<div class="empty"><div class="spinner"></div></div></section>`;
      loadMemo(route.id).then(render).catch(showError);
      return;
    }

    // 同じメモ内で、通常画面かテンプレート管理画面かを切り替える。
    if (route.name === "templates") return renderTemplates();
    renderMemo();
  }

  // ログイン後のメモ一覧画面を描画する。
  function renderList() {
    const memos = state.index.memos;
    app.innerHTML = `<section class="shell">${header({ topControls: true })}<div class="hero"><h1>${t("yourNotes")}</h1></div>${memos.length ? `<div class="memo-list">${memos.map((memo) => `<button class="memo-card" data-open-memo="${escapeAttr(memo.id)}"><span class="memo-avatar">${icon(memo.icon)}</span><span><strong>${escapeHtml(memo.title || t("untitled"))}</strong><small>${formatDate(memo.updatedAt)}</small></span><span class="chevron">›</span></button>`).join("")}</div>` : `<div class="empty"><h2>${t("noMemos")}</h2><p>${t("noMemosText")}</p></div>`}<div class="bottom-action"><button class="primary" data-action="new-memo">${icon("plus", "button-icon")} ${t("newMemo")}</button></div></section>`;
    renderIcons(app);
  }
  // メモ本体は投稿を先にUIへ反映し、Dropbox保存はバックグラウンドで行う。
  function renderMemo({ focusInput = false } = {}) {
    // よく使うテンプレート名を入力欄の近くへ最大4件だけ並べる。
    const memo = state.memo,
      templateButtons = memo.templates
        .slice(0, 4)
        .map(
          (template) =>
            `<button class="template-chip" data-template="${escapeAttr(template.id)}">${escapeHtml(templateLabel(template))}</button>`,
        )
        .join("");

    // メモの投稿一覧、テンプレート操作、入力欄をまとめて描画する。
    app.innerHTML = `<section class="shell memo-screen">${header({ back: true, title: memo.title || t("newMemoTitle"), right: `<button class="icon-button" data-action="note-menu" aria-label="Note menu">${icon("menu")}</button>` })}<div class="chat">${memo.entries.length ? memo.entries.map((entry) => `<div class="entry-row"><span class="entry-memo-icon">${icon(memo.icon)}</span><div><button class="bubble" data-entry="${escapeAttr(entry.id)}">${escapeHtml(entry.text || "")}</button><time class="entry-time">${formatDate(entry.createdAt)}</time></div></div>`).join("") : `<div class="new-note">${escapeHtml(t("newPost")).replace(/\n/g, "<br>")}</div>`}</div><div class="composer-wrap"><div class="template-strip"><button class="template-chip" data-action="pick-template">${icon("message-square-text", "button-icon")} ${t("templates")}</button>${templateButtons}</div><div class="composer"><textarea id="entry-input" rows="1" placeholder="${t("placeholder")}" aria-label="${t("send")}"></textarea><button class="send" data-action="submit-entry" aria-label="${t("send")}">${icon("send")}</button></div></div></section>`;

    // 描画したLucideアイコンをSVGへ変換する。
    renderIcons(app);

    // テキストエリアの高さを内容に合わせ、⌘/Ctrl+Enterで投稿できるようにする。
    const input = document.querySelector("#entry-input");
    input.addEventListener("input", () => {
      fitTextarea(input, 150);
    });
    input.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        submitEntry();
      }
    });

    // 初期表示や新規投稿後は、常に新しい投稿が見える末尾までスクロールする。
    scrollMemoToBottom();
    if (focusInput) focusEntryInput(input);
  }
  // テンプレートは名前と本文を同じ画面で直接編集し、自動保存する。
  function renderTemplates() {
    // テンプレートがない場合も、追加ボタンは常に表示する。
    const templates = state.memo.templates;
    app.innerHTML = `<section class="shell template-admin">${header({ back: true, title: "" })}<h1>${t("templates")}</h1><p>${t("templatesText")}</p><button class="outline" data-action="new-template">${icon("plus", "button-icon")} ${t("addTemplate")}</button><div id="template-list">${templates.length ? templates.map((template, index) => `<article class="template-item"><input class="template-name" data-template-name="${escapeAttr(template.id)}" value="${escapeHtml(template.name || "")}" placeholder="${t("templateName")}" aria-label="${t("templateName")}"><textarea data-template-text="${escapeAttr(template.id)}" aria-label="${t("templates")}"></textarea><div class="template-item-actions"><button class="small-button" data-move="up" data-template-id="${escapeAttr(template.id)}" ${index === 0 ? "disabled" : ""}>${icon("arrow-up-from-line")}</button><button class="small-button" data-move="down" data-template-id="${escapeAttr(template.id)}" ${index === templates.length - 1 ? "disabled" : ""}>${icon("arrow-down-from-line")}</button><button class="small-button danger" data-action="delete-template" data-template-id="${escapeAttr(template.id)}">${icon("square-x", "button-icon")} ${t("delete")}</button></div></article>`).join("") : `<div class="empty"><h2>${t("noTemplates")}</h2></div>`}</div></section>`;

    // textareaのHTML初期値では先頭改行が落ちるため、valueとして正確に復元する。
    document.querySelectorAll("[data-template-text]").forEach((field) => {
      const template = templates.find(
        (item) => item.id === field.dataset.templateText,
      );
      if (template) field.value = String(template.text || "");
      fitTextarea(field, 260);
    });

    renderIcons(app);
  }

  // モーダルまたは画面下部シートをDOMへ追加して表示する。
  function showModal(content, className = "modal-backdrop") {
    const modal = document.createElement("div");
    modal.className = className;
    modal.id = "modal";
    modal.innerHTML = content;
    document.body.append(modal);
    renderIcons(modal);
  }

  // 開いているモーダルがあれば閉じる。
  const closeModal = () => document.querySelector("#modal")?.remove();

  // メモ右上のメニューを開く。
  function noteMenu() {
    showModal(
      `<section class="sheet"><div class="sheet-handle"></div><button class="menu-button" data-action="edit-title">${icon("pencil", "button-icon")} ${t("editTitle")}</button><button class="menu-button" data-action="pick-icon">${icon("palette", "button-icon")} ${t("changeIcon")}</button><button class="menu-button" data-action="templates">${icon("square-menu", "button-icon")} ${t("templates")}</button><button class="menu-button danger" data-action="delete-memo">${icon("message-circle-x", "button-icon")} ${t("delete")}</button><button class="menu-button" data-action="close-modal">${icon("x", "button-icon")} ${t("close")}</button></section>`,
    );
  }

  // 投稿をタップしたときのコピー・編集・削除メニューを開く。
  function menuForEntry(entry) {
    showModal(
      `<section class="sheet"><div class="sheet-handle"></div><button class="menu-button" data-entry-action="copy" data-entry-id="${escapeAttr(entry.id)}">${icon("copy", "button-icon")} ${t("copy")}</button><button class="menu-button" data-entry-action="edit" data-entry-id="${escapeAttr(entry.id)}">${icon("pencil", "button-icon")} ${t("edit")}</button><button class="menu-button" data-entry-action="duplicate" data-entry-id="${escapeAttr(entry.id)}">${icon("copy-plus", "button-icon")} ${t("duplicate")}</button><button class="menu-button" data-entry-action="template" data-entry-id="${escapeAttr(entry.id)}">${icon("square-plus", "button-icon")} ${t("saveTemplate")}</button><button class="menu-button danger" data-entry-action="delete" data-entry-id="${escapeAttr(entry.id)}">${icon("message-circle-x", "button-icon")} ${t("delete")}</button><button class="menu-button" data-action="close-modal">${icon("x", "button-icon")} ${t("close")}</button></section>`,
    );
  }

  // 投稿欄のテンプレート選択シートを開く。
  function templatePicker() {
    showModal(
      `<section class="sheet"><div class="sheet-handle"></div><h2>${t("templatePickerTitle")}</h2>${state.memo.templates.length ? state.memo.templates.map((template) => `<button class="template-pick" data-template="${escapeAttr(template.id)}">${escapeHtml(templateLabel(template))}</button>`).join("") : `<p class="sheet-empty">${t("noTemplates")}</p>`}<button class="menu-button" data-action="close-modal">${icon("x", "button-icon")} ${t("close")}</button></section>`,
    );
  }

  // 削除操作の最終確認ダイアログを開く。
  function confirmDialog(title, detail, action) {
    showModal(
      `<section class="dialog"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p><div class="dialog-actions"><button class="outline" data-action="close-modal">${t("cancel")}</button><button class="primary danger-button" data-confirm="${escapeAttr(action)}">${t("deleteNow")}</button></div></section>`,
      "modal",
    );
  }

  // メモタイトルを編集するダイアログを開く。
  function titleEditor() {
    showModal(
      `<section class="dialog"><h2>${t("editTitle")}</h2><input id="title-field" value="${escapeHtml(state.memo.title)}" aria-label="${t("title")}"><div class="dialog-actions"><button class="outline" data-action="close-modal">${t("cancel")}</button><button class="primary" data-action="save-title">${t("save")}</button></div></section>`,
      "modal",
    );
  }

  // メモ一覧や投稿に使うアイコンを選ぶシートを開く。
  function iconPicker() {
    showModal(
      `<section class="sheet icon-sheet"><div class="sheet-handle"></div><h2>${t("chooseIcon")}</h2><div class="icon-grid">${MEMO_ICON_CHOICES.map((name) => `<button class="icon-choice ${name === safeIconName(state.memo.icon || DEFAULT_ICON) ? "selected" : ""}" data-memo-icon="${name}" aria-label="${name}">${icon(name)}</button>`).join("")}</div><button class="menu-button" data-action="close-modal">${icon("x", "button-icon")} ${t("close")}</button></section>`,
    );
  }
  // 新しい空のメモを作成し、すぐ編集画面へ遷移する。
  function createMemo() {
    // 本文・テンプレートを空にした新しいメモを作る。
    const memo = {
      id: id(),
      title: "",
      icon: DEFAULT_ICON,
      entries: [],
      templates: [],
      createdAt: now(),
      updatedAt: now(),
    };

    // 一覧へ先に追加してから、メモ本体と一覧をバックグラウンドで保存する。
    state.index.memos.unshift({
      id: memo.id,
      title: t("newMemoTitle"),
      icon: memo.icon,
      createdAt: memo.createdAt,
      updatedAt: memo.updatedAt,
    });
    state.memo = memo;
    queueSave({ memo, index: true });
    location.hash = `#/memo/${encodeURIComponent(memo.id)}`;
  }

  // 現在のメモを一覧から消し、保存キューでDropbox上のJSONも削除する。
  function deleteCurrentMemo() {
    const memoId = state.memo.id;
    state.index.memos = state.index.memos.filter((memo) => memo.id !== memoId);
    state.memo = null;
    state.editingEntryId = null;
    queueMemoDeletion(memoId);
    closeModal();
    location.hash = "#/";
    notify(t("deleted"));
  }
  // 入力欄の内容を投稿する。編集中なら既存投稿を更新し、それ以外は末尾に追加する。
  function submitEntry() {
    // 空白だけの投稿は作らない。
    const input = document.querySelector("#entry-input"),
      text = input.value;
    if (!text.trim()) return;

    // 編集対象の有無で、更新と新規追加を切り替える。
    const existing =
      state.editingEntryId &&
      state.memo.entries.find((entry) => entry.id === state.editingEntryId);
    if (existing) {
      existing.text = text;
      existing.updatedAt = now();
      state.editingEntryId = null;
    } else {
      state.memo.entries.push({ id: id(), text, createdAt: now() });
      if (!state.memo.title) state.memo.title = text;
    }

    // UIは直ちに再描画し、保存はキュー経由で裏で進める。
    saveMemo();
    renderMemo({ focusInput: true });
  }

  // 予期しないエラーを画面と開発者コンソールへ表示する。
  function showError(error) {
    console.error(error);
    app.innerHTML = `<section class="shell">${header()}<div class="empty"><h2>${t("loadError")}</h2><p>${escapeHtml(error.message || "")}</p><button class="primary" data-action="retry">${t("retry")}</button></div></section>`;
  }
  // 起動時はOAuthの戻りを処理してから、認証済みならDropboxの一覧を読む。
  async function boot() {
    // OAuthから戻った直後なら、まず認証情報を確定させる。
    if (await finishOAuth()) notify(t("connected"));

    // App keyがなければDropboxを使わない体験版として起動する。
    state.local = !configured();
    if (!state.local && !auth()) {
      renderWelcome();
      return;
    }

    // 認証済みなら一覧を読んで、URLに対応する画面を表示する。
    await loadIndex();
    render();
  }

  // 未ログイン時のウェルカム画面を描画する。
  function renderWelcome() {
    app.innerHTML = `<section class="shell">${header({ topControls: true })}<div class="welcome empty"><div class="welcome-app-icon" aria-hidden="true"></div><h2>${t("welcome")}</h2><p>${t("welcomeText")}</p><button class="primary" data-action="connect">${t("connect")}</button></div></section>`;
    renderIcons(app);
  }

  // このブラウザの認証情報を消し、ウェルカム画面へ戻る。
  function logout() {
    localStorage.removeItem(STORAGE.auth);
    state.memo = null;
    state.index = { version: 1, memos: [] };
    state.revisions = {};
    state.conflictCopies = {};
    history.replaceState({}, "", location.pathname);
    renderWelcome();
  }
  // テンプレートの入力変更は短い遅延を挟んで自動保存する。
  document.addEventListener("input", (event) => {
    // テンプレート名・本文以外の入力は無視する。
    const field = event.target.closest(
      "[data-template-text],[data-template-name]",
    );
    if (!field) return;

    // 変更対象のテンプレートを特定して、該当するフィールドだけ更新する。
    const template = state.memo?.templates.find(
      (item) =>
        item.id === (field.dataset.templateText || field.dataset.templateName),
    );
    if (template) {
      if (field.dataset.templateText) {
        template.text = field.value;
        fitTextarea(field, 260);
      } else template.name = field.value;
      scheduleTemplateSave();
    }
  });

  // 入力欄からフォーカスが外れたら、待機中の自動保存をすぐ実行する。
  document.addEventListener("change", (event) => {
    if (event.target.closest("[data-template-text],[data-template-name]")) {
      clearTimeout(state.templateTimer);
      saveMemo();
    }
  });
  // 画面を再描画しても個別リスナーを付け直さずに済むよう、操作はイベント委譲で扱う。
  document.addEventListener("click", async (event) => {
    // ボタン以外のクリックは扱わない。
    const target = event.target.closest("button");
    if (!target) return;

    try {
      const action = target.dataset.action;

      // アプリ全体に関わる操作（言語・接続・ログアウト・再試行）を処理する。
      if (action === "language") {
        localStorage.setItem(
          STORAGE.language,
          language() === "en" ? "ja" : "en",
        );
        document.documentElement.lang = language();
        const route = routeFromHash();
        if (route.name === "list") {
          if (!state.local && !auth()) renderWelcome();
          else renderList();
        } else render();
        return;
      }
      if (action === "connect") return connectDropbox();
      if (action === "logout") return logout();
      if (action === "retry") return boot().catch(showError);
      if (action === "close-modal") return closeModal();
      if (action === "new-memo") return createMemo();

      // 一覧から選んだメモのURLへ遷移する。
      if (target.dataset.openMemo) {
        location.hash = `#/memo/${encodeURIComponent(target.dataset.openMemo)}`;
        return;
      }
      if (action === "back") {
        history.back();
        return;
      }

      // メモ右上のメニューと、そこから開く設定操作を処理する。
      if (action === "note-menu") return noteMenu();
      if (action === "pick-icon") {
        closeModal();
        return iconPicker();
      }
      if (target.dataset.memoIcon) {
        state.memo.icon = safeIconName(target.dataset.memoIcon);
        saveMemo();
        closeModal();
        renderMemo();
        return;
      }
      if (action === "templates") {
        closeModal();
        location.hash = `#/memo/${encodeURIComponent(state.memo.id)}/templates`;
        return;
      }
      if (action === "edit-title") {
        closeModal();
        return titleEditor();
      }
      if (action === "delete-memo") {
        closeModal();
        return confirmDialog(t("deleteMemo"), t("deleteMemoText"), "memo");
      }
      if (action === "save-title") {
        const value = document.querySelector("#title-field").value.trim();
        if (value) {
          state.memo.title = value;
          saveMemo();
        }
        closeModal();
        renderMemo();
        return;
      }
      if (action === "submit-entry") return submitEntry();

      // テンプレートを選ぶと、現在の入力内容を保ったまま本文を差し込む。
      if (action === "pick-template") return templatePicker();
      if (target.dataset.template) {
        const template = state.memo.templates.find(
            (item) => item.id === target.dataset.template,
          ),
          input = document.querySelector("#entry-input");
        if (template && input) {
          insertAtCursor(input, template.text);
          focusEntryInput(input);
        }
        closeModal();
        return;
      }

      // 投稿をタップした場合は、投稿用の操作メニューを開く。
      if (target.dataset.entry)
        return menuForEntry(
          state.memo.entries.find((entry) => entry.id === target.dataset.entry),
        );
      if (target.dataset.entryAction) {
        const entry = state.memo.entries.find(
            (item) => item.id === target.dataset.entryId,
          ),
          choice = target.dataset.entryAction;

        // クリップボードへのコピーは非同期APIで行う。
        if (choice === "copy") {
          await navigator.clipboard.writeText(entry.text);
          closeModal();
          notify(t("copied"));
        }

        // 編集は対象IDを保持し、複製はIDを持たずに入力欄へ本文だけ読み込む。
        if (choice === "edit" || choice === "duplicate") {
          state.editingEntryId = choice === "edit" ? entry.id : null;
          closeModal();
          const input = document.querySelector("#entry-input");
          input.value = entry.text;
          input.focus();
          input.dispatchEvent(new Event("input"));
          notify(choice === "edit" ? t("editing") : t("duplicateReady"));
        }

        // 投稿をテンプレートにする場合、最初の行を初期名に採用する。
        if (choice === "template") {
          state.memo.templates.push({
            id: id(),
            name: entry.text.split("\n")[0].trim(),
            text: entry.text,
          });
          saveMemo();
          closeModal();
          notify(t("templateSaved"));
        }

        // 投稿削除だけは確認ダイアログを挟む。
        if (choice === "delete")
          confirmDialog(
            t("deleteEntry"),
            t("deleteEntryText"),
            `entry:${entry.id}`,
          );
        return;
      }

      // 確認ダイアログからの削除を確定する。
      if (target.dataset.confirm === "memo") return deleteCurrentMemo();
      if (target.dataset.confirm?.startsWith("entry:")) {
        state.memo.entries = state.memo.entries.filter(
          (entry) => entry.id !== target.dataset.confirm.slice(6),
        );
        saveMemo();
        closeModal();
        renderMemo();
        notify(t("deleted"));
        return;
      }

      // テンプレート管理画面の追加・削除・並べ替え操作を処理する。
      if (action === "new-template") {
        state.memo.templates.push({ id: id(), name: "", text: "" });
        saveMemo();
        renderTemplates();
        return;
      }
      if (action === "delete-template") {
        state.memo.templates = state.memo.templates.filter(
          (template) => template.id !== target.dataset.templateId,
        );
        saveMemo();
        renderTemplates();
        return;
      }
      if (target.dataset.move) {
        const from = state.memo.templates.findIndex(
            (template) => template.id === target.dataset.templateId,
          ),
          to = target.dataset.move === "up" ? from - 1 : from + 1;
        [state.memo.templates[from], state.memo.templates[to]] = [
          state.memo.templates[to],
          state.memo.templates[from],
        ];
        saveMemo();
        renderTemplates();
      }
    } catch (error) {
      // クリック処理の例外は、画面を壊したままにせずエラー画面へ渡す。
      showError(error);
    }
  });

  // 初期言語・URL遷移・PWA登録を設定してから、アプリを起動する。
  document.documentElement.lang = language();

  // ブラウザの戻る・進むによるURL変更を、画面表示へ反映する。
  window.addEventListener("hashchange", render);

  // オフラインキャッシュは持たないが、PWAとしてインストールできるようService Workerを登録する。
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});

  // 最後に認証状態を確認して、最初の画面を描画する。
  boot().catch(showError);
})();

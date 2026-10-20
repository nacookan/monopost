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
    saveRunning: false,
    pendingSave: null,
    failedSave: null,
    local: false,
    ready: false,
    view: "",
    refreshing: null,
    revisions: {},
    // 最後にDropboxと一致していた内容。競合時の3方向マージで共通の元として使う。
    bases: {},
    deletedMemoIds: new Set(),
    templateTimer: null,
  };
  // 別端末の変更を確認する間隔と、競合時に読み直してマージする最大回数。
  const REFRESH_INTERVAL = 15000;
  const MERGE_RETRIES = 4;
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
      deleteEntryText:
        "Are you sure you want to delete this post? This action cannot be undone.",
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
      conflictError:
        "Couldn’t merge changes from another device. Please try again.",
      reload: "Reload",
      updated: "Loaded the latest changes",
      upToDate: "Already up to date",
      memoDeleted: "This Note was deleted on another device.",
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
      deleteEntryText: "投稿を削除してよろしいですか？この操作は元に戻せません。",
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
        "別の端末の変更とまとめられませんでした。もう一度お試しください。",
      reload: "再読み込み",
      updated: "最新の内容を読み込みました",
      upToDate: "最新の状態です",
      memoDeleted: "このメモは別の端末で削除されました。",
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
    "refresh-cw",
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

  // iPhoneなど、入力欄へのフォーカスでソフトウェアキーボードが出る端末かを判定する。
  const usesTouchKeyboard = () =>
    window.matchMedia("(hover: none) and (pointer: coarse)").matches;

  // テンプレート挿入後などに入力欄へフォーカスを戻す。
  // タッチ端末ではキーボードを出し直すと入力欄が隠れる位置になるため、自動では出さない。
  function focusEntryInput(input) {
    if (document.activeElement === input || usesTouchKeyboard()) return;
    requestAnimationFrame(() => {
      try {
        input.focus({ preventScroll: true });
      } catch {
        input.focus();
      }
    });
  }

  // textareaを内容量に合わせて広げ、長すぎる場合だけ上限で止める。
  function fitTextarea(textarea, maxHeight) {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }

  // 入力中の入力欄をスクリプトで書き換えるときは、重ねて置いた見えない中継用の入力欄へ
  // いったんフォーカスを移して変換を終わらせ、書き換え後に入力欄へ戻す。
  // iPhoneの日本語入力は、変換中のまま書き換えるとその後に打った文字が入らなくなる。
  // 同じ要素のblur/focusでは直らないが、入力欄どうしの移動ならキーボードを閉じずに入力状態を作り直せる。
  function editEntryInput(input, edit) {
    const relay = document.querySelector("#entry-relay");
    if (document.activeElement !== input || !relay) return edit();

    // フォーカス移動で変換中の文字が消えた場合に備え、移動前の内容へ戻してから書き換える。
    const { value, selectionStart, selectionEnd } = input;
    relay.focus();
    if (input.value !== value) {
      input.value = value;
      input.setSelectionRange(selectionStart, selectionEnd);
    }
    try {
      edit();
    } finally {
      input.focus();
      relay.value = "";
    }

    // 変換中だった場合、直後の切り替えだけでは入力状態が戻らないことがある。
    // 少し待ってもまだ何も入力されていなければ、もう一度切り替えて作り直す。
    const edited = input.value;
    [80, 300].forEach((delay) =>
      setTimeout(() => {
        if (document.activeElement !== input || input.value !== edited) return;
        relay.focus();
        input.focus();
        relay.value = "";
      }, delay),
    );
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

  // 別端末で削除済みなど、対象ファイルが存在しない409かを判定する。
  const isNotFoundError = (error) =>
    isConflictError(error) &&
    String(error?.message || error).includes("not_found");

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
    // Dropbox接続中は再読み込みボタンのアイコンを回し、体験版ではスピナーを出す。
    const el = document.querySelector("#sync-indicator");
    if (!el) return;
    if (el.dataset.action === "refresh")
      el.classList.toggle("is-syncing", state.syncing > 0);
    else
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

    // Dropbox接続中は通信中表示を兼ねた再読み込みボタン、体験版ではスピナーだけを置く。
    const sync = isConnected()
      ? `<button class="icon-button sync-button${state.syncing ? " is-syncing" : ""}" id="sync-indicator" data-action="refresh" aria-label="${t("reload")}" title="${t("reload")}">${icon("refresh-cw")}</button>`
      : `<div class="sync" id="sync-indicator">${state.syncing ? '<span class="spinner"></span>' : ""}</div>`;
    return `<header class="topbar">${leading}<div class="${title === "Monopost" ? "brand" : "memo-title"}">${escapeHtml(title)}</div><div class="spacer"></div>${sync}${right}${controls}</header>`;
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
  // 定期的な変更確認のような軽い呼び出しは、quietで通信中表示を出さない。
  async function dbx(endpoint, args, content, { quiet = false } = {}) {
    // API呼び出しに必要な認証情報を確保する。
    const accessToken = await token();
    if (!accessToken) throw new Error(t("relink"));
    if (!quiet) setSyncing(1);
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
      if (!quiet) setSyncing(-1);
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

    // 画面側で書き換えられないよう、マージ用の元データは別オブジェクトとして持つ。
    state.bases[path] = JSON.parse(result.content);
    return JSON.parse(result.content);
  }

  // 別端末で削除済みならnullを返し、次の保存を新規作成として扱う。
  async function readFileIfExists(path) {
    try {
      return await readFile(path);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      delete state.revisions[path];
      delete state.bases[path];
      return null;
    }
  }

  // 本文をダウンロードせず、Dropbox上の現在のrevだけを確認する。削除済みならnull。
  async function remoteRevision(path) {
    try {
      const metadata = await dbx("files/get_metadata", { path }, undefined, {
        quiet: true,
      });
      return metadata.rev || null;
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
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
    state.bases[path] = clone(content);
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

  // 一覧を更新日時の新しい順に並べる。
  const sortByUpdated = (memos) =>
    memos.sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    );

  // 2つのJSON値が同じ内容かを比べる。
  const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // 共通の元(base)と比べて、手元(local)と別端末(remote)の変更をIDごとに1つへまとめる。
  // 片側だけの変更はそのまま採用し、両側で変わった項目だけpickで選ぶ。
  function mergeList(base, local, remote, { pick, deleteWins = false }) {
    const toMap = (list) =>
        new Map(
          (Array.isArray(list) ? list : []).map((item) => [item.id, item]),
        ),
      before = toMap(base),
      mine = toMap(local),
      theirs = toMap(remote),
      merged = new Map();

    for (const itemId of new Set([...mine.keys(), ...theirs.keys()])) {
      const original = before.get(itemId),
        ours = mine.get(itemId),
        other = theirs.get(itemId);
      if (ours && other) {
        if (sameJson(ours, other) || sameJson(other, original))
          merged.set(itemId, ours);
        else if (sameJson(ours, original)) merged.set(itemId, other);
        else merged.set(itemId, pick(ours, other, original));
      } else if (
        !original ||
        (!deleteWins && !sameJson(ours || other, original))
      ) {
        // 片側にしかない項目は、新規追加か、もう片側で削除される前に編集された場合だけ残す。
        merged.set(itemId, ours || other);
      }
    }

    // 並び順は並べ替えた側を優先し、もう片側にだけある項目を後ろへ足す。
    const ids = (map) => [...map.keys()],
      reordered = (map) =>
        !sameJson(
          ids(map).filter((itemId) => before.has(itemId)),
          ids(before).filter((itemId) => map.has(itemId)),
        ),
      [first, second] =
        reordered(mine) || !reordered(theirs) ? [mine, theirs] : [theirs, mine];
    return [...new Set([...ids(first), ...ids(second)])]
      .filter((itemId) => merged.has(itemId))
      .map((itemId) => merged.get(itemId));
  }

  // 同じメモの手元版と別端末版を、重複なく1つにまとめる。投稿は作成日時順に並べる。
  function mergeMemos(base, local, remote) {
    const before = base || {},
      changed = (ours, other, original, key) =>
        sameJson(ours[key], original[key]) ? other[key] : ours[key],
      editedAt = (entry) => String(entry.updatedAt || entry.createdAt || ""),
      dates = (key) => [local[key], remote[key]].filter(Boolean).sort();

    return clone({
      ...remote,
      ...local,
      title: changed(local, remote, before, "title"),
      icon: changed(local, remote, before, "icon"),
      createdAt: dates("createdAt")[0],
      updatedAt: dates("updatedAt").pop(),
      // 同じ投稿が両方で編集されていたら、後から編集した方を残す。
      entries: mergeList(before.entries, local.entries, remote.entries, {
        pick: (ours, other) =>
          editedAt(other) > editedAt(ours) ? other : ours,
      }).sort((a, b) =>
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")),
      ),
      // テンプレートは名前と本文を別々にマージし、両方で変えた項目は手元を優先する。
      templates: mergeList(
        before.templates,
        local.templates,
        remote.templates,
        {
          pick: (ours, other, original = {}) => ({
            ...other,
            ...ours,
            name: changed(ours, other, original, "name"),
            text: changed(ours, other, original, "text"),
          }),
        },
      ),
    });
  }

  // メモ一覧をマージする。どちらかで削除されたメモは、一覧からも削除する。
  function mergeIndex(base, local, remote) {
    const memos = mergeList(base?.memos, local?.memos, remote?.memos, {
      pick: (ours, other) =>
        String(other.updatedAt || "") > String(ours.updatedAt || "")
          ? other
          : ours,
      deleteWins: true,
    }).filter((memo) => !state.deletedMemoIds.has(memo.id));
    return clone({
      version: local?.version || remote?.version || 1,
      memos: sortByUpdated(memos),
    });
  }

  // メモを保存する。別端末の変更と競合したら、最新版を読み直してマージしてから保存し直す。
  async function saveMemoSnapshot(memo) {
    const path = memoPath(memo.id);
    let base = state.bases[path],
      content = memo;

    for (let attempt = 0; ; attempt += 1) {
      try {
        await writeFile(path, content);
        return content;
      } catch (error) {
        if (!isConflictError(error) || attempt >= MERGE_RETRIES) throw error;

        // 別端末で削除されていた場合は、手元の内容で作り直す。
        const remote = await readFileIfExists(path);
        if (remote) content = mergeMemos(base, content, remote);
        base = remote;
      }
    }
  }

  // 一覧を保存する。競合したら最新一覧とマージし、保存したメモが必ず載るようにする。
  async function saveIndexSnapshot(savedMemos = []) {
    const path = "/index.json",
      attempted = clone(state.index);
    let base = state.bases[path],
      content = attempted;

    for (let attempt = 0; ; attempt += 1) {
      try {
        await writeFile(path, content);
        break;
      } catch (error) {
        if (!isConflictError(error) || attempt >= MERGE_RETRIES) throw error;
        const remote = (await readFileIfExists(path)) || {
          version: 1,
          memos: [],
        };
        content = mergeIndex(base, content, remote);
        savedMemos
          .filter((memo) => !state.deletedMemoIds.has(memo.id))
          .forEach((memo) => upsertSummary(content, summaryForMemo(memo)));
        base = remote;
      }
    }

    // マージした場合は、保存中に画面側で増えた変更も残したまま一覧へ反映する。
    if (content === attempted) return false;
    state.index = mergeIndex(attempted, state.index, content);
    return true;
  }

  // 保存や再読み込みで得た最新版を、表示中のメモと未保存の変更へ取り込む。
  function absorbRemoteMemo(base, remote) {
    if (state.memo?.id === remote.id)
      state.memo = mergeMemos(base, state.memo, remote);
    const pending = state.pendingSave?.memos[remote.id];
    if (pending)
      state.pendingSave.memos[remote.id] = mergeMemos(base, pending, remote);
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
    delete state.bases[path];
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
  // 保存・削除・再読み込みを1本の列で順番に実行し、Dropboxへの読み書きが交差しないようにする。
  function enqueue(task) {
    const run = state.saveTail.then(task);
    state.saveTail = run.catch(() => {});
    return run;
  }

  // メモごとに最新の保存要求だけを保持し、入力途中の古いスナップショットを捨てる。
  function rememberPendingSave({ memo = null, index = false } = {}) {
    if (!memo && !index) return;
    const pending = state.pendingSave || { memos: {}, index: false };

    // メモ本体はIDごとに最後に要求された内容で上書きし、一覧は保存時点の内容を使う。
    if (memo) pending.memos[memo.id] = clone(memo);
    if (index) pending.index = true;
    state.pendingSave = pending;
  }

  // 1件分の保存スナップショットをDropboxへ反映する。
  async function persistPendingSave(pending) {
    const savedMemos = [];
    let merged = false;

    for (const memo of Object.values(pending.memos)) {
      const saved = await saveMemoSnapshot(memo);
      savedMemos.push(saved);

      // 保存できたメモは、失敗時の再保存対象から外す。古い内容でマージ結果を上書きしないため。
      delete pending.memos[memo.id];
      if (state.failedSave) delete state.failedSave.memos[memo.id];

      // 別端末の変更とマージした場合は、画面上のメモにも取り込む。
      if (saved !== memo) {
        absorbRemoteMemo(memo, saved);
        merged = true;
      }

      // 別端末で削除されて作り直した場合も含め、一覧へ最新のサマリーを載せる。
      if (!state.deletedMemoIds.has(saved.id))
        state.index = upsertSummary(
          state.index,
          summaryForMemo(state.memo?.id === saved.id ? state.memo : saved),
        );
    }

    if (pending.index || savedMemos.length) {
      if (await saveIndexSnapshot(savedMemos)) merged = true;
      if (state.failedSave) state.failedSave.index = false;
    }
    if (merged) refreshView();
  }

  // 保存に失敗した内容を覚えておき、再接続や再読み込みのときに保存し直す。
  function keepFailedSave(pending) {
    const failed = state.failedSave || { memos: {}, index: false };
    Object.assign(failed.memos, pending.memos);
    failed.index = failed.index || pending.index;
    state.failedSave = failed;
  }

  // 保存に失敗したままの内容を、保存キューへ戻す。
  function retryFailedSave() {
    const failed = state.failedSave;
    if (!failed || !isConnected()) return;
    state.failedSave = null;
    if (!failed.index && !Object.keys(failed.memos).length) return;

    // 表示中のメモはその後の編集も含めて保存し、新しい保存要求があればそちらを優先する。
    const pending = state.pendingSave || { memos: {}, index: false };
    Object.entries(failed.memos).forEach(([memoId, memo]) => {
      if (pending.memos[memoId] || state.deletedMemoIds.has(memoId)) return;
      pending.memos[memoId] =
        state.memo?.id === memoId ? clone(state.memo) : memo;
    });
    pending.index = pending.index || failed.index;
    state.pendingSave = pending;
    queueSave();
  }

  // 保存中に増えた変更を、常に最新1件へ畳み込みながら順番に保存する。
  async function drainSaveQueue() {
    try {
      while (state.pendingSave) {
        const pending = state.pendingSave;
        state.pendingSave = null;

        try {
          await persistPendingSave(pending);
        } catch (error) {
          // UIはすでに更新済みなので、保存失敗だけを通知して後で保存し直す。
          console.error(error);
          keepFailedSave(pending);
          notify(t(isConflictError(error) ? "conflictError" : "syncError"));
        }
      }
    } finally {
      state.saveRunning = false;
      if (state.pendingSave) queueSave();
    }
  }

  // 保存要求を最新状態へまとめ、まだ保存処理がなければ開始する。
  function queueSave({ memo = null, index = false } = {}) {
    rememberPendingSave({ memo, index });

    // 既存の保存・削除処理の後ろに、まとめた保存処理を1本だけつなぐ。
    if (!state.saveRunning && state.pendingSave) {
      state.saveRunning = true;
      enqueue(drainSaveQueue);
    }
    return state.saveTail;
  }
  // メモJSONの削除と一覧更新を、他の保存処理と直列に実行する。
  function queueMemoDeletion(memoId) {
    // 削除したメモが、未保存の変更や一覧のマージで復活しないようにする。
    state.deletedMemoIds.add(memoId);
    delete state.pendingSave?.memos[memoId];
    delete state.failedSave?.memos[memoId];

    // 先行している保存のあとに、メモ本体の削除と一覧更新を続けて行う。
    return enqueue(async () => {
      try {
        await deleteFile(memoPath(memoId));
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
      state.index.memos = state.index.memos.filter(
        (memo) => memo.id !== memoId,
      );
      if (await saveIndexSnapshot()) refreshView();
    }).catch((error) => {
      // 削除に失敗しても一覧UIは戻さず、同期失敗だけを通知する。
      console.error(error);
      notify(t(isConflictError(error) ? "conflictError" : "syncError"));
    });
  }

  // 開いているメモに、まだDropboxへ保存していない変更があるかを判定する。
  const hasUnsavedChanges = (memoId) =>
    !!(
      state.pendingSave?.memos[memoId] ||
      state.failedSave?.memos[memoId] ||
      (state.templateTimer && state.memo?.id === memoId)
    );

  // 別端末で削除されたメモを一覧から外し、一覧画面へ戻る。
  function forgetDeletedMemo(memoId) {
    state.index.memos = state.index.memos.filter((memo) => memo.id !== memoId);
    delete state.revisions[memoPath(memoId)];
    delete state.bases[memoPath(memoId)];
    if (state.memo?.id === memoId) {
      state.memo = null;
      state.editingEntryId = null;
      clearTemplateSaveTimer();
    }
    closeModal();
    notify(t("memoDeleted"));
    location.replace("#/");
  }

  // 一覧と表示中のメモについてrevだけを確認し、変わっていれば読み込んで手元とマージする。
  async function pullLatest() {
    const route = routeFromHash(),
      memoId =
        route.name !== "list" && state.memo?.id === route.id ? route.id : null,
      [indexRev, memoRev] = await Promise.all([
        remoteRevision("/index.json"),
        memoId ? remoteRevision(memoPath(memoId)) : null,
      ]);
    let changed = false;

    if (indexRev && indexRev !== state.revisions["/index.json"]) {
      const base = state.bases["/index.json"],
        remote = await readFile("/index.json");
      state.index = mergeIndex(base, state.index, remote);
      changed = true;
    }

    // 確認中に別のメモへ移動していない場合だけ、表示中のメモへ反映する。
    if (memoId && state.memo?.id === memoId) {
      const path = memoPath(memoId);
      if (!memoRev && !hasUnsavedChanges(memoId)) {
        forgetDeletedMemo(memoId);
        return "deleted";
      }
      if (memoRev && memoRev !== state.revisions[path]) {
        const base = state.bases[path],
          remote = await readFile(path);
        absorbRemoteMemo(base, remote);
        changed = true;
      }
    }

    if (changed) refreshView();
    return changed;
  }

  // 保存待ちを片付けたあとで最新を確認する。確認中に重ねて呼ばれたら同じ結果を返す。
  function refresh() {
    if (!state.ready || !isConnected()) return Promise.resolve(false);
    if (!state.refreshing)
      state.refreshing = enqueue(pullLatest).finally(() => {
        state.refreshing = null;
      });
    return state.refreshing;
  }

  // 画面に戻ったときや一定間隔で、別端末の変更を静かに取り込む。
  function autoRefresh() {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    refresh().catch((error) => console.warn(error));
  }

  // ヘッダーの再読み込みボタン。保存に失敗した内容も保存し直し、結果を知らせる。
  async function manualRefresh() {
    retryFailedSave();
    setSyncing(1);
    try {
      // 表示中のメモが削除されていた場合は、その通知を残す。
      const changed = await refresh();
      if (changed !== "deleted") notify(t(changed ? "updated" : "upToDate"));
    } catch (error) {
      console.error(error);
      notify(t("loadError"));
    } finally {
      setSyncing(-1);
    }
  }

  // Dropbox未設定時に、データをこのブラウザだけへ保存する体験版を起動する。
  function startLocal() {
    state.local = true;
    state.revisions = {};
    state.bases = {};
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

  // 待機中のテンプレート保存タイマーを止める。
  function clearTemplateSaveTimer() {
    clearTimeout(state.templateTimer);
    state.templateTimer = null;
  }

  // テンプレート入力中は少し待ち、連続入力ごとの保存を避ける。
  function scheduleTemplateSave() {
    clearTemplateSaveTimer();
    state.templateTimer = setTimeout(() => {
      state.templateTimer = null;
      saveMemo();
    }, 900);
  }

  // フォーカスが外れた時点で、待機中のテンプレート保存だけを即実行する。
  function flushTemplateSave() {
    if (!state.templateTimer) return;
    clearTemplateSaveTimer();
    saveMemo();
  }

  // 指定されたメモJSONを読み、編集中のメモとしてstateへセットする。存在しなければfalseを返す。
  // 保存待ちのあとに読み、保存に失敗したままの変更があれば読み込んだ内容とマージする。
  async function loadMemo(memoId) {
    const path = memoPath(memoId),
      { base, remote } = await enqueue(async () => ({
        base: state.bases[path],
        remote: await readFileIfExists(path),
      })),
      failed = state.failedSave?.memos[memoId];
    if (!remote && !failed) return false;
    if (!failed) state.memo = remote;
    else state.memo = remote ? mergeMemos(base, failed, remote) : clone(failed);
    return true;
  }
  // URLハッシュに応じて、一覧・メモ・テンプレート管理を描画する。
  function render() {
    // 一覧画面はメモ本文を読む必要がないため、すぐ描画する。
    const route = routeFromHash();
    if (route.name === "list") return renderList();

    // 目的のメモが未読なら、読み込み中表示を出してから再描画する。
    if (!state.memo || state.memo.id !== route.id) {
      state.view = "loading";
      app.innerHTML = `<section class="shell">${header()}<div class="empty"><div class="spinner"></div></div></section>`;
      loadMemo(route.id)
        .then((found) => (found ? render() : forgetDeletedMemo(route.id)))
        .catch(showError);
      return;
    }

    // 同じメモ内で、通常画面かテンプレート管理画面かを切り替える。
    if (route.name === "templates") return renderTemplates();
    renderMemo();
  }

  // 別端末の変更を取り込んだあと、入力中の内容を壊さない範囲で画面を更新する。
  function refreshView() {
    const route = routeFromHash();
    if (route.name === "list") {
      if (state.view === "list") renderList();
      return;
    }
    if (!state.memo || state.memo.id !== route.id) return;
    if (state.view === "memo") return updateMemoView();

    // テンプレート編集中は入力を消さないよう、編集が落ち着くまで描き直さない。
    const editing = document.activeElement?.closest?.(
      "[data-template-text],[data-template-name]",
    );
    if (state.view === "templates" && !editing && !state.templateTimer)
      renderTemplates();
  }

  // ログイン後のメモ一覧画面を描画する。
  function renderList() {
    const memos = state.index.memos;
    state.view = "list";
    app.innerHTML = `<section class="shell">${header({ topControls: true })}<div class="hero"><h1>${t("yourNotes")}</h1></div>${memos.length ? `<div class="memo-list">${memos.map((memo) => `<button class="memo-card" data-open-memo="${escapeAttr(memo.id)}"><span class="memo-avatar">${icon(memo.icon)}</span><span><strong>${escapeHtml(memo.title || t("untitled"))}</strong><small>${formatDate(memo.updatedAt)}</small></span><span class="chevron">›</span></button>`).join("")}</div>` : `<div class="empty"><h2>${t("noMemos")}</h2><p>${t("noMemosText")}</p></div>`}<div class="bottom-action"><button class="primary" data-action="new-memo">${icon("plus", "button-icon")} ${t("newMemo")}</button></div></section>`;
    renderIcons(app);
  }
  // メモの投稿一覧の中身を組み立てる。
  const chatHtml = (memo) =>
    memo.entries.length
      ? memo.entries
          .map(
            (entry) =>
              `<div class="entry-row"><span class="entry-memo-icon">${icon(memo.icon)}</span><div><button class="bubble" data-entry="${escapeAttr(entry.id)}">${escapeHtml(entry.text || "")}</button><time class="entry-time">${formatDate(entry.createdAt)}</time></div></div>`,
          )
          .join("")
      : `<div class="new-note">${escapeHtml(t("newPost")).replace(/\n/g, "<br>")}</div>`;

  // よく使うテンプレート名を入力欄の近くへ最大4件だけ並べる。
  // 投稿ボタンと同じく、押しても入力欄のフォーカスを外さない。
  const templateStripHtml = (memo) =>
    `<button class="template-chip" data-action="pick-template">${icon("message-square-text", "button-icon")} ${t("templates")}</button>${memo.templates
      .slice(0, 4)
      .map(
        (template) =>
          `<button class="template-chip" data-template="${escapeAttr(template.id)}" data-keep-focus>${escapeHtml(templateLabel(template))}</button>`,
      )
      .join("")}`;

  // メモ本体は投稿を先にUIへ反映し、Dropbox保存はバックグラウンドで行う。
  function renderMemo() {
    // 同じメモ画面を描き直すときは、入力途中の文章を引き継ぐ。
    const memo = state.memo,
      draft =
        state.view === "memo"
          ? document.querySelector("#entry-input")?.value || ""
          : "";
    state.view = "memo";

    // メモの投稿一覧、テンプレート操作、入力欄をまとめて描画する。
    app.innerHTML = `<section class="shell memo-screen">${header({ back: true, title: memo.title || t("newMemoTitle"), right: `<button class="icon-button" data-action="note-menu" aria-label="Note menu">${icon("menu")}</button>` })}<div class="chat">${chatHtml(memo)}</div><div class="composer-wrap"><div class="template-strip">${templateStripHtml(memo)}</div><div class="composer"><textarea id="entry-input" rows="1" placeholder="${t("placeholder")}" aria-label="${t("send")}"></textarea><textarea id="entry-relay" class="entry-relay" rows="1" tabindex="-1" aria-hidden="true"></textarea><button class="send" data-action="submit-entry" data-keep-focus aria-label="${t("send")}">${icon("send")}</button></div></div></section>`;

    // 描画したLucideアイコンをSVGへ変換する。
    renderIcons(app);

    // テキストエリアの高さを内容に合わせ、⌘/Ctrl+Enterで投稿できるようにする。
    const input = document.querySelector("#entry-input");
    if (draft) {
      input.value = draft;
      fitTextarea(input, 150);
    }
    input.addEventListener("input", () => {
      fitTextarea(input, 150);
    });
    input.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        submitEntry();
      }
    });

    // 初期表示では、常に新しい投稿が見える末尾までスクロールする。
    scrollMemoToBottom();
  }

  // 投稿一覧・タイトル・テンプレート候補だけを差し替える。
  // 入力欄は作り直さないので、iPhoneでもキーボードが閉じたり入力途中の文章が消えたりしない。
  function updateMemoView({ scrollToEnd = false } = {}) {
    const chat = app.querySelector(".chat"),
      strip = app.querySelector(".template-strip"),
      title = app.querySelector(".memo-title");
    if (state.view !== "memo" || !chat || !strip) return renderMemo();

    // 末尾付近を見ていたときだけ末尾へ追従し、過去の投稿を読んでいる位置は保つ。
    const scrollTop = chat.scrollTop,
      atEnd =
        scrollToEnd ||
        chat.scrollHeight - chat.scrollTop - chat.clientHeight < 40;
    if (title) title.textContent = state.memo.title || t("newMemoTitle");
    chat.innerHTML = chatHtml(state.memo);
    strip.innerHTML = templateStripHtml(state.memo);
    renderIcons(chat);
    renderIcons(strip);
    if (atEnd) scrollMemoToBottom();
    else chat.scrollTop = scrollTop;
  }

  // テンプレートは名前と本文を同じ画面で直接編集し、自動保存する。
  function renderTemplates() {
    // テンプレートがない場合も、追加ボタンは常に表示する。
    const templates = state.memo.templates;
    state.view = "templates";
    app.innerHTML = `<section class="shell template-admin">${header({ back: true, title: "" })}<h1>${t("templates")}</h1><p>${t("templatesText")}</p><div id="template-list">${templates.length ? templates.map((template, index) => `<article class="template-item"><input class="template-name" data-template-name="${escapeAttr(template.id)}" value="${escapeHtml(template.name || "")}" placeholder="${t("templateName")}" aria-label="${t("templateName")}"><textarea data-template-text="${escapeAttr(template.id)}" aria-label="${t("templates")}"></textarea><div class="template-item-actions"><button class="small-button" data-move="up" data-template-id="${escapeAttr(template.id)}" ${index === 0 ? "disabled" : ""}>${icon("arrow-up-from-line")}</button><button class="small-button" data-move="down" data-template-id="${escapeAttr(template.id)}" ${index === templates.length - 1 ? "disabled" : ""}>${icon("arrow-down-from-line")}</button><button class="small-button danger" data-action="delete-template" data-template-id="${escapeAttr(template.id)}">${icon("square-x", "button-icon")} ${t("delete")}</button></div></article>`).join("") : `<div class="empty"><h2>${t("noTemplates")}</h2></div>`}</div><button class="outline template-add-button" data-action="new-template">${icon("plus", "button-icon")} ${t("addTemplate")}</button></section>`;

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
    // 確認ダイアログを重ねて開く場合も、古いモーダルを残さない。
    closeModal();

    const modal = document.createElement("div");
    modal.className = className;
    modal.id = "modal";
    modal.innerHTML = content;

    // メニュー外の薄暗い部分をタップしたら閉じる。シート内から指をずらして離した場合は閉じない。
    // iOSは要素に直接clickリスナーがないと、divのタップでclickを発生させないため個別に登録する。
    let pressedBackdrop = false;
    modal.addEventListener("pointerdown", (event) => {
      pressedBackdrop = event.target === modal;
    });
    modal.addEventListener("click", (event) => {
      if (event.target === modal && pressedBackdrop) closeModal();
    });

    document.body.append(modal);
    renderIcons(modal);
  }

  // 開いているモーダルがあれば閉じる。
  const closeModal = () => {
    document.querySelectorAll("#modal").forEach((modal) => modal.remove());
  };

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
    clearTemplateSaveTimer();
    queueMemoDeletion(memoId);
    closeModal();
    location.hash = "#/";
    notify(t("deleted"));
  }
  // 入力欄の内容を投稿する。編集中なら既存投稿を更新し、それ以外は末尾に追加する。
  function submitEntry() {
    const input = document.querySelector("#entry-input");

    // 変換中の文字も確定させてから本文を読み、入力欄を空にする。
    editEntryInput(input, () => {
      // 空白だけの投稿は作らない。
      const text = input.value;
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

      // 入力欄は作り直さずに空にして、投稿一覧だけを更新する。保存はキュー経由で裏で進める。
      input.value = "";
      fitTextarea(input, 150);
      saveMemo();
      updateMemoView({ scrollToEnd: true });
    });
    focusEntryInput(input);
  }

  // 予期しないエラーを画面と開発者コンソールへ表示する。
  function showError(error) {
    console.error(error);
    state.view = "error";
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
    state.ready = true;
    render();
  }

  // 未ログイン時のウェルカム画面を描画する。
  function renderWelcome() {
    state.view = "welcome";
    app.innerHTML = `<section class="shell">${header({ topControls: true })}<div class="welcome empty"><div class="welcome-app-icon" aria-hidden="true"></div><h2>${t("welcome")}</h2><p>${t("welcomeText")}</p><button class="primary" data-action="connect">${t("connect")}</button></div></section>`;
    renderIcons(app);
  }

  // このブラウザの認証情報を消し、ウェルカム画面へ戻る。
  function logout() {
    localStorage.removeItem(STORAGE.auth);
    state.memo = null;
    state.index = { version: 1, memos: [] };
    state.ready = false;
    state.revisions = {};
    state.bases = {};
    state.failedSave = null;
    clearTemplateSaveTimer();
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
      flushTemplateSave();
    }
  });
  // 画面を再描画しても個別リスナーを付け直さずに済むよう、操作はイベント委譲で扱う。
  document.addEventListener("click", async (event) => {
    // テンプレート管理のボタン列の余白は、同じカードの本文入力へフォーカスする。
    const templateActions = event.target.closest(".template-item-actions");
    if (templateActions && !event.target.closest("button")) {
      const textField = templateActions
        .closest(".template-item")
        ?.querySelector("[data-template-text]");
      textField?.focus();
      return;
    }

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
      if (action === "refresh") return manualRefresh();
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
        updateMemoView();
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
        updateMemoView();
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
          editEntryInput(input, () => insertAtCursor(input, template.text));
          focusEntryInput(input);
        }
        closeModal();
        return;
      }

      // 投稿をタップした場合は、投稿用の操作メニューを開く。
      if (target.dataset.entry) {
        const entry = state.memo.entries.find(
          (item) => item.id === target.dataset.entry,
        );
        return entry && menuForEntry(entry);
      }
      if (target.dataset.entryAction) {
        const entry = state.memo.entries.find(
            (item) => item.id === target.dataset.entryId,
          ),
          choice = target.dataset.entryAction;

        // メニュー表示中に別端末で削除された投稿は、操作せずにメニューを閉じる。
        if (!entry) return closeModal();

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
        updateMemoView();
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
        if (from < 0 || !state.memo.templates[to]) return renderTemplates();
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

  // ブラウザの戻る・進むによるURL変更を、画面表示へ反映し、移動先の最新も確認する。
  window.addEventListener("hashchange", () => {
    render();
    autoRefresh();
  });

  // 別端末からの更新を取り込むため、画面に戻ったときと表示中は一定間隔で最新を確認する。
  // 保存に失敗した内容も、画面に戻ったときや再接続したときに保存し直す。
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    retryFailedSave();
    autoRefresh();
  });
  window.addEventListener("focus", autoRefresh);
  window.addEventListener("online", () => {
    retryFailedSave();
    autoRefresh();
  });
  setInterval(autoRefresh, REFRESH_INTERVAL);

  // Escキーで開いているメニューやダイアログを閉じる。日本語入力の変換中は閉じない。
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.isComposing) return;
    if (!document.querySelector("#modal")) return;
    event.preventDefault();
    closeModal();
  });

  // 入力中に投稿ボタンやテンプレートを押しても、入力欄のフォーカスを外さない。
  // iPhoneはキーボードが一度閉じて開き直すと入力欄がキーボードの裏に隠れるため、
  // 入力中のタップは既定動作（フォーカス移動）を止めて、自前でクリックとして扱う。
  const entryInputFocused = () => document.activeElement?.id === "entry-input";
  let keepFocusTap = null;
  document.addEventListener("mousedown", (event) => {
    if (entryInputFocused() && event.target.closest("[data-keep-focus]"))
      event.preventDefault();
  });
  document.addEventListener(
    "touchstart",
    (event) => {
      const button = event.target.closest("[data-keep-focus]"),
        touch = event.touches[0];
      keepFocusTap =
        button && event.touches.length === 1 && entryInputFocused()
          ? { button, x: touch.clientX, y: touch.clientY }
          : null;
    },
    { passive: true },
  );
  document.addEventListener(
    "touchmove",
    (event) => {
      // テンプレート列の横スクロールなど、指が動いた場合はタップとみなさない。
      const touch = event.touches[0];
      if (
        keepFocusTap &&
        touch &&
        Math.hypot(
          touch.clientX - keepFocusTap.x,
          touch.clientY - keepFocusTap.y,
        ) > 10
      )
        keepFocusTap = null;
    },
    { passive: true },
  );
  document.addEventListener(
    "touchend",
    (event) => {
      const tap = keepFocusTap;
      keepFocusTap = null;
      if (!tap || !tap.button.isConnected) return;
      event.preventDefault();
      tap.button.click();
    },
    { passive: false },
  );
  document.addEventListener("touchcancel", () => {
    keepFocusTap = null;
  });

  // 背景のボケ玉は、起動ごとに数・大きさ・位置・濃さをランダムに変える。
  function paintBokeh() {
    const random = (min, max) => min + Math.random() * (max - min),
      tones = ["30 94 73", "23 71 55", "38 112 86", "26 84 66", "47 124 96"],
      balls = Array.from({ length: Math.floor(random(3, 8)) }, () => {
        const tone = tones[Math.floor(Math.random() * tones.length)],
          radius = Math.round(random(120, 560)),
          x = random(-10, 110).toFixed(1),
          y = random(-10, 110).toFixed(1),
          alpha = random(0.45, 1).toFixed(2);
        return `radial-gradient(circle ${radius}px at ${x}% ${y}%, rgb(${tone} / ${alpha}) 0%, transparent 68%)`;
      });
    document.body.style.backgroundImage = [
      ...balls,
      "linear-gradient(145deg, var(--bg), var(--bg-deep))",
    ].join(",");
  }
  paintBokeh();

  // オフラインキャッシュは持たないが、PWAとしてインストールできるようService Workerを登録する。
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("sw.js").catch(() => {});

  // 最後に認証状態を確認して、最初の画面を描画する。
  boot().catch(showError);
})();

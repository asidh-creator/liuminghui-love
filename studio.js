(() => {
  const config = window.LMH_AUTH_CONFIG;
  const sessionStorageKey = "lmh-studio-session";
  const claimStorageKey = "lmh-cms-claim-token";
  const redirectUrl = `${location.origin}${location.pathname}`;
  const kindNames = {
    story: "爱情故事",
    photo: "照片回忆",
    timeline: "恋爱时间线",
    video: "视频回忆",
    letter: "更多情书",
    promise: "未来约定",
  };

  const authPanel = document.getElementById("authPanel");
  const editorArea = document.getElementById("editorArea");
  const authForm = document.getElementById("authForm");
  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  const authSubmit = document.getElementById("authSubmit");
  const authMessage = document.getElementById("authMessage");
  const authIntro = document.getElementById("authIntro");
  const loginTab = document.getElementById("loginTab");
  const signupTab = document.getElementById("signupTab");
  const claimHelp = document.getElementById("claimHelp");
  const claimTokenInput = document.getElementById("claimTokenInput");
  const saveClaimButton = document.getElementById("saveClaimButton");
  const logoutButton = document.getElementById("logoutButton");
  const contentForm = document.getElementById("contentForm");
  const editorTitle = document.getElementById("editorTitle");
  const cancelEditButton = document.getElementById("cancelEditButton");
  const contentList = document.getElementById("contentList");
  const editorMessage = document.getElementById("editorMessage");
  const saveContentButton = document.getElementById("saveContentButton");
  const refreshButton = document.getElementById("refreshButton");

  let authMode = "login";
  let session = null;
  let contentKey = null;
  let contentItems = [];

  function setMessage(element, text, type = "") {
    element.textContent = text;
    element.dataset.type = type;
  }

  function saveSession(nextSession) {
    session = nextSession;
    if (session) localStorage.setItem(sessionStorageKey, JSON.stringify(session));
    else localStorage.removeItem(sessionStorageKey);
  }

  function captureUrlSecrets() {
    const params = new URLSearchParams(location.hash.slice(1));
    const claim = params.get("claim");
    if (claim) localStorage.setItem(claimStorageKey, claim);

    const accessToken = params.get("access_token");
    if (accessToken) {
      saveSession({
        access_token: accessToken,
        refresh_token: params.get("refresh_token") || "",
        expires_at: Date.now() + Number(params.get("expires_in") || 3600) * 1000,
      });
    }
    if (location.hash) history.replaceState(null, "", location.pathname);
  }

  async function request(path, { method = "GET", body, token, headers = {} } = {}) {
    const response = await fetch(`${config.supabaseUrl}${path}`, {
      method,
      headers: {
        apikey: config.publishableKey,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body && !(body instanceof Blob) && !(body instanceof File) ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body && !(body instanceof Blob) && !(body instanceof File) ? JSON.stringify(body) : body,
    });
    const raw = await response.text();
    const data = raw ? (() => { try { return JSON.parse(raw); } catch { return raw; } })() : null;
    if (!response.ok) {
      const detail = data?.msg || data?.message || data?.error_description || data?.error || "请求失败";
      throw new Error(detail);
    }
    return data;
  }

  async function refreshSessionIfNeeded() {
    if (!session?.refresh_token || Date.now() < Number(session.expires_at || 0) - 60000) return;
    const data = await request("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: { refresh_token: session.refresh_token },
    });
    saveSession({ ...data, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 });
  }

  async function ensureUser() {
    if (!session?.access_token) return null;
    try {
      await refreshSessionIfNeeded();
      const user = await request("/auth/v1/user", { token: session.access_token });
      session.user = user;
      saveSession(session);
      return user;
    } catch {
      saveSession(null);
      return null;
    }
  }

  async function rpc(name, body = {}) {
    return request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      token: session?.access_token,
      body,
    });
  }

  function switchAuthMode(mode) {
    authMode = mode;
    const signingUp = mode === "signup";
    loginTab.classList.toggle("active", !signingUp);
    signupTab.classList.toggle("active", signingUp);
    authSubmit.textContent = signingUp ? "注册管理员账户" : "登录工作室";
    authPassword.autocomplete = signingUp ? "new-password" : "current-password";
    authIntro.textContent = signingUp
      ? "请使用你能接收邮件的邮箱注册。若收到确认邮件，请在同一台手机上打开。"
      : "输入管理员邮箱和密码，进入内容工作室。";
    setMessage(authMessage, "");
  }

  loginTab.addEventListener("click", () => switchAuthMode("login"));
  signupTab.addEventListener("click", () => switchAuthMode("signup"));

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authSubmit.disabled = true;
    setMessage(authMessage, authMode === "signup" ? "正在注册……" : "正在登录……");
    try {
      const email = authEmail.value.trim();
      const password = authPassword.value;
      const data = authMode === "signup"
        ? await request(`/auth/v1/signup?redirect_to=${encodeURIComponent(redirectUrl)}`, {
            method: "POST",
            body: { email, password },
          })
        : await request("/auth/v1/token?grant_type=password", {
            method: "POST",
            body: { email, password },
          });

      if (!data.access_token) {
        setMessage(authMessage, "注册成功。请打开确认邮件，然后返回此页面登录。", "success");
        switchAuthMode("login");
        return;
      }
      saveSession({ ...data, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 });
      authPassword.value = "";
      await enterStudio();
    } catch (error) {
      setMessage(authMessage, error.message || "登录失败，请检查邮箱和密码。", "error");
    } finally {
      authSubmit.disabled = false;
    }
  });

  saveClaimButton.addEventListener("click", async () => {
    const token = claimTokenInput.value.trim();
    if (!token) return setMessage(authMessage, "请先粘贴管理员凭证。", "error");
    localStorage.setItem(claimStorageKey, token);
    claimTokenInput.value = "";
    if (session?.access_token) await enterStudio();
    else setMessage(authMessage, "凭证已保存，请先登录或注册。", "success");
  });

  logoutButton.addEventListener("click", async () => {
    try {
      if (session?.access_token) await request("/auth/v1/logout", { method: "POST", token: session.access_token });
    } catch { /* local logout still continues */ }
    saveSession(null);
    contentKey = null;
    editorArea.hidden = true;
    authPanel.hidden = false;
    logoutButton.hidden = true;
    setMessage(authMessage, "已退出登录。", "success");
  });

  function fromHex(value) {
    return Uint8Array.from(value.match(/.{1,2}/g), (byte) => parseInt(byte, 16));
  }

  function toBase64(bytes) {
    let value = "";
    bytes.forEach((byte) => { value += String.fromCharCode(byte); });
    return btoa(value);
  }

  function fromBase64(value) {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }

  async function getCryptoKey() {
    return crypto.subtle.importKey("raw", fromHex(contentKey), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  }

  async function encryptPayload(payload) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      await getCryptoKey(),
      new TextEncoder().encode(JSON.stringify(payload))
    );
    return { version: 1, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) };
  }

  async function decryptPayload(encrypted) {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(encrypted.iv) },
      await getCryptoKey(),
      fromBase64(encrypted.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function enterStudio() {
    const user = await ensureUser();
    if (!user) return;

    const claimToken = localStorage.getItem(claimStorageKey);
    if (claimToken) {
      const claimed = await rpc("lmh_claim_cms_admin", { p_claim_token: claimToken }).catch(() => false);
      if (claimed) localStorage.removeItem(claimStorageKey);
    }

    const isAdmin = await rpc("lmh_is_cms_admin").catch(() => false);
    if (!isAdmin) {
      authPanel.hidden = false;
      editorArea.hidden = true;
      logoutButton.hidden = false;
      claimHelp.hidden = false;
      authIntro.textContent = `已登录 ${user.email || "该账户"}，但尚未取得管理员权限。`;
      return setMessage(authMessage, "请使用专用管理员注册链接，或在下方粘贴一次性管理员凭证。", "error");
    }

    contentKey = await rpc("lmh_cms_content_key");
    if (!contentKey) throw new Error("无法取得内容加密密钥");
    authPanel.hidden = true;
    editorArea.hidden = false;
    logoutButton.hidden = false;
    await loadContent();
  }

  function encodeStoragePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  async function uploadMedia(file) {
    if (file.size > 20 * 1024 * 1024) throw new Error("文件超过 20MB，请压缩后再上传或使用视频链接。");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"];
    if (!allowed.includes(file.type)) throw new Error("不支持这种文件格式。");
    const extension = (file.name.split(".").pop() || "bin").replace(/[^a-z0-9]/gi, "").toLowerCase();
    const userId = session.user.id;
    const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    await request(`/storage/v1/object/lmh-media/${encodeStoragePath(path)}`, {
      method: "POST",
      token: session.access_token,
      body: file,
      headers: { "Content-Type": file.type, "x-upsert": "false" },
    });
    return {
      path,
      url: `${config.supabaseUrl}/storage/v1/object/public/lmh-media/${encodeStoragePath(path)}`,
      kind: file.type.startsWith("image/") ? "image" : "video",
    };
  }

  async function deleteMedia(path) {
    if (!path) return;
    await request(`/storage/v1/object/lmh-media/${encodeStoragePath(path)}`, {
      method: "DELETE",
      token: session.access_token,
    }).catch(() => null);
  }

  async function rest(path, options = {}) {
    return request(`/rest/v1/${path}`, {
      ...options,
      token: session.access_token,
      headers: { ...(options.headers || {}) },
    });
  }

  async function loadContent() {
    contentList.innerHTML = '<p class="empty-state">正在读取内容……</p>';
    try {
      const rows = await rest("lmh_content?select=id,kind,encrypted_payload,sort_order,published,created_at&order=sort_order.asc,created_at.desc");
      contentItems = await Promise.all(rows.map(async (row) => ({ ...row, payload: await decryptPayload(row.encrypted_payload) })));
      renderContentList();
    } catch (error) {
      contentList.innerHTML = "";
      const p = document.createElement("p");
      p.className = "empty-state";
      p.textContent = `读取失败：${error.message}`;
      contentList.appendChild(p);
    }
  }

  function renderContentList() {
    contentList.innerHTML = "";
    if (!contentItems.length) {
      const empty = document.createElement("p");
      empty.className = "empty-state";
      empty.textContent = "还没有自定义内容，从左侧添加第一条回忆吧。";
      return contentList.appendChild(empty);
    }

    contentItems.forEach((item) => {
      const article = document.createElement("article");
      article.className = "content-item";
      const preview = item.payload.media_kind === "image" && item.payload.media_url
        ? Object.assign(document.createElement("img"), { className: "content-thumb", src: item.payload.media_url, alt: "" })
        : Object.assign(document.createElement("div"), { className: "content-thumb placeholder", textContent: item.kind === "video" ? "▶" : "♥" });
      article.appendChild(preview);

      const meta = document.createElement("div");
      meta.className = "content-meta";
      const title = document.createElement("h3");
      title.textContent = item.payload.title || "未命名内容";
      const body = document.createElement("p");
      body.textContent = (item.payload.body || "暂无文字").slice(0, 100);
      const badges = document.createElement("div");
      badges.className = "content-badges";
      [kindNames[item.kind], item.published ? "已发布" : "草稿", `顺序 ${item.sort_order}`].forEach((text) => {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = text;
        badges.appendChild(badge);
      });
      const actions = document.createElement("div");
      actions.className = "item-actions";
      actions.innerHTML = `<button type="button" data-action="edit" data-id="${item.id}">编辑</button><button type="button" data-action="toggle" data-id="${item.id}">${item.published ? "转为草稿" : "发布"}</button><button class="danger" type="button" data-action="delete" data-id="${item.id}">删除</button>`;
      meta.append(title, body, badges, actions);
      article.appendChild(meta);
      contentList.appendChild(article);
    });
  }

  function resetEditor() {
    contentForm.reset();
    document.getElementById("contentId").value = "";
    document.getElementById("sortOrder").value = "0";
    document.getElementById("published").checked = true;
    editorTitle.textContent = "新增内容";
    cancelEditButton.hidden = true;
    setMessage(editorMessage, "");
  }

  function editItem(item) {
    document.getElementById("contentId").value = item.id;
    document.getElementById("contentKind").value = item.kind;
    document.getElementById("contentTitle").value = item.payload.title || "";
    document.getElementById("contentDate").value = item.payload.date || "";
    document.getElementById("contentBody").value = item.payload.body || "";
    document.getElementById("mediaUrl").value = item.payload.media_url || "";
    document.getElementById("sortOrder").value = item.sort_order;
    document.getElementById("published").checked = item.published;
    editorTitle.textContent = "修改内容";
    cancelEditButton.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  cancelEditButton.addEventListener("click", resetEditor);
  refreshButton.addEventListener("click", loadContent);

  contentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveContentButton.disabled = true;
    setMessage(editorMessage, "正在保存……");
    const id = document.getElementById("contentId").value;
    const oldItem = contentItems.find((item) => item.id === id);
    let uploaded = null;
    try {
      const file = document.getElementById("mediaFile").files[0];
      if (file) uploaded = await uploadMedia(file);
      const mediaUrl = uploaded?.url || document.getElementById("mediaUrl").value.trim();
      const selectedKind = document.getElementById("contentKind").value;
      const mediaKind = uploaded?.kind || oldItem?.payload.media_kind || (
        selectedKind === "video" ? "video" : mediaUrl ? "image" : ""
      );
      const payload = {
        title: document.getElementById("contentTitle").value.trim(),
        body: document.getElementById("contentBody").value.trim(),
        date: document.getElementById("contentDate").value,
        media_url: mediaUrl,
        media_kind: mediaKind,
        storage_path: uploaded?.path || (mediaUrl === oldItem?.payload.media_url ? oldItem?.payload.storage_path || "" : ""),
      };
      const record = {
        kind: selectedKind,
        encrypted_payload: await encryptPayload(payload),
        sort_order: Number(document.getElementById("sortOrder").value) || 0,
        published: document.getElementById("published").checked,
        updated_at: new Date().toISOString(),
      };

      if (id) {
        await rest(`lmh_content?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: record,
          headers: { Prefer: "return=minimal" },
        });
        if (uploaded && oldItem?.payload.storage_path) await deleteMedia(oldItem.payload.storage_path);
      } else {
        await rest("lmh_content", {
          method: "POST",
          body: record,
          headers: { Prefer: "return=minimal" },
        });
      }
      resetEditor();
      setMessage(editorMessage, "内容已保存，访客刷新网页后即可看到。", "success");
      await loadContent();
    } catch (error) {
      if (uploaded?.path) await deleteMedia(uploaded.path);
      setMessage(editorMessage, error.message || "保存失败，请稍后重试。", "error");
    } finally {
      saveContentButton.disabled = false;
    }
  });

  contentList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = contentItems.find((entry) => entry.id === button.dataset.id);
    if (!item) return;
    if (button.dataset.action === "edit") return editItem(item);

    button.disabled = true;
    try {
      if (button.dataset.action === "toggle") {
        await rest(`lmh_content?id=eq.${encodeURIComponent(item.id)}`, {
          method: "PATCH",
          body: { published: !item.published, updated_at: new Date().toISOString() },
          headers: { Prefer: "return=minimal" },
        });
      }
      if (button.dataset.action === "delete") {
        if (!confirm(`确定删除“${item.payload.title || "这条内容"}”吗？`)) return;
        await rest(`lmh_content?id=eq.${encodeURIComponent(item.id)}`, { method: "DELETE" });
        await deleteMedia(item.payload.storage_path);
      }
      await loadContent();
    } catch (error) {
      setMessage(editorMessage, error.message || "操作失败。", "error");
    } finally {
      button.disabled = false;
    }
  });

  async function init() {
    captureUrlSecrets();
    try {
      const stored = localStorage.getItem(sessionStorageKey);
      if (!session && stored) session = JSON.parse(stored);
    } catch { saveSession(null); }
    claimHelp.hidden = !localStorage.getItem(claimStorageKey);
    if (session?.access_token) {
      try { await enterStudio(); }
      catch (error) { setMessage(authMessage, error.message || "无法进入工作室。", "error"); }
    }
  }

  init();
})();

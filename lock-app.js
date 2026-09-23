(() => {
  const config = window.LMH_AUTH_CONFIG;
  const form = document.getElementById("unlockForm");
  const input = document.getElementById("accessPassword");
  const button = document.getElementById("unlockButton");
  const message = document.getElementById("formMessage");
  const toggle = document.getElementById("togglePassword");

  function setMessage(text, type = "") {
    message.textContent = text;
    message.dataset.type = type;
  }

  async function rpc(name, payload) {
    const response = await fetch(`https://iznnuwegitvweswyxrsm.supabase.co/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("验证服务暂时不可用");
    return response.json();
  }

  function fromBase64(value) {
    const binary = atob(value);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  function fromHex(value) {
    return Uint8Array.from(value.match(/.{1,2}/g), (byte) => parseInt(byte, 16));
  }

  async function openLetter(contentKey) {
    const payloadResponse = await fetch("site_payload.json", { cache: "no-store" });
    if (!payloadResponse.ok) throw new Error("情书内容暂时无法读取");
    const payload = await payloadResponse.json();
    const key = await crypto.subtle.importKey(
      "raw",
      fromHex(contentKey),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv) },
      key,
      fromBase64(payload.ciphertext)
    );
    const html = new TextDecoder().decode(plain);
    sessionStorage.setItem("lmh-content-key", contentKey);
    document.open();
    document.write(html);
    document.close();
  }

  toggle.addEventListener("click", () => {
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    toggle.textContent = show ? "隐藏" : "显示";
    toggle.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    button.disabled = true;
    setMessage("正在验证……");
    try {
      const key = await rpc("lmh_password_verify", { p_password: input.value });
      input.value = "";
      if (!key) {
        setMessage("密码不正确，请重新输入。", "error");
        return;
      }
      setMessage("验证成功，正在打开……", "success");
      await openLetter(key);
    } catch (error) {
      sessionStorage.removeItem("lmh-content-key");
      setMessage(error.message || "暂时无法验证，请稍后重试。", "error");
    } finally {
      button.disabled = false;
    }
  });

  const cachedKey = sessionStorage.getItem("lmh-content-key");
  if (cachedKey) {
    openLetter(cachedKey).catch(() => sessionStorage.removeItem("lmh-content-key"));
  }
})();

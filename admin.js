(() => {
  const config = window.LMH_AUTH_CONFIG;
  const intro = document.getElementById("adminIntro");
  const setupForm = document.getElementById("setupForm");
  const changeAccessForm = document.getElementById("changeAccessForm");
  const changeAdminForm = document.getElementById("changeAdminForm");
  const adminPanel = document.getElementById("adminPasswordPanel");
  const message = document.getElementById("adminMessage");
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const setupToken = hashParams.get("setup") || "";
  history.replaceState(null, "", location.pathname);

  function setMessage(text, type = "") {
    message.textContent = text;
    message.dataset.type = type;
  }

  async function rpc(name, payload = {}) {
    const response = await fetch(`https://iznnuwegitvweswyxrsm.supabase.co/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error("密码服务暂时不可用");
    return response.json();
  }

  async function loadState() {
    try {
      const initialized = await rpc("lmh_password_status");
      if (initialized) {
        intro.textContent = "输入管理密码即可修改网页访问密码。";
        changeAccessForm.hidden = false;
        adminPanel.hidden = false;
      } else if (setupToken) {
        intro.textContent = "请完成首次设置：分别设置访问密码和管理密码。";
        setupForm.hidden = false;
      } else {
        intro.textContent = "首次设置链接无效，请使用创建时生成的专用链接。";
        setMessage("缺少一次性设置凭证。", "error");
      }
    } catch (error) {
      intro.textContent = "无法连接密码服务。";
      setMessage(error.message, "error");
    }
  }

  setupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const access = document.getElementById("initialAccess").value;
    const accessAgain = document.getElementById("initialAccessConfirm").value;
    const admin = document.getElementById("initialAdmin").value;
    const adminAgain = document.getElementById("initialAdminConfirm").value;
    if (access !== accessAgain) return setMessage("两次访问密码不一致。", "error");
    if (admin !== adminAgain) return setMessage("两次管理密码不一致。", "error");
    if (access === admin) return setMessage("访问密码和管理密码不能相同。", "error");
    setMessage("正在保存首次设置……");
    const ok = await rpc("lmh_password_initialize", {
      p_setup_token: setupToken,
      p_access_password: access,
      p_admin_password: admin,
    }).catch(() => false);
    if (!ok) return setMessage("首次设置失败或链接已失效。", "error");
    setupForm.reset();
    setupForm.hidden = true;
    changeAccessForm.hidden = false;
    adminPanel.hidden = false;
    intro.textContent = "首次设置已完成。以后可在这里修改访问密码。";
    setMessage("密码设置成功。", "success");
  });

  changeAccessForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const admin = document.getElementById("adminPassword").value;
    const next = document.getElementById("newAccess").value;
    const again = document.getElementById("newAccessConfirm").value;
    if (next !== again) return setMessage("两次新访问密码不一致。", "error");
    setMessage("正在修改访问密码……");
    const ok = await rpc("lmh_password_change", {
      p_admin_password: admin,
      p_new_password: next,
    }).catch(() => false);
    if (!ok) return setMessage("管理密码不正确，修改失败。", "error");
    changeAccessForm.reset();
    setMessage("访问密码修改成功，所有访客立即使用新密码。", "success");
  });

  changeAdminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const current = document.getElementById("oldAdmin").value;
    const next = document.getElementById("newAdmin").value;
    const again = document.getElementById("newAdminConfirm").value;
    if (next !== again) return setMessage("两次新管理密码不一致。", "error");
    setMessage("正在修改管理密码……");
    const ok = await rpc("lmh_admin_password_change", {
      p_current_admin_password: current,
      p_new_admin_password: next,
    }).catch(() => false);
    if (!ok) return setMessage("当前管理密码不正确，修改失败。", "error");
    changeAdminForm.reset();
    adminPanel.open = false;
    setMessage("管理密码修改成功。", "success");
  });

  loadState();
})();

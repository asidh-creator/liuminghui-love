(() => {
  const config = window.LMH_AUTH_CONFIG;
  const host = document.getElementById("customContent");
  const keyHex = sessionStorage.getItem("lmh-content-key");
  if (!host || !keyHex) return;

  const kindLabels = {
    story: "我们的故事",
    photo: "照片回忆",
    timeline: "恋爱时间线",
    video: "视频回忆",
    letter: "写给你的更多情书",
    promise: "未来约定",
  };

  function fromHex(value) {
    return Uint8Array.from(value.match(/.{1,2}/g), (byte) => parseInt(byte, 16));
  }
  function fromBase64(value) {
    return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  }
  function safeUrl(value) {
    try {
      const parsed = new URL(value, location.href);
      return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
    } catch { return ""; }
  }
  function videoEmbedUrl(url) {
    try {
      const parsed = new URL(url);
      const bilibiliId = parsed.searchParams.get("bvid") || parsed.pathname.match(/\/(BV[\w]+)/i)?.[1];
      if (bilibiliId) return `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bilibiliId)}&page=1`;
      if (parsed.hostname.includes("youtube.com")) {
        const id = parsed.searchParams.get("v");
        if (id) return `https://www.youtube.com/embed/${encodeURIComponent(id)}`;
      }
      if (parsed.hostname === "youtu.be") return `https://www.youtube.com/embed/${encodeURIComponent(parsed.pathname.slice(1))}`;
    } catch { /* link fallback below */ }
    return "";
  }

  async function decryptPayload(encrypted, cryptoKey) {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(encrypted.iv) },
      cryptoKey,
      fromBase64(encrypted.ciphertext)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  function appendMedia(card, item) {
    const url = safeUrl(item.media_url);
    if (!url) return;
    if (item.media_kind === "image") {
      const image = document.createElement("img");
      image.className = "memory-media";
      image.src = url;
      image.alt = item.title || "爱情回忆照片";
      image.loading = "lazy";
      card.appendChild(image);
      return;
    }
    if (item.media_kind === "video") {
      if (/\.(mp4|webm)(?:$|\?)/i.test(url) || url.includes("/storage/v1/object/public/")) {
        const video = document.createElement("video");
        video.className = "memory-media";
        video.src = url;
        video.controls = true;
        video.preload = "metadata";
        video.playsInline = true;
        card.appendChild(video);
        return;
      }
      const embed = videoEmbedUrl(url);
      if (embed) {
        const frame = document.createElement("iframe");
        frame.className = "memory-media memory-frame";
        frame.src = embed;
        frame.title = item.title || "视频回忆";
        frame.loading = "lazy";
        frame.allowFullscreen = true;
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        card.appendChild(frame);
        return;
      }
      const link = document.createElement("a");
      link.className = "memory-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "打开这段视频回忆 →";
      card.appendChild(link);
    }
  }

  function renderGroup(kind, items) {
    const group = document.createElement("section");
    group.className = "memory-group reveal is-visible";
    const heading = document.createElement("div");
    heading.className = "memory-group-heading";
    const label = document.createElement("p");
    label.className = "section-label";
    label.textContent = kindLabels[kind] || "我们的回忆";
    const title = document.createElement("h3");
    title.textContent = kindLabels[kind] || "我们的回忆";
    heading.append(label, title);
    group.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = `memory-grid memory-grid-${kind}`;
    items.forEach(({ payload }) => {
      const card = document.createElement("article");
      card.className = "memory-card";
      appendMedia(card, payload);
      const copy = document.createElement("div");
      copy.className = "memory-copy";
      if (payload.date) {
        const date = document.createElement("time");
        date.dateTime = payload.date;
        date.textContent = payload.date.replaceAll("-", ".");
        copy.appendChild(date);
      }
      const cardTitle = document.createElement("h4");
      cardTitle.textContent = payload.title || "一段珍贵的回忆";
      copy.appendChild(cardTitle);
      if (payload.body) {
        const body = document.createElement("p");
        body.textContent = payload.body;
        copy.appendChild(body);
      }
      card.appendChild(copy);
      grid.appendChild(card);
    });
    group.appendChild(grid);
    return group;
  }

  async function load() {
    try {
      const response = await fetch(`${config.supabaseUrl}/rest/v1/lmh_content?select=kind,encrypted_payload,sort_order&published=eq.true&order=sort_order.asc,created_at.asc`, {
        headers: { apikey: config.publishableKey },
        cache: "no-store",
      });
      if (!response.ok) throw new Error("内容读取失败");
      const rows = await response.json();
      if (!rows.length) return;
      const cryptoKey = await crypto.subtle.importKey("raw", fromHex(keyHex), { name: "AES-GCM" }, false, ["decrypt"]);
      const decrypted = await Promise.all(rows.map(async (row) => ({ kind: row.kind, payload: await decryptPayload(row.encrypted_payload, cryptoKey) })));
      const groups = new Map();
      decrypted.forEach((item) => {
        if (!groups.has(item.kind)) groups.set(item.kind, []);
        groups.get(item.kind).push(item);
      });
      host.innerHTML = "";
      groups.forEach((items, kind) => host.appendChild(renderGroup(kind, items)));
      host.hidden = false;
    } catch {
      host.hidden = true;
    }
  }

  load();
})();

const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (ts) =>
  ts
    ? new Date(ts).toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";
const EMOJIS = [
  "🐍",
  "🦊",
  "🐱",
  "🐼",
  "🦁",
  "🐧",
  "🐙",
  "🦄",
  "🚀",
  "🎮",
  "⚡",
  "🔥",
];
const qs = new URLSearchParams(location.search);
const LS = "pytasks.local";
const lsGet = () => {
  try {
    return JSON.parse(localStorage.getItem(LS) || "{}");
  } catch {
    return {};
  }
};
const lsSet = (v) => {
  try {
    localStorage.setItem(LS, JSON.stringify(v));
  } catch {}
};

let DATA,
  TASKS = [],
  me = null,
  subs = {};

async function api(method, url, body) {
  const r = await fetch("/api" + url, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || "Ошибка");
  return j;
}
const setApp = (h) => {
  $("#app").innerHTML = h;
};
const doneCount = () => TASKS.filter((t) => subs[t.id]).length;

async function boot() {
  DATA = await (await fetch("tasks.json")).json();
  TASKS = DATA.sections.flatMap((s) =>
    s.tasks.map((t) => ({ ...t, sid: s.id })),
  );
  try {
    const r = await api("GET", "/me");
    me = r.user;
    subs = r.solutions || {};
  } catch {}
  if (!me) subs = lsGet();
  chrome();
  ({ home, topic, people, profile, login })[document.body.dataset.page]();
}

function chrome() {
  const pg = document.body.dataset.page,
    n = TASKS.length,
    d = doneCount();
  const L = [
    ["index.html", "Главная", "home"],
    ["people.html", "Сообщество", "people"],
    me
      ? ["profile.html", (me.emoji || "🐍") + " " + esc(me.name), "profile"]
      : ["login.html", "Войти / Регистрация", "login"],
  ];
  $("#bar").innerHTML = `<a class="logo" href="index.html">🐍 Python Задачи</a>
    <nav>${L.map(([h, t, p]) => `<a href="${h}" class="${pg === p || (pg === "topic" && p === "home") ? "on" : ""}">${t}</a>`).join("")}${me ? `<a href="#" id="out">Выйти</a>` : ""}</nav>
    <div class="prog"><span>${d}/${n}</span><div class="pw"><div class="pf" style="width:${(100 * d) / n}%"></div></div></div>`;
  const o = $("#out");
  if (o)
    o.onclick = async (e) => {
      e.preventDefault();
      await api("POST", "/logout").catch(() => {});
      location.href = "index.html";
    };
}

const notice = () =>
  me
    ? ""
    : `<div class="notice">Вы не вошли в аккаунт: решения сохраняются только в этом браузере. <a href="login.html"><b>Создайте аккаунт</b></a>, чтобы другие видели ваш код.</div>`;

function home() {
  const cards = DATA.sections
    .map((s) => {
      const d = s.tasks.filter((t) => subs[t.id]).length;
      return `<a class="box tc" href="topic.html?t=${s.id}"><b>${s.title}</b><small>${s.tasks.length} задач</small>
      <div class="row" style="margin:0"><div class="pw" style="flex:1"><div class="pf" style="width:${(100 * d) / s.tasks.length}%"></div></div><span class="msg">${d}/${s.tasks.length}</span></div></a>`;
    })
    .join("");
  setApp(
    `<h1>🐍 Python Задачи</h1><p class="sub">shohin’s Academy · Шохин Алимов — решай задачи, вставляй код и делись им с другими.</p>${notice()}<div class="grid">${cards}</div>`,
  );
}

function topic() {
  const s = DATA.sections.find((x) => x.id === qs.get("t")) || DATA.sections[0];
  document.title = s.title.replace(/<[^>]*>/g, "") + " — Python Задачи";
  const tabs = DATA.sections
    .map(
      (x) =>
        `<a href="topic.html?t=${x.id}" class="${x.id === s.id ? "on" : ""}">${x.title}</a>`,
    )
    .join("");
  const cards = s.tasks
    .map((t) => {
      const sb = subs[t.id];
      return `<div class="card ${sb ? "done" : ""}" id="c${t.id}">
      <div class="head"><div class="num">${t.id}</div><div class="ct">${t.title}</div><div>${t.stars}</div></div>
      <div class="tag ${t.lvl}">${t.lvlText}</div><div class="desc">${t.desc}</div>
      <textarea id="code${t.id}" spellcheck="false" placeholder="# Вставь сюда свой код…">${esc(sb?.code || "")}</textarea>
      <div class="row"><button data-hint="${t.id}">💡 Подсказка</button>
        <button class="${sb ? "ok" : "p"}" data-send="${t.id}">${sb ? "✓ Обновить решение" : "Отправить решение"}</button>
        <span class="msg" id="m${t.id}">${sb ? "Сохранено " + fmt(sb.ts) : ""}</span></div>
      <div class="hint" id="h${t.id}">${t.hint}</div></div>`;
    })
    .join("");
  setApp(
    `<div class="tabs">${tabs}</div><h1>${s.title}</h1><p class="sub">${s.sub}</p>${notice()}${cards}`,
  );
  if (location.hash.startsWith("#c")) $(location.hash)?.scrollIntoView();
}

document.addEventListener("click", async (e) => {
  const h = e.target.closest("[data-hint]");
  if (h) return $("#h" + h.dataset.hint).classList.toggle("show");
  const b = e.target.closest("[data-send]");
  if (!b) return;
  const id = +b.dataset.send,
    code = $("#code" + id).value,
    m = $("#m" + id);
  if (!code.trim()) {
    m.textContent = "Вставьте код в поле выше";
    return;
  }
  b.disabled = true;
  try {
    let ts = Date.now();
    if (me) ts = (await api("PUT", "/solutions/" + id, { code })).solution.ts;
    subs[id] = { code, ts };
    if (!me) lsSet(subs);
    m.textContent = "Сохранено " + fmt(ts);
    b.className = "ok";
    b.textContent = "✓ Обновить решение";
    $("#c" + id).classList.add("done");
    chrome();
  } catch (err) {
    m.textContent = err.message;
  }
  b.disabled = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && e.target.tagName === "TEXTAREA") {
    e.preventDefault();
    const t = e.target,
      s = t.selectionStart;
    t.value = t.value.slice(0, s) + "    " + t.value.slice(t.selectionEnd);
    t.selectionStart = t.selectionEnd = s + 4;
  }
});

async function people() {
  try {
    const { users } = await api("GET", "/users");
    setApp(
      `<h1>Сообщество</h1><p class="sub">Нажми на участника, чтобы увидеть его решения.</p>${notice()}` +
        (users
          .map(
            (
              u,
            ) => `<a class="box user" href="profile.html?u=${encodeURIComponent(u.username)}"><div class="av">${esc(u.emoji)}</div>
        <div><div class="n">${esc(u.name)} <span class="msg">@${esc(u.username)}</span>${me && me.username === u.username ? " (вы)" : ""}</div><div class="b">${esc(u.bio)}</div></div>
        <div class="s">✅ ${u.solved}</div></a>`,
          )
          .join("") || `<p class="empty">Пока никого нет. Будь первым!</p>`),
    );
  } catch {
    setApp(`<p class="empty">Не удалось загрузить список.</p>`);
  }
}

const solutionsHtml = (map) => {
  const list = TASKS.filter((t) => map[t.id]);
  return list.length
    ? list
        .map(
          (
            t,
          ) => `<details><summary><span class="num" style="width:24px;height:24px;font-size:12px">${t.id}</span>${t.title}
    <span class="msg" style="margin-left:auto">${fmt(map[t.id].ts)}</span></summary>
    <div class="in"><div class="desc">${t.desc}</div><pre>${esc(map[t.id].code)}</pre></div></details>`,
        )
        .join("")
    : `<p class="empty">Пока нет решений.</p>`;
};
const emojiPicker = (cur) =>
  `<div class="emo" id="emo">${EMOJIS.map((e) => `<button type="button" data-em="${e}" class="${e === cur ? "on" : ""}">${e}</button>`).join("")}</div>`;
function bindEmoji(get, set) {
  $("#emo").onclick = (e) => {
    const b = e.target.closest("[data-em]");
    if (!b) return;
    set(b.dataset.em);
    document
      .querySelectorAll("#emo button")
      .forEach((x) => x.classList.toggle("on", x === b));
  };
}

async function profile() {
  const u = qs.get("u") || me?.username;
  if (!u) return (location.href = "login.html");
  let r;
  try {
    r = await api("GET", "/users/" + encodeURIComponent(u));
  } catch (e) {
    return setApp(`<p class="empty">${esc(e.message)}</p>`);
  }
  const own = me && me.username === r.user.username,
    n = Object.keys(r.solutions).length;
  setApp(`${own ? "" : `<p><a href="people.html">← Сообщество</a></p>`}<div class="box ph"><div class="av">${esc(r.user.emoji)}</div><div style="flex:1">
    <h1 style="margin:0">${esc(r.user.name)}</h1><div class="msg">@${esc(r.user.username)} · ${esc(r.user.bio)}</div>
    <div style="margin-top:6px"><b>✅ Решено: ${n} из ${TASKS.length}</b></div></div></div>
    ${own ? `<div class="row"><button id="ed">✏️ Изменить профиль</button><button class="d" id="rs">🗑 Сбросить прогресс</button></div><div id="edbox"></div>` : ""}
    <h2 style="margin-top:22px">${own ? "Мои решения" : "Решения"}</h2>${solutionsHtml(r.solutions)}`);
  if (!own) return;
  $("#ed").onclick = () => {
    let em = me.emoji;
    $("#edbox").innerHTML =
      `<div class="box" style="margin-top:12px"><label>Имя</label><input type="text" id="pn" maxlength="30" value="${esc(me.name)}">
      <label>Аватар</label>${emojiPicker(em)}<label>О себе</label><input type="text" id="pb" maxlength="120" value="${esc(me.bio)}">
      <div class="row"><button class="p" id="sv">Сохранить</button><span class="msg" id="sm"></span></div></div>`;
    bindEmoji(
      () => em,
      (v) => (em = v),
    );
    $("#sv").onclick = async () => {
      try {
        me = (
          await api("PATCH", "/me", {
            name: $("#pn").value,
            emoji: em,
            bio: $("#pb").value,
          })
        ).user;
        chrome();
        profile();
      } catch (e) {
        $("#sm").textContent = e.message;
      }
    };
  };
  $("#rs").onclick = async () => {
    if (!confirm("Удалить все свои решения? Это нельзя отменить.")) return;
    await api("DELETE", "/solutions");
    subs = {};
    chrome();
    profile();
  };
}

function login() {
  if (me) return (location.href = "profile.html");
  let mode = "in",
    em = EMOJIS[0];
  const draw = () => {
    setApp(`<div class="narrow"><h1>${mode === "in" ? "Вход" : "Создать аккаунт"}</h1>
      <div class="seg"><button class="${mode === "in" ? "on" : ""}" data-m="in">Войти</button><button class="${mode === "up" ? "on" : ""}" data-m="up">Регистрация</button></div>
      <div class="box"><label>Логин</label><input type="text" id="lu" autocomplete="username" autocapitalize="none" placeholder="alice_12">
      <label>Пароль</label><input type="password" id="lp" autocomplete="${mode === "in" ? "current-password" : "new-password"}" placeholder="минимум 6 символов">
      ${
        mode === "up"
          ? `<label>Имя (как показывать другим)</label><input type="text" id="ln" maxlength="30" placeholder="Алиса">
      <label>Аватар</label>${emojiPicker(em)}<label>О себе (необязательно)</label><input type="text" id="lb" maxlength="120">`
          : ""
      }
      <div class="row"><button class="p" id="go">${mode === "in" ? "Войти" : "Создать аккаунт"}</button></div><div class="err" id="er"></div></div></div>`);
    document.querySelectorAll("[data-m]").forEach(
      (b) =>
        (b.onclick = () => {
          mode = b.dataset.m;
          draw();
        }),
    );
    if (mode === "up")
      bindEmoji(
        () => em,
        (v) => (em = v),
      );
    const submit = async () => {
      $("#go").disabled = true;
      $("#er").textContent = "";
      try {
        const username = $("#lu").value,
          password = $("#lp").value;
        if (mode === "in") await api("POST", "/login", { username, password });
        else
          await api("POST", "/register", {
            username,
            password,
            name: $("#ln").value,
            emoji: em,
            bio: $("#lb").value,
          });
        const old = lsGet();
        for (const id of Object.keys(old))
          await api("PUT", "/solutions/" + id, { code: old[id].code }).catch(
            () => {},
          );
        lsSet({});
        location.href = "profile.html";
      } catch (e) {
        $("#er").textContent = e.message;
        $("#go").disabled = false;
      }
    };
    $("#go").onclick = submit;
    $("#lp").onkeydown = (e) => {
      if (e.key === "Enter") submit();
    };
  };
  draw();
}
boot();

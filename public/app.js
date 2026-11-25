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
  await ({ home, topic, people, profile, login })[document.body.dataset.page]();
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
  $("#bar").innerHTML = `<a class="logo" href="index.html"><span class="brand-mark" aria-hidden="true">&gt;_</span><span>Python Academy</span></a>
    <nav>${L.map(([h, t, p]) => `<a href="${h}" class="${pg === p || (pg === "topic" && p === "home") ? "on" : ""}">${t}</a>`).join("")}${me ? `<a href="#" id="out">Выйти</a>` : ""}</nav>
    <div class="prog" aria-label="Решено ${d} из ${n} задач"><span>${d} / ${n}</span><div class="pw"><div class="pf" style="width:${(100 * d) / n}%"></div></div></div>`;
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
    : `<div class="notice">Гостевой режим · Решения сохраняются в этом браузере. <a href="login.html">Войти или создать аккаунт <span aria-hidden="true">↗</span></a></div>`;

function home() {
  const next = TASKS.find((t) => !subs[t.id]) || TASKS[0];
  const started = doneCount() > 0;
  const cards = DATA.sections.map((s) => {
    const solved = s.tasks.filter((t) => subs[t.id]).length;
    const [icon, ...title] = s.title.split(" ");
    return `<a class="box tc" href="topic.html?t=${s.id}">
      <div class="module-top"><span class="module-icon" aria-hidden="true">${icon}</span><span class="module-arrow" aria-hidden="true">↗</span></div>
      <h3>${title.join(" ")}</h3><small>Решено ${solved} из ${s.tasks.length}</small>
      <div class="pw" aria-hidden="true"><div class="pf" style="width:${(100 * solved) / s.tasks.length}%"></div></div>
    </a>`;
  }).join("");
  setApp(`<section class="hero">
    <div class="hero-copy">
      <p class="eyebrow"><span></span> Практика программирования</p>
      <h1>Учись Python.<br><em>Пиши код.</em></h1>
      <p class="hero-summary">${TASKS.length} задач с автопроверкой. От первой переменной до собственного класса.</p>
      <a class="btn p" href="topic.html?t=${next.sid}#c${next.id}">${started ? "Продолжить практику" : "Начать решать"} <span aria-hidden="true">↗</span></a>
    </div>
    <div class="hero-code" aria-hidden="true">
      <div class="terminal">
        <div class="terminal-bar"><span></span><span></span><span></span><small>solution.py</small></div>
        <div class="terminal-body">
          <div><i>01</i><b>def</b> square(n):</div>
          <div><i>02</i>&nbsp;&nbsp;&nbsp;&nbsp;<b>return</b> n ** 2</div>
          <div><i>03</i></div>
          <div><i>04</i>print(square(<strong>5</strong>))</div>
          <div class="terminal-output"><i>&gt;</i>25 <span>✓</span></div>
        </div>
      </div>
    </div>
  </section>
  <section id="topics" aria-labelledby="topics-title">
    <div class="section-head"><h2 id="topics-title">Темы задач</h2><span>${DATA.sections.length} модулей</span></div>
    ${notice()}<div class="grid">${cards}</div>
  </section>`);
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
  const drafts = me ? lsGet() : {};
  const cards = s.tasks
    .map((t) => {
      const sb = subs[t.id];
      return `<article class="card task-card ${sb ? "done" : ""}" id="c${t.id}">
        <div class="task-copy">
          <div class="head"><span class="num">#${t.id}</span><span class="tag ${t.lvl}">${t.lvlText}</span></div>
          <h2 class="ct">${t.title}</h2><div class="desc">${t.desc}</div>
          <button class="hint-button" type="button" data-hint="${t.id}" aria-controls="h${t.id}" aria-expanded="false">Подсказка <span aria-hidden="true">+</span></button>
          <div class="hint" id="h${t.id}">${t.hint}</div>
        </div>
        <div class="task-editor">
          <label class="editor-title" for="code${t.id}">Твой код <span>Python</span></label>
          <textarea id="code${t.id}" spellcheck="false" autocapitalize="off" maxlength="20000" placeholder="# Вставь сюда свой код…">${esc(sb?.code || drafts[t.id]?.code || "")}</textarea>
          <div class="check-row"><button class="p" type="button" data-send="${t.id}">Проверить решение <span aria-hidden="true">↗</span></button></div>
          <div class="check-result" role="status" id="m${t.id}" ${sb?.checked ? 'data-status="passed"' : ""}>${sb ? (sb.checked ? "✓ Принято " : "Ранее сохранено ") + fmt(sb.ts) : ""}</div>
        </div>
      </article>`;
    })
    .join("");
  setApp(
    `<div class="tabs" aria-label="Темы">${tabs}</div><div class="page-head"><h1>${s.title}</h1><p class="sub">${s.sub}</p></div>${notice()}${cards}`,
  );
  if (/^#c\d+$/.test(location.hash)) $(location.hash)?.scrollIntoView();
}

function checkMessage(result) {
  if (result.status === "passed") return `✓ Принято. Тесты: ${result.passed} из ${result.total}.`;
  if (result.status === "syntax") {
    return result.line
      ? `Синтаксическая ошибка в строке ${result.line}.`
      : "Синтаксическая ошибка.";
  }
  const labels = {
    wrong: "Результат отличается от ожидаемого.",
    input: "Программа запрашивает больше данных, чем предусмотрено тестом.",
    runtime: "Ошибка при выполнении программы.",
    timeout: "Превышено время выполнения. Проверьте условие выхода из цикла.",
    output: "Программа выводит слишком много текста.",
  };
  const inputs = result.inputs?.length
    ? ` Ввод: ${result.inputs.join(" · ")}.`
    : "";
  return `Тест ${result.case} из ${result.total}. ${labels[result.status]}${inputs}`;
}

document.addEventListener("click", async (e) => {
  const hint = e.target.closest("[data-hint]");
  if (hint) {
    const visible = $("#h" + hint.dataset.hint).classList.toggle("show");
    hint.setAttribute("aria-expanded", String(visible));
    return;
  }
  const button = e.target.closest("[data-send]");
  if (!button || button.disabled) return;
  const id = Number(button.dataset.send);
  const editor = $("#code" + id);
  const message = $("#m" + id);
  const code = editor.value;
  if (!code.trim()) {
    message.dataset.status = "wrong";
    message.textContent = "Вставьте код в поле выше";
    editor.focus();
    return;
  }
  button.disabled = true;
  editor.readOnly = true;
  message.dataset.status = "pending";
  message.textContent = "Проверяем решение…";
  try {
    const response = me
      ? await api("PUT", "/solutions/" + id, { code })
      : await api("POST", "/check/" + id, { code });
    const { result } = response;
    message.dataset.status = result.status;
    message.textContent = checkMessage(result);
    if (result.status === "passed") {
      subs[id] = response.solution || { code, ts: Date.now(), checked: true };
      if (!me) lsSet(subs);
      $("#c" + id).classList.add("done");
      chrome();
    }
  } catch (error) {
    message.dataset.status = "runtime";
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    editor.readOnly = false;
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && !e.shiftKey && e.target.matches("textarea:enabled:not([readonly])")) {
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
  const total = Object.keys(map).length;
  if (!total) return `<p class="empty">Пока нет решений.</p>`;

  return DATA.sections
    .map((s) => {
      const list = s.tasks.filter((t) => map[t.id]);
      const pct = (100 * list.length) / s.tasks.length;

      const head = `<span class="mt">${s.title}</span>
        <span class="msg" style="margin-left:auto">${list.length}/${s.tasks.length}</span>
        <div class="pw" style="width:60px"><div class="pf" style="width:${pct}%"></div></div>`;

      // модуль без решений — просто серая строка, без раскрытия
      if (!list.length)
        return `<div class="mod empty-mod"><div class="msum">${head}</div></div>`;

      const items = list
        .map(
          (t) => `<details class="sol">
            <summary><span class="num" style="width:24px;height:24px;font-size:12px">${t.id}</span>${t.title}
              <span class="msg" style="margin-left:auto">${fmt(map[t.id].ts)}</span></summary>
            <div class="in"><div class="desc">${t.desc}</div><pre>${esc(map[t.id].code)}</pre></div>
          </details>`,
        )
        .join("");

      return `<details class="mod"><summary class="msum">${head}</summary><div class="in">${items}</div></details>`;
    })
    .join("");
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
        const local = lsGet();
        if (Object.keys(local).length) {
          try {
            const { solutions } = await api("GET", "/me");
            for (const [id, draft] of Object.entries(local)) {
              if (solutions[id]) continue;
              try {
                const { result } = await api("PUT", "/solutions/" + id, { code: draft.code });
                if (result.status === "passed") delete local[id];
              } catch {}
            }
            lsSet(local);
          } catch {}
        }
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
boot().catch(() => setApp(`<p class="empty">Не удалось загрузить задачи. Обновите страницу и попробуйте снова.</p>`));

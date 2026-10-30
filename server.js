require("dotenv").config();
const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");

const { MONGODB_URI, JWT_SECRET, PORT = 3000, NODE_ENV } = process.env;
if (!MONGODB_URI || !JWT_SECRET) {
  console.error("Задайте MONGODB_URI и JWT_SECRET в файле .env");
  process.exit(1);
}
const TASK_COUNT = require("./public/tasks.json").sections.reduce(
  (n, s) => n + s.tasks.length,
  0,
);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

let users, sols;
const wrap = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: "Ошибка сервера" });
  });
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });

const hits = new Map();
const limit = (max, ms) => (req, res, next) => {
  const k = req.ip + req.path,
    now = Date.now();
  const a = (hits.get(k) || []).filter((t) => now - t < ms);
  if (a.length >= max)
    return bad(res, "Слишком много попыток, подождите немного", 429);
  a.push(now);
  hits.set(k, a);
  next();
};

const pub = (u) => ({
  username: u.username,
  name: u.name,
  emoji: u.emoji,
  bio: u.bio,
  solved: u.solved || 0,
  created: u.created,
});
const toMap = (list) =>
  Object.fromEntries(list.map((s) => [s.task, { code: s.code, ts: s.ts }]));
const setCookie = (res, id) =>
  res.cookie(
    "tok",
    jwt.sign({ sub: String(id) }, JWT_SECRET, { expiresIn: "30d" }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: NODE_ENV === production,
      maxAge: 30 * 864e5,
    },
  );

async function auth(req, res, next) {
  try {
    const { sub } = jwt.verify(req.cookies.tok || "", JWT_SECRET);
    req.user = await users.findOne({ _id: new ObjectId(sub) });
  } catch {
    req.user = null;
  }
  next();
}
const need = (req, res, next) =>
  req.user ? next() : bad(res, "Нужно войти в аккаунт", 401);
app.use("/api", auth);

app.post(
  "/api/register",
  limit(10, 36e5),
  wrap(async (req, res) => {
    const b = req.body || {};
    const username = String(b.username || "")
      .trim()
      .toLowerCase();
    const password = String(b.password || "");
    if (!/^[a-z0-9_]{3,20}$/.test(username))
      return bad(res, "Логин: 3–20 символов, латиница, цифры и _");
    if (password.length < 6 || password.length > 100)
      return bad(res, "Пароль: минимум 6 символов");
    const doc = {
      username,
      passHash: await bcrypt.hash(password, 10),
      name:
        String(b.name || username)
          .trim()
          .slice(0, 30) || username,
      emoji: String(b.emoji || "🐍").slice(0, 8),
      bio: String(b.bio || "")
        .trim()
        .slice(0, 120),
      solved: 0,
      created: Date.now(),
    };
    try {
      const r = await users.insertOne(doc);
      setCookie(res, r.insertedId);
      res.json({ user: pub(doc) });
    } catch (e) {
      if (e.code === 11000) return bad(res, "Этот логин уже занят", 409);
      throw e;
    }
  }),
);

app.post(
  "/api/login",
  limit(10, 15 * 6e4),
  wrap(async (req, res) => {
    const username = String(req.body?.username || "")
      .trim()
      .toLowerCase();
    const u = await users.findOne({ username });
    if (
      !u ||
      !(await bcrypt.compare(String(req.body?.password || ""), u.passHash))
    )
      return bad(res, "Неверный логин или пароль", 401);
    setCookie(res, u._id);
    res.json({ user: pub(u) });
  }),
);

app.post("/api/logout", (req, res) => {
  res.clearCookie("tok");
  res.json({ ok: true });
});

app.get(
  "/api/me",
  wrap(async (req, res) => {
    if (!req.user) return res.json({ user: null });
    res.json({
      user: pub(req.user),
      solutions: toMap(await sols.find({ userId: req.user._id }).toArray()),
    });
  }),
);

app.patch(
  "/api/me",
  need,
  wrap(async (req, res) => {
    const b = req.body || {},
      set = {};
    if (b.name !== undefined) {
      set.name = String(b.name).trim().slice(0, 30);
      if (!set.name) return bad(res, "Введите имя");
    }
    if (b.emoji !== undefined) set.emoji = String(b.emoji).slice(0, 8);
    if (b.bio !== undefined) set.bio = String(b.bio).trim().slice(0, 120);
    await users.updateOne({ _id: req.user._id }, { $set: set });
    res.json({ user: pub({ ...req.user, ...set }) });
  }),
);

const recount = async (u) => {
  const n = await sols.countDocuments({ userId: u._id });
  await users.updateOne({ _id: u._id }, { $set: { solved: n } });
  return n;
};

app.put(
  "/api/solutions/:task",
  need,
  limit(120, 36e5),
  wrap(async (req, res) => {
    const task = parseInt(req.params.task, 10),
      code = String(req.body?.code ?? "");
    if (!(task >= 1 && task <= TASK_COUNT))
      return bad(res, "Нет такой задачи", 404);
    if (!code.trim()) return bad(res, "Код пустой");
    if (code.length > 20000)
      return bad(res, "Код слишком длинный (макс. 20 000 символов)");
    const ts = Date.now();
    await sols.updateOne(
      { userId: req.user._id, task },
      { $set: { code, ts } },
      { upsert: true },
    );
    res.json({ solution: { code, ts }, solved: await recount(req.user) });
  }),
);

app.delete(
  "/api/solutions",
  need,
  wrap(async (req, res) => {
    await sols.deleteMany({ userId: req.user._id });
    await recount(req.user);
    res.json({ ok: true });
  }),
);

app.get(
  "/api/users",
  wrap(async (req, res) => {
    res.json({
      users: (
        await users
          .find({})
          .sort({ solved: -1, created: 1 })
          .limit(200)
          .toArray()
      ).map(pub),
    });
  }),
);

app.get(
  "/api/users/:username",
  wrap(async (req, res) => {
    const u = await users.findOne({
      username: String(req.params.username).toLowerCase(),
    });
    if (!u) return bad(res, "Пользователь не найден", 404);
    res.json({
      user: pub(u),
      solutions: toMap(await sols.find({ userId: u._id }).toArray()),
    });
  }),
);

(async () => {
  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db();
  users = db.collection("users");
  sols = db.collection("solutions");
  await users.createIndex({ username: 1 }, { unique: true });
  await users.createIndex({ solved: -1 });
  await sols.createIndex({ userId: 1, task: 1 }, { unique: true });
  app.listen(PORT, () => console.log("http://localhost:" + PORT));
})().catch((e) => {
  console.error("Не удалось подключиться к MongoDB:", e.message);
  process.exit(1);
});

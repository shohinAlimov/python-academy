const { spawn, execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const bootstrap = "import json,sys; exec(json.loads(sys.stdin.readline()))";
const grader = JSON.stringify(readFileSync(path.join(__dirname, "public", "grade-core.py"), "utf8"));
const image = process.env.GRADER_IMAGE || "python:3.13-slim";
const statuses = new Set(["passed", "syntax", "wrong", "input", "runtime", "timeout", "output"]);
const configurationMessage =
  "Серверная проверка недоступна. Установите зависимости (npm install) или запустите Docker.";
const mode = (process.env.GRADER_MODE || "auto").toLowerCase(); // auto | docker | pyodide
const pyodideDir = path.dirname(require.resolve("pyodide/package.json"));
const pyodideScript = path.join(__dirname, "pyodide-grader.js");
const grader_text = readFileSync(path.join(__dirname, "public", "grade-core.py"), "utf8");
let active = 0;

function unavailable(message, httpStatus = 503) {
  return Object.assign(new Error(message), { httpStatus });
}

function gradeInDocker(task, code) {
  if (active >= 2) {
    return Promise.reject(unavailable("Проверка занята. Попробуйте через несколько секунд.", 429));
  }

  active += 1;
  const name = "python-academy-" + randomUUID();
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "run", "--rm", "--name", name, "--pull=never", "--interactive",
      "--network=none", "--read-only", "--cap-drop=ALL",
      "--security-opt=no-new-privileges", "--user=65534:65534",
      "--memory=96m", "--memory-swap=96m", "--cpus=1", "--pids-limit=24",
      "--ulimit", "nofile=64:64", "--ulimit", "core=0:0",
      "--log-driver=none", "--init", image, "python", "-I", "-B", "-c", bootstrap,
    ], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    let output = "";
    let diagnostics = "";
    let stopping = false;

    const stop = () => {
      // Killing the CLI alone can leave a running container on the daemon.
      stopping = true;
      child.kill();
      execFile("docker", ["rm", "-f", name], { timeout: 3000, windowsHide: true }, () => {
        reject(unavailable("Проверка прервана. Попробуйте ещё раз."));
      });
    };
    const timer = setTimeout(stop, 20000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (diagnostics.length < 1024) diagnostics = (diagnostics + chunk).slice(0, 1024);
    });
    child.stdout.on("data", (chunk) => {
      if (stopping) return;
      output += chunk;
      if (output.length > 4096) {
        clearTimeout(timer);
        stop();
      }
    });
    child.stdin.on("error", () => {}); // Failed startup is handled by close.
    let spawnError;
    child.on("error", (error) => { spawnError = error.code; });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (stopping) return;
      if (exitCode !== 0) {
        console.error("Python grader could not start:", spawnError || diagnostics.trim() || exitCode);
        reject(unavailable(configurationMessage));
        return;
      }
      try {
        const result = JSON.parse(output);
        if (!statuses.has(result.status)) throw new Error();
        resolve(result);
      } catch {
        reject(unavailable("Проверка прервана. Попробуйте ещё раз."));
      }
    });
    child.stdin.end(grader + "\n" + JSON.stringify({ task, code }));
  }).finally(() => {
    active -= 1;
  });
}

// --- Pyodide (no Docker) ---------------------------------------------------
function permissionFlags() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20) return null;
  const flag = major > 22 || (major === 22 && minor >= 13) ? "--permission" : "--experimental-permission";
  return [flag, `--allow-fs-read=${pyodideDir}`, `--allow-fs-read=${pyodideScript}`];
}

function gradeInPyodide(task, code) {
  if (active >= 2) {
    return Promise.reject(unavailable("Проверка занята. Попробуйте через несколько секунд.", 429));
  }
  const flags = permissionFlags();
  if (!flags) {
    return Promise.reject(unavailable("Для проверки без Docker нужен Node.js 20 или новее."));
  }
  active += 1;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...flags, "--max-old-space-size=256", pyodideScript], {
      env: {}, // no MONGODB_URI, JWT_SECRET or anything else
      cwd: pyodideDir,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let output = "";
    let diagnostics = "";
    let ready = false;
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      fn(value);
    };
    // 30 s to load Python the first time, then 8 s for the tests themselves.
    let timer = setTimeout(() => done(reject, unavailable("Проверка прервана. Попробуйте ещё раз.")), 30000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (c) => { if (diagnostics.length < 1024) diagnostics += c; });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 4096) return done(reject, unavailable("Проверка прервана. Попробуйте ещё раз."));
      if (!ready && output.includes("ready\n")) {
        ready = true;
        clearTimeout(timer);
        timer = setTimeout(
          () => done(resolve, { status: "timeout", case: 1, passed: 0, total: 1, inputs: [] }),
          8000,
        );
      }
    });
    child.stdin.on("error", () => {});
    child.on("error", (e) => {
      console.error("Pyodide grader could not start:", e.code);
      done(reject, unavailable(configurationMessage));
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      if (exitCode !== 0) {
        console.error("Pyodide grader failed:", diagnostics.trim() || exitCode);
        return done(reject, unavailable(configurationMessage));
      }
      try {
        const result = JSON.parse(output.split("\n").filter(Boolean).pop());
        if (!statuses.has(result.status)) throw new Error();
        done(resolve, result);
      } catch {
        done(reject, unavailable("Проверка прервана. Попробуйте ещё раз."));
      }
    });
    child.stdin.end(JSON.stringify(grader_text) + "\n" + JSON.stringify({ task, code }) + "\n");
  }).finally(() => {
    active -= 1;
  });
}

// --- Docker detection + dispatcher -----------------------------------------
let dockerCheck = { at: 0, ok: false };
function dockerReady() {
  if (Date.now() - dockerCheck.at < 60000) return Promise.resolve(dockerCheck.ok);
  return new Promise((resolve) => {
    execFile("docker", ["image", "inspect", image], { timeout: 4000, windowsHide: true }, (error) => {
      dockerCheck = { at: Date.now(), ok: !error };
      resolve(!error);
    });
  });
}

async function grade(task, code) {
  if (mode === "docker") return gradeInDocker(task, code);
  if (mode === "pyodide") return gradeInPyodide(task, code);
  return (await dockerReady()) ? gradeInDocker(task, code) : gradeInPyodide(task, code);
}

module.exports = { grade, gradeInPyodide };

const { spawn, execFile } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const bootstrap = "import json,sys; exec(json.loads(sys.stdin.readline()))";
const grader = JSON.stringify(readFileSync(path.join(__dirname, "grader.py"), "utf8"));
const image = process.env.GRADER_IMAGE || "python:3.13-slim";
const statuses = new Set(["passed", "syntax", "wrong", "input", "runtime", "timeout", "output"]);
let active = 0;

function unavailable(message, httpStatus = 503) {
  return Object.assign(new Error(message), { httpStatus });
}

function grade(task, code) {
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
    ], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    let output = "";
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
    child.stdout.on("data", (chunk) => {
      if (stopping) return;
      output += chunk;
      if (output.length > 4096) {
        clearTimeout(timer);
        stop();
      }
    });
    child.stdin.on("error", () => {}); // Failed startup is handled by close.
    child.on("error", () => {
      if (!stopping) reject(unavailable("Сервис проверки недоступен. Попробуйте позже."));
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      if (stopping) return;
      try {
        const result = JSON.parse(output);
        if (exitCode !== 0 || !statuses.has(result.status)) throw new Error();
        resolve(result);
      } catch {
        reject(unavailable("Сервис проверки недоступен. Попробуйте позже."));
      }
    });
    child.stdin.end(grader + "\n" + JSON.stringify({ task, code }));
  }).finally(() => {
    active -= 1;
  });
}

module.exports = { grade };

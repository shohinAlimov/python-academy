// Child process: runs grade-core.py inside Pyodide (WebAssembly Python).
// Started by runner.js with an empty environment and the Node permission model,
// so it can only read the pyodide package: no env secrets, no writes, no subprocesses.
// Pyodide's file-system layer calls process.binding("constants"), which the
// permission model forbids. Give it only the harmless fs constants it needs.
const fsConstants = require("node:fs").constants;
process.binding = (name) => {
  if (name === "constants") return { fs: fsConstants };
  throw new Error("process.binding is disabled");
};
const { loadPyodide } = require("pyodide");

// Defence in depth: take the obvious network and module-loading handles away
// from the JavaScript globals that Python can reach through the `js` module.
function lockDown() {
  for (const name of ["fetch", "WebSocket", "XMLHttpRequest", "EventSource"]) {
    try { delete globalThis[name]; } catch {}
  }
  try { process.mainModule = undefined; } catch {}
  try { Object.defineProperty(process, "mainModule", { value: undefined }); } catch {}
}

const lines = [];
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  lines.push(chunk);
});
process.stdin.on("end", async () => {
  try {
    const [coreLine, request] = lines.join("").split("\n");
    const core = JSON.parse(coreLine);
    const { task, code } = JSON.parse(request);
    const python = await loadPyodide({ stdout: () => {}, stderr: () => {} });
    python.globals.set("__name__", "academy_grader");
    python.runPython(core);
    lockDown();
    python.globals.set("submission_code", code);
    python.globals.set("submission_task", task);
    process.stdout.write("ready\n");
    const result = python.runPython(
      "json.dumps(grade(submission_task, submission_code, browser_case))",
    );
    process.stdout.write(result + "\n");
    process.exit(0);
  } catch (error) {
    process.stderr.write(String(error && error.message).slice(0, 500));
    process.exit(1);
  }
});

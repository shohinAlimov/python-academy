const runtimeURL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

self.onmessage = async ({ data: { core, code, task } }) => {
  try {
    importScripts(runtimeURL + "pyodide.js");
    const python = await self.loadPyodide({ indexURL: runtimeURL });
    python.globals.set("__name__", "academy_grader");
    python.runPython(core);
    python.globals.set("submission_code", code);
    python.globals.set("submission_task", task);
    self.postMessage({ type: "ready" });
    const result = python.runPython(
      "json.dumps(grade(submission_task, submission_code, browser_case))",
    );
    self.postMessage({ type: "result", result: JSON.parse(result) });
  } catch {
    self.postMessage({ type: "error" });
  }
};

const frameURL = new URL("./grade-frame.html", import.meta.url);
const sourceURL = new URL("./grade-core.py", import.meta.url);
const workerURL = new URL("./grade-worker.js", import.meta.url);

let sources;
let pending = false;

function getSources() {
  if (!sources) {
    sources = Promise.all([sourceURL, workerURL].map(async (url) => {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error();
      return response.text();
    })).catch(() => {
      sources = null;
      throw new Error("Не удалось загрузить файлы автопроверки. Обновите страницу.");
    });
  }
  return sources;
}

export async function gradeInBrowser(task, code) {
  if (pending) throw new Error("Дождитесь завершения текущей проверки.");
  if (code.length > 20000) throw new Error("Код слишком длинный (макс. 20 000 символов)");
  pending = true;
  try {
    const [core, workerCode] = await getSources();
    return await new Promise((resolve, reject) => {
      const frame = document.createElement("iframe");
      const channel = new MessageChannel();
      frame.hidden = true;
      frame.title = "Среда проверки Python";
      frame.setAttribute("sandbox", "allow-scripts");
      frame.src = frameURL.href;

      function finish(error, result) {
        clearTimeout(timer);
        channel.port1.close();
        frame.remove();
        if (error) reject(new Error(error));
        else resolve(result);
      }

      let timer = setTimeout(() => {
        finish("Python не загрузился. Проверьте подключение к интернету.");
      }, 45000);

      channel.port1.onmessage = ({ data }) => {
        if (data?.type === "ready") {
          clearTimeout(timer);
          timer = setTimeout(() => finish(
            "Превышено время выполнения. Проверьте условие выхода из цикла.",
          ), 10000);
        } else if (data?.type === "result" && typeof data.result === "object" && data.result) {
          finish(null, data.result);
        } else if (data?.type === "error") {
          finish("Не удалось запустить Python в браузере. Проверьте подключение и обновите страницу.");
        }
      };
      frame.addEventListener("load", () => {
        frame.contentWindow.postMessage({ task, code, core, workerCode }, "*", [channel.port2]);
      }, { once: true });
      document.body.append(frame);
    });
  } finally {
    pending = false;
  }
}

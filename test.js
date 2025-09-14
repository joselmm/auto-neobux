import puppeteer from "puppeteer-core";
import express from "express";
import dotenv from "dotenv";
import { generateToWait, login, goSeeAds } from "./modules/utils.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 📅 Devuelve fecha en formato colombiano
function fechaColombia() {
  return new Date().toLocaleString("es-CO", { dateStyle: "full", timeStyle: "medium" });
}

// Variables en memoria
let screenshotBase64 = null;
let lastMeta = {
  fecha: null,
  noError: true,
  errorMessage: null
};

async function takeScreenshot() {
  let noError = true;
  let errorMessage = null;
  let fecha = fechaColombia();

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: process.platform !== "win32",
  });

  const pages = await browser.pages();
  const page = pages[0];

  try {
    await page.setViewport({ width: 1360, height: 600, deviceScaleFactor: 1 });
    await page.goto("https://neobux.com", { waitUntil: "networkidle2" });
    await page.waitForSelector('a[style="color:#00ac00;"]');
    await page.click('a[style="color:#00ac00;"]');
    await new Promise(r => setTimeout(r, generateToWait(3889, 4005)));

    await login(page);
    await goSeeAds(page, browser);

  } catch (error) {
    console.error("⚠️ Error durante el proceso:", error);
    noError = false;
    errorMessage = error.message;
  } finally {
    try {
      // screenshot en memoria
      const buffer = await page.screenshot({ encoding: "binary" });
      screenshotBase64 = buffer.toString("base64");

      // actualizar meta en memoria
      lastMeta = { fecha, noError, errorMessage };
    } catch (err) {
      console.error("⚠️ Error generando screenshot:", err.message);
      noError = false;
      errorMessage = err.message;
      lastMeta = { fecha, noError, errorMessage };
    }

    await browser.close();
  }
}

// Endpoint /ss devuelve HTML con screenshot y meta
app.get("/ss", async (req, res) => {
  const escapeHtml = s => s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;") : "";

  const { fecha, noError, errorMessage } = lastMeta;

  const statusBadge = noError
    ? `<span style="background:#28a745;color:#fff;padding:6px 10px;border-radius:6px;font-weight:600">OK</span>`
    : `<span style="background:#dc3545;color:#fff;padding:6px 10px;border-radius:6px;font-weight:600">ERROR</span>`;

  const html = `<!doctype html>
  <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <title>Screenshot / Estado</title>
      <style>
        body{font-family:Inter,system-ui,Segoe UI,Roboto,'Helvetica Neue',Arial;margin:24px;color:#222;}
        .container{max-width:1100px;margin:0 auto}
        header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
        .meta{background:#f7f7f9;border:1px solid #eee;padding:12px;border-radius:8px}
        .image-wrap{margin-top:18px;text-align:center}
        img.sshot{max-width:100%;height:auto;border:1px solid #ddd;box-shadow:0 6px 18px rgba(0,0,0,0.06);border-radius:6px}
        .error{color:#b22;margin-top:8px;white-space:pre-wrap}
        .small{font-size:0.9rem;color:#666}
        .foot{margin-top:18px;font-size:0.85rem;color:#666}
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <div>
            <h2 style="margin:0 0 6px 0">Captura de pantalla</h2>
            <div class="small">Fecha (guardada al tomar la captura): <strong>${escapeHtml(fecha ?? "—")}</strong></div>
          </div>
          <div style="text-align:right">
            ${statusBadge}
            <div class="small" style="margin-top:8px">${escapeHtml(errorMessage ?? "")}</div>
          </div>
        </header>

        <div class="meta">
          <div><strong>noError:</strong> ${noError ? "true" : "false"}</div>
          ${errorMessage ? `<div class="error"><strong>Error:</strong> ${escapeHtml(errorMessage)}</div>` : ""}
        </div>

        <div class="image-wrap">
          ${screenshotBase64
        ? `<img class="sshot" src="data:image/png;base64,${screenshotBase64}" alt="screenshot" />`
        : `<div style="padding:48px;border:1px dashed #ddd;border-radius:8px;color:#666">No hay screenshot disponible</div>`}
        </div>
      </div>
    </body>
  </html>`;

  res.type("html").send(html);
});

// Tomar screenshot al iniciar servidor
takeScreenshot().catch(console.error);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/ss`);
});

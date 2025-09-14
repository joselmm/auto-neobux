import puppeteer from "puppeteer-core";
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { generateToWait, login, goSeeAds } from "./modules/utils.js";

dotenv.config();

const screenshotPath = path.join(process.cwd(), "screenshot.png");
const metaPath = path.join(process.cwd(), "screenshot.json");

const app = express();
const PORT = process.env.PORT || 3000;

// 📅 Devuelve fecha en formato colombiano
function fechaColombia() {
  return new Date().toLocaleString("es-CO", { dateStyle: "full", timeStyle: "medium" });
}

async function takeScreenshot() {
  let noError = true;
  let errorMessage = null;

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: process.platform !== "win32",
  });

  const pages = await browser.pages();
  const page = pages[0];

  try {
    await page.setViewport({
      width: 1360,
      height: 600,
      deviceScaleFactor: 1,
    });

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
      // Screenshot
      const screenshotBuffer = await page.screenshot({ path: screenshotPath });

      // Guardar JSON meta
      fs.writeFileSync(
        metaPath,
        JSON.stringify(
          {
            fecha: fechaColombia(),
            noError,
            errorMessage,
          },
          null,
          2
        )
      );

    } catch (err) {
      console.error("⚠️ Error guardando screenshot o JSON:", err.message);
    }

    await browser.close();
  }
}

// Endpoint /ss devuelve base64 y meta info
app.get("/ss", async (req, res) => {
  // helpers
  const escapeHtml = (s) => {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  try {
    let fecha = null;
    let noError = true;
    let errorMessage = null;
    let screenshotBase64 = null;

    // leer metadata si existe
    if (fs.existsSync(metaPath)) {
      try {
        const metaJson = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        fecha = metaJson.fecha ?? null;
        noError = metaJson.noError ?? true;
        errorMessage = metaJson.errorMessage ?? null;
      } catch (e) {
        // si falla el parse, marcamos error en meta
        noError = false;
        errorMessage = "Error leyendo metadata: " + e.message;
      }
    }

    // leer screenshot si existe
    if (fs.existsSync(screenshotPath)) {
      const imgBuffer = fs.readFileSync(screenshotPath);
      screenshotBase64 = imgBuffer.toString("base64");
    }

    // construir HTML
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
          a.button{display:inline-block;background:#007bff;color:#fff;padding:8px 12px;border-radius:6px;text-decoration:none}
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

          <div class="foot">
            <p>Si quieres descargar la imagen, haz click en el botón: <a class="button" href="/download-ss">Descargar screenshot</a></p>
          </div>
        </div>
      </body>
    </html>`;

    res.type("html").send(html);
  } catch (err) {
    // fallback si algo falla construyendo la página
    res.status(500).send(`<pre>Error generando la página: ${escapeHtml(err.message)}</pre>`);
  }
});


// Al iniciar servidor, tomar screenshot
takeScreenshot().catch(console.error);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/ss`);
});

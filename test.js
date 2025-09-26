// test.js
import puppeteer from "puppeteer-core";
import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch"; // npm i node-fetch
import { generateToWait, login, goSeeAds, getContextIp } from "./modules/utils.js";
import { getUserNameList, updateRow } from "./modules/ss.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 📅 Devuelve fecha en formato colombiano
function fechaColombia() {
  return new Date().toLocaleString("es-CO", { timeZone: 'America/Bogota', dateStyle: "full", timeStyle: "medium" });
}

// Variables en memoria
let screenshotBase64 = null;
let lastMeta = {
  fecha: null,
  noError: true,
  errorMessage: null,
  fileId: null,
  fileUrl: null
};

// Env var para GAS y DRIVE_LIBRARY (uploader a Drive)
const GAS_URL = process.env.GAS_URL || null;
const DRIVE_LIBRARY = process.env.DRIVE_LIBRARY || null;

/**
 * Sube el base64 a tu AppScript que guarda en Drive.
 * Devuelve el fileId o null si falló.
 */
async function uploadToDrive(base64, filename = "screenshot.png", mime = "image/png") {
  if (!DRIVE_LIBRARY) {
    console.warn("⚠️ DRIVE_LIBRARY no está definida. Saltando upload a Drive.");
    return null;
  }

  const payload = {
    archivo_name: filename,
    file_mime: mime,
    archivo_base64: base64
  };

  try {
    const res = await fetch(DRIVE_LIBRARY, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    // Tu frontend hacía .json() y luego JSON.parse(result), por eso intento manejar ambos casos.
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      // si no es JSON string, intentar usar text como-is
      parsed = text;
    }

    // parsed puede ser un objeto, o un string que contiene JSON. Normalizo:
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch (e) {
        // queda como string
      }
    }

    // Intento extraer fileId de varias maneras
    if (parsed && typeof parsed === "object") {
      // rutas comunes
      const candidates = ["fileId", "file_id", "id", "fileId_str", "fileIdString"];
      for (const c of candidates) {
        if (parsed[c]) {
          return String(parsed[c]);
        }
      }
      // si hay nested, buscar recursivamente (limitado)
      const findFileIdRec = (obj) => {
        if (!obj || typeof obj !== "object") return null;
        for (const k of Object.keys(obj)) {
          if (/file.*id/i.test(k) && obj[k]) return String(obj[k]);
          const v = obj[k];
          if (typeof v === "object") {
            const r = findFileIdRec(v);
            if (r) return r;
          }
        }
        return null;
      };
      const nested = findFileIdRec(parsed);
      if (nested) return nested;
    }

    // Si no encontré fileId, logueo la respuesta para debugging
    console.warn("⚠️ Respuesta inesperada del uploader a Drive (DRIVE_LIBRARY). Texto:", text);
    return null;

  } catch (err) {
    console.error("❌ Error subiendo a Drive vía DRIVE_LIBRARY:", err.message);
    return null;
  }
}

/**
 * Envia metadatos a tu GAS (emailer). No incluye la imagen base64
 */
async function sendToGAS(payload) {
  if (!GAS_URL) {
    console.warn("⚠️ GAS_URL no está definida. Saltando POST a GAS.");
    return;
  }

  try {
    const res = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await res.text().catch(() => "");
    console.log("✅ Respuesta GAS:", res.status, res.statusText, text);
  } catch (err) {
    console.error("❌ Error enviando payload a GAS:", err.message);
  }
}

async function takeScreenshot() {
  let noError = true;
  let errorMessage = null;
  const fecha = fechaColombia();

  console.log("🚀 Lanzando puppeteer...");
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    headless: process.platform !== "win32",
  });
  console.log("✅ Browser lanzado");

  const pages = await browser.pages();
  const page = pages[0];

  try {
    console.log("➡️ Seteando viewport...");
    await page.setViewport({ width: 1360, height: 600, deviceScaleFactor: 1 });
    console.log("✅ Viewport seteado");

    console.log("➡️ Navegando a https://neobux.com ...");
    await page.goto("https://neobux.com", { waitUntil: "networkidle2" });
    console.log("✅ Página cargada");

    console.log("➡️ Esperando selector del login...");
    await page.waitForSelector('a[style="color:#00ac00;"]');
    console.log("✅ Selector encontrado");

    console.log("➡️ Click en login...");
    await page.click('a[style="color:#00ac00;"]');
    console.log("✅ Click hecho");

    console.log("➡️ Esperando unos segundos...");
    await new Promise(r => setTimeout(r, generateToWait(3889, 4005)));
    console.log("✅ Espera terminada");

    console.log("➡️ definiendo context");
    globalThis.context ??= {
      attempts: 0,
      clicks: 0,
      saldo: null,
    };
    console.log("➡️ Ejecutando login(page)...");
    await login(page);
    console.log("✅ login(page) completado");



    console.log("➡️ Ejecutando goSeeAds(page, browser)...");
    await goSeeAds(page, browser);
    console.log("✅ goSeeAds(page, browser) completado");

  } catch (error) {
    console.error("⚠️ Error durante el proceso principal:", error);
    noError = false;
    errorMessage = error?.message ?? String(error);
  } finally {
    try {
      if (noError === false) {

        console.log("➡️ Tomando screenshot... porque hubo un error");
        const buffer = await page.screenshot({ encoding: "binary" });
        console.log("✅ Screenshot generado en memoria");
        screenshotBase64 = buffer.toString("base64");

        console.log("➡️ Subiendo screenshot a Drive...");
        const fileId = await uploadToDrive(screenshotBase64, "screenshot.png", "image/png");
        const fileUrl = fileId ? `https://drive.google.com/uc?id=${fileId}` : null;
        console.log("✅ Subida a Drive completada, fileId:", fileId);

        lastMeta = { fecha, noError, errorMessage, fileId: fileId ?? null, fileUrl: fileUrl ?? null };

        console.log("➡️ Enviando metadatos a GAS...");
        await sendToGAS({
          fecha,
          noError,
          errorMessage,
          fileId,
          fileUrl,
          email: process.env.EMAIL ?? "",
          attempts: globalThis.context?.attempts ?? 0,
          clicks: globalThis.context?.clicks ?? 0,
          saldo: globalThis.context?.saldo ?? "—",
          next_exec: globalThis.context?.next_exec ?? "_",
          username: process.env.THEUSERNAME
        });
        console.log("✅ Payload enviado a GAS");

        console.log("📸 Screenshot tomada; fileId:", fileId, " fileUrl:", fileUrl);
      }

    } catch (err) {
      console.error("⚠️ Error generando screenshot o subiendo:", err.message);
      lastMeta = { fecha, noError: false, errorMessage: err.message, fileId: null, fileUrl: null };
    }

    try {
      console.log("➡️ Cerrando browser...");
      await browser.close();
      console.log("✅ Browser cerrado");
    } catch (e) {
      console.warn("⚠️ Error cerrando browser:", e.message);
    }
  }
}


// Endpoint /ss devuelve HTML con screenshot y meta (en memoria)
app.get("/ss", async (req, res) => {
  const escapeHtml = s => s ? String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;") : "";

  const { fecha, noError, errorMessage, fileId, fileUrl } = lastMeta;

  const statusBadge = noError
    ? `<span style="background:#28a745;color:#fff;padding:6px 10px;border-radius:6px;font-weight:600">OK</span>`
    : `<span style="background:#dc3545;color:#fff;padding:6px 10px;border-radius:6px;font-weight:600">ERROR</span>`;

  const imgHtml = fileUrl
    ? `<p>Archivo guardado en Drive: <a href="${escapeHtml(fileUrl)}" target="_blank">${escapeHtml(fileUrl)}</a></p>`
    : (screenshotBase64 ? `<img class="sshot" src="data:image/png;base64,${screenshotBase64}" alt="screenshot" />` : `<div style="padding:48px;border:1px dashed #ddd;border-radius:8px;color:#666">No hay screenshot disponible</div>`);

  // 👇 aquí mostramos attempts, clicks y saldo en el cuerpo HTML
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
        .foot{margin-top:18px;font-size:0.85rem;color:#666'}
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <div>
            <h2 style="margin:0 0 6px 0">Captura de pantalla</h2>
            <div class="small">Fecha: <strong>${escapeHtml(fecha ?? "—")}</strong></div>
          </div>
          <div style="text-align:right">
            ${statusBadge}
            <div class="small" style="margin-top:8px">${escapeHtml(errorMessage ?? "")}</div>
          </div>
        </header>

        <div class="meta">
          <div><strong>noError:</strong> ${noError ? "true" : "false"}</div>
          <div><strong>Attempts:</strong> ${escapeHtml(globalThis.context?.attempts ?? 0)}</div>
          <div><strong>Clicks:</strong> ${escapeHtml(globalThis.context?.clicks ?? 0)}</div>
          <div><strong>Saldo:</strong> ${escapeHtml(globalThis.context?.saldo ?? "—")}</div>
          ${errorMessage ? `<div class="error"><strong>Error:</strong> ${escapeHtml(errorMessage)}</div>` : ""}
          ${fileId ? `<div style="margin-top:8px;"><strong>fileId:</strong> ${escapeHtml(fileId)}</div>` : ""}
        </div>

        <div class="image-wrap">
          ${imgHtml}
        </div>
      </div>
    </body>
  </html>`;

  res.type("html").send(html);
});

// Endpoint /alf devuelve ok
app.post("/alf", express.json(), (req, res) => {
  // responde OK de forma inmediata
  res.status(200).json({ ok: true });
});

/**
 * NUEVO: Endpoint /exec para lanzar la ejecución de Puppeteer en segundo plano.
 * Responde inmediatamente { ok: true } y lanza takeScreenshot() sin await,
 * por lo que la tarea se ejecuta asincrónicamente en "background".
 */
app.get("/exec", (req, res) => {
  try {
    // Lanzar la tarea en background sin esperar (no bloquea la respuesta)
    takeScreenshot().catch(err => {
      // Capturamos cualquier error no manejado en la promesa
      console.error("❌ Error en background takeScreenshot():", err);
    });
  } catch (err) {
    // Esto es por si fallara la invocación síncrona (raro)
    console.error("❌ Error lanzando takeScreenshot():", err);
  }

  // Respuesta inmediata al cliente
  res.json({ ok: true });
});

// NOTA: ya no ejecutamos takeScreenshot() al iniciar el servidor.
// Si quieres mantener la ejecución automática, descomenta la línea siguiente:
// takeScreenshot().catch(console.error);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/ss`);
  console.log(`🔁 Endpoint para ejecutar en background: http://localhost:${PORT}/exec`);
});


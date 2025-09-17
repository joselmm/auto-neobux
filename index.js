// test.js
import puppeteer from "puppeteer-core";
import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch"; // npm i node-fetch
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
      // si viene {status:'ok', fileId: '...'} o similar, lo cubrimos arriba
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
    errorMessage = error?.message ?? String(error);
  } finally {
    try {
      const buffer = await page.screenshot({ encoding: "binary" });
      screenshotBase64 = buffer.toString("base64");

      const fileId = await uploadToDrive(screenshotBase64, "screenshot.png", "image/png");
      const fileUrl = fileId ? `https://drive.google.com/uc?id=${fileId}` : null;

      lastMeta = { fecha, noError, errorMessage, fileId: fileId ?? null, fileUrl: fileUrl ?? null };

      // 👇 incluir las variables globales en el payload
      await sendToGAS({
        fecha,
        noError,
        errorMessage,
        fileId,
        fileUrl,
        email: process.env.EMAIL ?? "",
        attempts: globalThis.context?.attempts ?? 0,
        clicks: globalThis.context?.clicks ?? 0,
        saldo: globalThis.context?.saldo ?? "—"
      });

      console.log("📸 Screenshot tomada; fileId:", fileId, " fileUrl:", fileUrl);

    } catch (err) {
      console.error("⚠️ Error generando screenshot o subiendo:", err.message);
      lastMeta = { fecha, noError: false, errorMessage: err.message, fileId: null, fileUrl: null };
    }

    try {
      await browser.close();
    } catch (e) {
      console.warn("⚠️ Error cerrando browser:", e.message);
    }
  }
}

// Endpoint /ss devuelve HTML con screenshot y meta (en memoria)
app.get("/ss", async (req, res) => {
  const escapeHtml = s => s ? String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;") : "";

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

// Tomar screenshot al iniciar servidor
takeScreenshot().catch(console.error);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/ss`);
});

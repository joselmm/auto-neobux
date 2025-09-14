import puppeteer from "puppeteer-core";
import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

async function takeScreenshot() {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // opcional si usas puppeteer normal
    headless: true,
  });

  const page = await browser.newPage();
  await page.goto("https://neobux.com", { waitUntil: "networkidle2" });
  await page.waitForSelector('a[style="color:#00ac00;"]');
  await page.click('a[style="color:#00ac00;"]');
  await new Promise(r=>setTimeout(r,6000))

  const element = await page.$('a[style="color:#00ac00;"]');
  if(element===null) console.log("No se encontro el elemto de captcha") 
    else console.log("si eencontrro el ejemto de capcha")
 
  await page.screenshot({ path: "screenshot.png" });
  await browser.close();
  console.log("✅ Screenshot saved as screenshot.png");
}

// endpoint que devuelve la imagen
app.get("/ss", (req, res) => {
  res.sendFile(process.cwd() + "/screenshot.png");
});

// al iniciar el servidor tomamos la foto
takeScreenshot().catch(console.error);

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}/ss`);
});

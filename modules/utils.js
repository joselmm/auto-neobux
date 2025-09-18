import fetch from "node-fetch";
import { solveCaptcha } from "./captchaSolver.js"
import { TimeoutError } from "puppeteer-core";
import { getUserNameList, updateRow } from "./ss.js";
const viewAdsSelector = "#navAds";
const adStarSelector = "div.icon i.ic-star-1";
const closeAdTabSelector = 'a[onclick="wClose()"]';


const ONE_DAY = 24 * 60 * 60 * 1000; // 86400000 ms
export async function compareTime(ts) {

  if (ts - Date.now() < ONE_DAY) {
    return {
      noError: false,
      message: "aun no a pasado al menos 24hr con " + username
    }
  }
  return {
    noError: true
  }
}

export async function getContextIp() {
  var res = await fetch("https://api.ipify.org?format=json")
  var ipJson = await res.json()
  //console.log(ipJson.ip)
  return ipJson.ip
}

export async function login(page) {
  /* var ip = await getContextIp()
  console.log("LA IP DEL CONTEXT ES " + ip) */
  var usernameSelector = "#Kf1";
  var passwordSelector = "#Kf2";
  var captchaSelector = "#Kf3";
  var submitBtnSelector = "#botao_login";
  var captchaImgSelector = "td[align='right'] > img";
  var errorCaptchaSelector = "div[align='left'] span.t_vermelho";

  // console.log(process.env.THEUSERNAME)
  await waitAndType(page, usernameSelector, process.env.THEUSERNAME, 789, 1783);

  await waitAndType(page, passwordSelector, process.env.PASSWORD, 340, 837);

  var captchaEle = await page.$(captchaSelector);

  const captchaIsHiddenType = await page.evaluate(el => el.getAttribute("type") === "hidden", captchaEle);


  if (captchaIsHiddenType) {
    console.log("NO HAY CAPTCHA INTENTANDO ENTRAR")
    await new Promise(r => setTimeout(r, generateToWait(2450, 3149)));
    return await pressEnter(page);;
  }


  var maxAttempts = 3;
  let success = false;

  for (let i = 0; i < maxAttempts; i++) {
    const captchaImgEle = await page.$(captchaImgSelector);
    if (!captchaImgEle) throw new Error("No se encontró la imagen de captcha con '" + captchaImgSelector + "'");

    const captchaSrc = await page.evaluate(el => el.src, captchaImgEle);
    if (!captchaSrc) throw new Error("Captcha sin src, puede que esté embebido en canvas.");

    const { solved: captchaSolvedResult } = await solveCaptcha(captchaSrc);

    // ⌨️ Escribir captcha
    await waitAndType(page, captchaSelector, captchaSolvedResult, 100, 500);



    await pressEnter(page);
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 })


    // ⏳ Esperar un poquito extra
    await new Promise(r => setTimeout(r, generateToWait(2000, 3000)));

    // ✅ Checar login correcto
    const viewAdsEle = await page.$(viewAdsSelector);
    if (viewAdsEle) {
      success = true;
      break; // login exitoso
    }

    // ❌ Checar captcha incorrecto
    const errorCaptchaEle = await page.$(errorCaptchaSelector);
    if (errorCaptchaEle) {
      console.log(`⚠️ Captcha incorrecto en intento ${i + 1}, reintentando...`);

      // esperar a que cargue username otra vez
      await page.waitForSelector(usernameSelector, { timeout: 5000 });
      await waitAndType(page, usernameSelector, process.env.THEUSERNAME, 789, 1783);
      await waitAndType(page, passwordSelector, process.env.PASSWORD, 340, 837);
      continue; // intentar de nuevo
    }

    // Caso raro: no hay ni viewAds ni errorCaptcha
    console.warn(`⚠️ Intento ${i + 1} falló pero no se encontró '${errorCaptchaSelector}'`);
  }

  // ❌ Si no se logró login después de todos los intentos
  if (!success) {
    throw new Error(`No se pudo iniciar después de ${maxAttempts} intentos.`);
  }

  await updateIpInfoInSheetList()
    .then(() => console.log("Se actualizo las ip's registradas en sheets"))
    .catch(e => {
      throw new Error("Ocurrio un error al actualizar las ip's en el sheet: " + e.message);
    })
}



export async function pressEnter(page) {
  await page.keyboard.press("Enter");
}




export async function waitAndType(page, selector, text, min, max) {
  if (min === undefined) {
    throw new Error("No se espefico min y max")
  }

  await page.waitForSelector(selector);
  var toWait = generateToWait(min, max);
  await new Promise(r => setTimeout(r, toWait));

  var typingDelay = generateToWait(120, 300);
  await page.click(selector)
  await page.type(selector, text, { delay: typingDelay })
}

export function generateToWait(min = 927, max = 2469) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function waitAndClick(page, selector, min, max) {
  if (min === undefined) {
    throw new Error("No se espefico min y max")
  }

  await page.waitForSelector(selector);
  var toWait = generateToWait(min, max);
  await new Promise(r => setTimeout(r, toWait));


  await page.click(selector)

}


export async function goSeeAds(page, browser) {
  await page.waitForNavigation();
  await new Promise(r => setTimeout(r, generateToWait(4000, 5000)));

  await page.waitForSelector(viewAdsSelector);
  await waitAndClick(page, viewAdsSelector, 402, 707);

  await waitAndClick(page, viewAdsSelector, 402, 707);

  // inicializar contexto global
  globalThis.context ??= {
    attempts: 0,
    clicks: 0,
    saldo: null,
  };

  await seeFoundAd(page, browser);
}

async function seeFoundAd(page, browser) {
  const selectorStarFound = await page
    .waitForSelector(adStarSelector, { timeout: 3000 })
    .then(() => true)
    .catch(e => {
      if (e instanceof TimeoutError) {
        console.log("Timeout para el selector de star");
        return false;
      } else {
        throw e;
      }
    });


  if (!selectorStarFound) {
    console.log(
      `✅ No se encontró más ads después de ${globalThis.context.attempts} intentos. Fin.`
    );

    const saldo = await page
      .evaluate(() => {
        const el = document.querySelector("#t_saldo");
        return el ? el.innerText : null;
      })
      .catch(e => {
        console.log("Error hallando saldo:", e.message);
        return null;
      });

    if (typeof saldo === "string") {
      globalThis.context.saldo = saldo;
    }
    return;
  }

  globalThis.context.attempts++;

  // ✅ como el selector existe, puedes rescatar el saldo en cada iteración
  const saldo = await page
    .evaluate(() => {
      const el = document.querySelector("#t_saldo");
      return el ? el.innerText : null;
    })
    .catch(e => {
      console.log("Error hallando saldo:", e.message);
      return null;
    });

  if (typeof saldo === "string") {
    globalThis.context.saldo = saldo;
  }

  console.log("SALDO HAYADO: " + saldo);

  const ad = await page.$(adStarSelector);
  if (!ad) {
    console.log("El selector existía pero no se encontró el elemento.");
    return;
  }

  await new Promise(r => setTimeout(r, generateToWait(3000, 4000)));

  // 🔢 Rescatar número de ad
  const num = await page.evaluate(
    ad =>
      parseInt(
        ad.parentElement.parentElement.parentElement
          .onclick.toString()
          .match(/ggz\([^,]+,\s*'(\d+)'\)/)?.[1]
      ),
    ad
  );

  console.log(
    `➡️ Click en banner #${num} (intento ${globalThis.context.attempts}).`
  );

  // Disparar onmouseover
  await page.evaluate(
    ad => ad.parentElement.parentElement.parentElement.onmouseover(),
    ad
  );
  await new Promise(r => setTimeout(r, generateToWait(457, 1304)));

  // Click en banner
  await page.evaluate(async ad => {
    function generateToWait(min = 927, max = 2469) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    const banner = ad.parentElement.parentElement.parentElement;
    banner.scrollIntoView();
    await new Promise(r => setTimeout(r, generateToWait(2700, 3000)));
    banner.click();
  }, ad);

  await new Promise(r => setTimeout(r, generateToWait(893, 2034)));

  // Click en botón rojo
  await page.evaluate(
    (ad, num) => {
      const btn = ad.parentElement.parentElement.parentElement.querySelector(
        "#i" + num
      );
      if (btn) btn.click();
    },
    ad,
    num
  );

  await new Promise(r => setTimeout(r, generateToWait(2356, 3000)));

  // Buscar tab de la ad
  const adTab = await findAdtab(browser);
  if (!adTab) throw new Error("No se encontró el tab de la ad");

  await adTab.bringToFront();
  await adTab.waitForSelector(closeAdTabSelector, {
    timeout: 60000,
    visible: true,
  });

  await adTab
    .evaluate(sel => {
      const el = document.querySelector(sel);
      if (el) el.click();
    }, closeAdTabSelector)
    .then(() => {
      console.log("Se dio click en el ad #" + num);
      globalThis.context.clicks++;
    });

  await new Promise(r => setTimeout(r, generateToWait(1400, 2700)));

  // Recargar página de banners
  await page.reload({ waitUntil: "domcontentloaded" });

  // 🔄 Repetir hasta que no queden más ads
  return seeFoundAd(page, browser);
}





export async function findAdtab(browser, prefix = "https://www.neobux.com/v/?a=") {
  const pages = await browser.pages();

  for (const page of pages) {
    const url = page.url();
    if (url.startsWith(prefix)) {
      return page; // ✅ encontrada
    }
  }

  return null; // ❌ no encontrada
}



async function updateIpInfoInSheetList() {

  var ip = await getContextIp();

  console.log("LA IP DEL CONTEXT ES " + ip)

  var lista = await getUserNameList()

  var row = lista.find(e => e.username === process.env.THEUSERNAME);

  if (!row) throw new Error("El valor de row es " + row);

  var used_ips = JSON.parse(row.used_ips);

  if (!Array.isArray(used_ips)) {
    throw new Error("used_ips no es un array");
  }

  if (!used_ips.includes(ip)) {
    used_ips.push(ip);
  };

  row.used_ips = JSON.stringify(used_ips);
  row.last_ip = "" + ip;

  var updatedList = await updateRow(row);
  return updatedList;

}

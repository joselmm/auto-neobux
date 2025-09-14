const DEFAULT_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DEFAULT_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

/** genera string aleatorio alfanumérico de n caracteres */
function randString(n = 5) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let s = "";
    for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
}

/** intenta extraer JSON de una cadena (busca la primera llave { ... }) */
function tryExtractJson(text) {
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last !== -1 && last > first) {
        const candidate = text.slice(first, last + 1);
        try {
            return JSON.parse(candidate);
        } catch {
            return null;
        }
    }
    return null;
}

/** intenta sacar valor de solved con regex */
function tryExtractSolvedFromText(text) {
    const m = text.match(/"solved"\s*:\s*"([^"]*)"/i);
    if (m) return m[1];
    const m2 = text.match(/'solved'\s*:\s*'([^']*)'/i);
    if (m2) return m2[1];
    return null;
}

/**
 * Función principal
 */
export async function solveCaptcha(base64, options = {}) {
    if (!base64 || typeof base64 !== "string") {
        throw new Error("Se requiere la cadena base64 (string) como primer argumento.");
    }

    const apiKey = options.apiKey || process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("API key faltante: pásala en options.apiKey o en la variable de entorno GROQ_API_KEY.");

    const apiUrl = options.apiUrl || DEFAULT_API_URL;
    const model = options.model || DEFAULT_MODEL;

    // Mensaje system que exige 5 caracteres
    const systemMessage = {
        role: "system",
        content: [
            {
                type: "text",
                text:
                    "Eres un captcha solver. SOLO debes devolver un JSON válido EXACTAMENTE con la forma {\"solved\":\"<texto>\"} y NADA MÁS. " +
                    "El valor de <texto> debe ser SIEMPRE una cadena alfanumérica de EXACTAMENTE 5 caracteres. ya que esos son los que trae la imagen del capcha SIEMPRE" +
                    "Si no ves texto o no puedes leerlo, devuelve un string aleatorio de 5 caracteres. " +
                    "Observa bien los caracteres para que no los confundas con otros. " +
                    "No escribas explicaciones, ni comentarios, ni JSON adicional, ni texto fuera del JSON."
            }
        ]
    };

    const userMessage = {
        role: "user",
        content: [
            { type: "text", text: "Resuelve el captcha de la siguiente imagen y devuelve solo el JSON requerido." },
            { type: "image_url", image_url: { url: base64 } }
        ]
    };

    const body = {
        messages: [systemMessage, userMessage],
        model,
        temperature: 0.0,
        max_completion_tokens: 256,
        top_p: 1,
        stream: false,
        stop: null
    };

    const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API request failed ${res.status} ${res.statusText} - ${text}`);
    }

    const data = await res.json();

    let rawText = "";
    try {
        if (Array.isArray(data?.choices) && data.choices.length > 0) {
            const msg = data.choices[0].message;
            if (msg) {
                if (typeof msg.content === "string") {
                    rawText = msg.content;
                } else if (Array.isArray(msg.content)) {
                    rawText = msg.content
                        .map(c => (c.type === "text" ? c.text ?? "" : ""))
                        .join("\n")
                        .trim();
                    if (!rawText) rawText = JSON.stringify(msg.content);
                } else {
                    rawText = JSON.stringify(msg.content);
                }
            }
        }
        if (!rawText && typeof data?.output_text === "string") {
            rawText = data.output_text;
        }
        if (!rawText) rawText = JSON.stringify(data);
    } catch {
        rawText = JSON.stringify(data);
    }

    let solvedValue = null;
    const parsed = tryExtractJson(rawText);
    if (parsed && typeof parsed === "object" && parsed.hasOwnProperty("solved")) {
        solvedValue = String(parsed.solved ?? "");
    } else {
        const s = tryExtractSolvedFromText(rawText);
        if (s !== null) solvedValue = String(s);
    }

    // Fallback o corrección de longitud
    if (!solvedValue) solvedValue = randString(5);
    // limpiar: solo caracteres alfanuméricos
    solvedValue = solvedValue.replace(/[^A-Za-z0-9]/g, "");
    // asegurar longitud exacta 5
    if (solvedValue.length < 5) {
        solvedValue = (solvedValue + randString(5)).slice(0, 5);
    } else if (solvedValue.length > 5) {
        solvedValue = solvedValue.slice(0, 5);
    }

    return { solved: solvedValue };
}

export default solveCaptcha;

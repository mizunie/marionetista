import { launch } from "./core/browser.js"
import { inject } from "./core/injector.js"
import { startCasesServer } from "./core/casesServer.js"

const server = startCasesServer()

const url = process.argv[2] || "http://localhost:7331"

const { page, context } = await launch(url)
context.on('close', () => {
  console.log("\n🛑 Ventana del navegador cerrada. Apagando Marioneta...");
  server.close();
  process.exit(0);
});

// 🆕 Normalizador de URL para Playwright
function normalizeUrl(input) {
  if (!input || typeof input !== 'string') return ''
  let url = input.trim()
  if (!url) return ''
  url = url.replace(/^['"]|['"]$/g, '').replace(/\s+/g, '')
  // Si ya tiene protocolo, se usa tal cual
  if (/^https?:\/\//i.test(url)) return url
  // localhost o IP → http://
  if (/^(localhost|\[?\d+\.\d+\.\d+\.\d+\]?)(:\d+)?(\/.*)?$/i.test(url)) {
    return 'http://' + url
  }
  // Cualquier otra cosa → https://
  return 'https://' + url
}

// 🆕 Escuchar peticiones del dashboard para abrir nuevas URLs
server.on("open-url", async (targetUrl) => {
  const fullUrl = normalizeUrl(targetUrl)
  if (!fullUrl) {
    console.error("❌ URL inválida:", targetUrl)
    return
  }
  console.log(`🪄 Abriendo nueva página con Marionetista: ${fullUrl}`)
  try {
    const newPage = await context.newPage()
    await inject(newPage)
    await newPage.goto(fullUrl)
    await newPage.bringToFront()
  } catch (e) {
    console.error("❌ Error abriendo página:", e.message)
  }
})

// Limpiar al cerrar (Graceful Shutdown)
let isShuttingDown = false;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Recibido ${signal}. Cerrando Marioneta...`);

  try {
    // 1. Cerrar el servidor HTTP
    server.close();

    // 2. Cerrar el contexto de Playwright
    if (context) {
      await context.close();
      console.log("🧹 Navegador cerrado.");
    }
  } catch (e) {
    console.error("Error cerrando:", e.message);
  } finally {
    // 3. Matar el proceso
    process.exit(0);
  }
}

// Limpiar al cerrar
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGHUP", () => shutdown("SIGHUP"));

console.log("🪄 Marioneta lista")
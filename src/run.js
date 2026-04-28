import { launch } from "./core/browser.js"
import { inject } from "./core/injector.js"
import { startCasesServer } from "./core/casesServer.js"

const server = startCasesServer()

const url = process.argv[2] || "http://localhost:7331"

const { page, context } = await launch(url)

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

// Limpiar al cerrar
process.on("SIGINT", async () => {
  console.log("\n👋 Cerrando...")
  await context.close()
  process.exit(0)
})
process.on("SIGTERM", async () => {
  await context.close()
  process.exit(0)
})

console.log("🪄 Marioneta lista")
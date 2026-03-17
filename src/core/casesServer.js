import http from "http"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const PORT = 7331

// Mismo mapeo que generate.js
const FRAMEWORK_SUBDIR = {
  "playwright-pom":        "playwright",
  "playwright-cucumber":   "playwright",
  "playwright-screenplay": "playwright",
}

function resolveProjectDir(url, framework) {
  const host = new URL(url).hostname.replaceAll(".", "_")
  const base = path.join(process.cwd(), "generated", host)
  const subdir = FRAMEWORK_SUBDIR[framework]
  return subdir ? path.join(base, subdir) : base
}

function caseFilePath(url, caseName) {
  const parsed = new URL(url)
  const host = parsed.hostname.replaceAll(".", "_")
  // pathname: "/" → "home", "/products/list" → "products/list"
  const pathname = parsed.pathname.replace(/^\//, "") || "home"
  return path.join(process.cwd(), "generated", host, "cases", pathname, `${caseName}.json`)
}

function saveCases(url, caseName, steps) {
  const filePath = caseFilePath(url, caseName)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(steps, null, 2), "utf8")
  console.log("💾 Case guardado →", filePath)
}

function loadCases(url) {
  const parsed = new URL(url)
  const host = parsed.hostname.replaceAll(".", "_")
  const pathname = parsed.pathname.replace(/^\//, "") || "home"
  const dir = path.join(process.cwd(), "generated", host, "cases", pathname)

  if (!fs.existsSync(dir)) return {}

  const result = {}
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith(".json")) continue
    const caseName = file.replace(".json", "")
    try {
      result[caseName] = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"))
    } catch {}
  }
  return result
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", chunk => (data += chunk))
    req.on("end", () => {
      try { resolve(JSON.parse(data)) } catch { reject(new Error("Invalid JSON")) }
    })
  })
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
}

export function startCasesServer() {
  const server = http.createServer(async (req, res) => {
    cors(res)

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      return res.end()
    }

    const reqUrl = new URL(req.url, `http://localhost:${PORT}`)

    // POST /run  { url, caseName, framework }
    if (req.method === "POST" && reqUrl.pathname === "/run") {
      try {
        const { url, caseName, framework } = await readBody(req)
        const dir = resolveProjectDir(url, framework)

        if (!fs.existsSync(dir)) {
          res.writeHead(404)
          return res.end("Directorio generado no encontrado")
        }

        // Instalar solo si no hay node_modules
        if (!fs.existsSync(path.join(dir, "node_modules"))) {
          console.log("📦 Instalando dependencias en", dir)
          execSync("pnpm i", { cwd: dir, stdio: "inherit" })
        }

        console.log(`▶️  Ejecutando case "${caseName}"`)
        let ok = true
        try {
          execSync(`pnpm playwright test --grep "${caseName}"`, { cwd: dir, stdio: "inherit" })
        } catch {
          ok = false
        }

        // Abre el reporte en el browser si existe
        const reportIndex = path.join(dir, "playwright-report", "index.html")
        const reportUrl = fs.existsSync(reportIndex)
          ? `http://localhost:${PORT}/report?url=${encodeURIComponent(url)}&framework=${encodeURIComponent(framework)}`
          : null
        if (reportUrl) console.log("📊 Reporte →", reportUrl)

        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok, reportUrl, ...(!ok && { msg: "Test finalizado con fallos, revisa la consola" }) }))
      } catch (e) {
        res.writeHead(400)
        res.end(e.message)
      }
      return
    }

    // POST /cases  { url, caseName, steps }
    if (req.method === "POST" && reqUrl.pathname === "/cases") {
      try {
        const { url, caseName, steps } = await readBody(req)
        saveCases(url, caseName, steps)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(400)
        res.end(e.message)
      }
      return
    }

    // DELETE /cases  { url, caseName }
    if (req.method === "DELETE" && reqUrl.pathname === "/cases") {
      try {
        const { url, caseName } = await readBody(req)
        const filePath = caseFilePath(url, caseName)
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
          console.log("🗑️  Case eliminado →", filePath)
        }
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(400)
        res.end(e.message)
      }
      return
    }

    // GET /cases?url=...
    if (req.method === "GET" && reqUrl.pathname === "/cases") {
      const url = reqUrl.searchParams.get("url")
      if (!url) { res.writeHead(400); return res.end("missing url") }
      const cases = loadCases(url)
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(cases))
      return
    }

    // GET /report?url=...&framework=...  — sirve playwright-report como estático
    if (req.method === "GET" && reqUrl.pathname.startsWith("/report")) {
      const pageUrl   = reqUrl.searchParams.get("url")
      const framework = reqUrl.searchParams.get("framework")
      if (!pageUrl || !framework) { res.writeHead(400); return res.end("missing params") }

      const dir        = resolveProjectDir(pageUrl, framework)
      const reportDir  = path.join(dir, "playwright-report")
      // El sub-path dentro del reporte (ej: /report/data/xxx.zip → data/xxx.zip)
      const subPath    = reqUrl.pathname.replace(/^\/report\/?/, "") || "index.html"
      const filePath   = path.join(reportDir, subPath)

      if (!fs.existsSync(filePath) || !filePath.startsWith(reportDir)) {
        res.writeHead(404); return res.end("not found")
      }

      const ext = path.extname(filePath).toLowerCase()
      const mime = {
        ".html": "text/html", ".js": "application/javascript",
        ".css": "text/css",   ".json": "application/json",
        ".png": "image/png",  ".svg": "image/svg+xml",
        ".zip": "application/zip", ".webm": "video/webm"
      }[ext] || "application/octet-stream"

      res.writeHead(200, { "Content-Type": mime })
      fs.createReadStream(filePath).pipe(res)
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(PORT, () => console.log(`🗄️  Cases server → http://localhost:${PORT}`))
  return server
}

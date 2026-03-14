import http from "http"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const PORT = 7331

function hostFolder(url) {
  return new URL(url).hostname.replaceAll(".", "_")
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

    // POST /run  { url, caseName }
    if (req.method === "POST" && reqUrl.pathname === "/run") {
      try {
        const { url, caseName } = await readBody(req)
        const host = new URL(url).hostname.replaceAll(".", "_")
        const dir = path.join(process.cwd(), "generated", host)

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
        try {
          execSync(`pnpm playwright test --grep "${caseName}"`, { cwd: dir, stdio: "inherit" })
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: true }))
        } catch {
          // playwright devuelve exit code != 0 si hay fallos, pero el output ya se imprimió
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ ok: false, msg: "Test finalizado con fallos, revisa la consola" }))
        }
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

    res.writeHead(404)
    res.end()
  })

  server.listen(PORT, () => console.log(`🗄️  Cases server → http://localhost:${PORT}`))
  return server
}

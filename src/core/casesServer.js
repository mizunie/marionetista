import http from "http"
import fs from "fs"
import path from "path"
import { execSync } from "child_process"

const PORT = 7331
const SECRETS_FILE = path.join(process.cwd(), ".secrets.json")

function loadSecrets() {
  try { return JSON.parse(fs.readFileSync(SECRETS_FILE, "utf8")) } catch { return {} }
}

function saveSecret(token, value) {
  const secrets = loadSecrets()
  secrets[token] = value
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), "utf8")
}

// Mismo mapeo que generate.js
const FRAMEWORK_SUBDIR = {
  "playwright-pom": "playwright",
  "playwright-cucumber": "playwright",
  "playwright-screenplay": "playwright",
  "serenity-pom-java": "serenity",
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
    } catch { }
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

// 🆕 Helper para listar proyectos con metadata
function listProjects() {
  const generatedDir = path.join(process.cwd(), "generated")
  const projects = []
  
  if (fs.existsSync(generatedDir)) {
    for (const dirEntry of fs.readdirSync(generatedDir, { withFileTypes: true })) {
      if (!dirEntry.isDirectory()) continue
      
      const projectPath = path.join(generatedDir, dirEntry.name)
      const stat = fs.statSync(projectPath)
      
      const frameworks = []
      if (fs.existsSync(path.join(projectPath, "playwright"))) frameworks.push("playwright")
      if (fs.existsSync(path.join(projectPath, "serenity"))) frameworks.push("serenity")
      
      // Contar cases
      let caseCount = 0
      const casesDir = path.join(projectPath, "cases")
      if (fs.existsSync(casesDir)) {
        function countCases(dir) {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) countCases(path.join(dir, entry.name))
            else if (entry.name.endsWith(".json")) caseCount++
          }
        }
        countCases(casesDir)
      }
      
      // ¿Tiene reporte?
      const hasReport = frameworks.some(fw => {
        if (fw === "playwright") return fs.existsSync(path.join(projectPath, "playwright", "playwright-report", "index.html"))
        if (fw === "serenity") return fs.existsSync(path.join(projectPath, "serenity", "target", "site", "serenity", "index.html"))
        return false
      })
      
      // Reconstruir URL original desde el nombre de carpeta
      const originalUrl = "https://" + dirEntry.name.replaceAll("_", ".")
      
      projects.push({
        name: dirEntry.name,
        originalUrl,
        frameworks,
        caseCount,
        hasReport,
        lastModified: stat.mtime.toISOString()
      })
    }
  }
  
  return projects.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
}

// 🆕 Dashboard HTML
function renderDashboard() {
  const projects = listProjects()
  const uptime = process.uptime()
  const uptimeStr = uptime > 60 
    ? `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`
    : `${Math.floor(uptime)}s`

  const projectCards = projects.length === 0 
    ? `<div class="col-span-full text-center py-16 text-slate-400">
        <div class="text-5xl mb-4">📭</div>
        <p class="text-lg">No hay proyectos aún</p>
        <p class="text-sm mt-2">Ejecuta <code class="bg-slate-800 px-2 py-1 rounded text-emerald-400">node src/run.js &lt;url&gt;</code> para empezar</p>
       </div>`
    : projects.map(p => `
      <div class="project-card bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 hover:border-emerald-500/30 transition-all group"
           data-name="${p.name.toLowerCase()}"
           data-url="${p.originalUrl.toLowerCase()}"
           data-frameworks="${p.frameworks.join(',')}"
           data-has-report="${p.hasReport}"
           data-case-count="${p.caseCount}">
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-semibold text-white truncate" title="${p.originalUrl}">🌐 ${p.originalUrl}</h3>
            <p class="text-xs text-slate-500 mt-0.5 font-mono">${p.name}</p>
          </div>
          <span class="text-xs text-slate-500 whitespace-nowrap ml-3" title="${new Date(p.lastModified).toLocaleString()}">
            ${new Date(p.lastModified).toLocaleDateString()}
          </span>
        </div>
        
        <div class="flex flex-wrap gap-2 mb-4">
          ${p.frameworks.map(fw => {
            const fwName = fw === "playwright" ? "Playwright" : "Serenity"
            const fwColor = fw === "playwright" ? "bg-emerald-900/40 text-emerald-300" : "bg-purple-900/40 text-purple-300"
            return `<span class="text-xs px-2.5 py-1 rounded-full ${fwColor}">${fwName}</span>`
          }).join("")}
          <span class="text-xs px-2.5 py-1 rounded-full bg-slate-700/50 text-slate-400">
            📋 ${p.caseCount} cases
          </span>
          ${p.hasReport ? '<span class="text-xs px-2.5 py-1 rounded-full bg-amber-900/40 text-amber-300">📊 Reporte</span>' : ''}
        </div>
        
        <div class="flex gap-2">
          <button onclick="openMarionetista('${p.originalUrl}')"
             class="flex-1 text-xs px-3 py-2 rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/40 transition font-medium">
            🪄 Marionetista
          </button>
          <a href="${p.originalUrl}" target="_blank" 
             class="flex-1 text-center text-xs px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 transition font-medium">
            🔗 Abrir sitio
          </a>
          ${p.hasReport ? `
          <button onclick="openReport('${p.originalUrl}', '${p.frameworks[0]}')"
             class="flex-1 text-xs px-3 py-2 rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600/40 transition font-medium">
            📊 Ver reporte
          </button>` : ''}
        </div>
      </div>
    `).join("")

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🪄 Marionetista — Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: { mono: ['JetBrains Mono', 'Fira Code', 'monospace'] }
        }
      }
    }
  </script>
  <style>
    body { background: #0b1120; }
    .pulse { animation: pulse 2s infinite; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  </style>
</head>
<body class="font-mono text-slate-300 min-h-screen">
  <div class="max-w-5xl mx-auto px-6 py-10">
    <!-- Header -->
    <div class="flex items-center justify-between mb-10">
      <div>
        <h1 class="text-3xl font-bold text-white flex items-center gap-3">
          <span class="text-4xl">🪄</span> Marionetista
        </h1>
        <p class="text-slate-500 mt-1">Dashboard de proyectos QA</p>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-900/30 border border-emerald-800/50">
          <span class="w-2 h-2 rounded-full bg-emerald-400 pulse"></span>
          <span class="text-emerald-300">Online</span>
        </div>
      </div>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
      <div class="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
        <div class="text-2xl font-bold text-white">${projects.length}</div>
        <div class="text-xs text-slate-500 mt-1">Proyectos</div>
      </div>
      <div class="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
        <div class="text-2xl font-bold text-white">${projects.reduce((sum, p) => sum + p.caseCount, 0)}</div>
        <div class="text-xs text-slate-500 mt-1">Cases totales</div>
      </div>
      <div class="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
        <div class="text-2xl font-bold text-white">${new Set(projects.flatMap(p => p.frameworks)).size || 0}</div>
        <div class="text-xs text-slate-500 mt-1">Frameworks</div>
      </div>
      <div class="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
        <div class="text-2xl font-bold text-white">${projects.filter(p => p.hasReport).length}</div>
        <div class="text-xs text-slate-500 mt-1">Con reportes</div>
      </div>
    </div>

    <!-- Quick actions -->
    <div class="flex gap-3 mb-8">
      <div class="flex-1 relative">
        <input id="quickUrl" type="text" 
               placeholder="Pega una URL para abrir con Marionetista..."
               class="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
               onkeydown="if(event.key==='Enter')openMarionetista(this.value)">
      </div>
      <button onclick="openMarionetista(document.getElementById('quickUrl').value)"
              class="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl transition flex items-center gap-2">
        🪄 Abrir
      </button>
    </div>

    <!-- 🆕 Filtros -->
    <div class="flex gap-3 mb-6" id="filters">
      <div class="flex-1 relative">
        <input id="filterSearch" type="text" 
               placeholder="Filtrar por nombre o URL..."
               class="w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition"
               oninput="applyFilters()">
      </div>
      <select id="filterTag" onchange="applyFilters()"
              class="bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition cursor-pointer">
        <option value="">Todos</option>
        <option value="playwright">Playwright</option>
        <option value="serenity">Serenity</option>
        <option value="has-report">📊 Con reporte</option>
        <option value="has-cases">📋 Con cases</option>
      </select>
      <span id="filterCount" class="text-xs text-slate-500 self-center whitespace-nowrap"></span>
    </div>

    <!-- Projects grid -->
    <h2 class="text-lg font-semibold text-white mb-4 flex items-center gap-2">
      📁 Proyectos
      <span class="text-xs text-slate-500 font-normal" id="projectCount">(${projects.length})</span>
    </h2>
    <div class="grid sm:grid-cols-2 gap-4" id="projectGrid">
      ${projectCards}
    </div>

    <!-- Footer -->
    <div class="mt-12 pt-6 border-t border-slate-800 text-center text-xs text-slate-600">
      🪄 Marionetista v1.0 · API :${PORT} · <a href="/health" class="hover:text-slate-400 transition">/health</a> · <a href="/projects" class="hover:text-slate-400 transition">/projects</a>
    </div>
  </div>

  <script>
    async function openMarionetista(url) {
      if (!url) return
      const res = await fetch('/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      })
      const data = await res.json()
      if (!data.ok) alert('Error al abrir Marionetista')
    }
    function openReport(url, framework) {
      const params = new URLSearchParams({ url, framework })
      window.open('/report?' + params, '_blank')
    }

    // 🆕 Filtros
    function applyFilters() {
      const search = (document.getElementById('filterSearch')?.value || '').toLowerCase()
      const tag = document.getElementById('filterTag')?.value || ''
      
      let visible = 0
      document.querySelectorAll('.project-card').forEach(card => {
        const name = card.dataset.name || ''
        const url = card.dataset.url || ''
        const frameworks = card.dataset.frameworks || ''
        const hasReport = card.dataset.hasReport === 'true'
        const caseCount = parseInt(card.dataset.caseCount) || 0
        
        let show = true
        
        // Búsqueda por texto
        if (search && !name.includes(search) && !url.includes(search)) {
          show = false
        }
        
        // Filtro por tag
        if (tag === 'playwright' && !frameworks.includes('playwright')) show = false
        if (tag === 'serenity' && !frameworks.includes('serenity')) show = false
        if (tag === 'has-report' && !hasReport) show = false
        if (tag === 'has-cases' && caseCount === 0) show = false
        
        card.style.display = show ? '' : 'none'
        if (show) visible++
      })
      
      // Actualizar contador
      const countEl = document.getElementById('projectCount')
      const filterCountEl = document.getElementById('filterCount')
      if (countEl) countEl.textContent = search || tag ? \`(\${visible} visibles)\` : \`(\${document.querySelectorAll('.project-card').length})\`
      if (filterCountEl) filterCountEl.textContent = visible + ' proyecto' + (visible !== 1 ? 's' : '')
    }
  </script>
</body>
</html>`
}

export function startCasesServer() {
  const server = http.createServer(async (req, res) => {
    cors(res)

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      return res.end()
    }

    const reqUrl = new URL(req.url, `http://localhost:${PORT}`)

    // 🆕 GET / — Dashboard
    if (req.method === "GET" && (reqUrl.pathname === "/" || reqUrl.pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(renderDashboard())
      return
    }

    // POST /run  { url, caseName, framework }
    if (req.method === "POST" && reqUrl.pathname === "/run") {
      try {
        const { url, caseName, framework } = await readBody(req)
        const dir = resolveProjectDir(url, framework)

        if (!fs.existsSync(dir)) {
          res.writeHead(404)
          return res.end("Directorio generado no encontrado")
        }

        // playwright
        if (framework.startsWith("playwright")) {
          // Instalar solo si no hay node_modules
          if (!fs.existsSync(path.join(dir, "node_modules"))) {
            console.log("📦 Instalando dependencias en", dir)
            execSync("pnpm i", { cwd: dir, stdio: "inherit" })
          }

          console.log(`▶️  Ejecutando case @"${caseName}"`)
          let ok = true
          try {
            execSync(`pnpm playwright test --grep "@${caseName}"`, { cwd: dir, stdio: "inherit" })
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
        }
        if (framework.startsWith("serenity")) {
          // no instala
          console.log(`▶️  Ejecutando case @"${caseName}"`)
          let ok = true

          try {
            execSync(`mvn test -Dgroups=${caseName}`, {
              cwd: dir,
              stdio: "inherit"
            })
          } catch {
            ok = false
          }

          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({
            ok,
            ...(!ok && { msg: "Test finalizado con fallos, revisa la consola" })
          }))
          return
        }
      } catch (e) {
        res.writeHead(400)
        res.end(e.message)
      }
      return
    }

    // POST /open  { url }
    if (req.method === "POST" && reqUrl.pathname === "/open") {
      try {
        let { url } = await readBody(req)
        if (!url) {
          res.writeHead(400)
          return res.end("missing url")
        }
        
        // 🆕 Normalizar también en el backend
        url = url.trim().replace(/^['"]|['"]$/g, '').replace(/\s+/g, '')
        if (!/^https?:\/\//i.test(url)) {
          url = /^(localhost|\[\d+\.\d+\.\d+\.\d+\]|\d+\.\d+\.\d+\.\d+)(:\d+)?(\/.*)?$/i.test(url)
            ? 'http://' + url
            : 'https://' + url
        }
        
        // Emitir evento para que run.js abra la URL
        server.emit("open-url", url)
        
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: true, url }))
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

    // POST /secrets  { token, value }
    if (req.method === "POST" && reqUrl.pathname === "/secrets") {
      try {
        const { token, value } = await readBody(req)
        saveSecret(token, value)
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ ok: true }))
      } catch (e) {
        res.writeHead(400); res.end(e.message)
      }
      return
    }

    // GET /secrets
    if (req.method === "GET" && reqUrl.pathname === "/secrets") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(loadSecrets()))
      return
    }

    // GET /report?url=...&framework=...  — sirve playwright-report como estático
    if (req.method === "GET" && reqUrl.pathname.startsWith("/report")) {
      const pageUrl = reqUrl.searchParams.get("url")
      const framework = reqUrl.searchParams.get("framework")
      if (!pageUrl || !framework) { res.writeHead(400); return res.end("missing params") }

      const dir = resolveProjectDir(pageUrl, framework)
      const reportDir = path.join(dir, "playwright-report")
      // El sub-path dentro del reporte (ej: /report/data/xxx.zip → data/xxx.zip)
      const subPath = reqUrl.pathname.replace(/^\/report\/?/, "") || "index.html"
      const filePath = path.join(reportDir, subPath)

      if (!fs.existsSync(filePath) || !filePath.startsWith(reportDir)) {
        res.writeHead(404); return res.end("not found")
      }

      const ext = path.extname(filePath).toLowerCase()
      const mime = {
        ".html": "text/html", ".js": "application/javascript",
        ".css": "text/css", ".json": "application/json",
        ".png": "image/png", ".svg": "image/svg+xml",
        ".zip": "application/zip", ".webm": "video/webm"
      }[ext] || "application/octet-stream"

      res.writeHead(200, { "Content-Type": mime })
      fs.createReadStream(filePath).pipe(res)
      return
    }

    // GET /health
    if (req.method === "GET" && reqUrl.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ status: "ok", uptime: process.uptime() }))
      return
    }

    // GET /projects — lista todos los proyectos generados con metadata
    if (req.method === "GET" && reqUrl.pathname === "/projects") {
      const projects = listProjects()
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify(projects))
      return
    }

    res.writeHead(404)
    res.end()
  })

  server.listen(PORT, () => console.log(`🗄️  Cases server → http://localhost:${PORT}`))
  return server
}

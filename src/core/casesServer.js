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

function apiCaseDir(url, caseName) {
  const host = new URL(url).hostname.replaceAll(".", "_")
  return path.join(process.cwd(), "generated", host, "api", caseName)
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

      // Contar casos de API
      let apiCaseCount = 0
      const apiDir = path.join(projectPath, "api")
      if (fs.existsSync(apiDir)) {
        for (const entry of fs.readdirSync(apiDir, { withFileTypes: true })) {
          if (entry.isDirectory()) apiCaseCount++
        }
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
        apiCaseCount,
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

  const apiCards = projects.flatMap(p => {
    const apiDir = path.join(process.cwd(), "generated", p.name, "api")
    if (!fs.existsSync(apiDir)) return []
    return fs.readdirSync(apiDir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => {
        const caseName = e.name
        const baseFile = path.join(apiDir, caseName, "scenario.json")
        let method = "?"
        let url = ""
        try {
          const base = JSON.parse(fs.readFileSync(baseFile, "utf8"))
          method = base.method || "?"
          url = base.url || ""
        } catch { }
        return `
          <div class="api-card bg-slate-800/50 rounded-xl p-5 border border-slate-700/50 hover:border-amber-500/30 transition-all"
               data-name="${caseName.toLowerCase()}"
               data-url="${(p.originalUrl || '').toLowerCase()}">
            <div class="flex items-start justify-between mb-3">
              <div class="flex-1 min-w-0">
                <h3 class="text-lg font-semibold text-white truncate">🔌 ${caseName}</h3>
                <p class="text-xs text-slate-500 mt-0.5 font-mono truncate" title="${url}">${method} ${url}</p>
              </div>
              <span class="text-xs text-slate-500 whitespace-nowrap ml-3">${p.name}</span>
            </div>
            <div class="flex gap-2 mt-4">
              <button onclick="openApiEditor('${p.originalUrl}', '${caseName}')"
                 class="flex-1 text-xs px-3 py-2 rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600/40 transition font-medium">
                ✏️ Editar
              </button>
              <button onclick="runApiCase('${p.originalUrl}', '${caseName}', 'playwright-pom')"
                 class="flex-1 text-xs px-3 py-2 rounded-lg bg-emerald-600/20 text-emerald-300 hover:bg-emerald-600/40 transition font-medium">
                ▶ Ejecutar
              </button>
            </div>
          </div>
        `
      })
  }).join("")

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

    <!-- 🆕 Tabs E2E / API -->
    <div class="flex gap-1 mb-6 border-b border-slate-800">
      <button id="tab-e2e" onclick="switchTab('e2e')"
              class="px-5 py-2.5 text-sm font-medium border-b-2 border-emerald-500 text-emerald-300 transition">
        🎭 E2E
      </button>
      <button id="tab-api" onclick="switchTab('api')"
              class="px-5 py-2.5 text-sm font-medium border-b-2 border-transparent text-slate-500 hover:text-slate-300 transition">
        🔌 API
      </button>
    </div>
    <div id="pane-e2e">
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
    </div><!-- /pane-e2e -->

        <!-- 🆕 Pane API -->
    <div id="pane-api" class="hidden">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-white flex items-center gap-2">
          🔌 Casos de API
          <span class="text-xs text-slate-500 font-normal" id="apiCount">(${projects.reduce((s, p) => s + (p.apiCaseCount || 0), 0)})</span>
        </h2>
        <button onclick="newApiCase()"
                class="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
          ➕ Nueva petición (pegar cURL)
        </button>
      </div>

      ${apiCards
      ? `<div class="grid sm:grid-cols-2 gap-4" id="apiGrid">${apiCards}</div>`
      : `<div class="text-center py-16 text-slate-400">
             <div class="text-5xl mb-4">🔌</div>
             <p class="text-lg">No hay casos de API aún</p>
             <p class="text-sm mt-2">Pega un cURL desde Postman, Bruno o DevTools para empezar</p>
           </div>`}
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

    function switchTab(tab) {
      const isApi = tab === 'api'
      document.getElementById('pane-e2e').classList.toggle('hidden', isApi)
      document.getElementById('pane-api').classList.toggle('hidden', !isApi)

      const tE2E = document.getElementById('tab-e2e')
      const tApi = document.getElementById('tab-api')
      const on  = 'border-emerald-500 text-emerald-300'
      const off = 'border-transparent text-slate-500 hover:text-slate-300'

      tE2E.className = 'px-5 py-2.5 text-sm font-medium border-b-2 transition ' + (isApi ? off : on)
      tApi.className = 'px-5 py-2.5 text-sm font-medium border-b-2 transition ' + (isApi ? on : off)
    }

    function newApiCase() {
      window.location.href = '/api'
    }

    function openApiEditor(url, caseName) {
      const params = new URLSearchParams({ url, case: caseName })
      window.location.href = '/api?' + params
    }

    async function runApiCase(url, caseName, framework) {
      const res = await fetch('/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, caseName, framework })
      })
      const data = await res.json()
      if (data.reportUrl) window.open(data.reportUrl, '_blank')
    }
  </script>
</body>
</html>`
}

function renderApiWorkspace() {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>🔌 API Workspace — Marionetista</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background: #0b1120; }
    .mono { font-family: 'JetBrains Mono', 'Fira Code', monospace; }
  </style>
</head>
<body class="mono text-slate-300 min-h-screen">
  <div class="max-w-6xl mx-auto px-6 py-8">

    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white flex items-center gap-2">🔌 API Workspace</h1>
        <p class="text-xs text-slate-500 mt-1">Pega un cURL, revisa el parseo y define qué validar</p>
      </div>
      <a href="/" class="text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition">
        ← Dashboard
      </a>
    </div>

    <!-- 1. Pegar cURL -->
    <section class="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 mb-4">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-semibold text-white">1. Pegar cURL</h2>
        <button onclick="parseCurl()"
                class="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition">
          Parsear
        </button>
      </div>
      <textarea id="curlInput" rows="10"
        placeholder="curl -X 'POST' 'https://...' -H 'accept: application/json' -d '{...}'"
        class="w-full bg-slate-900/70 border border-slate-700 rounded-lg p-3 text-xs text-emerald-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 resize-y"></textarea>
      <p id="parseError" class="text-xs text-red-400 mt-2 hidden"></p>
    </section>

    <!-- Resultado (oculto hasta parsear) -->
    <div id="result" class="hidden space-y-4">

      <!-- 2. Info general -->
      <section class="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
        <h2 class="text-sm font-semibold text-white mb-3">2. Info general</h2>
        <div class="grid sm:grid-cols-2 gap-3 text-xs">
          <label class="block">
            <span class="text-slate-500">Nombre del caso</span>
            <input id="caseName" type="text"
              class="w-full mt-1 bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500/50">
          </label>
          <label class="block">
            <span class="text-slate-500">Tag</span>
            <input id="caseTag" type="text"
              class="w-full mt-1 bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-amber-500/50">
          </label>
          <label class="block">
            <span class="text-slate-500">Método</span>
            <input id="method" type="text" readonly
              class="w-full mt-1 bg-slate-900/40 border border-slate-700 rounded-lg px-3 py-2 text-slate-400">
          </label>
          <label class="block">
            <span class="text-slate-500">Path</span>
            <input id="path" type="text" readonly
              class="w-full mt-1 bg-slate-900/40 border border-slate-700 rounded-lg px-3 py-2 text-slate-400">
          </label>
          <label class="block sm:col-span-2">
            <span class="text-slate-500">URL</span>
            <input id="url" type="text" readonly
              class="w-full mt-1 bg-slate-900/40 border border-slate-700 rounded-lg px-3 py-2 text-slate-400">
          </label>
          <div class="sm:col-span-2 mt-2">
            <label class="flex items-center gap-2 text-sm text-blue-300 cursor-pointer bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 hover:border-blue-500/50 transition">
              <input type="checkbox" id="isSetupCheck" class="w-4 h-4 rounded border-slate-600 bg-slate-800 checked:bg-blue-600">
              <span>Guardar esta petición como <strong>Setup</strong> (se ejecutará en el <code>beforeAll</code> para obtener tokens/contexto)</span>
            </label>
          </div>
        </div>
      </section>

      <!-- 3. Headers -->
      <section class="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
        <h2 class="text-sm font-semibold text-white mb-3">
          3. Headers
          <span class="text-xs text-slate-500 font-normal">— marca los requeridos</span>
        </h2>
        <div id="headersList" class="space-y-1.5"></div>
      </section>

      <!-- 4. Data -->
      <section id="dataSection" class="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
        <h2 class="text-sm font-semibold text-white mb-3">
          4. Body (data)
          <span class="text-xs text-slate-500 font-normal">— marca los requeridos</span>
        </h2>
        <div id="dataList" class="space-y-1.5"></div>
      </section>

      <!-- 5. Cases a validar -->
      <section class="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
        <h2 class="text-sm font-semibold text-white mb-3">5. Cases a validar</h2>
        <div id="casesList" class="flex flex-wrap gap-3 text-xs"></div>
      </section>

      <!-- Botón Validar -->
      <div class="flex justify-end">
        <button onclick="executeCases()"
                class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition">
          ✓ Validar
        </button>
      </div>

      <!-- Status de la respuesta -->
      <div id="responseStatus" class="hidden mb-4"></div>

      <!-- Área de validaciones -->
      <section id="validationSection" class="hidden bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
        
        <!-- Tabs de casos -->
        <div id="caseTabs" class="flex gap-2 mb-4 border-b border-slate-700 pb-2"></div>

        <!-- Info del caso actual -->
        <div id="caseInfo" class="text-xs text-slate-400 mb-3 italic"></div>

        <!-- Árbol de campos -->
        <div id="responseTreeWrapper">
          <h2 class="text-sm font-semibold text-white mb-3">
            Validaciones por campo
          </h2>
          <div id="responseTree"></div>
        </div>

        <!-- Si no es JSON, mostramos esto -->
        <div id="nonJsonWrapper" class="hidden">
          <p class="text-amber-400 text-sm mb-2">⚠️ La respuesta no es un JSON válido. Puedes validar el texto crudo:</p>
          <div class="bg-slate-900/40 rounded-lg p-2 mb-2 validation-row">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-slate-500 min-w-[180px] font-mono">raw_text</span>
              <span class="text-amber-300 min-w-[60px]">string</span>
              <select data-kind="val" data-case="\${currentCaseTab}" data-key="raw_text" data-type="string" class="op-select bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                <option value="">— no validar —</option>
                <option value="contains">contiene</option>
                <option value="equals">igual a</option>
                <option value="notEmpty">no está vacío</option>
              </select>
              <input data-case="\${currentCaseTab}" data-key="raw_text" data-type="string" class="op-value bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white w-32 hidden" placeholder="texto">
            </div>
          </div>
          <textarea id="rawResponse" readonly class="w-full h-32 bg-slate-900/70 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 font-mono"></textarea>
        </div>

        <div class="flex justify-end gap-2 mt-4">
          <button onclick="previewValidations()"
                  class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium rounded-lg transition">
            Previsualizar
          </button>
          <button onclick="saveScenario()"
                  class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition">
            💾 Guardar Escenario
          </button>
        </div>
      </section>

      <!-- Preview del JSON final -->
      <section id="previewSection" class="hidden bg-slate-900/70 rounded-xl p-4 border border-emerald-700/40">
        <h2 class="text-sm font-semibold text-emerald-300 mb-2">JSON resultante</h2>
        <pre id="preview" class="text-xs text-emerald-200 overflow-auto max-h-96"></pre>
      </section>
    </div>
  </div>

  <script>
    let parsed = null;
    let setupCaseName = null;
    let currentIsSetup = false;

    async function parseCurl() {
      const curl = document.getElementById('curlInput').value.trim();
      const errEl = document.getElementById('parseError');
      errEl.classList.add('hidden');
      if (!curl) return;

      try {
        const res = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ curl })
        });
        if (!res.ok) throw new Error(await res.text());
        parsed = await res.json();
        renderParsed(parsed);
        document.getElementById('result').classList.remove('hidden');
      } catch (e) {
        errEl.textContent = 'Error: ' + e.message;
        errEl.classList.remove('hidden');
      }
    }

    function renderParsed(p) {
      document.getElementById('caseName').value = p.caseName;
      document.getElementById('caseTag').value = p.tag;
      document.getElementById('method').value = p.method;
      document.getElementById('path').value = p.path;
      document.getElementById('url').value = p.url;

      // Headers
      const hList = document.getElementById('headersList');
      hList.innerHTML = '';
      for (const [k, v] of Object.entries(p.headers || {})) {
        const id = 'h_' + k.replace(/[^a-z0-9]/gi, '_');
        hList.insertAdjacentHTML('beforeend', \`
          <label class="flex items-center gap-2 text-xs bg-slate-900/50 rounded-lg px-3 py-2">
            <input type="checkbox" data-kind="header" data-key="\${k}" id="\${id}">
            <span class="text-slate-400 min-w-[140px]">\${k}</span>
            <span class="text-slate-200 truncate">\${v}</span>
          </label>
        \`);
      }

      // Data (árbol recursivo con required por hoja)
      const dList = document.getElementById('dataList');
      dList.innerHTML = '';
      const dataObj = p.data && typeof p.data === 'object' ? p.data : null;
      if (!dataObj) {
        document.getElementById('dataSection').style.display = 'none';
      } else {
        document.getElementById('dataSection').style.display = '';
        renderDataTree(dataObj, dList, '');
      }

      // Cases
      const cList = document.getElementById('casesList');
      cList.innerHTML = '';
      for (const c of p.cases) {
        const id = 'c_' + c;
        cList.insertAdjacentHTML('beforeend', \`
          <label class="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2 cursor-pointer hover:bg-slate-900/80">
            <input type="checkbox" data-kind="case" data-key="\${c}" id="\${id}" checked>
            <span class="text-slate-200">\${c}</span>
          </label>
        \`);
      }
    }

    function collectChecked(kind) {
      return [...document.querySelectorAll(\`input[data-kind="\${kind}"]:checked\`)]
        .map(el => el.dataset.key);
    }

        function saveCurrentTabState() {
      if (!currentCaseTab) return;
      
      // Guardar SOLO Validaciones
      if (!savedValidations[currentCaseTab]) savedValidations[currentCaseTab] = {};
      document.querySelectorAll(\`.op-select[data-case="\${currentCaseTab}"]\`).forEach(sel => {
        if (sel.value) {
          const row = sel.closest('.validation-row');
          const input = row?.querySelector('.op-value');
          savedValidations[currentCaseTab][sel.dataset.key] = {
            op: sel.value,
            val: input && !input.classList.contains('hidden') ? input.value : ""
          };
        } else {
          delete savedValidations[currentCaseTab][sel.dataset.key];
        }
      });
    }

    let responseBody = null;
    let savedValidations = {};
    let savedVariables = {};

    async function validateCase() {
      if (!parsed) return;

      // 1. Ejecutar el cURL
      const execRes = await fetch('/api/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: document.getElementById('method').value,
          url: document.getElementById('url').value,
          headers: parsed.headers,
          data: parsed.data,
        }),
      });
      const execData = await execRes.json();

      // 2. Mostrar status y preparar árbol
      const statusEl = document.getElementById('responseStatus');
      statusEl.innerHTML = \`
        <span class="px-2 py-1 rounded \${execData.ok ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}">
          \${execData.status} \${execData.ok ? 'OK' : 'ERROR'}
        </span>
      \`;
      statusEl.classList.remove('hidden');

      responseBody = execData.body;

      // 3. Renderizar árbol de campos
      const treeEl = document.getElementById('responseTree');
      treeEl.innerHTML = '';
      renderTree(responseBody, treeEl, '');

      // 4. Mostrar la sección de validación
      document.getElementById('validationSection').classList.remove('hidden');
      document.getElementById('previewSection').classList.add('hidden');
    }

    function renderTree(obj, container, prefix) {
      if (obj === null || typeof obj !== 'object') return;

      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? \`\${prefix}.\${key}\` : key;
        const type = Array.isArray(value) ? 'array' : typeof value === 'object' && value !== null ? 'object' : typeof value;

        const row = document.createElement('div');
        row.className = 'validation-row bg-slate-900/40 rounded-lg p-2 mb-1';
        row.innerHTML = \`
          <div class="flex items-center gap-2 text-xs flex-wrap">
            <span class="text-slate-500 min-w-[180px] font-mono">\${fullKey}</span>
            <span class="text-amber-300 min-w-[60px]">\${type}</span>
            <span class="text-slate-400 truncate flex-1" title='\${JSON.stringify(value)}'>\${JSON.stringify(value)}</span>
            
            <!-- Validación -->
            <select data-kind="val" data-case="\${currentCaseTab}" data-key="\${fullKey}" data-type="\${type}" class="op-select bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white">
              <option value="">— no validar —</option>
            </select>
            <input data-case="\${currentCaseTab}" data-key="\${fullKey}" data-type="\${type}" class="op-value bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white w-32 hidden" placeholder="valor">

            <!-- Guardar variable -->
            <div class="flex items-center gap-1 ml-2 pl-2 border-l border-slate-700">
              <span class="text-[10px] text-slate-500">var:</span>
              <input type="text" data-var-key="\${fullKey}" class="var-name bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-emerald-300 w-20 placeholder-slate-600" placeholder="nombre">
            </div>
          </div>
        \`;
        container.appendChild(row);

        // Poblar opciones según tipo
        const select = row.querySelector('.op-select');
        const ops = getOpsForType(type);
        for (const [val, label] of ops) {
          select.insertAdjacentHTML('beforeend', \`<option value="\${val}">\${label}</option>\`);
        }

        // Mostrar/ocultar input de valor
        select.addEventListener('change', () => {
          const input = row.querySelector('.op-value');
          const needsValue = !['type', 'exists'].includes(select.value) && select.value !== '';
          input.classList.toggle('hidden', !needsValue);
          if (select.value === 'type') {
            input.classList.add('hidden');
          }
        });

        // Conectar eventos para guardar estado en vivo
        const selectEl = row.querySelector('.op-select');
        const opValueInput = row.querySelector('.op-value');
        const varNameInput = row.querySelector('.var-name');

        if (selectEl) selectEl.addEventListener('change', saveCurrentTabState);
        if (opValueInput) opValueInput.addEventListener('input', saveCurrentTabState);
        
        // Para la variable, hacemos una función que guarde SOLO la variable
        if (varNameInput) {
          varNameInput.addEventListener('input', (e) => {
            if (!currentCaseTab) return;
            if (!savedVariables[currentCaseTab]) savedVariables[currentCaseTab] = {};
            const key = e.target.dataset.varKey;
            if (e.target.value.trim()) {
              savedVariables[currentCaseTab][key] = e.target.value.trim();
            } else {
              delete savedVariables[currentCaseTab][key];
            }
          });
        }
      }
    }

    function getOpsForType(type) {
      if (type === 'number') {
        return [
          ['type', 'es tipo número'],
          ['equals', 'igual a'],
          ['gt', 'mayor que'],
          ['gte', 'mayor o igual'],
          ['lt', 'menor que'],
          ['lte', 'menor o igual'],
        ];
      }
      if (type === 'string') {
        return [
          ['type', 'es tipo string'],
          ['equals', 'igual a'],
          ['contains', 'contiene'],
        ];
      }
      if (type === 'boolean') {
        return [
          ['type', 'es tipo boolean'],
          ['equals', 'igual a'],
        ];
      }
      if (type === 'array') {
        return [
          ['type', 'es tipo array'],
        ];
      }
      if (type === 'object') {
        return [
          ['type', 'es tipo object'],
        ];
      }
      return [];
    }

    function collectValidations() {
      saveCurrentTabState();

      const result = [];
      for (const [caseType, fields] of Object.entries(savedValidations)) {
        for (const [path, data] of Object.entries(fields)) {
          if (path === '_vars') continue; // <-- ESCUDO PROTECTOR

          let fieldType = 'string';
          if (path !== 'raw_text' && allResults[caseType]?.isJson) {
            fieldType = typeof getNestedValue(allResults[caseType].body, path);
          }

          result.push({
            caseType: caseType,
            path: path,
            type: fieldType,
            operation: data.op,
            value: data.val !== "" ? data.val : undefined,
          });
        }
      }

      window.marionetaVariables = {};
      for (const [caseType, vars] of Object.entries(savedVariables)) {
        Object.assign(window.marionetaVariables, vars);
      }

      window.marionetaIsSetup = document.getElementById('isSetupCheck').checked;

      return result;
    }

    // Helper para sacar el tipo de un campo anidado ej: "category.name" o "tags[0].id"
    function getNestedValue(obj, path) {
      // Convertimos "tags[0].id" a "tags.0.id" para poder hacer split(".")
      const normalizedPath = path.replace(/\\[(\\d+)\\]/g, '.$1');
      return normalizedPath.split('.').reduce((acc, part) => acc && acc[part], obj);
    }

    function previewValidations() {
      // 1. Recolectamos todo
      const validations = collectValidations();
      
      // 2. Armamos el JSON
      const final = {
        url: document.getElementById('url').value,
        path: document.getElementById('path').value,
        method: document.getElementById('method').value,
        headers: parsed.headers,
        data: parsed.data,
        requireFields: collectChecked('data'),
        requireHeaders: collectChecked('header'),
        caseName: document.getElementById('caseName').value,
        tag: document.getElementById('caseTag').value,
        cases: (() => {
          const selected = collectChecked('case');
          const result = {};
          for (const c of selected) {
            // Si ejecutamos el caso, usamos su status real. Si no, ponemos un string como fallback.
            result[c] = allResults[c] ? allResults[c].status : 'unknown';
          }
          return result;
        })(),
        validations: validations,
        
        isSetup: document.getElementById('isSetupCheck').checked, // <-- AHORA LEE EL CHECK DE ARRIBA
        variables: window.marionetaVariables || {}
      };
      
      const el = document.getElementById('previewSection');
      document.getElementById('preview').textContent = JSON.stringify(final, null, 2);
      el.classList.remove('hidden');
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function saveScenario() {
      // Reutilizamos la lógica de previsualización para armar el JSON
      const validations = collectValidations();
      const payload = {
        url: document.getElementById('url').value,
        path: document.getElementById('path').value,
        method: document.getElementById('method').value,
        headers: parsed.headers,
        data: parsed.data,
        requireFields: collectChecked('data'),
        requireHeaders: collectChecked('header'),
        caseName: document.getElementById('caseName').value,
        tag: document.getElementById('caseTag').value,
        cases: (() => {
          const selected = collectChecked('case');
          const result = {};
          for (const c of selected) {
            result[c] = allResults[c] ? allResults[c].status : 'unknown';
          }
          return result;
        })(),
        validations: validations,
        isSetup: document.getElementById('isSetupCheck').checked,
        variables: window.marionetaVariables || {}
      };

      try {
        const res = await fetch('/api/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: payload.url,
            caseName: payload.caseName,
            payload: payload
          })
        });

        if (!res.ok) throw new Error(await res.text());
        const result = await res.json();
        
        // Mostrar feedback
        alert('✅ Escenario guardado en:\\n' + result.path);
      } catch (e) {
        alert('❌ Error al guardar: ' + e.message);
      }
    }

    function renderDataTree(obj, container, prefix) {
      if (obj === null || typeof obj !== 'object') return;

      for (const [key, value] of Object.entries(obj)) {
        const fullKey = prefix ? \`\${prefix}.\${key}\` : key;

        if (Array.isArray(value)) {
          // Contenedor de array: mostrar título y recursión por índice
          const header = document.createElement('div');
          header.className = 'text-xs text-slate-500 font-mono mt-2 mb-1';
          header.textContent = \`\${fullKey} []\`;
          container.appendChild(header);

          const childContainer = document.createElement('div');
          childContainer.className = 'ml-4';
          container.appendChild(childContainer);

          value.forEach((item, idx) => {
            const itemKey = \`\${fullKey}[\${idx}]\`;
            if (item !== null && typeof item === 'object') {
              const itemHeader = document.createElement('div');
              itemHeader.className = 'text-xs text-slate-600 font-mono mt-1';
              itemHeader.textContent = itemKey;
              childContainer.appendChild(itemHeader);
              const inner = document.createElement('div');
              inner.className = 'ml-4';
              childContainer.appendChild(inner);
              renderDataTree(item, inner, itemKey);
            } else {
              // Array de primitivos: checkbox por índice
              const row = document.createElement('label');
              row.className = 'flex items-center gap-2 text-xs bg-slate-900/50 rounded-lg px-3 py-2';
              const safeId = 'd_' + itemKey.replace(/[^a-z0-9]/gi, '_');
              row.innerHTML = \`
                <input type="checkbox" data-kind="data" data-key="\${itemKey}" id="\${safeId}">
                <span class="text-slate-400 min-w-[160px] font-mono">\${itemKey}</span>
                <span class="text-slate-200 truncate">\${String(item)}</span>
              \`;
              childContainer.appendChild(row);
            }
          });

        } else if (value !== null && typeof value === 'object') {
          // Objeto anidado: título + recursión
          const header = document.createElement('div');
          header.className = 'text-xs text-slate-500 font-mono mt-2 mb-1';
          header.textContent = \`\${fullKey}\`;
          container.appendChild(header);

          const childContainer = document.createElement('div');
          childContainer.className = 'ml-4';
          container.appendChild(childContainer);

          renderDataTree(value, childContainer, fullKey);

        } else {
          // Hoja: checkbox de required
          const row = document.createElement('label');
          row.className = 'flex items-center gap-2 text-xs bg-slate-900/50 rounded-lg px-3 py-2';
          const safeId = 'd_' + fullKey.replace(/[^a-z0-9]/gi, '_');
          row.innerHTML = \`
            <input type="checkbox" data-kind="data" data-key="\${fullKey}" id="\${safeId}">
            <span class="text-slate-400 min-w-[160px] font-mono">\${fullKey}</span>
            <span class="text-slate-200 truncate">\${String(value)}</span>
          \`;
          container.appendChild(row);
        }
      }
    }

    let allResults = {}; // { happy: {...}, missingField: {...} }
    let currentCaseTab = null;

    async function executeCases() {
      if (!parsed) return;

      const selectedCases = collectChecked('case');
      if (selectedCases.length === 0) return alert('Marca al menos un case');

      // Si estamos ejecutando un caso con "login", "auth" o similar en el nombre, lo marcamos como setup
      // (Esto es heurístico, el usuario luego puede corregirlo con el check)
      if (selectedCases.some(c => c.toLowerCase().includes('login') || c.toLowerCase().includes('auth'))) {
        setupCaseName = selectedCases.find(c => c.toLowerCase().includes('login') || c.toLowerCase().includes('auth'));
      } else {
        setupCaseName = null;
      }

      const requireFields = collectChecked('data');
      const requireHeaders = collectChecked('header');
      
      allResults = {}; // Limpiar resultados anteriores
      const statusEl = document.getElementById('responseStatus');
      statusEl.classList.remove('hidden');
      statusEl.innerHTML = '<p class="text-xs text-slate-500 animate-pulse">Ejecutando cases...</p>';

      const caseTabsEl = document.getElementById('caseTabs');
      caseTabsEl.innerHTML = '';

      // Ejecutar todos
      for (const caseType of selectedCases) {
        const res = await fetch('/api/execute-case', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            method: document.getElementById('method').value,
            url: document.getElementById('url').value,
            path: document.getElementById('path').value,
            headers: parsed.headers,
            data: parsed.data,
            caseType,
            requireFields,
            requireHeaders,
          }),
        });
        const result = await res.json();
        result.caseType = caseType;
        allResults[caseType] = result;
      }

      // Renderizar resumen de status
      statusEl.innerHTML = Object.values(allResults).map(r => \`
        <div class="flex items-center gap-3 text-xs bg-slate-900/50 rounded-lg px-3 py-2 mb-1">
          <span class="text-slate-400 min-w-[120px]">\${r.caseType}</span>
          <span class="px-2 py-0.5 rounded \${r.ok ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}">
            \${r.status}
          </span>
          \${r.mutated ? \`<span class="text-amber-500/80 italic">borró \${r.mutated.type}: \${r.mutated.path}</span>\` : ''}
          <span class="text-slate-500 truncate">\${JSON.stringify(r.body).slice(0, 80)}</span>
        </div>
      \`).join('');

      // Renderizar pestañas
      for (const caseType of Object.keys(allResults)) {
        const r = allResults[caseType];
        const btn = document.createElement('button');
        btn.className = 'px-3 py-1.5 text-xs rounded-t-lg transition ' + (caseType === selectedCases[0] ? 'bg-slate-800 text-amber-300' : 'text-slate-400 hover:text-white');
        btn.textContent = \`\${caseType} (\${r.status})\`;
        btn.onclick = () => switchCaseTab(caseType, btn);
        caseTabsEl.appendChild(btn);
      }

      // Mostrar el primer tab por defecto
      switchCaseTab(selectedCases[0], caseTabsEl.firstChild);
      document.getElementById('validationSection').classList.remove('hidden');
      document.getElementById('previewSection').classList.add('hidden');
    }

    function switchCaseTab(caseType, btnEl) {
      // 1. GUARDAR el estado del tab actual antes de cambiar
      if (currentCaseTab) {
        saveCurrentTabState();
      }

      currentCaseTab = caseType;
      
      // UI de tabs
      document.querySelectorAll('#caseTabs button').forEach(b => {
        b.className = 'px-3 py-1.5 text-xs rounded-t-lg transition text-slate-400 hover:text-white';
      });
      btnEl.className = 'px-3 py-1.5 text-xs rounded-t-lg transition bg-slate-800 text-amber-300';

      const result = allResults[caseType];
      const treeWrapper = document.getElementById('responseTreeWrapper');
      const nonJsonWrapper = document.getElementById('nonJsonWrapper');
      const infoEl = document.getElementById('caseInfo');

      if (!result.isJson) {
        // --- NO ES JSON ---
        treeWrapper.classList.add('hidden');
        nonJsonWrapper.classList.remove('hidden');
        infoEl.textContent = "El caso no devolvió JSON. No se pueden mapear campos.";
        
        nonJsonWrapper.innerHTML = \`
          <p class="text-amber-400 text-sm mb-2">⚠️ La respuesta no es un JSON válido. Puedes validar el texto crudo:</p>
          <div class="bg-slate-900/40 rounded-lg p-2 mb-2 validation-row">
            <div class="flex items-center gap-2 text-xs">
              <span class="text-slate-500 min-w-[180px] font-mono">raw_text</span>
              <span class="text-amber-300 min-w-[60px]">string</span>
              <span class="text-slate-400 truncate flex-1">\${result.body}</span>
              <select data-kind="val" data-case="\${caseType}" data-key="raw_text" data-type="string" class="op-select bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                <option value="">— no validar —</option>
                <option value="contains">contiene</option>
                <option value="equals">igual a</option>
                <option value="notEmpty">no está vacío</option>
              </select>
              <input data-case="\${caseType}" data-key="raw_text" data-type="string" class="op-value bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white w-32 hidden" placeholder="texto">
            </div>
          </div>
          <textarea readonly class="w-full h-32 bg-slate-900/70 border border-slate-700 rounded-lg p-3 text-xs text-slate-300 font-mono">\${result.body}</textarea>
        \`;

        const rawSelect = nonJsonWrapper.querySelector('.op-select');
        const rawInput = nonJsonWrapper.querySelector('.op-value');
        
        rawSelect.addEventListener('change', () => {
          const needsValue = !['type', 'exists', 'notEmpty'].includes(rawSelect.value) && rawSelect.value !== '';
          rawInput.classList.toggle('hidden', !needsValue);
          saveCurrentTabState();
        });
        
        if (rawInput) {
          rawInput.addEventListener('input', (e) => {
            if (!currentCaseTab) return;
            if (!savedVariables[currentCaseTab]) savedVariables[currentCaseTab] = {};
            const key = e.target.dataset.varKey; // Aunque aquí no hay variable visible, por si acaso
            if (key) {
              if (e.target.value.trim()) savedVariables[currentCaseTab][key] = e.target.value.trim();
              else delete savedVariables[currentCaseTab][key];
            }
          });
        }

        if (savedValidations[caseType] && savedValidations[caseType]['raw_text']) {
          const saved = savedValidations[caseType]['raw_text'];
          rawSelect.value = saved.op;
          rawSelect.dispatchEvent(new Event('change'));
          if (rawInput) rawInput.value = saved.val;
        }

      } else {
        // --- ES JSON ---
        treeWrapper.classList.remove('hidden');
        nonJsonWrapper.classList.add('hidden');
        infoEl.textContent = \`Validando campos de la respuesta "\${caseType}"\`;
        
        const treeEl = document.getElementById('responseTree');
        treeEl.innerHTML = ''; // Borra el DOM viejo
        renderTree(result.body, treeEl, ''); // Crea el DOM nuevo

        // Restaurar validaciones
        if (savedValidations[caseType]) {
          document.querySelectorAll('.op-select').forEach(sel => {
            const saved = savedValidations[caseType][sel.dataset.key];
            if (saved) {
              sel.value = saved.op;
              sel.dispatchEvent(new Event('change'));
              const row = sel.closest('.validation-row');
              const input = row?.querySelector('.op-value');
              if (input) input.value = saved.val;
            }
          });
        }

        // Restaurar variables guardadas
        const caseVars = savedVariables[caseType] || {};
        document.querySelectorAll('.var-name').forEach(input => {
          if (caseVars[input.dataset.varKey] !== undefined) {
            input.value = caseVars[input.dataset.varKey];
          }
        });
      }
    }
  </script>
</body>
</html>`;
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

    // 🔌 GET /api — workspace de API
    if (req.method === "GET" && reqUrl.pathname === "/api") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
      res.end(renderApiWorkspace())
      return
    }

    // 🔌 POST /api/parse  { curl }
    if (req.method === "POST" && reqUrl.pathname === "/api/parse") {
      try {
        const { curl } = await readBody(req);
        const curlconverter = await import("curlconverter");
        const parsed = curlconverter.toJsonObject(curl);

        const url = parsed.url;
        const method = (parsed.method || "GET").toUpperCase();
        const headers = parsed.headers || {};
        let data = parsed.data ?? null;

        // curlconverter a veces devuelve data como string JSON
        if (typeof data === "string") {
          try { data = JSON.parse(data); } catch { /* deja el string */ }
        }

        const urlObj = new URL(url);
        const path = urlObj.pathname;
        const baseUrl = urlObj.origin; // <-- Esto extrae https://fakestoreapi.com

        const lastSegment = path.split("/").filter(Boolean).pop() || "default";
        const caseName = lastSegment;
        const tag = "@default";

        const hasAuth = Object.keys(headers).some(k => k.toLowerCase() === "authorization");
        const cases = ["happy", "missingField", "missingHeader"];
        if (hasAuth) cases.push("noAuth");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          url: baseUrl, // <-- Ahora enviamos solo la base
          path,         // <-- El path separado
          method,
          headers,
          data,
          caseName,
          tag,
          cases,
        }));
      } catch (e) {
        res.writeHead(400);
        res.end(e.message);
      }
      return;
    }

    // 🔌 POST /api/execute  { method, url, headers, data }
    if (req.method === "POST" && reqUrl.pathname === "/api/execute") {
      try {
        const { method, url, headers, data } = await readBody(req);

        const fetchOpts = {
          method: method || "GET",
          headers: headers || {},
        };

        // Solo adjuntar body si NO es GET/HEAD
        if (fetchOpts.method !== "GET" && fetchOpts.method !== "HEAD" && data != null) {
          fetchOpts.body = typeof data === "string" ? data : JSON.stringify(data);
        }

        const response = await fetch(url, fetchOpts);
        const status = response.status;
        const ok = response.ok;
        const contentType = response.headers.get("content-type") || "";
        let body = null;

        if (contentType.includes("application/json")) {
          try { body = await response.json(); } catch { body = await response.text(); }
        } else {
          body = await response.text();
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          ok,
          status,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        }));
      } catch (e) {
        res.writeHead(400);
        res.end(e.message);
      }
      return;
    }

    // 🔌 POST /api/execute-case  { method, url, headers, data, caseType, requireFields, requireHeaders }
    if (req.method === "POST" && reqUrl.pathname === "/api/execute-case") {
      try {
        const { method, url, headers, data, caseType, requireFields, requireHeaders, path } = await readBody(req);
        const { deleteProperty } = await import("dot-prop");

        // Clonar para no mutar el original
        const finalHeaders = { ...(headers || {}) };
        let finalData = data != null ? JSON.parse(JSON.stringify(data)) : null;
        let mutated = null; // Para guardar qué se borró

        const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

        // Aplicar mutación según el case
        if (caseType === "missingField" && requireFields?.length && finalData) {
          const fieldToRemove = pickRandom(requireFields);
          deleteProperty(finalData, fieldToRemove);
          mutated = { type: 'field', path: fieldToRemove };
        }
        
        if (caseType === "missingHeader" && requireHeaders?.length) {
          const headerToRemove = pickRandom(requireHeaders);
          // Borrar case-insensitive
          for (const k of Object.keys(finalHeaders)) {
            if (k.toLowerCase() === headerToRemove.toLowerCase()) delete finalHeaders[k];
          }
          mutated = { type: 'header', path: headerToRemove };
        }
        
        if (caseType === "noAuth") {
          for (const k of Object.keys(finalHeaders)) {
            if (k.toLowerCase() === "authorization") delete finalHeaders[k];
          }
          mutated = { type: 'header', path: 'Authorization' };
        }
        // happy no muta nada

        const cleanBase = (url || "").replace(/\/$/, ""); 
        const cleanPath = (path || "").startsWith("/") ? path : "/" + (path || "");
        const finalUrl = cleanBase + cleanPath;

        const fetchOpts = { method: method || "GET", headers: finalHeaders };
        if (fetchOpts.method !== "GET" && fetchOpts.method !== "HEAD" && finalData != null) {
          fetchOpts.body = typeof finalData === "string" ? finalData : JSON.stringify(finalData);
        }

        const response = await fetch(finalUrl, fetchOpts);
        const status = response.status;
        const contentType = response.headers.get("content-type") || "";
        const rawText = await response.text();
        let body = null;
        let isJson = false;

        if (contentType.includes("application/json")) {
          try {
            body = JSON.parse(rawText);
            isJson = true;
          } catch {
            body = rawText; // Vino JSON roto o mal formado, guardamos el string
          }
        } else {
          // Intentar parsear de todas formas por si acaso mienten en el header
          try {
            body = JSON.parse(rawText);
            isJson = true;
          } catch {
            body = rawText; 
          }
        }

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          caseType,
          ok: response.ok,
          status,
          isJson,
          mutated,
          headers: Object.fromEntries(response.headers.entries()),
          body,
        }));
      } catch (e) {
        res.writeHead(400);
        res.end(e.message);
        console.log(e)
      }
      return;
    }

    // 🔌 POST /api/save  { url, caseName, payload }
    if (req.method === "POST" && reqUrl.pathname === "/api/save") {
      try {
        const { url, caseName, payload } = await readBody(req);
        
        // Necesitamos la URL base (host) para la carpeta
        const host = new URL(url).hostname.replaceAll(".", "_");
        const apiDir = path.join(process.cwd(), "generated", host, "api", caseName);
        
        fs.mkdirSync(apiDir, { recursive: true });
        
        // Guardar el JSON completo
        const filePath = path.join(apiDir, "scenario.json");
        fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
        
        // Opcional: también guardar el raw.curl si tuvieras el string, 
        // pero por ahora con el JSON es suficiente.
        
        console.log("💾 Escenario de API guardado →", filePath);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: filePath }));
      } catch (e) {
        res.writeHead(400);
        res.end(e.message);
      }
      return;
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

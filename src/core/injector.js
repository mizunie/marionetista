import { generate } from './generate.js'
process.loadEnvFile();

function marionetaBoot() {
  if (window.__marionetaBooted) return
  window.__marionetaBooted = true

  const ROOT = "__marionetaRoot"
  const OVERLAY = "__marionetaOverlay"
  const INFO = "__marionetaInfo"

  // Estado principal
  let paused = false           // Congela el inspector con tecla Pause
  let frozen = null            // Selector actualmente fijado

  // Almacena pasos agrupados por case
  const cases = Object.create(null)

  const css = (e, s) => Object.assign(e.style, s)

  function mount() {
    if (!document.body) return false
    if (document.getElementById(ROOT)) return true

    const root = document.createElement("div")
    css(root, { display: "grid", gridTemplateColumns: "80% 20%" })

    const web = document.createElement("div")

    const panel = document.createElement("aside")
    css(panel, {
      position: "fixed",
      right: 0,
      top: 0,
      width: "19%",
      height: "100vh",
      background: "#0f172a",
      color: "#e5e7eb",
      fontFamily: "monospace",
      padding: "8px",
      overflow: "auto",
      zIndex: 999998
    })

    panel.innerHTML = `
<strong>🧪 Marioneta</strong>

<!-- Case actual -->
<input id="m_case" placeholder="case (ej: login)" style="width:100%;margin:4px 0">

<div id="${INFO}"></div>
<hr>

<select id="m_action">
  <option value="click">click</option>
  <option value="assert">assert</option>
  <option value="hover">hover</option>
  <option value="fill">fill</option>
  <option value="clickfill">click & fill</option>
  <option value="if">if</option>
</select>

<div id="m_opts"></div>

<div style="margin-top:6px">
  <button id="m_ok">✅</button>
  <button id="m_cancel">❌</button>
  <button id="m_generate">🚀</button>
</div>
`

    const nodes = [...document.body.childNodes]
    nodes.forEach(n => web.appendChild(n))

    root.append(web, panel)
    document.body.appendChild(root)

    const overlay = document.createElement("div")
    css(overlay, {
      position: "fixed",
      pointerEvents: "none",
      border: "2px solid #22c55e",
      background: "rgba(34,197,94,.15)",
      zIndex: 999999
    })

    document.body.appendChild(overlay)

    bind(panel, overlay)
    return true
  }

  function bind(panel, overlay) {
    const info = panel.querySelector("#" + INFO)
    const actionSel = panel.querySelector("#m_action")
    const opts = panel.querySelector("#m_opts")
    const caseInput = panel.querySelector("#m_case")

    // Renderiza opciones dinámicas según acción
    const renderOpts = () => {
      const a = actionSel.value

      if (a === "click") opts.innerHTML = `
Clicks <input id="m_count" type="number" value="1" min="1" style="width:50px">
<select id="m_btn">
<option>left</option><option>right</option><option>middle</option>
</select>
<select id="m_dur"><option>short</option><option>long</option></select>`

      else if (a === "assert") opts.innerHTML = `
<select id="m_assert">
<option>visible</option>
<option>hidden</option>
<option>count</option>
<option>toHaveText</option>
<option>selected</option>
</select>`

      else if (a === "fill") opts.innerHTML = `
<input id="m_value" placeholder="value">`

      else if (a === "clickfill") opts.innerHTML = `
<input id="m_value" placeholder="value">`

      else if (a === "if") opts.innerHTML = `
<select id="m_if">
<option>visible</option>
<option>checked</option>
<option>exists</option>
</select>`

      else opts.innerHTML = ``

      // Notas siempre disponibles
      opts.innerHTML += `<textarea id="m_notas" placeholder="Notas" style="width:100%"></textarea>`
    }

    renderOpts()
    actionSel.onchange = renderOpts

    // Tecla Pause congela o libera el inspector
    document.addEventListener("keydown", e => {
      if (e.code === "Pause") paused = !paused
    })

    // Limpia selector actual
    panel.querySelector("#m_cancel").onclick = () => frozen = null

    panel.querySelector("#m_generate").onclick = () => {
      window.__marionetaGenerate(cases)
    }

    // Guarda un paso dentro del case activo
    panel.querySelector("#m_ok").onclick = () => {
      if (!frozen) return

      const currentCase = caseInput.value || "default"

      if (!cases[currentCase]) cases[currentCase] = []

      const action = actionSel.value
      const data = { selector: frozen, action }

      // Captura todas las opciones dinámicas (m_*)
      panel.querySelectorAll("input,select,textarea").forEach(el => {
        if (el.id.startsWith("m_")) data[el.id] = el.value
      })

      cases[currentCase].push(data)

      window.__marionetaEmit(cases)
    }

    let last = 0

    // Escape básico para evitar romper HTML del panel
    const safe = t => String(t)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")

    // Inspector visual en tiempo real
    document.addEventListener("mousemove", e => {
      if (paused) return
      if (performance.now() - last < 16) return
      last = performance.now()

      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el || panel.contains(el)) return

      const r = el.getBoundingClientRect()
      overlay.style.top = r.top + "px"
      overlay.style.left = r.left + "px"
      overlay.style.width = r.width + "px"
      overlay.style.height = r.height + "px"

      const meta = {
        tag: el.tagName.toLowerCase(),
        id: el.id || "-",
        testid: el.getAttribute("data-testid") || "-",
        datatest: el.getAttribute("data-test") || "-",
        name: el.getAttribute("name") || "-",
        role: el.getAttribute("role") || "-",
        class: el.className || "-",
        text: (el.innerText || "").trim().slice(0, 80)
      }

      const selector = buildSelector(el)
      frozen = selector

      info.innerHTML = `
<div>tag: &lt;${meta.tag}&gt;</div>
<div>id: ${safe(meta.id)}</div>
<div>data-testid: ${safe(meta.testid)}</div>
<div>data-test: ${safe(meta.datatest)}</div>
<div>name: ${safe(meta.name)}</div>
<div>role: ${safe(meta.role)}</div>
<div>class: ${safe(meta.class)}</div>
<div>text: "${safe(meta.text)}"</div>
<div style="margin-top:6px;color:#22c55e">Selector: ${selector}</div>
`
    })
  }

  // Heurística de selector optimizada para Playwright
  function buildSelector(el) {
    const t = el.getAttribute("data-testid")
    if (t) return `page.getByTestId("${t}")`

    const d = el.getAttribute("data-test")
    if (d) return `page.locator('[data-test="${d}"]')`

    if (el.id) return `page.locator("#${el.id}")`

    const role = el.getAttribute("role")
    const text = (el.innerText || "").trim()

    if (role && text)
      return `page.getByRole("${role}", { name: "${text}" })`

    if (text) return `page.getByText("${text}")`

    return `page.locator("${el.tagName.toLowerCase()}")`
  }

  // Espera a que el body exista antes de montar Marioneta
  const loop = () => !mount() && requestAnimationFrame(loop)
  loop()
}

export async function inject(page) {
  // Recibe los cases directamente desde el navegador
  await page.exposeFunction("__marionetaEmit", data => {
    console.log("MARIONETA_CASES →", data)
  })

  // Emite cuando el usuario presiona 🚀 generar
  await page.exposeFunction("__marionetaGenerate", async cases => {
    console.log("GENERATING FROM →", cases)

    generate({
      url: page.url(),
      cases
    })
    .then()
    .catch()
  })

  await page.addInitScript(() => {
    window.__marionetaEmit = window.__marionetaEmit || (() => {})
  })

  await page.addInitScript(marionetaBoot)
  await page.evaluate(marionetaBoot)
}
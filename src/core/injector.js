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
  let editingCase = null       // Case que se está editando
  let editingIndex = null      // Índice del step que se está editando

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

<div style="margin-top:4px">
  <label style="font-size:11px">Posición:</label>
  <select id="m_position" style="width:100%"><option value="end">end</option></select>
</div>

<div style="margin-top:6px">
  <button id="m_ok">✅</button>
  <button id="m_cancel">❌</button>
  <button id="m_generate">🚀</button>
</div>

<hr>
<div id="m_tree" style="font-size:11px"></div>
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

    // Carga cases guardados para esta URL
    fetch(`http://localhost:7331/cases?url=${encodeURIComponent(location.href)}`)
      .then(r => r.json())
      .then(saved => {
        Object.assign(cases, saved)
        if (Object.keys(saved).length) {
          console.log("📂 Cases cargados:", Object.keys(saved))
          panel.__renderTree?.()
          panel.__refreshPosition?.()
        }
      })
      .catch(() => {})

    return true
  }

  function bind(panel, overlay) {
    const info = panel.querySelector("#" + INFO)
    const actionSel = panel.querySelector("#m_action")
    const opts = panel.querySelector("#m_opts")
    const caseInput = panel.querySelector("#m_case")
    const positionSel = panel.querySelector("#m_position")
    const tree = panel.querySelector("#m_tree")

    // Escape básico para evitar romper HTML del panel
    const safe = t => String(t)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")

    // Renderiza el árbol de cases y steps debajo del 🚀
    function renderTree() {
      const caseNames = Object.keys(cases)
      if (!caseNames.length) { tree.innerHTML = ""; return }

      tree.innerHTML = caseNames.map(cn => {
        const steps = cases[cn] || []
        const stepsHtml = steps.map((s, i) => {
          const isEditing = editingCase === cn && editingIndex === i
          const label = `${s.action} → ${s.selector.slice(0, 30)}${s.selector.length > 30 ? "…" : ""}`
          return `<div data-case="${safe(cn)}" data-idx="${i}" class="m_step"
            style="padding:2px 4px;margin:1px 0;cursor:pointer;border-radius:3px;
            background:${isEditing ? "#1e40af" : "#1e293b"};
            border-left:2px solid ${isEditing ? "#60a5fa" : "#334155"}">
            Step ${i + 1}: ${safe(label)}
          </div>`
        }).join("")

        return `<div style="margin-bottom:6px">
          <div style="color:#94a3b8;font-weight:bold;margin-bottom:2px">${safe(cn)}</div>
          ${stepsHtml}
        </div>`
      }).join("")

      // Click en step → carga datos para editar
      tree.querySelectorAll(".m_step").forEach(el => {
        el.onclick = () => {
          const cn = el.dataset.case
          const idx = parseInt(el.dataset.idx)
          loadStepForEdit(cn, idx)
        }
      })
    }

    // Carga un step en el panel para editar
    function loadStepForEdit(cn, idx) {
      const step = cases[cn]?.[idx]
      if (!step) return

      editingCase = cn
      editingIndex = idx

      caseInput.value = cn
      frozen = step.selector

      // Selecciona la acción
      actionSel.value = step.action
      renderOpts()

      // Rellena los campos con los valores guardados
      panel.querySelectorAll("input,select,textarea").forEach(el => {
        if (el.id.startsWith("m_") && step[el.id] !== undefined) {
          el.value = step[el.id]
        }
      })

      // Actualiza el select de posición mostrando dónde está y opciones de mover
      updatePositionSelect(cn, idx)
      renderTree()
    }

    // Actualiza las opciones del select de posición
    function updatePositionSelect(cn, currentIdx) {
      const steps = cases[cn] || []
      const opts2 = ["start"]
      for (let i = 0; i < steps.length; i++) {
        if (editingIndex !== null && i === editingIndex) continue
        opts2.push(`after step ${i + 1}`)
      }
      opts2.push("end")

      positionSel.innerHTML = opts2.map(v => {
        // Marca la posición actual si estamos editando
        let isCurrent = false
        if (editingIndex !== null) {
          if (v === "start" && editingIndex === 0) isCurrent = true
          else if (v === `after step ${editingIndex}`) isCurrent = true
          else if (v === "end" && editingIndex === steps.length - 1) isCurrent = true
        }
        return `<option value="${v}"${isCurrent ? " selected" : ""}>${v}${isCurrent ? " ← actual" : ""}</option>`
      }).join("")
    }

    // Recalcula posición cuando cambia el case input
    function refreshPositionSelect() {
      const cn = caseInput.value || "default"
      const steps = cases[cn] || []
      const isEditing = editingCase === cn && editingIndex !== null

      const opts2 = ["start"]
      for (let i = 0; i < steps.length; i++) {
        if (isEditing && i === editingIndex) continue
        opts2.push(`after step ${i + 1}`)
      }
      opts2.push("end")

      positionSel.innerHTML = opts2.map(v => {
        let isCurrent = false
        if (isEditing) {
          if (v === "start" && editingIndex === 0) isCurrent = true
          else if (v === `after step ${editingIndex}`) isCurrent = true
          else if (v === "end" && editingIndex === steps.length - 1) isCurrent = true
        }
        return `<option value="${v}"${isCurrent ? " selected" : ""}>${v}${isCurrent ? " ← actual" : ""}</option>`
      }).join("")
    }

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
    caseInput.oninput = refreshPositionSelect

    // Tecla Pause congela o libera el inspector
    document.addEventListener("keydown", e => {
      if (e.code === "Pause") paused = !paused
    })

    // Cancela edición o limpia selector
    panel.querySelector("#m_cancel").onclick = () => {
      frozen = null
      editingCase = null
      editingIndex = null
      refreshPositionSelect()
      renderTree()
    }

    panel.querySelector("#m_generate").onclick = () => {
      window.__marionetaGenerate(cases)
    }

    // Resuelve el índice de inserción según el select de posición
    function resolvePosition(cn, posValue) {
      const steps = cases[cn] || []
      if (posValue === "start") return 0
      if (posValue === "end") return steps.length
      const m = posValue.match(/after step (\d+)/)
      if (m) return parseInt(m[1])
      return steps.length
    }

    // Guarda o actualiza un paso
    panel.querySelector("#m_ok").onclick = async () => {
      if (!frozen) return

      const currentCase = caseInput.value || "default"
      if (!cases[currentCase]) cases[currentCase] = []

      const action = actionSel.value
      const data = { selector: frozen, action }

      panel.querySelectorAll("input,select,textarea").forEach(el => {
        if (el.id.startsWith("m_")) data[el.id] = el.value
      })

      const posValue = positionSel.value

      if (editingCase !== null && editingCase === currentCase && editingIndex !== null) {
        // Edición: elimina el step viejo e inserta en la nueva posición
        cases[currentCase].splice(editingIndex, 1)
        const newIdx = resolvePosition(currentCase, posValue)
        cases[currentCase].splice(newIdx, 0, data)
      } else {
        // Nuevo step: inserta en la posición elegida
        const newIdx = resolvePosition(currentCase, posValue)
        cases[currentCase].splice(newIdx, 0, data)
      }

      // Limpia estado de edición
      editingCase = null
      editingIndex = null

      window.__marionetaEmit(cases)

      await fetch("http://localhost:7331/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: location.href,
          caseName: currentCase,
          steps: cases[currentCase]
        })
      }).catch(() => {})

      refreshPositionSelect()
      renderTree()
    }

    let last = 0

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
      if (editingIndex === null) frozen = selector

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

    // Expone renderTree para llamarlo tras cargar cases del servidor
    panel.__renderTree = renderTree
    panel.__refreshPosition = refreshPositionSelect
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
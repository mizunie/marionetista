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
  const selectedCases = new Set() // Cases marcados para generar

  // Almacena pasos agrupados por case
  const cases = Object.create(null)

  const css = (e, s) => Object.assign(e.style, s)

  function mount() {
    if (!document.body) return false
    if (document.getElementById(ROOT)) return true

    const root = document.createElement("div")

    const web = document.createElement("div")

    const panel = document.createElement("aside")
    css(panel, {
      position: "fixed",
      right: "12px",
      top: "12px",
      width: "260px",
      maxHeight: "calc(100vh - 24px)",
      background: "#0f172a",
      color: "#e5e7eb",
      fontFamily: "monospace",
      padding: "8px",
      overflow: "auto",
      zIndex: 999998,
      borderRadius: "8px",
      boxShadow: "0 4px 24px rgba(0,0,0,.5)"
    })

    panel.innerHTML = `
<style>
  #__marionetaPanel * { box-sizing: border-box; }
  #__marionetaPanel input,
  #__marionetaPanel select,
  #__marionetaPanel textarea {
    width: 100%;
    background: #1e293b;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 4px;
    padding: 4px 6px;
    font-family: monospace;
    font-size: 11px;
    outline: none;
    margin-top: 3px;
  }
  #__marionetaPanel input:focus,
  #__marionetaPanel select:focus,
  #__marionetaPanel textarea:focus { border-color: #3b82f6; }
  #__marionetaPanel textarea { resize: vertical; min-height: 40px; }
  #__marionetaPanel label { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; }
  #__marionetaPanel .m_btn {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 4px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 13px;
    transition: background .15s;
  }
  #__marionetaPanel .m_btn:hover { background: #334155; }
  #__marionetaPanel .m_btn.primary { border-color: #3b82f6; }
  #__marionetaPanel .m_btn.danger  { border-color: #ef4444; }
  #__marionetaPanel .m_divider { border: none; border-top: 1px solid #1e293b; margin: 8px 0; }
  #__marionetaPanel .m_field { margin-top: 6px; }
  #__marionetaPanel .m_row { display: flex; gap: 4px; align-items: center; }
  #__marionetaPanel .m_toggle {
    background: none;
    border: none;
    color: #64748b;
    cursor: pointer;
    font-size: 11px;
    padding: 0 2px;
    line-height: 1;
    flex-shrink: 0;
  }
  #__marionetaPanel .m_toggle:hover { color: #e2e8f0; }
  #__marionetaPanel input[type="checkbox"] {
    appearance: none;
    -webkit-appearance: none;
    width: 13px;
    height: 13px;
    max-width: 13px;
    flex-shrink: 0;
    border: 1px solid #475569;
    border-radius: 3px;
    background: #1e293b;
    cursor: pointer;
    position: relative;
    margin: 0;
  }
  #__marionetaPanel input[type="checkbox"]:checked {
    background: #3b82f6;
    border-color: #3b82f6;
  }
  #__marionetaPanel input[type="checkbox"]:checked::after {
    content: "";
    position: absolute;
    left: 3px;
    top: 1px;
    width: 5px;
    height: 8px;
    border: 2px solid #fff;
    border-top: none;
    border-left: none;
    transform: rotate(45deg);
  }
</style>

<div id="__marionetaPanel" style="display:flex;flex-direction:column;gap:0">

  <!-- Header -->
  <div id="m_header" style="display:flex;align-items:center;gap:6px;padding-bottom:8px;border-bottom:1px solid #1e293b;margin-bottom:8px;cursor:grab;user-select:none">
    <span style="font-size:15px">🧪</span>
    <span style="font-weight:700;font-size:13px;color:#f1f5f9;letter-spacing:.03em;flex:1">Marioneta</span>
    <span id="m_status" title="Estado" style="width:8px;height:8px;border-radius:50%;background:#475569;flex-shrink:0;transition:background .2s"></span>
    <button id="m_toggle" class="m_toggle" title="Colapsar">◀</button>
  </div>

  <!-- Contenido colapsable -->
  <div id="m_body">

  <!-- Case name -->
  <div class="m_field">
    <label>Case</label>
    <input id="m_case" placeholder="ej: login">
  </div>

  <!-- Inspector info -->
  <div id="${INFO}" style="margin-top:8px;font-size:10px;color:#64748b;line-height:1.6"></div>

  <hr class="m_divider">

  <!-- Acción -->
  <div class="m_field">
    <label>Acción</label>
    <select id="m_action">
      <option value="click">click</option>
      <option value="assert">assert</option>
      <option value="hover">hover</option>
      <option value="fill">fill</option>
      <option value="clickfill">click & fill</option>
      <option value="if">if</option>
    </select>
  </div>

  <!-- Opciones dinámicas -->
  <div id="m_opts"></div>

  <!-- Posición -->
  <div class="m_field">
    <label>Posición</label>
    <select id="m_position"><option value="end">end</option></select>
  </div>

  <!-- Framework + Generar -->
  <div class="m_field">
    <label>Framework</label>
    <select id="m_framework">
      <optgroup label="Playwright">
        <option value="playwright-pom">Playwright — POM</option>
        <option value="playwright-cucumber">Playwright — Cucumber BDD</option>
        <option value="playwright-screenplay">Playwright — Screenplay (Serenity/JS)</option>
      </optgroup>
      <optgroup label="Selenium">
        <option value="selenium-pom-js">Selenium JS — POM</option>
        <option value="selenium-pom-java">Selenium Java — POM</option>
        <option value="selenium-cucumber-js">Selenium JS — Cucumber BDD</option>
        <option value="selenium-cucumber-java">Selenium Java — Cucumber BDD</option>
        <option value="selenium-screenplay-java">Selenium Java — Screenplay (Serenity)</option>
        <option value="selenide-pom">Selenide — POM</option>
        <option value="selenide-screenplay">Selenide — Screenplay</option>
      </optgroup>
      <optgroup label="Cypress">
        <option value="cypress-pom">Cypress — POM</option>
        <option value="cypress-cucumber">Cypress — Cucumber BDD</option>
      </optgroup>
      <optgroup label="WebdriverIO">
        <option value="webdriverio-pom">WebdriverIO — POM</option>
        <option value="webdriverio-cucumber">WebdriverIO — Cucumber BDD</option>
        <option value="webdriverio-screenplay">WebdriverIO — Screenplay (Serenity/JS)</option>
      </optgroup>
    </select>
  </div>

  <!-- Botones de acción -->
  <div class="m_row" style="margin-top:8px">
    <button id="m_ok"     class="m_btn primary" title="Guardar step">✅</button>
    <button id="m_cancel" class="m_btn"         title="Cancelar">❌</button>
    <button id="m_delete" class="m_btn danger"  title="Eliminar step" style="display:none">🗑</button>
    <button id="m_generate" class="m_btn" title="Generar tests" style="margin-left:auto">🚀</button>
  </div>

  <hr class="m_divider">

  <!-- Árbol de cases -->
  <div id="m_tree" style="font-size:11px"></div>

</div>

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
    const deleteBtn = panel.querySelector("#m_delete")
    const generateBtn = panel.querySelector("#m_generate")
    const statusDot = panel.querySelector("#m_status")
    const header = panel.querySelector("#m_header")
    const toggleBtn = panel.querySelector("#m_toggle")

    // Indicador de estado
    function updateStatus() {
      if (editingIndex !== null) {
        statusDot.style.background = "#3b82f6"  // azul = editando
        statusDot.title = "Editando step"
      } else if (frozen) {
        statusDot.style.background = "#22c55e"  // verde = selector activo
        statusDot.title = "Selector capturado"
      } else {
        statusDot.style.background = "#475569"  // gris = idle
        statusDot.title = "Sin selección"
      }
    }

    // Drag del panel
    let dragging = false, dragOffX = 0, dragOffY = 0
    header.addEventListener("mousedown", e => {
      if (e.button !== 0) return
      dragging = true
      dragOffX = e.clientX - panel.getBoundingClientRect().left
      dragOffY = e.clientY - panel.getBoundingClientRect().top
      header.style.cursor = "grabbing"
    })
    document.addEventListener("mousemove", e => {
      if (!dragging) return
      const newTop = Math.max(0, e.clientY - dragOffY)
      panel.style.left = (e.clientX - dragOffX) + "px"
      panel.style.right = "auto"
      panel.style.top = newTop + "px"
      panel.style.maxHeight = `calc(100vh - ${newTop}px)`
    })
    document.addEventListener("mouseup", () => {
      if (!dragging) return
      dragging = false
      header.style.cursor = "grab"
    })

    // Toggle colapsar/expandir
    let collapsed = false
    const body = panel.querySelector("#m_body")
    toggleBtn.onclick = e => {
      e.stopPropagation()
      collapsed = !collapsed
      body.style.display = collapsed ? "none" : ""
      header.style.borderBottom = collapsed ? "none" : "1px solid #1e293b"
      header.style.marginBottom = collapsed ? "0" : "8px"
      header.style.paddingBottom = collapsed ? "0" : "8px"
      toggleBtn.textContent = collapsed ? "▶" : "◀"
      toggleBtn.title = collapsed ? "Expandir" : "Colapsar"
      // Al colapsar, apagar el inspector visual
      if (collapsed) {
        overlay.style.display = "none"
        paused = true
      } else {
        overlay.style.display = ""
        paused = false
      }
    }

    // Escape básico para evitar romper HTML del panel
    const safe = t => String(t)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")

    // Limpia el panel a estado inicial
    function resetPanel() {
      frozen = null
      editingCase = null
      editingIndex = null
      caseInput.value = ""
      actionSel.value = "click"
      deleteBtn.style.display = "none"
      updateStatus()
      renderOpts()
      refreshPositionSelect()
      renderTree()
    }

    // Sincroniza el estado del botón 🚀 según los cases seleccionados
    function updateGenerateBtn() {
      const enabled = selectedCases.size > 0
      generateBtn.disabled = !enabled
      generateBtn.style.opacity = enabled ? "1" : "0.35"
      generateBtn.style.cursor = enabled ? "pointer" : "not-allowed"
    }

    // Renderiza el árbol de cases y steps debajo del 🚀
    function renderTree() {
      const caseNames = Object.keys(cases)
      if (!caseNames.length) { tree.innerHTML = ""; updateGenerateBtn(); return }

      // Casos nuevos quedan marcados por defecto
      caseNames.forEach(cn => { if (!selectedCases.has(cn)) selectedCases.add(cn) })

      tree.innerHTML = caseNames.map(cn => {
        const steps = cases[cn] || []
        const checked = selectedCases.has(cn)
        const stepsHtml = steps.map((s, i) => {
          const isEditing = editingCase === cn && editingIndex === i
          const isGoto = s.action === "goto"
          const selDisplay = typeof s.selector === "object"
            ? `${s.selector.attr}="${s.selector.value}"`
            : s.selector
          const label = isGoto
            ? `goto → ${(s.selector?.value ?? s.selector).replace(/^https?:\/\//, "").slice(0, 28)}…`
            : `${s.action} → ${selDisplay.slice(0, 28)}${selDisplay.length > 28 ? "…" : ""}`
          return `<div data-case="${safe(cn)}" data-idx="${i}" class="m_step"
            style="padding:3px 6px;margin:2px 0;cursor:pointer;border-radius:4px;font-size:10px;
            background:${isEditing ? "#1e3a5f" : "transparent"};
            border:1px solid ${isEditing ? "#3b82f6" : isGoto ? "#312e81" : "#1e293b"};
            color:${isEditing ? "#93c5fd" : isGoto ? "#818cf8" : "#94a3b8"};
            transition:background .1s">
            <span style="color:${isEditing ? "#60a5fa" : isGoto ? "#6366f1" : "#475569"};margin-right:4px">${i + 1}.</span>${safe(label)}
          </div>`
        }).join("")

        return `<div style="margin-bottom:8px">
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px;padding-left:2px">
            <input type="checkbox" data-check-case="${safe(cn)}" ${checked ? "checked" : ""}>
            <span style="flex:1;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.06em">${safe(cn)}</span>
            <span style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:0 5px;font-size:9px;color:#64748b">${steps.length}</span>
            <button data-run-case="${safe(cn)}" title="Ejecutar test"
              style="background:none;border:none;cursor:pointer;color:#22c55e;padding:0;font-size:11px;line-height:1">▶</button>
          </div>
          ${stepsHtml}
        </div>`
      }).join("")

      tree.querySelectorAll("[data-check-case]").forEach(chk => {
        chk.onchange = () => {
          if (chk.checked) selectedCases.add(chk.dataset.checkCase)
          else selectedCases.delete(chk.dataset.checkCase)
          updateGenerateBtn()
        }
      })

      tree.querySelectorAll(".m_step").forEach(el => {
        el.onmouseenter = () => { if (editingCase !== el.dataset.case || editingIndex !== +el.dataset.idx) el.style.background = "#1e293b" }
        el.onmouseleave = () => { if (editingCase !== el.dataset.case || editingIndex !== +el.dataset.idx) el.style.background = "transparent" }
        el.onclick = () => loadStepForEdit(el.dataset.case, parseInt(el.dataset.idx))
      })

      tree.querySelectorAll("[data-run-case]").forEach(btn => {
        btn.onclick = async e => {
          e.stopPropagation()
          const cn = btn.dataset.runCase
          const framework = panel.querySelector("#m_framework").value
          btn.textContent = "⏳"
          btn.style.pointerEvents = "none"
          const res = await fetch("http://localhost:7331/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: location.href, caseName: cn, framework })
          }).catch(() => null)
          const data = res ? await res.json().catch(() => ({})) : {}
          btn.textContent = data.ok ? "✅" : "❌"
          btn.style.pointerEvents = ""
          setTimeout(() => { btn.textContent = "▶" }, 3000)
          if (data.reportUrl) window.open(data.reportUrl, "_blank")
        }
      })

      updateGenerateBtn()
    }

    // Carga un step en el panel para editar
    function loadStepForEdit(cn, idx) {
      const step = cases[cn]?.[idx]
      if (!step) return

      editingCase = cn
      editingIndex = idx

      caseInput.value = cn
      frozen = step.selector  // objeto { type, value, role? }

      // Selecciona la acción
      actionSel.value = step.action
      renderOpts()

      // Rellena los campos con los valores guardados
      panel.querySelectorAll("input,select,textarea").forEach(el => {
        if (el.id.startsWith("m_") && step[el.id] !== undefined) {
          el.value = step[el.id]
        }
      })
      // Restaura el check de secreto si aplica
      const secretChk = panel.querySelector("#m_secret")
      if (secretChk) secretChk.checked = !!step.m_secret

      // Actualiza el select de posición mostrando dónde está y opciones de mover
      updatePositionSelect(cn, idx)
      deleteBtn.style.display = "inline"
      updateStatus()
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
<div class="m_field">
  <div class="m_row">
    <div style="flex:1"><label>Clicks</label><input id="m_count" type="number" value="1" min="1"></div>
    <div style="flex:1"><label>Botón</label><select id="m_btn"><option>left</option><option>right</option><option>middle</option></select></div>
    <div style="flex:1"><label>Duración</label><select id="m_dur"><option>short</option><option>long</option></select></div>
  </div>
</div>`

      else if (a === "assert") opts.innerHTML = `
<div class="m_field">
  <label>Condición</label>
  <select id="m_assert">
    <option>visible</option><option>hidden</option><option>count</option>
    <option>toHaveText</option><option>selected</option>
  </select>
</div>`

      else if (a === "fill" || a === "clickfill") opts.innerHTML = `
<div class="m_field">
  <label>Valor</label>
  <div class="m_row" style="margin-top:3px">
    <input id="m_value" placeholder="value" style="margin-top:0">
    <label title="Valor sensible (contraseña, token...)" style="display:flex;align-items:center;gap:3px;cursor:pointer;white-space:nowrap;text-transform:none;letter-spacing:0;color:#64748b;font-size:10px">
      <input type="checkbox" id="m_secret" style="margin-top:0">🔒
    </label>
  </div>
</div>`

      else if (a === "if") opts.innerHTML = `
<div class="m_field">
  <label>Condición</label>
  <select id="m_if"><option>visible</option><option>checked</option><option>exists</option></select>
</div>`

      else opts.innerHTML = ``

      opts.innerHTML += `
<div class="m_field">
  <label>Notas</label>
  <textarea id="m_notas" placeholder="Notas opcionales..."></textarea>
</div>`
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
      resetPanel()
    }

    generateBtn.onclick = async () => {
      const payload = Object.fromEntries(
        Object.entries(cases).filter(([cn]) => selectedCases.has(cn))
      )
      const framework = panel.querySelector("#m_framework").value
      generateBtn.textContent = "⏳"
      generateBtn.disabled = true
      await window.__marionetaGenerate({ url: location.href, framework, cases: payload })
      generateBtn.textContent = "🚀"
      generateBtn.disabled = false
      updateGenerateBtn()
    }

    // Elimina el step que se está editando
    deleteBtn.onclick = async () => {
      if (editingCase === null || editingIndex === null) return
      const cn = editingCase
      const idx = editingIndex
      cases[cn].splice(idx, 1)
      // Si el case quedó vacío, eliminarlo
      if (cases[cn].length === 0) {
        delete cases[cn]
        await fetch("http://localhost:7331/cases", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: location.href, caseName: cn })
        }).catch(() => {})
      } else {
        await fetch("http://localhost:7331/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: location.href, caseName: cn, steps: cases[cn] })
        }).catch(() => {})
      }
      resetPanel()
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
        if (el.id.startsWith("m_") && !["m_action","m_case","m_position","m_framework","m_secret"].includes(el.id)) data[el.id] = el.value
      })

      // Si el valor es sensible, tokenizarlo antes de guardar
      const secretChk = panel.querySelector("#m_secret")
      if (secretChk?.checked && data.m_value) {
        const token = `__SECRET_${Date.now()}__`
        await fetch("http://localhost:7331/secrets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, value: data.m_value })
        }).catch(() => {})
        data.m_value = token
        data.m_secret = true
      }

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

      resetPanel()
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
      overlay.style.borderColor = editingIndex !== null ? "#3b82f6" : "#22c55e"
      overlay.style.background   = editingIndex !== null ? "rgba(59,130,246,.1)" : "rgba(34,197,94,.15)"

      const meta = {
        tag: el.tagName.toLowerCase(),
        id: el.id || "-",
        testid: el.getAttribute("data-testid") || "-",
        datatest: el.getAttribute("data-test") || "-",
        name: el.getAttribute("name") || "-",
        role: el.getAttribute("role") || "-",
        aria: el.getAttribute("aria-label") || "-",
        placeholder: el.getAttribute("placeholder") || "-",
        class: el.className || "-",
        text: (el.innerText || "").trim().slice(0, 80)
      }

      const { attr, value, name: roleName, weak } = buildSelector(el)
      if (editingIndex === null) {
        frozen = { attr, value, ...(roleName ? { name: roleName } : {}) }
        updateStatus()
      }

      const selectorBg     = editingIndex !== null ? "#0f1e3a" : weak ? "#1a1200" : "#0f2a1a"
      const selectorBorder = editingIndex !== null ? "#3b82f6" : weak ? "#f59e0b" : "#22c55e"
      const selectorColor  = editingIndex !== null ? "#93c5fd" : weak ? "#fbbf24" : "#4ade80"
      const warningHtml    = weak && editingIndex === null
        ? `<div style="color:#f59e0b;font-size:9px;margin-top:3px">⚠️ Selector genérico, puede ser frágil</div>`
        : ""

      const frozenDisplay = frozen
        ? frozen.name ? `${frozen.attr}="${frozen.value}" name="${frozen.name}"` : `${frozen.attr}="${frozen.value}"`
        : ""
      const displaySelector = editingIndex !== null
        ? frozenDisplay
        : roleName ? `${attr}="${value}" name="${roleName}"` : `${attr}="${value}"`

      info.innerHTML = `
<div style="display:grid;grid-template-columns:auto 1fr;gap:1px 6px">
  <span style="color:#475569">&lt;${meta.tag}&gt;</span><span style="color:#94a3b8">${safe(meta.id !== "-" ? "#"+meta.id : meta.testid !== "-" ? meta.testid : meta.name !== "-" ? meta.name : "")}</span>
  ${meta.aria !== "-" ? `<span style="color:#475569">aria</span><span style="color:#94a3b8">${safe(meta.aria)}</span>` : ""}
  ${meta.placeholder !== "-" ? `<span style="color:#475569">placeholder</span><span style="color:#94a3b8">${safe(meta.placeholder)}</span>` : ""}
  <span style="color:#475569">text</span><span style="color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">"${safe(meta.text)}"</span>
</div>
<div style="margin-top:5px;padding:4px 6px;background:${selectorBg};border-radius:4px;border-left:2px solid ${selectorBorder};color:${selectorColor};word-break:break-all">${safe(displaySelector)}</div>
${warningHtml}
`
    })

    // Expone renderTree para llamarlo tras cargar cases del servidor
    panel.__renderTree = renderTree
    panel.__refreshPosition = refreshPositionSelect
  }

  // Heurística de selector — guarda el atributo exacto y valor para que el back
  // genere la sintaxis correcta para cualquier framework
  function buildSelector(el) {
    const testid = el.getAttribute("data-testid")
    if (testid) return { attr: "data-testid", value: testid, weak: false }

    const datatest = el.getAttribute("data-test")
    if (datatest) return { attr: "data-test", value: datatest, weak: false }

    if (el.id) return { attr: "id", value: el.id, weak: false }

    const role = el.getAttribute("role")
    const text = (el.innerText || "").trim()
    if (role && text) return { attr: "role", value: role, name: text, weak: false }

    const aria = el.getAttribute("aria-label")
    if (aria) return { attr: "aria-label", value: aria, weak: false }

    const placeholder = el.getAttribute("placeholder")
    if (placeholder) return { attr: "placeholder", value: placeholder, weak: false }

    if (text) return { attr: "text", value: text, weak: false }

    return { attr: "tag", value: el.tagName.toLowerCase(), weak: true }
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
  await page.exposeFunction("__marionetaGenerate", async ({ url, framework, cases }) => {
    console.log("GENERATING FROM →", framework, cases)
    await generate({ url, framework, cases }).then().catch()
  })

  await page.addInitScript(() => {
    window.__marionetaEmit = window.__marionetaEmit || (() => {})
  })

  await page.addInitScript(marionetaBoot)
  await page.evaluate(marionetaBoot)
}
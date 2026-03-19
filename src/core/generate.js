process.loadEnvFile()
import fs from "fs"
import path from "path"

function hostNameFolder(url) {
  return new URL(url).hostname.replaceAll(".", "_")
}

// Mapea framework → subcarpeta dentro del baseDir
const FRAMEWORK_SUBDIR = {
  "playwright-pom":        "playwright",
  "playwright-cucumber":   "playwright",
  "playwright-screenplay": "playwright",
}

// Carpetas base a copiar si el directorio no existe aún
const FRAMEWORK_BASE = {
  "playwright": path.join(process.cwd(), "src", "base", "playwright"),
}

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath  = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function resolveBaseDir(url, framework) {
  const host   = hostNameFolder(url)
  const subdir = FRAMEWORK_SUBDIR[framework]
  const base   = path.join(process.cwd(), "generated", host)

  if (!subdir) return base  // framework sin subcarpeta definida, va directo

  const dir = path.join(base, subdir)

  // Si no existe aún, copiar el template base
  if (!fs.existsSync(dir) && FRAMEWORK_BASE[subdir]) {
    console.log(`📁 Inicializando template ${subdir} en`, dir)
    copyDirRecursive(FRAMEWORK_BASE[subdir], dir)
  }

  return dir
}

export function saveFilesFromContent(url, framework, content) {
  const baseDir = resolveBaseDir(url, framework)

  const fileRegex = /# file:(.+?)\n([\s\S]*?)# file:endfile/g

  let match
  let created = 0

  while ((match = fileRegex.exec(content.msg))) {
    const relativePath = match[1].trim()
    const raw = match[2]

    const fileContent = raw
      .replace(/^\n+/, "")
      .replace(/\n+$/, "")
      .replace(/\r/g, "")

    const fullPath = path.join(baseDir, relativePath)
    const dir = path.dirname(fullPath)

    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(fullPath, fileContent, "utf8")

    console.log("✅", fullPath)
    created++
  }

  if (!created) {
    console.warn("⚠️ No se detectaron bloques # file:")
  }
}

export async function generate(payload) {
  const res = await fetch(process.env.MARIONETISTA_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "bananin-marionetista": process.env.BANANIN_PERMISSION,
      "bananin-llave": process.env.BANANIN_KEY
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    console.log(await res.text())
    return false
  }

  const result = await res.json()

  // Reemplaza tokens secretos por valores reales antes de escribir al disco
  try {
    const secretsRes = await fetch("http://localhost:7331/secrets")
    const secrets = await secretsRes.json()
    for (const [token, value] of Object.entries(secrets)) {
      result.msg = result.msg.replaceAll(token, value)
    }
  } catch {}

  saveFilesFromContent(payload.url, payload.framework, result)
  return true
}

process.loadEnvFile()
import fs from "fs"
import path from "path"

function hostNameFolder(url) {
  return new URL(url).hostname.replaceAll(".", "_")
}

export function saveFilesFromContent(url, content) {
  const baseDir = path.join(process.cwd(), "generated", hostNameFolder(url))

  const fileRegex = /# file:(.+?)\n([\s\S]*?)# file:endfile/g

  let match
  let created = 0

  while ((match = fileRegex.exec(content.msg))) {
    const relativePath = match[1].trim()
    const raw = match[2]

    // Limpieza fuerte del output IA
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

  saveFilesFromContent(payload.url, result)
  return true
}

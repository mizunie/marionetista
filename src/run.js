import { launch } from "./core/browser.js"
import { inject } from "./core/injector.js"
import { startCasesServer } from "./core/casesServer.js"

startCasesServer()

const url = process.argv[2] || "http://opencart.abstracta.us/index.php"

const { page } = await launch(url)

await inject(page)

console.log("🪄 Marioneta lista")
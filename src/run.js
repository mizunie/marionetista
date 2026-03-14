import { launch } from "./core/browser.js"
import { inject } from "./core/injector.js"
import { startCasesServer } from "./core/casesServer.js"

startCasesServer()

const url = process.argv[2] || "https://www.saucedemo.com"

const { page } = await launch(url)

await inject(page)

console.log("🪄 Marioneta lista")
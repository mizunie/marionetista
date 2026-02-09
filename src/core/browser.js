import { chromium } from "playwright-core"

export async function launch(url) {
  const context = await chromium.launchPersistentContext("./profile", {
    headless: false,
    viewport: null,
    args: ["--start-maximized"]
  })

  context.setDefaultTimeout(0)
  context.setDefaultNavigationTimeout(0)

  const page = context.pages()[0] || await context.newPage()
  await page.goto(url)

  return { context, page }
}

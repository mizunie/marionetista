process.loadEnvFile();
import { chromium } from "playwright-core"

export async function launch(url) {
  const disableCors = process.env.DISABLE_CORS === 'true';

  const args = ["--start-maximized"]
  
  if (disableCors) {
    args.push(
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--allow-running-insecure-content',
      `--unsafely-treat-insecure-origin-as-secure=${url}`,
      '--disable-blink-features=AutomationControlled'
    );
    console.log('⚠️  CORS deshabilitado - cambialo en el .env')
  }

  const context = await chromium.launchPersistentContext("./profile", {
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: false,
    viewport: null,
    args: args
  })

  context.setDefaultTimeout(0)
  context.setDefaultNavigationTimeout(0)

  const page = context.pages()[0] || await context.newPage()
  await page.goto(url)

  return { context, page }
}

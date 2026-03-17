import { chromium, FullConfig } from '@playwright/test'

/**
 * Global setup — se ejecuta una vez antes de todos los tests.
 *
 * Úsalo para autenticación u otras tareas de inicialización.
 * Si no necesitas sesión compartida, puedes dejar este archivo vacío
 * o eliminarlo junto con la referencia en playwright.config.ts.
 *
 * Ejemplo de login:
 *
 *   const browser = await chromium.launch()
 *   const page    = await browser.newPage()
 *   await page.goto(`${baseURL}/login`)
 *   await page.fill('#username', process.env.TEST_USER ?? '')
 *   await page.fill('#password', process.env.TEST_PASS ?? '')
 *   await page.click('button[type="submit"]')
 *   await page.context().storageState({ path: '.auth/session.json' })
 *   await browser.close()
 */
async function globalSetup(_config: FullConfig) {
  // TODO: implementa aquí el setup global si lo necesitas
}

export default globalSetup

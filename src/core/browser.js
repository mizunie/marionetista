process.loadEnvFile();
import { chromium } from "playwright-core"

export async function launch(url) {
  const disableCors = process.env.DISABLE_CORS === 'true';

  // Args base necesarios para buena visualización
  const args = [
    "--start-maximized",
    // Forzar renderizado correcto
    "--force-color-profile=srgb",
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--use-gl=swiftshader",
    // Evitar modo oscuro automático
    "--disable-features=WebContentsForceDark",
    // Mejorar rendimiento visual
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-dev-shm-usage",
    "--no-sandbox"
  ];
  
  if (disableCors) {
    args.push(
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-site-isolation-trials',
      '--allow-running-insecure-content',
      `--unsafely-treat-insecure-origin-as-secure=${url}`,
      '--disable-blink-features=AutomationControlled'
    );
    console.log('⚠️  CORS deshabilitado - cambialo en el .env');
  }

  // Limpiar caché si existe para evitar problemas
  const fs = await import('fs');
  const cachePath = './profile/Default/Cache';
  if (fs.existsSync(cachePath)) {
    try {
      fs.rmSync(cachePath, { recursive: true, force: true });
      console.log('🧹 Caché limpiada');
    } catch (err) {
      // Ignorar errores de permisos
    }
  }

  const context = await chromium.launchPersistentContext("./profile", {
    headless: false,
    viewport: null,
    args: args,
    // Opciones adicionales para mejorar visualización
    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation'],
    timeout: 30000,
  });

  context.setDefaultTimeout(0);
  context.setDefaultNavigationTimeout(0);

  const page = context.pages()[0] || await context.newPage();
  
  // Esperar a que la página cargue completamente
  await page.goto(url, { waitUntil: 'networkidle' });
  
  // Forzar actualización de la vista si está oscura
  await page.evaluate(() => {
    // Forzar re-renderizado
    document.body.style.display = 'none';
    document.body.offsetHeight; // Trigger reflow
    document.body.style.display = '';
  });

  return { context, page };
}
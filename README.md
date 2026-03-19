# Marioneta

Grabador visual de tests E2E. Abre cualquier web, apunta con el mouse, define los pasos y genera el código listo para correr — sin escribir una línea de test a mano.

## Cómo funciona

1. Lanzas Marioneta apuntando a una URL
2. Un panel flotante aparece sobre la página
3. Haces hover sobre los elementos — el inspector los resalta y construye el selector automáticamente. Puedes congelar el elemento resaltado con la tecla `Pause`
4. Eliges la acción (click, fill, assert, hover...), el case al que pertenece y guardas el paso con ✅
5. Los pasos se persisten en disco en `generated/<host>/cases/<path>/<case>.json`
6. Cuando tienes el flujo completo, marcas los cases que quieres generar y pulsas 🚀 — la IA genera el código completo en `generated/<host>/playwright/`
7. Desde el panel puedes ejecutar cada case con ▶ y ver el reporte de Playwright en una nueva pestaña al terminar

## Instalación

```bash
pnpm install
pnpm exec playwright install chromium
```

## Variables de entorno

Crea un archivo `.env` en la raíz:

```
BANANIN_PERMISSION=
BANANIN_KEY=
MARIONETISTA_URL=https://back.mizunie.com/marionetista/generatePlaywright
```

## Uso

```bash
# URL por defecto: https://www.saucedemo.com
pnpm dev

# Apuntando a otra URL
pnpm dev https://tuapp.com
```

## Panel de grabación

| Control | Función |
|---|---|
| Case | Nombre del grupo de pasos (ej: `login`, `checkout`) |
| Acción | Tipo de interacción: click, fill, assert, hover, if... |
| Posición | Dónde insertar el paso dentro del case |
| ✅ | Guarda el paso actual |
| ❌ | Cancela / limpia la selección |
| 🗑️ | Elimina el paso que estás editando |
| Framework | Framework de destino para la generación |
| 🚀 | Envía los cases seleccionados a la IA para generar el código |
| ▶ | Ejecuta el test de ese case y abre el reporte al terminar |
| ◀ / ▶ | Colapsa o expande el panel (desactiva el inspector al colapsar) |

El header es arrastrable. Al colapsar, el inspector visual se apaga para navegar sin distracciones.

## Valores sensibles

En campos de tipo fill o click & fill aparece un check 🔒. Al marcarlo, el valor real nunca viaja a la IA — se reemplaza por un token opaco (`__SECRET_....__`) que se guarda localmente en `.secrets.json`. Al escribir los archivos generados, el token se sustituye por el valor real automáticamente.

`.secrets.json` está en `.gitignore` y nunca sale del equipo.

## Selectores

El inspector prioriza los atributos más estables en este orden:

1. `data-testid`
2. `data-test`
3. `#id`
4. `role` + texto visible
5. `aria-label`
6. `placeholder`
7. texto visible
8. tag genérico ⚠️ (se marca en naranja como advertencia)

## Estructura generada

```
generated/
└── www_tuapp_com/
    ├── cases/
    │   └── home/
    │       └── login.json         ← pasos grabados
    └── playwright/
        ├── playwright.config.ts
        ├── global.setup.ts
        ├── src/
        │   ├── pages/             ← Page Objects generados
        │   ├── tests/             ← specs de Playwright
        │   └── data/              ← datos de prueba
        └── playwright-report/     ← reporte tras ejecutar ▶
```

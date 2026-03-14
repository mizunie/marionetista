# Marioneta

Grabador visual de tests E2E para Playwright. Abre cualquier web, apunta con el mouse, define los pasos y genera el código listo para correr — sin escribir una línea de test a mano.

## Cómo funciona

1. Lanzas Marioneta apuntando a una URL
2. Un panel flotante aparece sobre la página
3. Haces hover sobre los elementos que quieres testear — el inspector los resalta y construye el selector automáticamente
4. Eliges la acción (click, fill, assert, hover...), el case al que pertenece y guardas el paso con ✅
5. Los pasos se persisten en disco en `generated/<host>/cases/<path>/<case>.json`
6. Cuando tienes el flujo completo, pulsas 🚀 y la IA genera el código Playwright completo en `generated/<host>/src/`
7. Desde el panel puedes ejecutar cada case directamente con ▶

## Instalación

```bash
pnpm add playwright-core
pnpm add -D playwright
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

# O apuntando a otra URL
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
| 🚀 | Envía los cases a la IA para generar el código |
| ▶ | Ejecuta el test de ese case (instala deps si hace falta) |

El header del panel es arrastrable. La flecha ◀ colapsa el panel y desactiva el inspector visual para navegar sin distracciones.

## Selectores

El inspector prioriza los atributos más estables para Playwright en este orden:

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
    │       └── login.json      ← pasos grabados
    └── src/
        ├── pages/              ← Page Objects generados
        └── tests/              ← specs de Playwright
```

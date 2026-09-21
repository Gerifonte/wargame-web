# CLAUDE.md

Editor de mapas hexagonales para wargames (TypeScript + PixiJS). El estado funcional, los controles y las limitaciones conocidas están en [README.md](README.md): léelo antes de tocar nada y mantenlo al día cuando cambies funcionalidad.

## Compilar (obligatorio tras cada cambio en el .ts)
- Fuente única: `js/terrain-editor.ts` (clase `TerrainEditor`). El navegador **no** carga el `.ts`, carga el compilado `dist/terrain-editor/terrain-editor.js`, que está versionado en git.
- Después de editar el `.ts` ejecuta `npm run build:terrain-editor` (`tsc -p js/tsconfig.json`, `strict: true`). Un cambio sin recompilar no se ve en el navegador.
- No hay tests automáticos ni linter: la verificación es compilar sin errores y probar en el navegador.

## Estructura
- `Editor-Terreno.php`: la página del editor (HTML del panel, ajustes y controles; los ids de los inputs los lee `TerrainEditor.initEvents`).
- `css/terrain-editor.css`: estilos.
- `js/terrain-editor.ts`: toda la lógica; `js/tsconfig.json` solo incluye ese archivo.
- `index.php`, `index_terreno.php`, `src/`: otras partes del proyecto, ajenas al editor de terreno.

## PixiJS
- Se carga por **CDN en la versión 7.4.2** desde `Editor-Terreno.php` y se usa como global (`declare const PIXI: any`). El paquete `pixi.js` 8.x de `package.json` **no** es el que se ejecuta: usa la API de v7 (`beginFill`/`drawPolygon`/`lineStyle`, `PIXI.BlurFilter`, `PIXI.Application` con opciones, etc.).
- `dibujarTableroCompleto()` repinta todo. Los perfiles ondulados, el trazo libre y los trazos (río/carretera/tren) van en `wavyOverlayContainer`, que se vacía con `removeChildren()` en cada repintado (no destruye los hijos). Los `Graphics` que necesiten persistir (casas, sombras) se guardan en la capa y se reutilizan.
- El estilo de `lineStyle` persiste en un `Graphics` (incluidas las máscaras de ruido): restablécelo con `lineStyle(0)` tras dibujar trazos.

## Convenciones
- Código, comentarios y textos de interfaz en **español**. Comentarios que expliquen el porqué, no el qué; el archivo ya tiene un nivel de comentarios moderado, mantenlo.
- Respeta los finales de línea de cada archivo (`.gitignore` está en CRLF, el resto de fuentes suelen estar en LF con aviso de git). Si haces reemplazos con scripts, detecta `\r\n` antes de escribir.
- Los ajustes de los pinceles siguen un patrón: los de un trazo (color, ancho, ondulación, punta) se guardan en el trazo al finalizar; los de sombra son comunes por tipo y se aplican en vivo; la densidad de ciudad se guarda por hexágono al pintar.
- No hagas commit salvo que se pida. Todo lo reciente está sin commitear.

## Trampas conocidas
- Añadir un tipo de terreno implica tocar `TerrainType`, `TERRAIN_LABELS`, `colores`, el botón en `Editor-Terreno.php` y el swatch en el CSS. Si es un trazo, también `LineKind`, `lineSettings` y `getLineKind()`.
- `.gitignore` termina con una línea suelta `/node_modules/gitgit push` (un `git push` pegado por error), por lo que `node_modules` probablemente no queda ignorado. No se ha corregido.

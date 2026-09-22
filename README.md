# Editor de Terrenos — Wargame Web

Editor de mapas hexagonales para wargames, construido en TypeScript sobre PixiJS 7 (cargado por CDN en `Editor-Terreno.php`). Permite pintar terreno hexágono a hexágono, organizarlo en capas, generar contornos orgánicos ("ondulados"), dibujar ríos, carreteras y vías de tren como curvas libres y colocar casas de ciudad.

## Compilar y abrir
- Código fuente: [js/terrain-editor.ts](js/terrain-editor.ts). El navegador carga el compilado `dist/terrain-editor/terrain-editor.js` (versionado en git), así que **hay que recompilar tras cada cambio**: `npm run build:terrain-editor`.
- Página: [Editor-Terreno.php](Editor-Terreno.php) (servida por XAMPP). Estilos en [css/terrain-editor.css](css/terrain-editor.css).

## Estado actual (`terrain-editor.ts`)

### Tablero y rejilla
- Grid hexagonal configurable: columnas, filas y radio de hexágono (`cols`, `filas`, `radioHex`), reconstruible en caliente con "Crear/Reiniciar Mapa".
- Coordenadas offset (`col`, `fila`) con posición en píxeles precalculada (`mapaHexes`).
- Rejilla visual activable/desactivable (botón "Ocultar/Mostrar malla").
- **Puntos imán** (`buildSnapPoints`, recalculados en `crearTablero`): un vértice, centro de arista y centro por cada hexágono, deduplicados entre hexágonos vecinos. Se ven como puntitos discretos y semitransparentes (no estorban) y sirven para enganchar los puntos de control de las curvas Bézier (río/carretera/tren y perfil libre): al añadir o arrastrar un punto, si cae cerca de uno de la rejilla (`snapToGrid`) se ajusta a él. Los tiradores de ancla no tienen imán. **Desactivados por defecto al abrir el editor**; botón independiente **"Activar/Desactivar imán"** que apaga o enciende a la vez los puntos y el enganche, sin afectar a la malla hexagonal.
- Pan con el **botón derecho** arrastrando y zoom centrado en el cursor (rueda), con límites de escala 0.1x–3x.

### Pinceles (panel "Tipos de Terrenos")
| Pincel | Cómo se usa |
|---|---|
| **Terreno base** | Pinta hexágonos con el color del selector de color de al lado. Cada hexágono guarda su propio color (`HexData.color`), así que cambiar el selector no repinta lo ya pintado. Es el pincel activo al arrancar. |
| **Carretera** | Trazo libre (ver "Trazos libres"). |
| **Tren** | Trazo libre dibujado como vía: dos railes con traviesas. |
| **Río** | Trazo libre con contorno de ancho variable. |
| **Ciudad** | Pinta hexágonos que se llenan de casas (ver "Ciudad"). |
| **Pueblo** | Botón presente pero **sin implementar**. |
| **Borrador** 🧹 | Herramienta aparte, no un tipo de terreno (ver "Borrador"). |

### Sistema de capas
- Capa base obligatoria (no se puede ocultar ni borrar), inicializada completa con el color de terreno base.
- Capas adicionales: añadir, renombrar (doble clic), ocultar/mostrar, eliminar. La capa activa se resalta.
- **Opacidad por capa** (deslizador "Opacidad", 0–100 %, 100 % por defecto; no disponible en la base). Afecta a hexágonos, ruido, perfiles ondulados, trazos y casas de esa capa.
- El terreno visible en un hexágono se resuelve recorriendo las capas de arriba a abajo (`getVisibleTerrain`).

### Modos de pintado (para Terreno base)
1. **Hexágono** — relleno de hexágono estándar, opaco.
2. **Perfil ondulado** — agrupa hexágonos contiguos del mismo color/capa/ajustes y dibuja un contorno orgánico:
   - `createGroupContours` (contorno exterior eliminando aristas compartidas) o `createConvexHull`.
   - Agrupación `stroke` (una mancha por arrastre) vs `contour` (una mancha por isla).
   - `drawBezierWavyContour`: contorno Bézier con ondulación sinusoidal; parámetros **Cobertura**, **Ondulaciones**, **Suavidad**.
3. **Perfil libre** — el usuario coloca puntos (contorno con Bézier cúbicos entre ellos, `drawFreeWavyPath`/`getFreeWavyHandles`). Pulsar en el punto inicial cierra la **vista previa** (se ve como mancha rellena) pero no termina la edición: se puede seguir moviendo puntos y tiradores. Solo **Ctrl + clic derecho** finaliza el trazo de verdad (`finishFreeWavy`; con menos de 3 puntos cancela en vez de cerrar). Mismo sistema de edición que río/carretera/tren mientras se dibuja: seleccionar/arrastrar puntos, tiradores de ancla en el punto seleccionado (Alt rompe la simetría), Mayús + clic quita un punto y Esc cancela.

### Trazos libres: río, carretera y tren
Curvas independientes de la rejilla (Bézier cúbicos entre los puntos marcados, `sampleLineSpline`), guardadas por capa en `TerrainLayer.lines` con su tipo (`LineKind`), color, ancho y semilla.

**Controles**
- **Clic izquierdo**: añade un punto al final.
- **Arrastrar un punto**: lo mueve. **Clic sobre un tramo**: inserta un punto ahí y se puede arrastrar sin soltar.
- **Clic en un punto**: lo selecciona (amarillo) y muestra dos ✕: rojo quita el punto, gris cancela todo el trazo. **Mayús + clic** también quita el punto.
- **Tiradores de ancla**: el punto seleccionado muestra sus dos tiradores Bézier (cuadrados azules) para ajustar la curva a mano. Por defecto son automáticos (dan la misma curva suave de siempre); al arrastrar uno se fija y el opuesto gira para mantener el punto "suave" (**Alt + arrastrar** rompe la simetría y deja un punto de esquina).
- **Ctrl + clic derecho**: finaliza el trazo (con menos de 2 puntos lo cancela). El clic derecho normal sigue moviendo la vista.
- **Esc**: cancela el trazo en curso. Botón **Deshacer último trazo**: quita el último trazo de la capa activa.
- Mientras se dibuja hay vista previa semitransparente con la guía de la curva. Los puntos (y sus tiradores) son editables solo hasta finalizar.

**Ajustes** (por tipo de trazo; afectan solo al trazo en curso, los ya finalizados conservan los suyos)
- Color y ancho (4–80).
- Solo río: **Ondulación** del perfil (cada orilla ondula por separado) y **Finalizar en punta** (el extremo final se estrecha).
- Carretera (banda de bordes paralelos, final recto) y tren (railes + traviesas) no tienen ondulación ni punta.

**Sombra de carretera y tren**: ver "Sombras".

### Ciudad
- Con el pincel Ciudad se pintan hexágonos (clic o arrastrar); **Mayús + clic** borra las casas de un hexágono. Las casas se guardan por capa (`TerrainLayer.cities`) y **no alteran el terreno de debajo**.
- Cada hexágono genera casas deterministas (semilla por capa y casilla): vistas desde arriba, tejado a dos aguas con dos tonos, contorno fino, paleta de tejas rojizas/marrones/crema y algunas azul grisáceo. Tamaño y giro variables; la mayoría sigue la orientación de la "manzana" y algunas giran 90°. No se solapan dentro del mismo hexágono.
- **Densidad** (1–14 casas por hexágono, 6 por defecto): se aplica a los hexágonos que se pinten a partir de ese momento.

### Borrador
Herramienta aparte (botón "🧹 Borrador"), no un tipo de terreno: no pinta ningún color y no aparece en `TerrainType`. Al activarla se recuerda el pincel que estaba seleccionado y se restaura solo al apagarla. Actúa sobre la **capa activa**; clic izquierdo y arrastrar para borrar, clic derecho sigue moviendo la vista (`eraseAt`). Contorno del pincel visible bajo el cursor (`drawEraserCursor`) para ver el radio (y, en círculo/cuadrado/diamante, la banda de suavidad) antes de pulsar. Todo lo que se puede recortar (hexágonos, perfil libre, río/carretera, perfil ondulado) usa la misma técnica de **hueco geométrico real**: se renderiza la forma junto al hueco (en `blendMode.ERASE`) en un `RenderTexture` propio y aislado (`renderIsolatedWithErase`, resolución ×3 y filtrado suave para que el borde no se vea "de píxeles"; con una forma muy grande la resolución baja para no pedirle a la GPU una textura más grande de lo que admite, y si algo falla se muestra la forma sin recortar en vez de romper el repintado). `Graphics.beginHole`/`endHole` se probó primero pero daba bordes rotos con curvas Bézier.
- **Suavidad = borde difuminado de verdad** en círculo/cuadrado/diamante (`drawErasedFill`): varios anillos concéntricos con opacidad parcial, que al superponerse (blendMode ERASE reduce opacidad de forma multiplicativa, no es un corte binario) dan un degradado real, más "mordido" cerca del centro. En orgánico/disperso la suavidad no difumina un borde: controla lo irregular/repartido de su propia forma.
- **Hexágonos**: mismo criterio que perfil libre, no un borrado de todo o nada. Los datos del hexágono solo se vacían del todo (dejan de contar para perfil ondulado, capas visibles, etc.) cuando el pincel lo cubre **entero** (sus 6 vértices); si solo toca el centro pero no llega a cubrirlo todo, se queda con un hueco visual (`HexData.erasedHoles`) y sus datos intactos. Con "solo tocar el centro" bastaba, arrastrar el pincel por una zona acababa vaciando casi todos los hexágonos del camino (el centro de cualquiera de ellos cae en el pincel en algún momento del arrastre) — por eso "seguía borrando hexágonos completos".
- **Perfil libre y río/carretera** (son relleno): el hueco se guarda en el propio trazo (`erasedHoles`) sin tocar sus puntos de control, así que un trazo nuevo dibujado después no hereda huecos de otro ya borrado, y se puede vaciar también el interior de la mancha, no solo el borde.
- **Perfil ondulado**: el contorno de un grupo de hexágonos se recalcula desde los datos de esos hexágonos en cada repintado, así que borrar (o simplemente no pintar) un hexágono en medio de una zona rodeada por el resto del grupo deja un agujero real, no solo en el borde. El contorno exacto por aristas (`createGroupContours`) distingue "borde exterior de una isla" de "borde de un agujero" por el sentido de giro del polígono (`signedArea`: fiable con formas cóncavas, a diferencia de mirar dónde cae el centro), y el agujero se recorta igual que perfil libre/río (`cutPolygonHoles`, sin suavidad: es un recorte exacto por hexágono, no de pincel). Aplica tanto a "Una mancha por arrastre" (envolvente convexa con los agujeros ya recortados) como a "Una mancha por grupo" (cada isla con su forma exacta).
- **Tren** (railes, sin relleno que recortar): el trazo se corta en dos (o más) donde el pincel toque puntos en medio.
- **Casas**: se borran por hexágono (como "Mayús + clic" en el pincel Ciudad).
- **Ruido y sombras de río/carretera: de momento sin recorte real** (limitación conocida, no un bug pendiente de arreglar sin más):
  - *Ruido*: su máscara (`noiseMaskWavy`) se acumula en un único `Graphics` compartido por capa; aplicarle huecos por trazo exigiría cambiar cómo se combinan varios trazos en una sola máscara (riesgo de romper algo que ya funciona).
  - *Sombra de río/carretera*: todos los trazos de un tipo se acumulan en un único `Graphics` opaco antes de desenfocar (para que las sombras solapadas no sumen opacidad); añadir huecos ahí con la misma técnica que el relleno arriesgaba reintroducir ese problema.
- **Tren** (railes, sin relleno que recortar): el trazo se corta en dos (o más) donde el pincel toque puntos en medio.
- **Casas**: se borran por hexágono (como "Mayús + clic" en el pincel Ciudad), así que una zona solo borra las casas de los hexágonos que toque.
- **Formas del pincel**: círculo, cuadrado, diamante (bordes limpios, la suavidad solo difumina el borrado de hexágonos) y dos formas irregulares — **orgánico** (contorno desigual tipo borde desgarrado) y **disperso** (varias manchitas sueltas) — donde la suavidad sí controla lo irregular/repartido del hueco. Cada hueco guarda su propia semilla y suavidad (`EraserStamp`) para no deformarse si luego se cambia el ajuste global.
- **Ajustes**: forma, radio (1–6 radios de hexágono) y suavidad (0–100 %).

### Sombras (casas, carreteras y trenes)
Ajustes: **Sombra** (activar, desactivada por defecto), **Dirección** (0°–360°; 0° = derecha, sentido horario, 50° por defecto), **Cenital** (sin desplazamiento, sombra ensanchada un 30 % alrededor; desactiva la dirección), **Desenfoque** gaussiano (0–10) y **Opacidad** (0–100 %).
- Son ajustes **comunes y en vivo**: afectan a todas las casas, o a todas las carreteras / todos los trenes ya dibujados (carretera y tren tienen ajustes independientes).
- Una sola sombra por capa (y por tipo de trazo) en un `Graphics` opaco con un único `BlurFilter`; la opacidad se aplica al conjunto para que las sombras solapadas no se sumen (`drawCityShadows`, `drawLineShadows`, helpers `getShadowVector` y `applyShadowBlur`).
- La sombra de un trazo es el propio trazo desplazado (banda en carretera; railes y traviesas en tren).

### Sistema de textura de ruido por capa
Cada capa puede llevar su propia pila de capas de ruido estilo Photoshop (botón **+ Ruido** dentro de cada capa, `buildNoiseSection`).

- Múltiples ruidos apilables por capa (`TerrainLayer.noiseLayers: NoiseLayerEntry[]`), cada uno con activar/eliminar.
- Parámetros por entrada: **tipo**, **semilla** (número 0–999999 + botón 🎲), dos colores, **tamaño**, **octavas** (1–6), **estirado** horizontal (1–8), **fuerza** (contraste entre ambos colores), **opacidad** y **modo de fusión**.
- **Tipos de ruido** (`getNoiseTexture`, todos tileables): Nube (value), Puntos (ruido blanco), Perlin, Crestas (ridged), Algodón (billow), Celdas (Voronoi) y Vetas (domain warping). Se generan con fBm (amplitud ×0.5 y frecuencia ×2 por octava) y un hash entero determinista; la misma semilla y ajustes dan siempre la misma textura.
- Cada textura se reescala a su rango completo (0–1) antes de aplicar la fuerza, para que todos los tipos tengan el mismo contraste.
- El ruido **solo se aplica a lo realmente pintado en esa capa** (máscaras `noiseMaskNormal` para hexágonos y `noiseMaskWavy` para manchas onduladas, trazo libre y trazos de río/carretera/tren) y respeta la opacidad de la capa.
- **Los 27 modos de fusión de Photoshop** (`NOISE_BLEND_MODE_GROUPS`): 4 usan el blend nativo de la GPU (`NOISE_BLEND_NATIVE_GPU_MODE`) y los otros 23 un shader propio (`NOISE_BLEND_FRAGMENT_SHADER`) que captura lo pintado debajo (`captureNoiseBackdrop`).
- **Presets de ruido**: cada entrada tiene botones 💾 (`exportNoisePreset`, pide un nombre y descarga sus ajustes como `.json` con ese nombre de archivo) y 📂 (`importNoisePreset`, carga un `.json` ya descargado y lo aplica a esa entrada). El preset guarda un nombre y el aspecto (tipo, semilla, colores, tamaño, octavas, estirado, fuerza, opacidad y modo de fusión) pero no `id` ni si está activada, que son de la instancia. Un archivo con datos inválidos o de otro origen se rechaza sin tocar nada.

### Imagen de referencia
Panel derecho (`#info-panel`), botón **"Cargar imagen de referencia"** (`loadReferenceImage`): abre un selector de archivo local y muestra la imagen centrada sobre el tablero, ajustada para caber dentro de él, en un contenedor propio (`referenceImageContainer`) que siempre queda por encima de todo (rejilla incluida) para poder calcarla.
- **Opacidad** (0–100 %, 60 % por defecto) en vivo y botón **"Quitar imagen"**.
- **Mover / escalar imagen** (checkbox): mientras está activo, el botón izquierdo arrastra la imagen y la rueda del ratón hace zoom centrado en el cursor (`zoomReferenceImageAt`), sin pintar ni mover el resto de herramientas; el botón derecho sigue moviendo la vista del mapa como siempre.
- Al no estar dentro de una capa, no se guarda con el mapa (no hay persistencia, ver limitaciones) y se pierde al pulsar "Crear/Reiniciar Mapa".

### Renderizado
- `dibujarTableroCompleto()` repinta base + capas + casas + overlay ondulado (manchas, trazo libre, sombras y trazos) + ruido + rejilla en cada cambio.
- Los perfiles ondulados, el trazo libre y los trazos de línea viven en un contenedor común (`wavyOverlayContainer`) por encima de todas las capas.
- Panel de información lateral: terreno por capa del hexágono seleccionado (indica "+ casas" si tiene).

## Limitaciones conocidas
- **Pendiente de pruebas visuales en navegador**: las últimas funciones (trazos y edición de puntos, tren, ciudad, sombras con desenfoque y dirección, tipos de ruido nuevos) se han implementado y compilan, pero no se han comprobado a fondo en pantalla.
- Los trazos de río/carretera/tren, los perfiles ondulados y el trazo libre **no respetan el orden entre capas** (siempre se dibujan encima de las capas de hexágonos y de las casas).
- Con curvas muy cerradas y trazos anchos, la orilla interior de río/carretera puede solaparse y verse mal.
- No hay unión suavizada entre ríos (confluencias): se pueden solapar dos ríos, pero sin fusión de contornos.
- Un trazo finalizado no se puede editar (solo deshacer el último). El trazo libre tampoco es editable tras cerrarse.
- Las casas: el patrón de cada hexágono es fijo (no hay botón para regenerarlo), la densidad no se puede cambiar de golpe en hexágonos ya pintados sin repintarlos, y pueden tocarse entre hexágonos vecinos.
- El pincel **Pueblo** no está implementado. Tampoco hay iconos/sprites de vehículos.
- Sin persistencia: no hay guardar/cargar mapa, exportar imagen, ni deshacer/rehacer general.
- El modo "Disolver" del ruido solo se verificó en opacidades 0 % y 100 %.
- Los modos de fusión no nativos regeneran una captura de pantalla completa por cada capa de ruido en cada repintado; con muchas activas a la vez podría notarse (no se ha medido el límite práctico).
- No hay textura de papel/pergamino independiente del terreno pintado ni texturas fotográficas (solo ruido procedural de 2 colores).

## Referencia visual objetivo
Mapa estilo wargame con textura de pergamino, bosques con manchas orgánicas, ríos y vías/carreteras serpenteantes, y asentamientos con casitas vistas desde arriba (se aportaron imágenes de referencia de ríos/vías y de un núcleo de casas).

### Ya cubierto
- Manchas orgánicas de bosque: modo **ondulado** con cobertura/ondulaciones/suavidad.
- Textura interna de los terrenos: **ruido por capa** con tipos, semilla y modos de fusión.
- Ríos, carreteras y vías de tren como curvas libres con sombra opcional (carretera y tren).
- Asentamientos tipo ciudad con casitas y sombra.

### Pendiente respecto a la referencia
1. **Pueblo**: mismo sistema de casas que Ciudad, presumiblemente más disperso.
2. **Casing del río/carretera** (borde más oscuro) y confluencias de ríos.
3. **Textura de papel/pergamino** independiente del terreno (imagen tileable).
4. **Orden entre capas** para trazos y manchas onduladas.
5. **Sombreado/relieve en bordes** de bosques y agua (halo oscuro sutil) reutilizando el sistema de sombras.
6. Persistencia (guardar/cargar, exportar imagen) y deshacer/rehacer.

## Próxima sesión — punto de partida
- Lo último implementado: sombra (activar, dirección 0–360°, cenital, desenfoque y opacidad) también para carretera y tren, reutilizando la lógica de las casas.
- Todo lo de esta sesión está **sin commitear** (`Editor-Terreno.php`, `css/terrain-editor.css`, `js/terrain-editor.ts`, `dist/terrain-editor/terrain-editor.js` y este README).
- Siguiente paso natural: revisar visualmente en el navegador los pinceles nuevos y decidir cómo debe ser **Pueblo**.

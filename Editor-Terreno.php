<!DOCTYPE html>
<html lang="es">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Editor de Terreno</title>
    <link rel="stylesheet" href="css/terrain-editor.css">
</head>

<body>

    <div class="terrain-editor">
        <!-- BARRA SUPERIOR -->
        <div class="terrain-toolbar">
            <label>
                Columnas:
                <input type="number" id="terrainCols" value="20">
            </label>
            <label>
                Filas:
                <input type="number" id="terrainRows" value="15">
            </label>
            <label>
                Tamaño Hex:
                <input type="number" id="hexSize" value="40">
            </label>
            <fieldset class="paint-mode-control">
                <legend>Modo de pintado</legend>
                <button type="button" class="paint-mode-option selected" data-paint-mode="normal" aria-pressed="true">Hexágono</button>
                <button type="button" class="paint-mode-option" data-paint-mode="ondulado" aria-pressed="false">Perfil ondulado</button>
                <button type="button" class="paint-mode-option" data-paint-mode="ondulado-libre" aria-pressed="false">Perfil libre</button>
                <label class="paint-setting">
                    Agrupación
                    <select id="wavyGrouping">
                        <option value="stroke">Una mancha por arrastre</option>
                        <option value="contour">Una mancha por grupo</option>
                    </select>
                </label>
                <label class="paint-setting">
                    Cobertura
                    <input id="wavyCoverage" type="range" min="10" max="100" step="10" value="100">
                    <output id="wavyCoverageValue">100%</output>
                </label>
                <label class="paint-setting">
                    Ondulaciones
                    <input id="wavyWaves" type="range" min="1" max="8" step="1" value="3">
                    <output id="wavyWavesValue">3</output>
                </label>
                <label class="paint-setting">
                    Suavidad
                    <input id="wavySmoothness" type="range" min="0" max="100" step="10" value="50">
                    <output id="wavySmoothnessValue">50%</output>
                </label>
            </fieldset>
            <button id="createTerrain">Crear/Reiniciar Mapa</button>
            <button type="button" id="toggleGrid">Ocultar malla</button>
        </div>


        <!-- CUERPO -->
        <div class="terrain-workspace">
            <!-- PANEL LATERAL -->
            <div class="terrain-panel">
                <h3>Tipos de Terrenos</h3>
                <div class="terrain-types">
                    <div class="terrain-type-row">
                        <button class="terrain-type selected" data-terrain="base">
                            <span class="terrain-color" id="baseTerrainSwatch" style="background:#8fbc6b"></span> Terreno base
                        </button>
                        <input type="color" id="baseTerrainColor" value="#8fbc6b" title="Color del terreno base">
                    </div>
                    <button class="terrain-type" data-terrain="carretera">
                        <span class="terrain-color carretera"></span> Carretera
                    </button>
                    <button class="terrain-type" data-terrain="tren">
                        <span class="terrain-color tren"></span> Tren
                    </button>
                    <button class="terrain-type" data-terrain="rio">
                        <span class="terrain-color rio"></span> Río
                    </button>
                    <button class="terrain-type" data-terrain="ciudad">
                        <span class="terrain-color ciudad"></span> Ciudad
                    </button>
                    <button class="terrain-type" data-terrain="pueblo">
                        <span class="terrain-color pueblo"></span> Pueblo
                    </button>
                </div>

                <!-- AJUSTES DE TRAZO (visibles con los pinceles Rio, Carretera y Tren) -->
                <div id="line-settings" class="line-settings" hidden>
                    <label>Color <input type="color" id="lineColor" value="#3d82b8"></label>
                    <label>Ancho <input type="range" id="lineWidth" min="4" max="80" step="1" value="20"><output id="lineWidthValue">20</output></label>
                    <label class="line-river-only">Ondulación <input type="range" id="lineWaviness" min="0" max="100" step="5" value="40"><output id="lineWavinessValue">40%</output></label>
                    <label class="line-check line-river-only"><input type="checkbox" id="lineTaper" checked> Finalizar en punta</label>
                    <div id="line-shadow-group" class="line-shadow-group" hidden>
                        <label class="line-check"><input type="checkbox" id="lineShadow"> Sombra</label>
                        <label class="line-check"><input type="checkbox" id="lineShadowCenital"> Cenital (sin dirección)</label>
                        <label>Dirección <input type="range" id="lineShadowDirection" min="0" max="360" step="5" value="50"><output id="lineShadowDirectionValue">50°</output></label>
                        <label>Desenfoque <input type="range" id="lineShadowBlur" min="0" max="10" step="0.5" value="3"><output id="lineShadowBlurValue">3</output></label>
                        <label>Opacidad sombra <input type="range" id="lineShadowOpacity" min="0" max="100" step="5" value="40"><output id="lineShadowOpacityValue">40%</output></label>
                    </div>
                    <button type="button" id="lineUndo">Deshacer último trazo</button>
                    <p class="line-hint">Clic izquierdo: añadir punto, arrastrar uno o insertar sobre un tramo<br>Clic en un punto: aparecen dos ✕ (rojo: quitar punto, gris: cancelar trazo)<br>Mayús + clic: quitar punto<br>Ctrl + clic derecho: finalizar<br>Clic derecho (arrastrar): mover la vista<br>Esc: cancelar</p>
                </div>

                <!-- AJUSTES DE CIUDAD (visibles con el pincel Ciudad) -->
                <div id="city-settings" class="line-settings" hidden>
                    <label>Densidad <input type="range" id="cityDensity" min="1" max="14" step="1" value="6"><output id="cityDensityValue">6</output></label>
                    <label class="line-check"><input type="checkbox" id="cityShadow"> Sombra</label>
                    <label class="line-check"><input type="checkbox" id="cityShadowCenital"> Cenital (sin dirección)</label>
                    <label>Dirección <input type="range" id="cityShadowDirection" min="0" max="360" step="5" value="50"><output id="cityShadowDirectionValue">50°</output></label>
                    <label>Desenfoque <input type="range" id="cityShadowBlur" min="0" max="10" step="0.5" value="3"><output id="cityShadowBlurValue">3</output></label>
                    <label>Opacidad sombra <input type="range" id="cityShadowOpacity" min="0" max="100" step="5" value="40"><output id="cityShadowOpacityValue">40%</output></label>
                    <p class="line-hint">Pinta hexágonos para colocar casas<br>Mayús + clic: borrar las casas del hexágono<br>La densidad se aplica a los hexágonos que pintes; la sombra, a todas las casas</p>
                </div>

    <!-- === NUEVO PANEL DE CAPAS === -->
    <div class="layers-panel">
        <div class="layers-header">
            <h3>Capas</h3>
            <button id="add-layer-btn" class="layer-btn">+</button>
        </div>
        <ul id="layer-list" class="layer-list">
            <!-- Las capas se generarán aquí con JavaScript -->
        </ul>
    </div>

<!-- ... resto del panel ... -->

            </div>

            <!-- CONTENEDOR DEL MAPA -->
            <div class="terrain-container" id="canvasContainer">
                <!-- El lienzo de PIXI.js se insertará aquí -->
            </div>
            <div id="info-panel" class="terrain-panel">
        <h3>Hexágono Seleccionado</h3>
        <div id="hex-info-content">
            <p>Haz clic en un hexágono para ver sus detalles.</p>
        </div>
    </div>
        </div>
        
    </div>

    <!--
    Asegúrate de que esta ruta a PIXI.js es correcta.
    Puedes descargarlo o usar un CDN como este.
    -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.4.2/pixi.min.js"></script>

    <!--
    Asegúrate de que la ruta a tu script del editor es correcta.
    Usa la versión más reciente de tu archivo.
    -->
    <script src="dist/terrain-editor/terrain-editor.js"></script>

</body>

</html>
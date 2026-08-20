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
                    <button class="terrain-type selected" data-terrain="llanura">
                        <span class="terrain-color llanura"></span> Llanura
                    </button>
                    <button class="terrain-type" data-terrain="bosque">
                        <span class="terrain-color bosque"></span> Bosque
                    </button>
                    <button class="terrain-type" data-terrain="montana">
                        <span class="terrain-color montana"></span> Montaña
                    </button>
                    <button class="terrain-type" data-terrain="agua">
                        <span class="terrain-color agua"></span> Agua
                    </button>
                    <button class="terrain-type" data-terrain="desierto">
                        <span class="terrain-color desierto"></span> Desierto
                    </button>
                    <button class="terrain-type" data-terrain="carretera">
                        <span class="terrain-color carretera"></span> Carretera
                    </button>
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
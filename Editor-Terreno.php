<!DOCTYPE html>
<html lang="es">

<head>

    <meta charset="UTF-8">

    <meta
        name="viewport"
        content="width=device-width, initial-scale=1.0"
    >

    <title>Editor de terreno</title>

    <link
        rel="stylesheet"
        href="css/terrain-editor.css"
    >

</head>

<body>

<div class="terrain-editor">

    <!-- BARRA SUPERIOR -->

    <div class="terrain-toolbar">

        <label>
            Columnas:
            <input
                type="number"
                id="terrainCols"
                value="10"
                min="1"
            >
        </label>

        <label>
            Filas:
            <input
                type="number"
                id="terrainRows"
                value="10"
                min="1"
            >
        </label>

        <label>
            Tamaño:
            <input
                type="number"
                id="hexSize"
                value="40"
                min="5"
            >
        </label>

        <button id="createTerrain">
            Crear terreno
        </button>

    </div>


    <!-- CUERPO DEL EDITOR -->

    <div class="terrain-workspace">


        <!-- PANEL DE TERRENOS -->

        <aside class="terrain-panel">

            <h3>Tipos de terreno</h3>

            <div
                id="terrainTypes"
                class="terrain-types"
            >

                <button
                    class="terrain-type"
                    data-terrain="llanura"
                >
                    <span class="terrain-color llanura"></span>
                    Llanura
                </button>


                <button
                    class="terrain-type"
                    data-terrain="bosque"
                >
                    <span class="terrain-color bosque"></span>
                    Bosque
                </button>


                <button
                    class="terrain-type"
                    data-terrain="montana"
                >
                    <span class="terrain-color montana"></span>
                    Montaña
                </button>


                <button
                    class="terrain-type"
                    data-terrain="agua"
                >
                    <span class="terrain-color agua"></span>
                    Agua
                </button>


                <button
                    class="terrain-type"
                    data-terrain="desierto"
                >
                    <span class="terrain-color desierto"></span>
                    Desierto
                </button>


                <button
                    class="terrain-type"
                    data-terrain="carretera"
                >
                    <span class="terrain-color carretera"></span>
                    Carretera
                </button>

            </div>

        </aside>


        <!-- MAPA -->

        <div class="terrain-container">

            <canvas id="terrainCanvas"></canvas>

        </div>

    </div>

</div>


<script src="js/terrain-editor.js"></script>

</body>

</html>
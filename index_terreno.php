<!DOCTYPE html>
<html lang="es">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width,
               initial-scale=1.0,
               maximum-scale=1.0,
               user-scalable=no">

<title>Wargame Web</title>


<style>

/* =====================================================
   GENERAL
===================================================== */

* {
    box-sizing: border-box;
}

html,
body {

    margin: 0;
    padding: 0;

    width: 100%;
    height: 100%;

    overflow: hidden;

    background: #202020;

    font-family: Arial, sans-serif;
}


/* =====================================================
   APP
===================================================== */

#app {

    width: 100%;
    height: 100%;

    display: flex;
    flex-direction: column;

}


/* =====================================================
   TOOLBAR
===================================================== */

#toolbar {

    height: 52px;

    flex-shrink: 0;

    background: #292929;

    border-bottom: 1px solid #555;

    display: flex;

    align-items: center;

    gap: 6px;

    padding: 6px;

    color: white;

    z-index: 20;

}


#toolbar button {

    height: 38px;

    min-width: 40px;

    padding: 0 12px;

    border: 1px solid #666;

    border-radius: 5px;

    background: #3a3a3a;

    color: white;

    font-size: 14px;

    cursor: pointer;

    touch-action: manipulation;

}


#toolbar button:active {

    background: #555;

}


#titulo {

    font-weight: bold;

    margin-right: 10px;

    white-space: nowrap;

}


#zoomTexto {

    min-width: 55px;

    text-align: center;

    font-size: 13px;

    color: #ccc;

}


/* =====================================================
   MAPA
===================================================== */

#main {

    position: relative;

    flex: 1;

    min-height: 0;

    overflow: hidden;

}


#canvas {

    position: absolute;

    inset: 0;

    width: 100%;
    height: 100%;

    touch-action: none;

}


/* =====================================================
   PANEL
===================================================== */

#panelFicha {

    position: absolute;

    right: 12px;

    top: 12px;

    width: 240px;

    max-width: calc(100% - 24px);

    background: rgba(35,35,35,.96);

    color: white;

    border: 1px solid #777;

    border-radius: 7px;

    padding: 12px;

    display: none;

    z-index: 10;

}


#panelFicha.visible {

    display: block;

}


#panelFicha h3 {

    margin: 0 0 10px 0;

    font-size: 17px;

}


#panelFicha h4 {

    margin: 12px 0 5px 0;

    font-size: 14px;

    color: #ddd;

}


#terrenoContenido {

    max-height: 130px;

    overflow-y: auto;

    font-size: 12px;

}


.terrenoFicha {

    padding: 4px 0;

    border-bottom: 1px solid #444;

}


.terrenoFichaSeleccionada {

    color: #ffff00;

}


.dato {

    display: flex;

    justify-content: space-between;

    padding: 5px 0;

    border-bottom: 1px solid #444;

    font-size: 13px;

}


#panelFicha button {

    width: 100%;

    margin-top: 10px;

    padding: 8px;

    background: #444;

    color: white;

    border: 1px solid #777;

    border-radius: 4px;

}


/* =====================================================
   DADOS
===================================================== */

#resultadoDados {

    position: absolute;

    left: 50%;

    bottom: 20px;

    transform: translateX(-50%);

    padding: 10px 18px;

    background: rgba(20,20,20,.9);

    color: white;

    border-radius: 6px;

    display: none;

    z-index: 15;

    font-size: 16px;

}

</style>

</head>


<body>


<div id="app">


<!-- =================================================
     TOOLBAR
================================================= -->

<div id="toolbar">

    <span id="titulo">
        WARGAME WEB
    </span>


    <button id="btnZoomMenos">
        −
    </button>


    <span id="zoomTexto">
        100%
    </span>


    <button id="btnZoomMas">
        +
    </button>


    <button id="btnCentro">
        ⌖
    </button>


    <button id="btnDados">
        🎲
    </button>

</div>


<!-- =================================================
     ZONA MAPA
================================================= -->

<div id="main">


    <canvas id="canvas"></canvas>


    <!-- PANEL FICHA -->

    <div id="panelFicha">

        <h3 id="fichaNombre">
            Ficha
        </h3>


        <div class="dato">

            <span>Tipo</span>

            <span id="fichaTipo"></span>

        </div>


        <div class="dato">

            <span>Bando</span>

            <span id="fichaBando"></span>

        </div>


        <div class="dato">

            <span>Hexágono</span>

            <span id="fichaHex"></span>

        </div>


        <!-- DATOS DEL TERRENO -->

        <div id="datosTerreno">

            <h4>Terreno</h4>

            <div class="dato">

                <span>Tipo</span>

                <span id="terrenoTipo"></span>

            </div>


            <div class="dato">

                <span>Coste movimiento</span>

                <span id="terrenoMovimiento"></span>

            </div>


            <div class="dato">

                <span>Mod. combate</span>

                <span id="terrenoCombate"></span>

            </div>


            <div class="dato">

                <span>Elevación</span>

                <span id="terrenoElevacion"></span>

            </div>


            <h4>Contenido del hexágono</h4>

            <div id="terrenoContenido">

                <span>Vacío</span>

            </div>

        </div>


        <div
            id="datosUnidad"
        >

            <div class="dato">

                <span>Fuerza</span>

                <span id="fichaFuerza"></span>

            </div>


            <div class="dato">

                <span>Movimiento</span>

                <span id="fichaMovimiento"></span>

            </div>


            <div class="dato">

                <span>Defensa</span>

                <span id="fichaDefensa"></span>

            </div>


            <div class="dato">

                <span>Pasos</span>

                <span id="fichaPasos"></span>

            </div>

        </div>


        <div
            id="datosChit"
            style="display:none"
        >

            <div class="dato">

                <span>Tipo chit</span>

                <span id="fichaChitTipo"></span>

            </div>


            <div class="dato">

                <span>Estado</span>

                <span id="fichaEstado"></span>

            </div>

        </div>


        <button id="btnRotar">

            ↻ Rotar

        </button>


        <button id="btnCerrar">

            Cerrar

        </button>

    </div>


    <div id="resultadoDados"></div>


</div>


</div>


<script>

/* =====================================================
   CONFIGURACIÓN
===================================================== */

const canvas =
    document.getElementById("canvas");

const ctx =
    canvas.getContext("2d");

const main =
    document.getElementById("main");


const HEX_SIZE_BASE = 38;

const MAP_COLUMNAS = 30;

const MAP_FILAS = 20;


/* =====================================================
   CÁMARA
===================================================== */

let zoom = 1;

let cameraX = 0;

let cameraY = 50;


/* =====================================================
   CLASE FICHA
===================================================== */

class Ficha {

    constructor(datos) {

        this.id =
            datos.id;

        this.nombre =
            datos.nombre;

        this.col =
            datos.col;

        this.row =
            datos.row;

        this.rotacion =
            datos.rotacion ?? 0;

        this.visible =
            datos.visible ?? true;

    }

}


/* =====================================================
   CLASE UNIDAD
===================================================== */

class Unidad extends Ficha {

    constructor(datos) {

        super(datos);


        this.tipoFicha =
            "unidad";


        this.bando =
            datos.bando;


        this.fuerza =
            datos.fuerza;


        this.movimiento =
            datos.movimiento;


        this.defensa =
            datos.defensa;


        this.pasos =
            datos.pasos;


        this.color =
            datos.color;

    }

}


/* =====================================================
   CLASE CHIT
===================================================== */

class Chit extends Ficha {

    constructor(datos) {

        super(datos);


        this.tipoFicha =
            "chit";


        this.bando =
            datos.bando ?? "";


        this.tipoChit =
            datos.tipoChit;


        this.estado =
            datos.estado ?? "";

    }

}


/* =====================================================
   CLASE STACK
===================================================== */

class Stack {

    constructor(col, row) {

        this.col =
            col;

        this.row =
            row;

        this.fichas =
            [];

    }


    añadir(ficha) {

        ficha.col =
            this.col;

        ficha.row =
            this.row;


        this.fichas.push(
            ficha
        );

    }


    quitar(ficha) {

        this.fichas =
            this.fichas.filter(
                f =>
                    f.id !==
                    ficha.id
            );

    }


    estaVacio() {

        return this.fichas.length === 0;

    }


    cantidad() {

        return this.fichas.length;

    }

}


/* =====================================================
   CLASE HEXÁGONO
===================================================== */

/* =====================================================
   CLASE TIPO TERRENO
===================================================== */

class TipoTerreno {

    constructor(datos) {

        this.id =
            datos.id;

        this.nombre =
            datos.nombre;

        this.costeMovimiento =
            datos.costeMovimiento ?? 1;

        this.modificadorCombate =
            datos.modificadorCombate ?? 0;

    }

}


/* =====================================================
   CLASE TERRENO
===================================================== */

class Terreno {

    constructor(col, row, tipo) {

        this.col =
            col;

        this.row =
            row;

        this.tipo =
            tipo;

        this.elevacion =
            0;

        this.unidades =
            [];

        this.chits =
            [];

    }


    añadirUnidad(unidad) {

        if (
            !this.unidades.includes(unidad)
        ) {

            this.unidades.push(
                unidad
            );

        }

    }


    quitarUnidad(unidad) {

        const indice =
            this.unidades.indexOf(
                unidad
            );

        if (
            indice !== -1
        ) {

            this.unidades.splice(
                indice,
                1
            );

        }

    }


    añadirChit(chit) {

        if (
            !this.chits.includes(chit)
        ) {

            this.chits.push(
                chit
            );

        }

    }


    quitarChit(chit) {

        const indice =
            this.chits.indexOf(
                chit
            );

        if (
            indice !== -1
        ) {

            this.chits.splice(
                indice,
                1
            );

        }

    }


    tieneUnidades() {

        return this.unidades.length > 0;

    }


    tieneChits() {

        return this.chits.length > 0;

    }


    estaOcupado() {

        return this.tieneUnidades() ||
               this.tieneChits();

    }


    obtenerFichas() {

        return [
            ...this.unidades,
            ...this.chits
        ];

    }

}


/* =====================================================
   TIPOS DE TERRENO
===================================================== */

const TIPOS_TERRENO = {

    llano:
        new TipoTerreno({

            id:
                "llano",

            nombre:
                "Llanura",

            costeMovimiento:
                1,

            modificadorCombate:
                0

        }),

    bosque:
        new TipoTerreno({

            id:
                "bosque",

            nombre:
                "Bosque",

            costeMovimiento:
                2,

            modificadorCombate:
                1

        }),

    montaña:
        new TipoTerreno({

            id:
                "montaña",

            nombre:
                "Montaña",

            costeMovimiento:
                3,

            modificadorCombate:
                2

        }),

    pantano:
        new TipoTerreno({

            id:
                "pantano",

            nombre:
                "Pantano",

            costeMovimiento:
                3,

            modificadorCombate:
                1

        }),

    ciudad:
        new TipoTerreno({

            id:
                "ciudad",

            nombre:
                "Ciudad",

            costeMovimiento:
                2,

            modificadorCombate:
                2

        })

};


/* =====================================================
   CLASE HEXÁGONO
===================================================== */

class Hexagono {

    constructor(col, row) {

        this.col =
            col;

        this.row =
            row;

        this.stack =
            new Stack(
                col,
                row
            );

        this.terreno =
            new Terreno(
                col,
                row,
                TIPOS_TERRENO.llano
            );

    }

}


/* =====================================================
   MAPA
===================================================== */

class Mapa {

    constructor() {

        this.hexagonos = [];

        this.crearMapa();

    }


    crearMapa() {

        for (
            let row = 0;
            row < MAP_FILAS;
            row++
        ) {

            for (
                let col = 0;
                col < MAP_COLUMNAS;
                col++
            ) {

                this.hexagonos.push(

                    new Hexagono(
                        col,
                        row
                    )

                );

            }

        }

    }


    obtenerHex(col, row) {

        return this.hexagonos.find(
            h =>
                h.col === col &&
                h.row === row
        );

    }

}


/* =====================================================
   CREAR MAPA
===================================================== */

const mapa =
    new Mapa();


/* =====================================================
   CREAR UNIDADES
===================================================== */

const unidad1 =
    new Unidad({

        id: 1,

        nombre: "1st Infantry",

        bando: "USA",

        fuerza: 4,

        movimiento: 5,

        defensa: 4,

        pasos: 2,

        col: 5,

        row: 4,

        rotacion: 0,

        color: "#3d6f42"

    });


const unidad2 =
    new Unidad({

        id: 2,

        nombre: "Panzer Division",

        bando: "GER",

        fuerza: 6,

        movimiento: 6,

        defensa: 5,

        pasos: 3,

        col: 9,

        row: 5,

        rotacion: 180,

        color: "#77704a"

    });


const unidad3 =
    new Unidad({

        id: 3,

        nombre: "Artillery",

        bando: "USA",

        fuerza: 3,

        movimiento: 2,

        defensa: 2,

        pasos: 2,

        col: 7,

        row: 7,

        rotacion: 0,

        color: "#3d6f42"

    });


/* =====================================================
   CREAR CHITS
===================================================== */

const chit1 =
    new Chit({

        id: 100,

        nombre: "Movimiento +1",

        bando: "USA",

        tipoChit: "Movimiento",

        estado: "Activo",

        col: 5,

        row: 4,

        rotacion: 0

    });


const chit2 =
    new Chit({

        id: 101,

        nombre: "Desorganizado",

        bando: "GER",

        tipoChit: "Estado",

        estado: "Desorganizado",

        col: 9,

        row: 5,

        rotacion: 0

    });


/* =====================================================
   COLOCAR FICHAS EN STACKS
===================================================== */

mapa
    .obtenerHex(
        unidad1.col,
        unidad1.row
    )
    .stack
    .añadir(unidad1);


mapa
    .obtenerHex(
        unidad2.col,
        unidad2.row
    )
    .stack
    .añadir(unidad2);


mapa
    .obtenerHex(
        unidad3.col,
        unidad3.row
    )
    .stack
    .añadir(unidad3);


mapa
    .obtenerHex(
        chit1.col,
        chit1.row
    )
    .stack
    .añadir(chit1);


mapa
    .obtenerHex(
        chit2.col,
        chit2.row
    )
    .stack
    .añadir(chit2);


/* =====================================================
   RENDERER
===================================================== */

class Renderer {


    constructor(canvas, ctx) {

        this.canvas =
            canvas;

        this.ctx =
            ctx;

    }


    hexSize() {

        return HEX_SIZE_BASE *
               zoom;

    }


    hexWidth() {

        return Math.sqrt(3) *
               this.hexSize();

    }


    hexHeight() {

        return this.hexSize() * 2;

    }


    hexPosition(col, row) {

        const w =
            this.hexWidth();


        const h =
            this.hexHeight();


        return {

            x:
                cameraX +
                col * w +
                (row % 2) *
                (w / 2),

            y:
                cameraY +
                row * h *
                0.75

        };

    }


    dibujarHex(x, y, size) {

        const ctx =
            this.ctx;


        ctx.beginPath();


        for (
            let i = 0;
            i < 6;
            i++
        ) {

            const angulo =
                Math.PI / 180 *
                (60 * i - 30);


            const px =
                x +
                size *
                Math.cos(
                    angulo
                );


            const py =
                y +
                size *
                Math.sin(
                    angulo
                );


            if (i === 0) {

                ctx.moveTo(
                    px,
                    py
                );

            } else {

                ctx.lineTo(
                    px,
                    py
                );

            }

        }


        ctx.closePath();

    }


    dibujarMapa() {

        const ctx =
            this.ctx;


        const size =
            this.hexSize();


        for (
            let row = 0;
            row < MAP_FILAS;
            row++
        ) {

            for (
                let col = 0;
                col < MAP_COLUMNAS;
                col++
            ) {

                const pos =
                    this.hexPosition(
                        col,
                        row
                    );


                this.dibujarHex(
                    pos.x,
                    pos.y,
                    size
                );


                const terreno =
                    (
                        col * 17 +
                        row * 23
                    ) % 5;


                if (
                    terreno === 0
                ) {

                    ctx.fillStyle =
                        "#52624d";

                } else if (
                    terreno === 1
                ) {

                    ctx.fillStyle =
                        "#59654f";

                } else {

                    ctx.fillStyle =
                        "#5e654f";

                }


                ctx.fill();


                ctx.strokeStyle =
                    "#3f4438";

                ctx.lineWidth = 1;

                ctx.stroke();

            }

        }

    }


    dibujarFicha(
        ficha,
        indiceStack
    ) {

        const ctx =
            this.ctx;


        const pos =
            this.hexPosition(
                ficha.col,
                ficha.row
            );


        const size =
            this.hexSize();


        /*
         * Las fichas apiladas se desplazan
         * ligeramente para que puedan verse.
         */

        const offset =
            indiceStack *
            size *
            .16;


        ctx.save();


        ctx.translate(
            pos.x + offset,
            pos.y + offset
        );


        ctx.rotate(
            ficha.rotacion *
            Math.PI / 180
        );


        if (
            ficha instanceof Unidad
        ) {

            this.dibujarUnidad(
                ficha,
                size
            );

        } else if (
            ficha instanceof Chit
        ) {

            this.dibujarChit(
                ficha,
                size
            );

        }


        ctx.restore();

    }


    dibujarUnidad(
        unidad,
        size
    ) {

        const ctx =
            this.ctx;


        const ancho =
            size * 1.15;


        const alto =
            size * .70;


        /*
         * Sombra
         */

        ctx.fillStyle =
            "rgba(0,0,0,.45)";


        ctx.fillRect(
            -ancho / 2 + 3,
            -alto / 2 + 3,
            ancho,
            alto
        );


        /*
         * Counter
         */

        ctx.fillStyle =
            unidad.color;


        ctx.fillRect(
            -ancho / 2,
            -alto / 2,
            ancho,
            alto
        );


        /*
         * Selección
         */

        if (
            fichaSeleccionada &&
            fichaSeleccionada.id ===
            unidad.id
        ) {

            ctx.strokeStyle =
                "#ffff00";

            ctx.lineWidth = 3;

        } else {

            ctx.strokeStyle =
                "#111";

            ctx.lineWidth = 2;

        }


        ctx.strokeRect(
            -ancho / 2,
            -alto / 2,
            ancho,
            alto
        );


        /*
         * Símbolo OTAN simplificado
         */

        ctx.strokeStyle =
            "#fff";

        ctx.lineWidth = 2;


        ctx.beginPath();

        ctx.moveTo(
            -ancho * .30,
            0
        );

        ctx.lineTo(
            ancho * .30,
            0
        );

        ctx.stroke();


        /*
         * Fuerza
         */

        ctx.fillStyle =
            "#fff";

        ctx.font =
            `${Math.max(
                10,
                size * .28
            )}px Arial`;

        ctx.textAlign =
            "center";

        ctx.textBaseline =
            "middle";


        ctx.fillText(
            unidad.fuerza,
            0,
            -alto * .28
        );


        /*
         * Movimiento
         */

        ctx.font =
            `${Math.max(
                9,
                size * .22
            )}px Arial`;


        ctx.fillText(
            unidad.movimiento,
            0,
            alto * .28
        );

    }


    dibujarChit(
        chit,
        size
    ) {

        const ctx =
            this.ctx;


        const ancho =
            size * .95;


        const alto =
            size * .65;


        /*
         * Chit amarillo
         */

        ctx.fillStyle =
            "#c8a93a";


        ctx.fillRect(
            -ancho / 2,
            -alto / 2,
            ancho,
            alto
        );


        ctx.strokeStyle =
            "#302b15";


        ctx.lineWidth = 2;


        ctx.strokeRect(
            -ancho / 2,
            -alto / 2,
            ancho,
            alto
        );


        /*
         * Símbolo
         */

        ctx.fillStyle =
            "#222";


        ctx.font =
            `${Math.max(
                10,
                size * .25
            )}px Arial`;


        ctx.textAlign =
            "center";


        ctx.textBaseline =
            "middle";


        ctx.fillText(
            "CHIT",
            0,
            0
        );

    }


    dibujarStacks() {

        for (
            const hex of
            mapa.hexagonos
        ) {

            hex.stack.fichas
                .forEach(
                    (ficha, indice) => {

                        this.dibujarFicha(
                            ficha,
                            indice
                        );

                    }
                );

        }

    }


    dibujar() {

        this.ctx.clearRect(
            0,
            0,
            main.clientWidth,
            main.clientHeight
        );


        this.dibujarMapa();

        this.dibujarStacks();

    }

}


const renderer =
    new Renderer(
        canvas,
        ctx
    );


/* =====================================================
   SELECCIÓN
===================================================== */

let fichaSeleccionada =
    null;


function obtenerPosicionHex(
    col,
    row
) {

    return renderer.hexPosition(
        col,
        row
    );

}


function encontrarHex(
    x,
    y
) {

    let mejor = null;

    let distanciaMinima =
        Infinity;


    for (
        let row = 0;
        row < MAP_FILAS;
        row++
    ) {

        for (
            let col = 0;
            col < MAP_COLUMNAS;
            col++
        ) {

            const pos =
                obtenerPosicionHex(
                    col,
                    row
                );


            const d =
                Math.hypot(
                    x - pos.x,
                    y - pos.y
                );


            if (
                d <
                distanciaMinima
            ) {

                distanciaMinima =
                    d;

                mejor = {

                    col,
                    row

                };

            }

        }

    }


    return mejor;

}


/*
 * Devuelve la última ficha del stack,
 * que visualmente es la que está arriba.
 */

function encontrarFicha(
    x,
    y
) {

    const hex =
        encontrarHex(
            x,
            y
        );


    if (!hex)
        return null;


    const stack =
        mapa.obtenerHex(
            hex.col,
            hex.row
        ).stack;


    if (
        stack.estaVacio()
    )
        return null;


    return stack.fichas[
        stack.fichas.length - 1
    ];

}


/* =====================================================
   MOVER FICHA
===================================================== */

function moverFicha(
    ficha,
    nuevoCol,
    nuevoRow
) {

    const hexOrigen =
        mapa.obtenerHex(
            ficha.col,
            ficha.row
        );


    const hexDestino =
        mapa.obtenerHex(
            nuevoCol,
            nuevoRow
        );


    if (
        !hexOrigen ||
        !hexDestino
    )
        return;


    /*
     * Quitar del stack anterior
     */

    hexOrigen.stack.quitar(
        ficha
    );


    /*
     * Actualizar posición
     */

    ficha.col =
        nuevoCol;

    ficha.row =
        nuevoRow;


    /*
     * Añadir al nuevo stack
     */

    hexDestino.stack.añadir(
        ficha
    );

}


/* =====================================================
   PANEL
===================================================== */

function mostrarPanel(
    ficha
) {

    /*
     * Datos de la ficha seleccionada
     */
    document
        .getElementById(
            "fichaNombre"
        )
        .textContent =
        ficha.nombre;


    document
        .getElementById(
            "fichaTipo"
        )
        .textContent =
        ficha instanceof Unidad
            ? "Unidad"
            : "Chit";


    document
        .getElementById(
            "fichaBando"
        )
        .textContent =
        ficha.bando || "-";


    document
        .getElementById(
            "fichaHex"
        )
        .textContent =
        `${ficha.col}, ${ficha.row}`;


    const datosUnidad =
        document
            .getElementById(
                "datosUnidad"
            );


    const datosChit =
        document
            .getElementById(
                "datosChit"
            );


    if (
        ficha instanceof Unidad
    ) {

        datosUnidad.style.display =
            "block";


        datosChit.style.display =
            "none";


        document
            .getElementById(
                "fichaFuerza"
            )
            .textContent =
            ficha.fuerza;


        document
            .getElementById(
                "fichaMovimiento"
            )
            .textContent =
            ficha.movimiento;


        document
            .getElementById(
                "fichaDefensa"
            )
            .textContent =
            ficha.defensa;


        document
            .getElementById(
                "fichaPasos"
            )
            .textContent =
            ficha.pasos;

    } else {

        datosUnidad.style.display =
            "none";


        datosChit.style.display =
            "block";


        document
            .getElementById(
                "fichaChitTipo"
            )
            .textContent =
            ficha.tipoChit;


        document
            .getElementById(
                "fichaEstado"
            )
            .textContent =
            ficha.estado;

    }


    /*
     * Datos del terreno del hexágono que contiene
     * la ficha seleccionada.
     */
    const hex =
        mapa.obtenerHex(
            ficha.col,
            ficha.row
        );


    if (
        hex &&
        hex.terreno
    ) {

        const terreno =
            hex.terreno;


        const tipo =
            terreno.tipo;


        document
            .getElementById(
                "terrenoTipo"
            )
            .textContent =
            tipo.nombre;


        document
            .getElementById(
                "terrenoMovimiento"
            )
            .textContent =
            tipo.costeMovimiento;


        document
            .getElementById(
                "terrenoCombate"
            )
            .textContent =
            tipo.modificadorCombate >= 0
                ? `+${tipo.modificadorCombate}`
                : tipo.modificadorCombate;


        document
            .getElementById(
                "terrenoElevacion"
            )
            .textContent =
            terreno.elevacion;


        /*
         * Lista de unidades y chits presentes en el hexágono.
         */
        const contenido =
            document
                .getElementById(
                    "terrenoContenido"
                );


        contenido.innerHTML = "";


        const fichas =
            terreno.obtenerFichas();


        if (
            fichas.length === 0
        ) {

            const vacio =
                document.createElement(
                    "div"
                );

            vacio.textContent =
                "Vacío";

            contenido.appendChild(
                vacio
            );

        } else {

            fichas.forEach(
                function(otraFicha) {

                    const linea =
                        document.createElement(
                            "div"
                        );


                    linea.className =
                        "terrenoFicha";


                    if (
                        otraFicha.id ===
                        ficha.id
                    ) {

                        linea.classList.add(
                            "terrenoFichaSeleccionada"
                        );

                    }


                    const tipoFicha =
                        otraFicha instanceof Unidad
                            ? "Unidad"
                            : "Chit";


                    linea.textContent =
                        `${tipoFicha}: ${otraFicha.nombre}`;


                    contenido.appendChild(
                        linea
                    );

                }
            );

        }

    }


    document
        .getElementById(
            "panelFicha"
        )
        .classList.add(
            "visible"
        );

}


function actualizarPanel() {

    if (
        !fichaSeleccionada
    )
        return;


    document
        .getElementById(
            "fichaHex"
        )
        .textContent =
        `${fichaSeleccionada.col}, ${fichaSeleccionada.row}`;

}


function cerrarPanel() {

    document
        .getElementById(
            "panelFicha"
        )
        .classList.remove(
            "visible"
        );

}


/* =====================================================
   INTERACCIÓN POINTER
===================================================== */

const pointers =
    new Map();


let arrastrandoFicha =
    false;


let desplazandoMapa =
    false;


let pointerAnterior =
    null;


let distanciaPinchInicial =
    null;


let zoomPinchInicial =
    null;


/* =====================================================
   POINTER DOWN
===================================================== */

canvas.addEventListener(
    "pointerdown",
    function(e) {

        e.preventDefault();


        canvas.setPointerCapture(
            e.pointerId
        );


        pointers.set(
            e.pointerId,
            {
                x: e.clientX,
                y: e.clientY
            }
        );


        /*
         * Segundo dedo
         */

        if (
            pointers.size === 2
        ) {

            const puntos =
                [...pointers.values()];


            distanciaPinchInicial =
                Math.hypot(
                    puntos[0].x -
                    puntos[1].x,

                    puntos[0].y -
                    puntos[1].y
                );


            zoomPinchInicial =
                zoom;


            arrastrandoFicha =
                false;

            desplazandoMapa =
                false;


            return;

        }


        const rect =
            canvas.getBoundingClientRect();


        const x =
            e.clientX -
            rect.left;


        const y =
            e.clientY -
            rect.top;


        const ficha =
            encontrarFicha(
                x,
                y
            );


        if (ficha) {

            fichaSeleccionada =
                ficha;


            arrastrandoFicha =
                true;


            mostrarPanel(
                ficha
            );

        } else {

            fichaSeleccionada =
                null;


            cerrarPanel();


            desplazandoMapa =
                true;

        }


        pointerAnterior = {

            x: e.clientX,

            y: e.clientY

        };


        renderer.dibujar();

    }
);


/* =====================================================
   POINTER MOVE
===================================================== */

canvas.addEventListener(
    "pointermove",
    function(e) {

        e.preventDefault();


        if (
            pointers.has(
                e.pointerId
            )
        ) {

            pointers.set(
                e.pointerId,
                {
                    x: e.clientX,
                    y: e.clientY
                }
            );

        }


        /*
         * PINCH
         */

        if (
            pointers.size === 2
        ) {

            const puntos =
                [...pointers.values()];


            const distanciaActual =
                Math.hypot(
                    puntos[0].x -
                    puntos[1].x,

                    puntos[0].y -
                    puntos[1].y
                );


            if (
                distanciaPinchInicial
            ) {

                zoom =
                    zoomPinchInicial *
                    (
                        distanciaActual /
                        distanciaPinchInicial
                    );


                zoom =
                    Math.max(
                        .45,
                        Math.min(
                            2.5,
                            zoom
                        )
                    );


                actualizarZoom();

                renderer.dibujar();

            }


            return;

        }


        /*
         * MOVER FICHA
         */

        if (
            arrastrandoFicha &&
            fichaSeleccionada
        ) {

            const rect =
                canvas.getBoundingClientRect();


            const x =
                e.clientX -
                rect.left;


            const y =
                e.clientY -
                rect.top;


            const hex =
                encontrarHex(
                    x,
                    y
                );


            if (hex) {

                if (
                    fichaSeleccionada.col !==
                    hex.col ||
                    fichaSeleccionada.row !==
                    hex.row
                ) {

                    moverFicha(

                        fichaSeleccionada,

                        hex.col,

                        hex.row

                    );

                }

            }


            actualizarPanel();

            renderer.dibujar();

            return;

        }


        /*
         * PAN
         */

        if (
            desplazandoMapa &&
            pointerAnterior
        ) {

            const dx =
                e.clientX -
                pointerAnterior.x;


            const dy =
                e.clientY -
                pointerAnterior.y;


            cameraX += dx;

            cameraY += dy;


            pointerAnterior = {

                x: e.clientX,

                y: e.clientY

            };


            renderer.dibujar();

        }

    }
);


/* =====================================================
   POINTER UP
===================================================== */

canvas.addEventListener(
    "pointerup",
    function(e) {

        e.preventDefault();


        pointers.delete(
            e.pointerId
        );


        if (
            pointers.size === 0
        ) {

            arrastrandoFicha =
                false;

            desplazandoMapa =
                false;

            pointerAnterior =
                null;

            distanciaPinchInicial =
                null;

        }

    }
);


/* =====================================================
   RUEDA ZOOM
===================================================== */

canvas.addEventListener(
    "wheel",
    function(e) {

        e.preventDefault();


        zoom *=
            e.deltaY < 0
                ? 1.1
                : .9;


        zoom =
            Math.max(
                .45,
                Math.min(
                    2.5,
                    zoom
                )
            );


        actualizarZoom();

        renderer.dibujar();

    },
    {
        passive: false
    }
);


/* =====================================================
   ZOOM BOTONES
===================================================== */

function actualizarZoom() {

    document
        .getElementById(
            "zoomTexto"
        )
        .textContent =
        Math.round(
            zoom * 100
        ) + "%";

}


document
    .getElementById(
        "btnZoomMas"
    )
    .onclick = function() {

        zoom *= 1.15;

        zoom =
            Math.min(
                2.5,
                zoom
            );

        actualizarZoom();

        renderer.dibujar();

    };


document
    .getElementById(
        "btnZoomMenos"
    )
    .onclick = function() {

        zoom *= .87;

        zoom =
            Math.max(
                .45,
                zoom
            );

        actualizarZoom();

        renderer.dibujar();

    };


/* =====================================================
   CENTRAR MAPA
===================================================== */

document
    .getElementById(
        "btnCentro"
    )
    .onclick = function() {

        cameraX =
            main.clientWidth / 2 -
            15 *
            renderer.hexWidth() /
            2;


        cameraY = 50;


        renderer.dibujar();

    };


/* =====================================================
   ROTAR
===================================================== */

document
    .getElementById(
        "btnRotar"
    )
    .onclick = function() {

        if (
            !fichaSeleccionada
        )
            return;


        fichaSeleccionada.rotacion +=
            60;


        if (
            fichaSeleccionada.rotacion >=
            360
        ) {

            fichaSeleccionada.rotacion =
                0;

        }


        renderer.dibujar();

    };


/* =====================================================
   CERRAR PANEL
===================================================== */

document
    .getElementById(
        "btnCerrar"
    )
    .onclick =
    cerrarPanel;


/* =====================================================
   DADOS
===================================================== */

document
    .getElementById(
        "btnDados"
    )
    .onclick = function() {

        const resultado =
            Math.floor(
                Math.random() * 6
            ) + 1;


        const elemento =
            document.getElementById(
                "resultadoDados"
            );


        elemento.textContent =
            "🎲 Resultado: " +
            resultado;


        elemento.style.display =
            "block";


        setTimeout(
            function() {

                elemento.style.display =
                    "none";

            },
            2000
        );

    };


/* =====================================================
   INICIO
===================================================== */

function iniciar() {

    const dpr =
        window.devicePixelRatio || 1;


    canvas.width =
        main.clientWidth * dpr;


    canvas.height =
        main.clientHeight * dpr;


    canvas.style.width =
        main.clientWidth + "px";


    canvas.style.height =
        main.clientHeight + "px";


    ctx.setTransform(
        dpr,
        0,
        0,
        dpr,
        0,
        0
    );


    cameraX =
        main.clientWidth / 2 -
        15 *
        renderer.hexWidth() /
        2;


    cameraY = 50;


    renderer.dibujar();

}


window.addEventListener(
    "resize",
    iniciar
);


iniciar();

</script>

</body>

</html>
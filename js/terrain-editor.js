class TerrainEditor {

    constructor(canvas) {

        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");

        this.cols = 10;
        this.rows = 10;
        this.hexSize = 40;

        this.hexes = [];

        // Terreno seleccionado actualmente
        this.selectedTerrain = null;

        this.createTerrain();

        this.initTerrainSelector();
        this.initCanvasEvents();
    }


    // --------------------------------------------------
    // GEOMETRÍA DEL HEXÁGONO
    // --------------------------------------------------

    hexWidth() {

        return Math.sqrt(3) * this.hexSize;
    }


    hexHeight() {

        return this.hexSize * 2;
    }


    hexPosition(col, row) {

        const w = this.hexWidth();
        const h = this.hexHeight();

        return {

            x:
                this.hexSize +
                col * w +
                (row % 2) * (w / 2),

            y:
                this.hexSize +
                row * (h * 0.75)
        };
    }


    // --------------------------------------------------
    // CREAR TERRENO
    // --------------------------------------------------

    createTerrain() {

        this.hexes = [];

        for (let row = 0; row < this.rows; row++) {

            for (let col = 0; col < this.cols; col++) {

                const position =
                    this.hexPosition(col, row);


                this.hexes.push({

                    col: col,
                    row: row,

                    x: position.x,
                    y: position.y,

                    terrain: null
                });
            }
        }


        this.resizeCanvas();

        this.draw();
    }


    // --------------------------------------------------
    // TAMAÑO DEL CANVAS
    // --------------------------------------------------

    resizeCanvas() {

        const w = this.hexWidth();
        const h = this.hexHeight();


        this.canvas.width =
            this.hexSize * 2 +
            this.cols * w +
            w / 2;


        this.canvas.height =
            this.hexSize * 2 +
            (this.rows - 1) * h * 0.75 +
            this.hexSize;
    }


    // --------------------------------------------------
    // DIBUJAR TODO EL TERRENO
    // --------------------------------------------------

    draw() {

        this.ctx.clearRect(
            0,
            0,
            this.canvas.width,
            this.canvas.height
        );


        for (const hex of this.hexes) {

            this.drawHex(hex);
        }
    }


    // --------------------------------------------------
    // DIBUJAR UN HEXÁGONO
    // --------------------------------------------------

    drawHex(hex) {

        const ctx = this.ctx;


        ctx.beginPath();


        for (let i = 0; i < 6; i++) {

            const angle =
                Math.PI / 180 *
                (60 * i - 30);


            const x =
                hex.x +
                this.hexSize *
                Math.cos(angle);


            const y =
                hex.y +
                this.hexSize *
                Math.sin(angle);


            if (i === 0) {

                ctx.moveTo(x, y);

            } else {

                ctx.lineTo(x, y);
            }
        }


        ctx.closePath();


        // Color según el tipo de terreno

        ctx.fillStyle =
            this.getTerrainColor(hex.terrain);


        ctx.fill();


        // Borde

        ctx.strokeStyle = "#333";

        ctx.lineWidth = 1;

        ctx.stroke();
    }


    // --------------------------------------------------
    // COLOR DEL TERRENO
    // --------------------------------------------------

    getTerrainColor(terrain) {

        switch (terrain) {

            case "llanura":

                return "#8fbc6b";


            case "bosque":

                return "#27632a";


            case "montana":

                return "#777";


            case "agua":

                return "#3d82b8";


            case "desierto":

                return "#d7bd72";


            case "carretera":

                return "#8b7355";


            default:

                return "#d9d9d9";
        }
    }


    // --------------------------------------------------
    // SELECTOR DE TIPOS DE TERRENO
    // --------------------------------------------------

    initTerrainSelector() {

        const buttons =
            document.querySelectorAll(".terrain-type");


        buttons.forEach(button => {

            button.addEventListener(
                "click",
                () => {

                    // Quitar selección anterior

                    buttons.forEach(b => {

                        b.classList.remove(
                            "selected"
                        );
                    });


                    // Seleccionar botón

                    button.classList.add(
                        "selected"
                    );


                    // Guardar terreno seleccionado

                    this.selectedTerrain =
                        button.dataset.terrain;


                    console.log(
                        "Terreno seleccionado:",
                        this.selectedTerrain
                    );
                }
            );
        });
    }


    // --------------------------------------------------
    // EVENTOS DEL CANVAS
    // --------------------------------------------------

    initCanvasEvents() {

        this.canvas.addEventListener(
            "click",
            (event) => {

                const rect =
                    this.canvas.getBoundingClientRect();


                const x =
                    event.clientX -
                    rect.left;


                const y =
                    event.clientY -
                    rect.top;


                const hex =
                    this.getHexAt(x, y);


                // No se ha pulsado ningún hexágono

                if (!hex) {

                    return;
                }


                // No hay terreno seleccionado

                if (!this.selectedTerrain) {

                    return;
                }


                // Aplicar terreno

                hex.terrain =
                    this.selectedTerrain;


                console.log(
                    "Hexágono:",
                    hex.col,
                    hex.row,
                    "Terreno:",
                    hex.terrain
                );


                // Redibujar

                this.draw();
            }
        );
    }


    // --------------------------------------------------
    // BUSCAR HEXÁGONO PULSADO
    // --------------------------------------------------

    getHexAt(x, y) {

        for (const hex of this.hexes) {

            const dx =
                x - hex.x;


            const dy =
                y - hex.y;


            const distance =
                Math.sqrt(
                    dx * dx +
                    dy * dy
                );


            if (
                distance <=
                this.hexSize
            ) {

                return hex;
            }
        }


        return null;
    }
}


// ======================================================
// INICIALIZACIÓN
// ======================================================

const canvas =
    document.getElementById(
        "terrainCanvas"
    );


const terrainEditor =
    new TerrainEditor(canvas);


// ======================================================
// BOTÓN CREAR TERRENO
// ======================================================

document
    .getElementById("createTerrain")
    .addEventListener(
        "click",
        function () {

            terrainEditor.cols =
                parseInt(
                    document.getElementById(
                        "terrainCols"
                    ).value
                );


            terrainEditor.rows =
                parseInt(
                    document.getElementById(
                        "terrainRows"
                    ).value
                );


            terrainEditor.hexSize =
                parseInt(
                    document.getElementById(
                        "hexSize"
                    ).value
                );


            terrainEditor.createTerrain();
        }
    );
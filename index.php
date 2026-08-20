<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tablero Wargame con Pixi.JS (Drag de Mapa Habilitado)</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background-color: #1a1a1a;
      font-family: Arial, sans-serif;
    }
    #game-container {
      width: 100%;
      height: 100%;
    }
    #ui-panel {
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      padding: 12px;
      border-radius: 6px;
      pointer-events: none;
      font-size: 14px;
      max-width: 250px;
      user-select: none;
    }
  </style>
  <!-- Pixi.JS via CDN -->
  <script src="https://pixijs.download/v7.3.2/pixi.min.js"></script>
</head>
<body>

  <div id="game-container"></div>

  <div id="ui-panel">
    <h3>Info Hexágono</h3>
    <p id="info-hex">Ninguno</p>
    <br>
    <h3>Info Ficha</h3>
    <p id="info-ficha">Ninguna</p>
  </div>

  <script>
    // ==========================================
    // ESTRUCTURAS DE DATOS Y LÓGICA DE JUEGO
    // ==========================================

    class Hexagono {
      constructor(col, fila, radio) {
        this.col = col;
        this.fila = fila;
        this.radio = radio;
        this.stack = new Stack();

        // Coordenadas axial/offset (Flat-topped hexes)
        this.x = col * (radio * 1.5);
        this.y = fila * (Math.sqrt(3) * radio) + ((col % 2 === 1) ? (Math.sqrt(3) * radio) / 2 : 0);
      }
    }

    class Stack {
      constructor() {
        this.fichas = [];
      }
      agregar(ficha) {
        this.fichas.push(ficha);
      }
      quitar(ficha) {
        const idx = this.fichas.indexOf(ficha);
        if (idx !== -1) this.fichas.splice(idx, 1);
      }
    }

    class Ficha {
      constructor(id, bando, ataque, defensa, movimiento, tipo) {
        this.id = id;
        this.bando = bando; // 'aliado' | 'eje'
        this.ataque = ataque;
        this.defensa = defensa;
        this.movimiento = movimiento;
        this.tipo = tipo; // 'infanteria' | 'blindado' | 'chit'
        this.hexActual = null;
        this.container = null; // Referencia al PIXI.Container de la ficha
      }
    }

    // ==========================================
    // RENDERIZADO Y CONTROLADOR PIXI.JS
    // ==========================================

    class WargameApp {
      constructor(containerEl, cols, filas, radioHex) {
        this.cols = cols;
        this.filas = filas;
        this.radioHex = radioHex;

        // Inicializar PIXI Application
        this.app = new PIXI.Application({
          resizeTo: window,
          backgroundColor: 0x222222,
          antialias: true,
          resolution: window.devicePixelRatio || 1
        });
        containerEl.appendChild(this.app.view);

        // Contenedor principal para Viewport (Pan & Zoom)
        this.viewport = new PIXI.Container();
        this.app.stage.addChild(this.viewport);

        // Capas ordenadas por z-index
        this.layerHexes = new PIXI.Container();
        this.layerFichas = new PIXI.Container();
        this.viewport.addChild(this.layerHexes);
        this.viewport.addChild(this.layerFichas);

        // Matriz de mapa
        this.mapaHexes = [];

        // Estado de Pan (Arrastrar mapa) y Drag & Drop
        this.fichaArrastrada = null;
        this.offsetDrag = { x: 0, y: 0 };
        this.isPanning = false;
        this.panStart = { x: 0, y: 0 };
        this.hasMovedMap = false;

        this.init();
      }

      init() {
        this.crearTablero();
        this.setupViewportEvents();
        this.crearUnidadesEjemplo();
        this.centrarMapa();
      }

      // --- DIBUJO DE HEXÁGONOS ---
      crearTablero() {
        for (let c = 0; c < this.cols; c++) {
          this.mapaHexes[c] = [];
          for (let f = 0; f < this.filas; f++) {
            const hexData = new Hexagono(c, f, this.radioHex);
            this.mapaHexes[c][f] = hexData;

            const hexGraphic = new PIXI.Graphics();
            this.dibujarHexagonoGraphics(hexGraphic, hexData.radio);
            hexGraphic.x = hexData.x;
            hexGraphic.y = hexData.y;

            // Importante: No asignamos 'eventMode' estático al hexágono individual
            // para permitir que los eventos de arrastre pasen directamente al stage/mapa.

            this.layerHexes.addChild(hexGraphic);
          }
        }
      }

      dibujarHexagonoGraphics(g, radio) {
        g.clear();
        g.lineStyle(1.5, 0x555555);
        g.beginFill(0x2d3748);

        const puntos = [];
        for (let i = 0; i < 6; i++) {
          const angulo = (Math.PI / 3) * i;
          puntos.push(
            radio * Math.cos(angulo),
            radio * Math.sin(angulo)
          );
        }
        g.drawPolygon(puntos);
        g.endFill();
      }

      // --- CREACIÓN DE FICHAS (COUNTERS) ---
      crearUnidadesEjemplo() {
        const u1 = new Ficha('INF-01', 'aliado', 4, 5, 3, 'infanteria');
        const u2 = new Ficha('ARM-01', 'eje', 6, 4, 5, 'blindado');
        const u3 = new Ficha('INF-02', 'aliado', 3, 3, 3, 'infanteria');

        this.colocarFichaEnHex(u1, this.mapaHexes[1][1]);
        this.colocarFichaEnHex(u2, this.mapaHexes[3][2]);
        this.colocarFichaEnHex(u3, this.mapaHexes[1][1]);
      }

      crearSpriteFicha(ficha) {
        const size = this.radioHex * 0.9;
        const container = new PIXI.Container();

        // Fondo del Counter
        const bg = new PIXI.Graphics();
        const colorFondo = ficha.bando === 'aliado' ? 0x2b6cb0 : 0xc53030;
        bg.lineStyle(2, 0xffffff);
        bg.beginFill(colorFondo);
        bg.drawRoundedRect(-size / 2, -size / 2, size, size, 4);
        bg.endFill();
        container.addChild(bg);

        // Simbología OTAN
        const simbolo = new PIXI.Graphics();
        simbolo.lineStyle(2, 0xffffff);
        const w = size * 0.5;
        const h = size * 0.3;
        simbolo.drawRect(-w / 2, -h / 2 - 2, w, h);

        if (ficha.tipo === 'infanteria') {
          simbolo.moveTo(-w / 2, -h / 2 - 2);
          simbolo.lineTo(w / 2, h / 2 - 2);
          simbolo.moveTo(w / 2, -h / 2 - 2);
          simbolo.lineTo(-w / 2, h / 2 - 2);
        } else if (ficha.tipo === 'blindado') {
          simbolo.drawEllipse(0, -2, w / 2 - 2, h / 2 - 2);
        }
        container.addChild(simbolo);

        // Texto de Factores
        const estiquetaTexto = `${ficha.ataque}-${ficha.defensa}-${ficha.movimiento}`;
        const txt = new PIXI.Text(estiquetaTexto, {
          fontSize: Math.floor(size * 0.22),
          fill: 0xffffff,
          fontWeight: 'bold',
          align: 'center'
        });
        txt.anchor.set(0.5);
        txt.y = size * 0.28;
        container.addChild(txt);

        // Habilitar interacción única para la ficha
        container.eventMode = 'static';
        container.cursor = 'grab';

        container.on('pointerdown', (e) => this.onStartDragFicha(e, ficha));

        ficha.container = container;
        this.layerFichas.addChild(container);
      }

      colocarFichaEnHex(ficha, hex) {
        if (!ficha.container) {
          this.crearSpriteFicha(ficha);
        }

        if (ficha.hexActual) {
          ficha.hexActual.stack.quitar(ficha);
          this.actualizarPosicionesStack(ficha.hexActual);
        }

        ficha.hexActual = hex;
        hex.stack.agregar(ficha);

        this.actualizarPosicionesStack(hex);
      }

      actualizarPosicionesStack(hex) {
        const offsetStep = this.radioHex * 0.15;
        hex.stack.fichas.forEach((f, idx) => {
          f.container.x = hex.x + (idx * offsetStep);
          f.container.y = hex.y - (idx * offsetStep);
          this.layerFichas.addChild(f.container);
        });
      }

      // --- DRAG & DROP DE FICHAS ---
      onStartDragFicha(event, ficha) {
        // Evitar que el clic en la ficha active el arrastre del mapa
        event.stopPropagation();

        this.fichaArrastrada = ficha;
        ficha.container.cursor = 'grabbing';

        this.layerFichas.addChild(ficha.container);

        const localPos = this.viewport.toLocal(event.global);
        this.offsetDrag.x = localPos.x - ficha.container.x;
        this.offsetDrag.y = localPos.y - ficha.container.y;

        document.getElementById('info-ficha').innerText = `ID: ${ficha.id}\nBando: ${ficha.bando}\nFactores: ${ficha.ataque}-${ficha.defensa}-${ficha.movimiento}`;

        this.onPointerMoveRef = (e) => this.onMoveDragFicha(e);
        this.onPointerUpRef = (e) => this.onEndDragFicha(e);

        this.app.stage.eventMode = 'static';
        this.app.stage.on('pointermove', this.onPointerMoveRef);
        this.app.stage.on('pointerup', this.onPointerUpRef);
        this.app.stage.on('pointerupoutside', this.onPointerUpRef);
      }

      onMoveDragFicha(event) {
        if (!this.fichaArrastrada) return;
        const localPos = this.viewport.toLocal(event.global);
        this.fichaArrastrada.container.x = localPos.x - this.offsetDrag.x;
        this.fichaArrastrada.container.y = localPos.y - this.offsetDrag.y;
      }

      onEndDragFicha(event) {
        if (!this.fichaArrastrada) return;

        this.app.stage.off('pointermove', this.onPointerMoveRef);
        this.app.stage.off('pointerup', this.onPointerUpRef);
        this.app.stage.off('pointerupoutside', this.onPointerUpRef);

        this.fichaArrastrada.container.cursor = 'grab';

        const posDrop = this.viewport.toLocal(event.global);
        const hexDestino = this.obtenerHexMasCercano(posDrop.x, posDrop.y);

        if (hexDestino) {
          this.colocarFichaEnHex(this.fichaArrastrada, hexDestino);
        } else {
          this.actualizarPosicionesStack(this.fichaArrastrada.hexActual);
        }

        this.fichaArrastrada = null;
      }

      obtenerHexMasCercano(x, y) {
        let mejorHex = null;
        let distMinima = Infinity;

        for (let c = 0; c < this.cols; c++) {
          for (let f = 0; f < this.filas; f++) {
            const hex = this.mapaHexes[c][f];
            const d = Math.hypot(x - hex.x, y - hex.y);
            if (d < this.radioHex && d < distMinima) {
              distMinima = d;
              mejorHex = hex;
            }
          }
        }
        return mejorHex;
      }

      // --- NAVEGACIÓN Y ARRASTRE DE MAPA (PAN GLOBAL & ZOOM) ---
      setupViewportEvents() {
        const viewEl = this.app.view;

        // Zoom mediante la rueda del ratón
        viewEl.addEventListener('wheel', (e) => {
          e.preventDefault();
          const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
          const newScale = Math.min(Math.max(this.viewport.scale.x * zoomFactor, 0.3), 3.0);

          const mouseGlobal = { x: e.clientX, y: e.clientY };
          const mouseLocal = this.viewport.toLocal(mouseGlobal);

          this.viewport.scale.set(newScale);
          this.viewport.x = mouseGlobal.x - mouseLocal.x * newScale;
          this.viewport.y = mouseGlobal.y - mouseLocal.y * newScale;
        }, { passive: false });

        // Interacción global del Stage para Arrastrar el Mapa
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;

        this.app.stage.on('pointerdown', (e) => {
          // Iniciar arrastre del mapa
          this.isPanning = true;
          this.hasMovedMap = false;
          this.app.view.style.cursor = 'grabbing';

          this.panStart = {
            x: e.global.x - this.viewport.x,
            y: e.global.y - this.viewport.y
          };
        });

        this.app.stage.on('pointermove', (e) => {
          if (this.isPanning) {
            const dx = e.global.x - (this.panStart.x + this.viewport.x);
            const dy = e.global.y - (this.panStart.y + this.viewport.y);

            // Si hay desplazamiento significativo, marcamos que se ha movido el mapa
            if (Math.hypot(dx, dy) > 3) {
              this.hasMovedMap = true;
            }

            this.viewport.x = e.global.x - this.panStart.x;
            this.viewport.y = e.global.y - this.panStart.y;
          }
        });

        const stopPan = (e) => {
          if (this.isPanning) {
            this.isPanning = false;
            this.app.view.style.cursor = 'default';

            // Si el usuario hizo clic sin arrastrar el mapa, seleccionamos el hexágono
            if (!this.hasMovedMap && e) {
              const localPos = this.viewport.toLocal(e.global);
              const hexClic = this.obtenerHexMasCercano(localPos.x, localPos.y);
              if (hexClic) {
                document.getElementById('info-hex').innerText = `Col: ${hexClic.col}, Fila: ${hexClic.fila}\nFichas: ${hexClic.stack.fichas.length}`;
              }
            }
          }
        };

        this.app.stage.on('pointerup', stopPan);
        this.app.stage.on('pointerupoutside', stopPan);
      }

      centrarMapa() {
        this.viewport.x = this.app.screen.width / 4;
        this.viewport.y = this.app.screen.height / 4;
      }
    }

    // Inicialización
    window.addEventListener('DOMContentLoaded', () => {
      const container = document.getElementById('game-container');
      new WargameApp(container, 100, 100, 45);
    });
  </script>
</body>
</html>
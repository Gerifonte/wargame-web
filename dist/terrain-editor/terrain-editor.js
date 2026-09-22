"use strict";
const TERRAIN_LABELS = {
    base: 'Terreno base',
    carretera: 'Carretera',
    tren: 'Tren',
    rio: 'Río',
    ciudad: 'Ciudad',
    pueblo: 'Pueblo'
};
const NOISE_TYPE_LABELS = {
    VALUE: 'Nube (value)',
    WHITE: 'Puntos (ruido blanco)',
    PERLIN: 'Perlin',
    RIDGED: 'Crestas (ridged)',
    BILLOW: 'Algodón (billow)',
    VORONOI: 'Celdas (Voronoi)',
    WARPED: 'Vetas (warped)'
};
const NOISE_PRESET_FILE_MARKER = 'wargame-web-noise-preset';
// Muestras de la curva por cada tramo entre dos puntos de control; sirve también para localizar el tramo pulsado.
const LINE_STEPS_PER_SEGMENT = 14;
// Grupos en el mismo orden/estructura que el menú de modos de fusión de Photoshop.
const NOISE_BLEND_MODE_GROUPS = [
    { label: '', modes: ['NORMAL', 'DISSOLVE'] },
    { label: 'Oscurecer', modes: ['DARKEN', 'MULTIPLY', 'COLOR_BURN', 'LINEAR_BURN', 'DARKER_COLOR'] },
    { label: 'Aclarar', modes: ['LIGHTEN', 'SCREEN', 'COLOR_DODGE', 'LINEAR_DODGE', 'LIGHTER_COLOR'] },
    { label: 'Contraste', modes: ['OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT', 'VIVID_LIGHT', 'LINEAR_LIGHT', 'PIN_LIGHT', 'HARD_MIX'] },
    { label: 'Comparar', modes: ['DIFFERENCE', 'EXCLUSION', 'SUBTRACT', 'DIVIDE'] },
    { label: 'Componer', modes: ['HUE', 'SATURATION', 'COLOR', 'LUMINOSITY'] }
];
const NOISE_BLEND_MODE_LABELS = {
    NORMAL: 'Normal',
    DISSOLVE: 'Disolver',
    DARKEN: 'Oscurecer',
    MULTIPLY: 'Multiplicar',
    COLOR_BURN: 'Subexponer color',
    LINEAR_BURN: 'Subexposición lineal',
    DARKER_COLOR: 'Color más oscuro',
    LIGHTEN: 'Aclarar',
    SCREEN: 'Trama',
    COLOR_DODGE: 'Sobreexponer color',
    LINEAR_DODGE: 'Sobreexpos. lineal (Añadir)',
    LIGHTER_COLOR: 'Color más claro',
    OVERLAY: 'Superponer',
    SOFT_LIGHT: 'Luz suave',
    HARD_LIGHT: 'Luz fuerte',
    VIVID_LIGHT: 'Luz intensa',
    LINEAR_LIGHT: 'Luz lineal',
    PIN_LIGHT: 'Luz focal',
    HARD_MIX: 'Mezcla definida',
    DIFFERENCE: 'Diferencia',
    EXCLUSION: 'Exclusión',
    SUBTRACT: 'Restar',
    DIVIDE: 'Dividir',
    HUE: 'Tono',
    SATURATION: 'Saturación',
    COLOR: 'Color',
    LUMINOSITY: 'Luminosidad'
};
// Índice pasado al shader de fusión (debe coincidir con el switch de BLEND_FRAGMENT_SHADER).
const NOISE_BLEND_MODE_INDEX = {
    NORMAL: 0, DISSOLVE: 1,
    DARKEN: 2, MULTIPLY: 3, COLOR_BURN: 4, LINEAR_BURN: 5, DARKER_COLOR: 6,
    LIGHTEN: 7, SCREEN: 8, COLOR_DODGE: 9, LINEAR_DODGE: 10, LIGHTER_COLOR: 11,
    OVERLAY: 12, SOFT_LIGHT: 13, HARD_LIGHT: 14, VIVID_LIGHT: 15, LINEAR_LIGHT: 16, PIN_LIGHT: 17, HARD_MIX: 18,
    DIFFERENCE: 19, EXCLUSION: 20, SUBTRACT: 21, DIVIDE: 22,
    HUE: 23, SATURATION: 24, COLOR: 25, LUMINOSITY: 26
};
// Estos 4 modos los soporta la GPU de forma nativa (glBlendFunc estándar), sin coste de shader.
// El resto de modos de Photoshop no tienen equivalente en el pipeline de mezcla estándar de WebGL
// (necesitarían KHR_blend_equation_advanced, que casi ningún navegador de escritorio expone),
// así que se resuelven con un shader propio que compara cada píxel contra una "instantánea" de
// todo lo dibujado debajo (uBackdrop) y aplica la fórmula exacta de Photoshop para ese modo.
const NOISE_BLEND_NATIVE_GPU_MODE = {
    NORMAL: 'NORMAL',
    MULTIPLY: 'MULTIPLY',
    SCREEN: 'SCREEN',
    LINEAR_DODGE: 'ADD'
};
const NOISE_BLEND_FRAGMENT_SHADER = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform sampler2D uBackdrop;
uniform vec2 uScreenSize;
uniform int uBlendMode;

float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

float lum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }

vec3 clipColor(vec3 c) {
    float l = lum(c);
    float n = min(min(c.r, c.g), c.b);
    float x = max(max(c.r, c.g), c.b);
    if (n < 0.0) c = l + (c - l) * l / max(l - n, 0.0001);
    if (x > 1.0) c = l + (c - l) * (1.0 - l) / max(x - l, 0.0001);
    return c;
}

vec3 setLum(vec3 c, float l) { return clipColor(c + (l - lum(c))); }
float satOf(vec3 c) { return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b); }

vec3 setSat(vec3 c, float s) {
    float cmin = min(min(c.r, c.g), c.b);
    float cmax = max(max(c.r, c.g), c.b);
    return (cmax > cmin) ? (c - cmin) * s / (cmax - cmin) : vec3(0.0);
}

float bColorBurn(float cb, float cs) {
    if (cb >= 1.0) return 1.0;
    if (cs <= 0.0) return 0.0;
    return 1.0 - min(1.0, (1.0 - cb) / cs);
}
float bColorDodge(float cb, float cs) {
    if (cb <= 0.0) return 0.0;
    if (cs >= 1.0) return 1.0;
    return min(1.0, cb / (1.0 - cs));
}
float bOverlay(float cb, float cs) { return cb < 0.5 ? 2.0 * cb * cs : 1.0 - 2.0 * (1.0 - cb) * (1.0 - cs); }
float bHardLight(float cb, float cs) { return cs < 0.5 ? 2.0 * cb * cs : 1.0 - 2.0 * (1.0 - cb) * (1.0 - cs); }
float bSoftLight(float cb, float cs) {
    if (cs <= 0.5) return cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb);
    float d = (cb <= 0.25) ? ((16.0 * cb - 12.0) * cb + 4.0) * cb : sqrt(cb);
    return cb + (2.0 * cs - 1.0) * (d - cb);
}
float bVividLight(float cb, float cs) { return cs < 0.5 ? bColorBurn(cb, 2.0 * cs) : bColorDodge(cb, 2.0 * (cs - 0.5)); }
float bPinLight(float cb, float cs) { return cs < 0.5 ? min(cb, 2.0 * cs) : max(cb, 2.0 * (cs - 0.5)); }
float bDivide(float cb, float cs) { return cs <= 0.0 ? 1.0 : clamp(cb / cs, 0.0, 1.0); }

vec3 vec3Map4(vec3 cb, vec3 cs, int mode) {
    if (mode == 4) return vec3(bColorBurn(cb.r, cs.r), bColorBurn(cb.g, cs.g), bColorBurn(cb.b, cs.b));
    if (mode == 9) return vec3(bColorDodge(cb.r, cs.r), bColorDodge(cb.g, cs.g), bColorDodge(cb.b, cs.b));
    if (mode == 12) return vec3(bOverlay(cb.r, cs.r), bOverlay(cb.g, cs.g), bOverlay(cb.b, cs.b));
    if (mode == 13) return vec3(bSoftLight(cb.r, cs.r), bSoftLight(cb.g, cs.g), bSoftLight(cb.b, cs.b));
    if (mode == 14) return vec3(bHardLight(cb.r, cs.r), bHardLight(cb.g, cs.g), bHardLight(cb.b, cs.b));
    if (mode == 15) return vec3(bVividLight(cb.r, cs.r), bVividLight(cb.g, cs.g), bVividLight(cb.b, cs.b));
    if (mode == 17) return vec3(bPinLight(cb.r, cs.r), bPinLight(cb.g, cs.g), bPinLight(cb.b, cs.b));
    if (mode == 22) return vec3(bDivide(cb.r, cs.r), bDivide(cb.g, cs.g), bDivide(cb.b, cs.b));
    return cs;
}

void main(void) {
    vec4 src = texture2D(uSampler, vTextureCoord);
    if (src.a <= 0.0) discard;
    vec3 cs = src.rgb / src.a;

    if (uBlendMode == 1) {
        float r = hash(gl_FragCoord.xy);
        if (r > src.a) discard;
        gl_FragColor = vec4(cs, 1.0);
        return;
    }

    vec2 backdropUV = gl_FragCoord.xy / uScreenSize;
    vec3 cb = texture2D(uBackdrop, backdropUV).rgb;

    vec3 blended;
    if (uBlendMode == 2) blended = min(cb, cs);
    else if (uBlendMode == 3) blended = cb * cs;
    else if (uBlendMode == 5) blended = clamp(cb + cs - 1.0, 0.0, 1.0);
    else if (uBlendMode == 6) blended = (lum(cb) <= lum(cs)) ? cb : cs;
    else if (uBlendMode == 7) blended = max(cb, cs);
    else if (uBlendMode == 8) blended = 1.0 - (1.0 - cb) * (1.0 - cs);
    else if (uBlendMode == 10) blended = clamp(cb + cs, 0.0, 1.0);
    else if (uBlendMode == 11) blended = (lum(cb) >= lum(cs)) ? cb : cs;
    else if (uBlendMode == 16) blended = clamp(cb + 2.0 * cs - 1.0, 0.0, 1.0);
    else if (uBlendMode == 18) blended = vec3(
        bVividLight(cb.r, cs.r) < 0.5 ? 0.0 : 1.0,
        bVividLight(cb.g, cs.g) < 0.5 ? 0.0 : 1.0,
        bVividLight(cb.b, cs.b) < 0.5 ? 0.0 : 1.0
    );
    else if (uBlendMode == 19) blended = abs(cb - cs);
    else if (uBlendMode == 20) blended = cb + cs - 2.0 * cb * cs;
    else if (uBlendMode == 21) blended = clamp(cb - cs, 0.0, 1.0);
    else if (uBlendMode == 23) blended = setLum(setSat(cs, satOf(cb)), lum(cb));
    else if (uBlendMode == 24) blended = setLum(setSat(cb, satOf(cs)), lum(cb));
    else if (uBlendMode == 25) blended = setLum(cs, lum(cb));
    else if (uBlendMode == 26) blended = setLum(cb, lum(cs));
    else if (uBlendMode == 4 || uBlendMode == 9 || uBlendMode == 12 || uBlendMode == 13 || uBlendMode == 14 || uBlendMode == 15 || uBlendMode == 17 || uBlendMode == 22) blended = vec3Map4(cb, cs, uBlendMode);
    else blended = cs;

    gl_FragColor = vec4(blended * src.a, src.a);
}
`;
function createNoiseBlendFilter() {
    return new PIXI.Filter(undefined, NOISE_BLEND_FRAGMENT_SHADER, {
        uBackdrop: PIXI.Texture.EMPTY,
        uScreenSize: [1, 1],
        uBlendMode: 0
    });
}
class TerrainEditor {
    constructor(containerId) {
        const container = document.getElementById(containerId);
        const infoPanelContent = document.getElementById('hex-info-content');
        const layerListElement = document.getElementById('layer-list');
        const coverageInput = document.getElementById('wavyCoverage');
        const coverageOutput = document.getElementById('wavyCoverageValue');
        const wavesInput = document.getElementById('wavyWaves');
        const wavesOutput = document.getElementById('wavyWavesValue');
        const smoothnessInput = document.getElementById('wavySmoothness');
        const smoothnessOutput = document.getElementById('wavySmoothnessValue');
        const groupingInput = document.getElementById('wavyGrouping');
        if (!container || !infoPanelContent || !layerListElement || !coverageInput || !coverageOutput || !wavesInput || !wavesOutput || !smoothnessInput || !smoothnessOutput || !groupingInput) {
            throw new Error('Faltan elementos necesarios para inicializar el editor de terreno.');
        }
        this.container = container;
        this.cols = 20;
        this.filas = 15;
        this.radioHex = 40;
        this.paintMode = 'normal';
        this.wavySettings = {
            coverage: Number(coverageInput.value),
            waves: Number(wavesInput.value),
            smoothness: Number(smoothnessInput.value)
        };
        this.wavyGrouping = groupingInput.value;
        this.selectedHex = null;
        this.colores = {
            base: 0x8fbc6b,
            carretera: 0x8b7355,
            tren: 0x3a3a3a,
            rio: 0x3d82b8,
            ciudad: 0x9a9a9a,
            pueblo: 0xc9a27a
        };
        this.selectedTerrain = 'base';
        this.eraserMode = false;
        this.eraserSettings = { shape: 'circulo', radius: 2, softness: 40 };
        this.infoPanelContent = infoPanelContent;
        this.layerListElement = layerListElement;
        this.coverageInput = coverageInput;
        this.coverageOutput = coverageOutput;
        this.wavesInput = wavesInput;
        this.wavesOutput = wavesOutput;
        this.smoothnessInput = smoothnessInput;
        this.smoothnessOutput = smoothnessOutput;
        this.groupingInput = groupingInput;
        this.noiseTextureCache = {};
        this.noiseLayerCounter = 0;
        this.pendingBackdropTextures = [];
        this.eraseHoleTextures = [];
        this.paintGroupCounter = 0;
        this.activePaintGroupId = null;
        this.layers = [];
        this.activeLayer = null;
        this.layerCounter = 0;
        this.mapaHexes = [];
        this.snapPoints = [];
        this.snapGridEnabled = false;
        this.referenceImageSprite = null;
        this.referenceImageOpacity = 60;
        this.referenceImageEditMode = false;
        this.freeWavyPoints = [];
        this.freeWavyClosed = false;
        this.selectedFreeWavyPointIndex = null;
        this.draggedFreeWavyHandle = null;
        this.lineSettings = {
            rio: { color: this.colores.rio, width: 20, taper: true, waviness: 40 },
            carretera: { color: this.colores.carretera, width: 10, taper: false, waviness: 0 },
            tren: { color: this.colores.tren, width: 12, taper: false, waviness: 0 }
        };
        this.linePoints = [];
        this.lineSeedCounter = 0;
        this.selectedLinePointIndex = null;
        this.draggedLineHandle = null;
        this.cityDensity = 6;
        this.cityShadow = { enabled: false, direction: 50, cenital: false, blur: 3, opacity: 40 };
        this.lineShadows = {
            carretera: { enabled: false, direction: 50, cenital: false, blur: 3, opacity: 40 },
            tren: { enabled: false, direction: 50, cenital: false, blur: 3, opacity: 40 }
        };
        this.gridVisible = true;
        this.initPixi();
        this.initEvents();
        this.crearTablero();
    }
    initPixi() {
        this.container.innerHTML = '';
        this.app = new PIXI.Application({
            resizeTo: this.container,
            backgroundColor: 0x1a1a1a,
            antialias: true,
            resolution: window.devicePixelRatio || 1
        });
        this.container.appendChild(this.app.view);
        this.viewport = new PIXI.Container();
        this.app.stage.addChild(this.viewport);
    }
    crearTablero() {
        this.app.stage.removeChild(this.viewport);
        this.viewport.destroy({ children: true });
        this.viewport = new PIXI.Container();
        this.app.stage.addChild(this.viewport);
        Object.keys(this.noiseTextureCache).forEach((id) => this.destroyNoiseTexture(Number(id)));
        this.layers = [];
        // La imagen de referencia vivía en el viewport anterior (ya destruido): se olvida y hay que recargarla.
        this.referenceImageSprite = null;
        this.referenceImageEditMode = false;
        document.getElementById('reference-image-settings')?.setAttribute('hidden', '');
        this.freeWavyPoints = [];
        this.freeWavyClosed = false;
        this.selectedFreeWavyPointIndex = null;
        this.draggedFreeWavyHandle = null;
        this.linePoints = [];
        this.selectedLinePointIndex = null;
        this.mapaHexes = [];
        this.selectedHex = null;
        this.layerCounter = 0;
        this.baseLayerContainer = new PIXI.Container();
        this.wavyOverlayContainer = new PIXI.Container();
        this.gridContainer = new PIXI.Container();
        this.snapPointsContainer = new PIXI.Container();
        this.referenceImageContainer = new PIXI.Container();
        this.eraserCursorContainer = new PIXI.Container();
        for (let c = 0; c < this.cols; c++) {
            this.mapaHexes[c] = [];
            for (let f = 0; f < this.filas; f++) {
                const x = c * (this.radioHex * 1.5);
                const y = f * (Math.sqrt(3) * this.radioHex) + (c % 2 === 1 ? (Math.sqrt(3) * this.radioHex) / 2 : 0);
                this.mapaHexes[c][f] = { col: c, fila: f, x, y };
            }
        }
        this.buildSnapPoints();
        this.viewport.addChild(this.baseLayerContainer);
        this.viewport.addChild(this.wavyOverlayContainer);
        this.viewport.addChild(this.gridContainer);
        this.viewport.addChild(this.snapPointsContainer);
        this.viewport.addChild(this.referenceImageContainer);
        this.viewport.addChild(this.eraserCursorContainer);
        this.addLayer(true);
        this.viewport.x = 50;
        this.viewport.y = 50;
        this.updateLayerList();
    }
    // holes: recortes del borrador que no llegan a vaciar el hexágono entero (ver HexData.erasedHoles). En
    // coordenadas de mundo, como todo EraserStamp; se trasladan a locales (relativas al centro del hexágono,
    // igual que points) antes de recortarlos.
    drawHexGraphic(graphic, hexCoord, color, alpha, paintMode, borderColor, borderThickness, holes) {
        graphic.clear();
        graphic.removeChildren();
        graphic.lineStyle(borderThickness, borderColor);
        const points = paintMode === 'ondulado'
            ? this.createWavyHexPoints(hexCoord)
            : this.createRegularHexPoints();
        const fillAlpha = paintMode === 'ondulado' ? alpha * 0.72 : alpha;
        if (holes && holes.length > 0) {
            const localHoles = holes.map((hole) => ({ ...hole, x: hole.x - hexCoord.x, y: hole.y - hexCoord.y }));
            const fillGraphic = new PIXI.Graphics();
            fillGraphic.beginFill(color, fillAlpha);
            fillGraphic.drawPolygon(points);
            fillGraphic.endFill();
            const pointsAsPoints = [];
            for (let i = 0; i < points.length; i += 2)
                pointsAsPoints.push({ x: points[i], y: points[i + 1] });
            const bounds = this.computeBounds(pointsAsPoints, this.radioHex * 0.3);
            const display = this.renderIsolatedWithErase(fillGraphic, bounds, (g) => localHoles.forEach((hole) => this.drawErasedFill(g, hole)));
            graphic.addChild(display);
        }
        else {
            graphic.beginFill(color, fillAlpha);
            graphic.drawPolygon(points);
            graphic.endFill();
        }
        graphic.x = hexCoord.x;
        graphic.y = hexCoord.y;
    }
    drawSingleHexGraphic(hexCoord, color, alpha, paintMode, borderColor, borderThickness) {
        const graphic = this.layers[0].hexes[hexCoord.col][hexCoord.fila].graphic;
        this.drawHexGraphic(graphic, hexCoord, color, alpha, paintMode, borderColor, borderThickness);
    }
    createRegularHexPoints() {
        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            points.push(this.radioHex * Math.cos(angle), this.radioHex * Math.sin(angle));
        }
        return points;
    }
    createWavyHexPoints(hexCoord) {
        const points = [];
        const pointCount = 18;
        for (let i = 0; i < pointCount; i++) {
            const angle = (Math.PI * 2 * i) / pointCount;
            const wave = Math.sin((i * 1.7) + hexCoord.col * 2.1 + hexCoord.fila * 1.4) * 0.06;
            const radius = this.radioHex * (0.91 + wave);
            points.push(radius * Math.cos(angle), radius * Math.sin(angle));
        }
        return points;
    }
    pointKey(point) {
        return `${Math.round(point.x * 100)}:${Math.round(point.y * 100)}`;
    }
    polygonCentroid(points) {
        return {
            x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
            y: points.reduce((sum, point) => sum + point.y, 0) / points.length
        };
    }
    // Área con signo (fórmula del shoelace): el signo indica el sentido de giro del polígono. En un contorno
    // trazado por aristas no compartidas (createGroupContours), el borde exterior de una isla y el borde de un
    // agujero interior giran siempre en sentidos opuestos — es el criterio estándar (y fiable con formas
    // cóncavas, a diferencia de mirar dónde cae el centro) para distinguir "sólido" de "hueco".
    signedArea(points) {
        let sum = 0;
        for (let i = 0; i < points.length; i++) {
            const a = points[i];
            const b = points[(i + 1) % points.length];
            sum += a.x * b.y - b.x * a.y;
        }
        return sum;
    }
    // Ray casting habitual: sirve para decidir dentro de qué contorno "sólido" cae un agujero interior, una vez
    // ya clasificados por signedArea.
    isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const a = polygon[i];
            const b = polygon[j];
            const intersects = (a.y > point.y) !== (b.y > point.y)
                && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
            if (intersects)
                inside = !inside;
        }
        return inside;
    }
    edgeKey(start, end) {
        return [this.pointKey(start), this.pointKey(end)].sort().join('|');
    }
    // Puntos imán de toda la rejilla: vértice, centro de arista y centro de cada hexágono. Los vértices y aristas
    // se comparten entre hexágonos vecinos, así que se deduplican por pointKey antes de guardarlos.
    buildSnapPoints() {
        const localVertices = this.createRegularHexPoints();
        const seen = new Map();
        const addSnapPoint = (point) => {
            const key = this.pointKey(point);
            if (!seen.has(key))
                seen.set(key, point);
        };
        for (let c = 0; c < this.cols; c++) {
            for (let f = 0; f < this.filas; f++) {
                const hex = this.mapaHexes[c][f];
                addSnapPoint({ x: hex.x, y: hex.y });
                const vertices = [];
                for (let i = 0; i < 6; i++) {
                    const vertex = { x: hex.x + localVertices[i * 2], y: hex.y + localVertices[i * 2 + 1] };
                    vertices.push(vertex);
                    addSnapPoint(vertex);
                }
                for (let i = 0; i < 6; i++) {
                    const a = vertices[i];
                    const b = vertices[(i + 1) % 6];
                    addSnapPoint({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                }
            }
        }
        this.snapPoints = Array.from(seen.values());
    }
    // Imán de los puntos de control de las curvas Bézier (río/carretera/tren y perfil libre): si la posición cae
    // cerca de un punto de la rejilla (radio en píxeles de pantalla, independiente del zoom), se ajusta a él.
    snapToGrid(position) {
        if (!this.snapGridEnabled)
            return position;
        const snapRadius = 12 / this.viewport.scale.x;
        let closest = null;
        let closestDistance = snapRadius;
        this.snapPoints.forEach((point) => {
            const distance = Math.hypot(point.x - position.x, point.y - position.y);
            if (distance <= closestDistance) {
                closestDistance = distance;
                closest = point;
            }
        });
        return closest ?? position;
    }
    createGroupContours(hexes) {
        const edges = new Map();
        hexes.forEach((hexCoord) => {
            const localPoints = this.createRegularHexPoints();
            const points = [];
            for (let i = 0; i < localPoints.length; i += 2) {
                points.push({
                    x: localPoints[i] + hexCoord.x,
                    y: localPoints[i + 1] + hexCoord.y
                });
            }
            for (let i = 0; i < points.length; i++) {
                const start = points[i];
                const end = points[(i + 1) % points.length];
                const key = this.edgeKey(start, end);
                if (edges.has(key)) {
                    edges.delete(key);
                }
                else {
                    edges.set(key, { start, end });
                }
            }
        });
        const contours = [];
        while (edges.size > 0) {
            const firstKey = edges.keys().next().value;
            const firstEdge = edges.get(firstKey);
            if (!firstEdge)
                break;
            edges.delete(firstKey);
            const contour = [firstEdge.start];
            let previous = firstEdge.start;
            let current = firstEdge.end;
            let guard = 0;
            while (this.pointKey(current) !== this.pointKey(firstEdge.start) && guard < 10000) {
                contour.push(current);
                guard++;
                let nextKey;
                let nextEdge;
                let bestTurn = -Infinity;
                const incomingAngle = Math.atan2(current.y - previous.y, current.x - previous.x);
                for (const [key, edge] of edges) {
                    const startsHere = this.pointKey(edge.start) === this.pointKey(current);
                    const endsHere = this.pointKey(edge.end) === this.pointKey(current);
                    if (!startsHere && !endsHere)
                        continue;
                    const candidate = startsHere ? edge.end : edge.start;
                    let turn = Math.atan2(candidate.y - current.y, candidate.x - current.x) - incomingAngle;
                    while (turn < 0)
                        turn += Math.PI * 2;
                    while (turn >= Math.PI * 2)
                        turn -= Math.PI * 2;
                    if (turn > bestTurn) {
                        bestTurn = turn;
                        nextKey = key;
                        nextEdge = edge;
                    }
                }
                if (!nextEdge || !nextKey)
                    break;
                edges.delete(nextKey);
                previous = current;
                current = this.pointKey(nextEdge.start) === this.pointKey(current) ? nextEdge.end : nextEdge.start;
            }
            if (contour.length >= 3)
                contours.push(contour);
        }
        return contours;
    }
    createWavyContourPoints(contour) {
        return this.createWavyContourPointsWithWaves(contour, 3);
    }
    createWavyContourPointsWithWaves(contour, waves) {
        let smoothContour = contour;
        for (let pass = 0; pass < 4; pass++) {
            const refinedContour = [];
            for (let i = 0; i < smoothContour.length; i++) {
                const current = smoothContour[i];
                const next = smoothContour[(i + 1) % smoothContour.length];
                refinedContour.push({ x: current.x * 0.75 + next.x * 0.25, y: current.y * 0.75 + next.y * 0.25 }, { x: current.x * 0.25 + next.x * 0.75, y: current.y * 0.25 + next.y * 0.75 });
            }
            smoothContour = refinedContour;
        }
        contour = smoothContour;
        let area = 0;
        for (let i = 0; i < contour.length; i++) {
            const current = contour[i];
            const next = contour[(i + 1) % contour.length];
            area += current.x * next.y - next.x * current.y;
        }
        const isClockwise = area < 0;
        const points = [];
        const waveSize = this.radioHex * 0.08;
        const edgeLengths = contour.map((start, index) => {
            const end = contour[(index + 1) % contour.length];
            return Math.hypot(end.x - start.x, end.y - start.y);
        });
        const perimeter = edgeLengths.reduce((sum, length) => sum + length, 0);
        let distanceAlongPerimeter = 0;
        for (let i = 0; i < contour.length; i++) {
            const start = contour[i];
            const end = contour[(i + 1) % contour.length];
            const deltaX = end.x - start.x;
            const deltaY = end.y - start.y;
            const length = edgeLengths[i] || 1;
            const normalX = (isClockwise ? -deltaY : deltaY) / length;
            const normalY = (isClockwise ? deltaX : -deltaX) / length;
            points.push(start.x, start.y);
            const samples = Math.max(4, Math.ceil(waves * 4));
            for (let step = 1; step <= samples; step++) {
                const progress = step / (samples + 1);
                const perimeterProgress = (distanceAlongPerimeter + length * progress) / perimeter;
                const wave = Math.sin(perimeterProgress * Math.PI * 2 * waves) * waveSize;
                points.push(start.x + deltaX * progress + normalX * wave, start.y + deltaY * progress + normalY * wave);
            }
            distanceAlongPerimeter += length;
        }
        return points;
    }
    getContourArea(contour) {
        let area = 0;
        for (let i = 0; i < contour.length; i++) {
            const current = contour[i];
            const next = contour[(i + 1) % contour.length];
            area += current.x * next.y - next.x * current.y;
        }
        return Math.abs(area) / 2;
    }
    createConvexHull(hexes) {
        const points = hexes.flatMap((hexCoord) => {
            const localPoints = this.createRegularHexPoints();
            const hexPoints = [];
            for (let i = 0; i < localPoints.length; i += 2) {
                hexPoints.push({
                    x: localPoints[i] + hexCoord.x,
                    y: localPoints[i + 1] + hexCoord.y
                });
            }
            return hexPoints;
        }).sort((first, second) => first.x - second.x || first.y - second.y);
        const uniquePoints = points.filter((point, index) => index === 0 || this.pointKey(point) !== this.pointKey(points[index - 1]));
        const cross = (origin, first, second) => (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x);
        const lower = [];
        uniquePoints.forEach((point) => {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
                lower.pop();
            }
            lower.push(point);
        });
        const upper = [];
        [...uniquePoints].reverse().forEach((point) => {
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
                upper.pop();
            }
            upper.push(point);
        });
        return lower.slice(0, -1).concat(upper.slice(0, -1));
    }
    drawSmoothContour(graphic, points) {
        const contour = [];
        for (let i = 0; i < points.length; i += 2) {
            contour.push({ x: points[i], y: points[i + 1] });
        }
        if (contour.length < 3)
            return;
        const midpoint = (first, second) => ({
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2
        });
        graphic.moveTo(midpoint(contour[contour.length - 1], contour[0]).x, midpoint(contour[contour.length - 1], contour[0]).y);
        for (let i = 0; i < contour.length; i++) {
            const current = contour[i];
            const nextMidpoint = midpoint(current, contour[(i + 1) % contour.length]);
            graphic.quadraticCurveTo(current.x, current.y, nextMidpoint.x, nextMidpoint.y);
        }
        graphic.closePath();
    }
    drawBezierWavyContour(graphic, contour, centerX, centerY, coverage, waves, smoothness) {
        const coverageFactor = Math.max(0.5, Math.min(1, 0.5 + coverage / 200));
        const controlFactor = 0.1 + (Math.max(0, Math.min(100, smoothness)) / 100) * 0.75;
        const anchors = contour.map((point, index) => {
            const next = contour[(index + 1) % contour.length];
            const previous = contour[(index - 1 + contour.length) % contour.length];
            const tangentX = next.x - previous.x;
            const tangentY = next.y - previous.y;
            const tangentLength = Math.hypot(tangentX, tangentY) || 1;
            const normalX = -tangentY / tangentLength;
            const normalY = tangentX / tangentLength;
            const radialX = point.x - centerX;
            const radialY = point.y - centerY;
            const wave = Math.sin((index / contour.length) * Math.PI * 2 * waves) * this.radioHex * 0.14;
            return {
                x: centerX + radialX * coverageFactor + normalX * wave,
                y: centerY + radialY * coverageFactor + normalY * wave
            };
        });
        if (anchors.length < 3)
            return;
        const midpoint = (first, second) => ({
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2
        });
        const firstStart = midpoint(anchors[anchors.length - 1], anchors[0]);
        graphic.moveTo(firstStart.x, firstStart.y);
        for (let i = 0; i < anchors.length; i++) {
            const previous = anchors[(i - 1 + anchors.length) % anchors.length];
            const current = anchors[i];
            const next = anchors[(i + 1) % anchors.length];
            const start = midpoint(previous, current);
            const end = midpoint(current, next);
            const controlIn = {
                x: current.x + (start.x - current.x) * controlFactor,
                y: current.y + (start.y - current.y) * controlFactor
            };
            const controlOut = {
                x: current.x + (end.x - current.x) * controlFactor,
                y: current.y + (end.y - current.y) * controlFactor
            };
            graphic.bezierCurveTo(controlIn.x, controlIn.y, controlOut.x, controlOut.y, end.x, end.y);
        }
        graphic.closePath();
    }
    redibujarHexagonoCompleto(hexCoord) {
        if (!hexCoord)
            return;
        this.dibujarTableroCompleto();
    }
    getVisibleTerrain(hexCoord, maxLayerIndex = this.layers.length - 1) {
        for (let i = maxLayerIndex; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible)
                continue;
            const data = layer.hexes[hexCoord.col][hexCoord.fila];
            if (data.terreno)
                return { layerIndex: i, data };
        }
        return null;
    }
    colorToHexString(color) {
        return `#${color.toString(16).padStart(6, '0')}`;
    }
    hexStringToColor(hexString) {
        return parseInt(hexString.replace('#', ''), 16);
    }
    // Nombre de preset -> nombre de archivo válido: fuera los caracteres prohibidos en Windows/macOS/Linux.
    sanitizeFileName(name) {
        return name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'preset-ruido';
    }
    hashSeed(value) {
        let hash = 0;
        for (let i = 0; i < value.length; i++) {
            hash = (Math.imul(31, hash) + value.charCodeAt(i)) | 0;
        }
        return hash >>> 0;
    }
    ensureNoiseMask(mask) {
        if (mask)
            return mask;
        const created = new PIXI.Graphics();
        created.renderable = false;
        return created;
    }
    addHexPolygonToNoiseMask(mask, hexCoord) {
        const localPoints = this.createRegularHexPoints();
        const worldPoints = [];
        for (let i = 0; i < localPoints.length; i += 2) {
            worldPoints.push(localPoints[i] + hexCoord.x, localPoints[i + 1] + hexCoord.y);
        }
        mask.beginFill(0xffffff, 1);
        mask.drawPolygon(worldPoints);
        mask.endFill();
    }
    getNoiseTexture(noise) {
        const key = `${noise.noiseType}:${noise.seed}:${noise.color1}:${noise.color2}:${noise.size}:${noise.octaves}:${noise.stretch}:${noise.strength}`;
        const cached = this.noiseTextureCache[noise.id];
        if (cached && cached.key === key)
            return cached.texture;
        const textureSize = 256;
        const canvas = document.createElement('canvas');
        canvas.width = textureSize;
        canvas.height = textureSize;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(textureSize, textureSize);
        const seed = this.hashSeed(`noise:${noise.seed}`);
        const wrap = (value, period) => ((value % period) + period) % period;
        const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
        // Hash entero determinista por celda; el índice se envuelve para que la textura sea tileable.
        const hashCell = (ix, iy, resX, resY, salt) => {
            let h = Math.imul(wrap(ix, resX), 374761393) ^ Math.imul(wrap(iy, resY), 668265263) ^ Math.imul(seed + salt, 1274126177);
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            h ^= h >>> 16;
            return (h >>> 0) / 4294967296;
        };
        const valueNoise = (x, y, resX, resY, salt) => {
            const ix = Math.floor(x);
            const iy = Math.floor(y);
            const tx = fade(x - ix);
            const ty = fade(y - iy);
            const top = hashCell(ix, iy, resX, resY, salt) * (1 - tx) + hashCell(ix + 1, iy, resX, resY, salt) * tx;
            const bottom = hashCell(ix, iy + 1, resX, resY, salt) * (1 - tx) + hashCell(ix + 1, iy + 1, resX, resY, salt) * tx;
            return top * (1 - ty) + bottom * ty;
        };
        const gradientNoise = (x, y, resX, resY, salt) => {
            const ix = Math.floor(x);
            const iy = Math.floor(y);
            const fx = x - ix;
            const fy = y - iy;
            const corner = (cx, cy, dx, dy) => {
                const angle = hashCell(cx, cy, resX, resY, salt) * Math.PI * 2;
                return Math.cos(angle) * dx + Math.sin(angle) * dy;
            };
            const tx = fade(fx);
            const ty = fade(fy);
            const top = corner(ix, iy, fx, fy) * (1 - tx) + corner(ix + 1, iy, fx - 1, fy) * tx;
            const bottom = corner(ix, iy + 1, fx, fy - 1) * (1 - tx) + corner(ix + 1, iy + 1, fx - 1, fy - 1) * tx;
            // Perlin 2D con gradientes unitarios queda en ±0.707.
            return Math.min(1, Math.max(0, 0.5 + (top * (1 - ty) + bottom * ty) * 0.707));
        };
        const cellularNoise = (x, y, resX, resY, salt) => {
            const ix = Math.floor(x);
            const iy = Math.floor(y);
            let nearest = Infinity;
            for (let cy = iy - 1; cy <= iy + 1; cy++) {
                for (let cx = ix - 1; cx <= ix + 1; cx++) {
                    const dx = cx + hashCell(cx, cy, resX, resY, salt) - x;
                    const dy = cy + hashCell(cx, cy, resX, resY, salt + 1) - y;
                    nearest = Math.min(nearest, dx * dx + dy * dy);
                }
            }
            return Math.min(1, Math.sqrt(nearest));
        };
        // Valor de una octava según el tipo; u,v en [0,1) y la frecuencia ya aplicada en resX/resY.
        const sampleOctave = (type, u, v, resX, resY, salt) => {
            const x = u * resX;
            const y = v * resY;
            switch (type) {
                case 'VALUE': return valueNoise(x, y, resX, resY, salt);
                case 'WHITE': return hashCell(Math.floor(x * 16), Math.floor(y * 16), resX * 16, resY * 16, salt);
                case 'VORONOI': return cellularNoise(x, y, resX, resY, salt);
                case 'RIDGED': {
                    const ridge = 1 - Math.abs(gradientNoise(x, y, resX, resY, salt) * 2 - 1);
                    return ridge * ridge;
                }
                case 'BILLOW': return Math.abs(gradientNoise(x, y, resX, resY, salt) * 2 - 1);
                default: return gradientNoise(x, y, resX, resY, salt);
            }
        };
        const baseResolution = Math.max(2, 13 - noise.size);
        const baseResX = Math.max(1, Math.round(baseResolution / noise.stretch));
        const octaveCount = Math.max(1, Math.round(noise.octaves));
        const fbm = (type, u, v, salt) => {
            let sum = 0;
            let total = 0;
            let amplitude = 1;
            let frequency = 1;
            for (let octave = 0; octave < octaveCount; octave++) {
                sum += amplitude * sampleOctave(type, u, v, baseResX * frequency, baseResolution * frequency, salt + octave * 7);
                total += amplitude;
                amplitude *= 0.5;
                frequency *= 2;
            }
            return sum / total;
        };
        const warpStrength = 0.15;
        const sampleValue = (u, v) => {
            if (noise.noiseType !== 'WARPED')
                return fbm(noise.noiseType, u, v, 0);
            // Domain warping: se desplazan las coordenadas con otros dos campos de ruido.
            const warpU = (fbm('PERLIN', u, v, 101) - 0.5) * 2 * warpStrength;
            const warpV = (fbm('PERLIN', u, v, 211) - 0.5) * 2 * warpStrength;
            return fbm('PERLIN', u + warpU, v + warpV, 0);
        };
        const values = new Float32Array(textureSize * textureSize);
        let minValue = Infinity;
        let maxValue = -Infinity;
        for (let py = 0; py < textureSize; py++) {
            for (let px = 0; px < textureSize; px++) {
                const value = sampleValue(px / textureSize, py / textureSize);
                values[py * textureSize + px] = value;
                if (value < minValue)
                    minValue = value;
                if (value > maxValue)
                    maxValue = value;
            }
        }
        // Reescala a 0..1 para que todos los tipos tengan el mismo contraste antes de aplicar la fuerza.
        const valueRange = Math.max(1e-6, maxValue - minValue);
        const r1 = (noise.color1 >> 16) & 0xff;
        const g1 = (noise.color1 >> 8) & 0xff;
        const b1 = noise.color1 & 0xff;
        const r2 = (noise.color2 >> 16) & 0xff;
        const g2 = (noise.color2 >> 8) & 0xff;
        const b2 = noise.color2 & 0xff;
        const strengthRatio = noise.strength / 100;
        for (let i = 0; i < values.length; i++) {
            const value = (values[i] - minValue) / valueRange;
            const mix = Math.min(1, Math.max(0, 0.5 + (value - 0.5) * strengthRatio));
            const idx = i * 4;
            imageData.data[idx] = Math.round(r1 + (r2 - r1) * mix);
            imageData.data[idx + 1] = Math.round(g1 + (g2 - g1) * mix);
            imageData.data[idx + 2] = Math.round(b1 + (b2 - b1) * mix);
            imageData.data[idx + 3] = 255;
        }
        ctx.putImageData(imageData, 0, 0);
        cached?.texture.destroy(true);
        const texture = PIXI.Texture.from(canvas);
        this.noiseTextureCache[noise.id] = { key, texture };
        return texture;
    }
    createNoiseTilingSprite(noise, mask, layerBlendAlpha) {
        const texture = this.getNoiseTexture(noise);
        const padding = this.radioHex * 2;
        const boardWidth = this.cols * this.radioHex * 1.5 + padding * 2;
        const boardHeight = this.filas * (Math.sqrt(3) * this.radioHex) + padding * 2;
        const tilingSprite = new PIXI.TilingSprite(texture, boardWidth, boardHeight);
        tilingSprite.x = -padding;
        tilingSprite.y = -padding;
        tilingSprite.mask = mask;
        tilingSprite.alpha = (noise.opacity / 100) * layerBlendAlpha;
        return tilingSprite;
    }
    captureNoiseBackdrop() {
        const width = Math.max(1, this.app.renderer.width);
        const height = Math.max(1, this.app.renderer.height);
        const renderTexture = PIXI.RenderTexture.create({ width, height, resolution: 1 });
        this.app.renderer.render(this.app.stage, { renderTexture });
        this.pendingBackdropTextures.push(renderTexture);
        return renderTexture;
    }
    // Caja delimitadora de unos puntos, ampliada por margin (para saber cuánto RenderTexture hace falta).
    computeBounds(points, margin) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach((point) => {
            if (point.x < minX)
                minX = point.x;
            if (point.x > maxX)
                maxX = point.x;
            if (point.y < minY)
                minY = point.y;
            if (point.y > maxY)
                maxY = point.y;
        });
        return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
    }
    // Recorta huecos "de verdad" (transparencia, no Graphics.beginHole/endHole: con curvas Bézier daba resultados
    // erráticos) en fillGraphic: lo renderiza junto a lo que dibuje drawErase (en blendMode ERASE) en un
    // RenderTexture propio y aislado (mismo truco que captureNoiseBackdrop), y devuelve un Sprite con el recorte
    // ya hecho. drawErase null (sin nada que recortar) devuelve el propio fillGraphic sin tocar, sin coste extra.
    renderIsolatedWithErase(fillGraphic, bounds, drawErase) {
        if (!drawErase)
            return fillGraphic;
        // Límite de tamaño de textura (WebGL suele tope en 4096–16384 según la GPU): con una mancha de perfil
        // ondulado grande, el ancho/alto en píxeles de mundo puede superarlo con resolución ×3, y crear una
        // RenderTexture más grande de lo que la GPU admite. Se limita el lado mayor y se ajusta la resolución
        // (nunca por debajo de 1) para no pasarse.
        const MAX_TEXTURE_SIDE = 4096;
        const rawWidth = Math.max(1, bounds.maxX - bounds.minX);
        const rawHeight = Math.max(1, bounds.maxY - bounds.minY);
        // Sin suelo en 1: si la mancha es enorme, la resolución baja de 1 para no pedir una textura más grande
        // de lo que la GPU admite (se ve algo más blanda, pero no revienta).
        const resolution = Math.min(3, MAX_TEXTURE_SIDE / Math.max(rawWidth, rawHeight));
        const width = Math.max(1, Math.ceil(rawWidth));
        const height = Math.max(1, Math.ceil(rawHeight));
        // drawErase gestiona sus propios beginFill/endFill (con la suavidad, cada anillo necesita su propia
        // opacidad; ver drawEraserStampShape), no uno solo compartido para todo.
        const eraseGraphic = new PIXI.Graphics();
        drawErase(eraseGraphic);
        eraseGraphic.blendMode = PIXI.BLEND_MODES.ERASE;
        // Grupo aislado: el ERASE solo afecta a fillGraphic dentro de este RenderTexture, no a nada de la escena.
        const group = new PIXI.Container();
        group.x = -bounds.minX;
        group.y = -bounds.minY;
        group.addChild(fillGraphic, eraseGraphic);
        // Red de seguridad: si algo falla al crear/renderizar la textura (p. ej. límites de la GPU en un caso
        // no previsto), se devuelve la forma sin recortar en vez de romper todo el repintado del tablero.
        try {
            const renderTexture = PIXI.RenderTexture.create({ width, height, resolution });
            renderTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.LINEAR;
            this.app.renderer.render(group, { renderTexture });
            this.eraseHoleTextures.push(renderTexture);
            const sprite = new PIXI.Sprite(renderTexture);
            sprite.x = bounds.minX;
            sprite.y = bounds.minY;
            return sprite;
        }
        catch (error) {
            console.error('No se pudo recortar el hueco de borrado, se muestra la forma sin recortar.', error);
            return fillGraphic;
        }
    }
    // Huecos del pincel de borrado sobre un trazo (perfil libre o río/carretera): ver EraserStamp.
    // extraMargin: además del margen fijo, cuánto puede sobresalir la forma de sus puntos (p. ej. el ancho de un río).
    buildErasableFill(fillGraphic, points, holes, extraMargin) {
        if (!holes || holes.length === 0)
            return fillGraphic;
        const maxHoleRadius = holes.reduce((max, hole) => Math.max(max, hole.radius), 0);
        const bounds = this.computeBounds(points, this.radioHex * 2 + extraMargin + maxHoleRadius);
        return this.renderIsolatedWithErase(fillGraphic, bounds, (graphic) => holes.forEach((hole) => this.drawErasedFill(graphic, hole)));
    }
    // Agujeros interiores de un contorno de perfil ondulado (hexágonos ausentes rodeados por el resto del grupo):
    // se recortan como polígonos exactos (el propio contorno trazado del agujero), no como forma de pincel.
    cutPolygonHoles(fillGraphic, outer, holes) {
        if (holes.length === 0)
            return fillGraphic;
        const bounds = this.computeBounds(outer, this.radioHex);
        return this.renderIsolatedWithErase(fillGraphic, bounds, (graphic) => {
            graphic.beginFill(0xffffff, 1);
            holes.forEach((hole) => graphic.drawPolygon(hole.flatMap((point) => [point.x, point.y])));
            graphic.endFill();
        });
    }
    applyNoiseBlend(sprite, noise) {
        const nativeMode = NOISE_BLEND_NATIVE_GPU_MODE[noise.blendMode];
        if (nativeMode) {
            sprite.blendMode = PIXI.BLEND_MODES[nativeMode];
            return;
        }
        const backdrop = this.captureNoiseBackdrop();
        const filter = createNoiseBlendFilter();
        filter.uniforms.uBackdrop = backdrop;
        filter.uniforms.uScreenSize = [this.app.renderer.width, this.app.renderer.height];
        filter.uniforms.uBlendMode = NOISE_BLEND_MODE_INDEX[noise.blendMode];
        sprite.filters = [filter];
        sprite.blendMode = PIXI.BLEND_MODES.NORMAL;
    }
    drawNoiseOverlays() {
        this.pendingBackdropTextures.forEach((texture) => texture.destroy(true));
        this.pendingBackdropTextures = [];
        this.layers.forEach((layer, layerIndex) => {
            const targetContainer = layerIndex === 0 ? this.baseLayerContainer : layer.container;
            // Los sprites normales heredan la opacidad del contenedor de la capa; los ondulados viven en un contenedor común.
            const wavyOpacity = layer.opacity / 100;
            layer.noiseSpritesNormal.forEach((sprite) => targetContainer.removeChild(sprite));
            layer.noiseSpritesNormal = [];
            layer.noiseSpritesWavy.forEach((sprite) => this.wavyOverlayContainer.removeChild(sprite));
            layer.noiseSpritesWavy = [];
            const enabledNoiseLayers = layer.noiseLayers.filter((noise) => noise.enabled);
            if (enabledNoiseLayers.length === 0)
                return;
            if (layer.noiseMaskNormal) {
                if (!layer.noiseMaskNormal.parent)
                    targetContainer.addChild(layer.noiseMaskNormal);
                enabledNoiseLayers.forEach((noise) => {
                    const sprite = this.createNoiseTilingSprite(noise, layer.noiseMaskNormal, 1);
                    this.applyNoiseBlend(sprite, noise);
                    targetContainer.addChild(sprite);
                    layer.noiseSpritesNormal.push(sprite);
                });
            }
            if (layer.noiseMaskWavy) {
                this.wavyOverlayContainer.addChild(layer.noiseMaskWavy);
                enabledNoiseLayers.forEach((noise) => {
                    const sprite = this.createNoiseTilingSprite(noise, layer.noiseMaskWavy, wavyOpacity);
                    this.applyNoiseBlend(sprite, noise);
                    this.wavyOverlayContainer.addChild(sprite);
                    layer.noiseSpritesWavy.push(sprite);
                });
            }
        });
    }
    // Tiradores de un punto del perfil libre: al ser un contorno que siempre acaba cerrado, la tangente automática
    // se calcula como un anillo (el vecino del último punto es el primero) incluso mientras aún se está dibujando,
    // para que la vista previa ya anticipe la forma del cierre. Factor 0.18 (en vez del 1/6 de río/carretera/tren):
    // es el que ya daba el aspecto orgánico de siempre, se conserva para no cambiar las manchas existentes.
    getFreeWavyHandles(points, index) {
        const point = points[index];
        const previous = points[(index - 1 + points.length) % points.length];
        const next = points[(index + 1) % points.length];
        const tangentX = (next.x - previous.x) * 0.18;
        const tangentY = (next.y - previous.y) * 0.18;
        return {
            in: point.handleIn ?? { x: point.x - tangentX, y: point.y - tangentY },
            out: point.handleOut ?? { x: point.x + tangentX, y: point.y + tangentY }
        };
    }
    drawFreeWavyPath(graphic, points, closePath, color, alpha) {
        if (points.length < 2)
            return;
        graphic.lineStyle(closePath ? 0 : 2, color, closePath ? 0 : 0.9);
        if (closePath)
            graphic.beginFill(color, alpha);
        graphic.moveTo(points[0].x, points[0].y);
        const segmentCount = closePath ? points.length : points.length - 1;
        for (let i = 0; i < segmentCount; i++) {
            const next = points[(i + 1) % points.length];
            const controlOut = this.getFreeWavyHandles(points, i).out;
            const controlIn = this.getFreeWavyHandles(points, (i + 1) % points.length).in;
            graphic.bezierCurveTo(controlOut.x, controlOut.y, controlIn.x, controlIn.y, next.x, next.y);
        }
        if (closePath) {
            graphic.closePath();
            graphic.endFill();
        }
    }
    drawFreeWavyStrokes() {
        this.layers.forEach((layer) => layer.freeWavyStrokes.forEach((stroke) => {
            if (!layer.visible)
                return;
            const graphic = new PIXI.Graphics();
            this.drawFreeWavyPath(graphic, stroke.points, true, stroke.color, 1);
            const display = this.buildErasableFill(graphic, stroke.points, stroke.erasedHoles, 0);
            display.alpha = layer.opacity / 100;
            if (layer.noiseLayers.some((noise) => noise.enabled)) {
                layer.noiseMaskWavy = this.ensureNoiseMask(layer.noiseMaskWavy);
                this.drawFreeWavyPath(layer.noiseMaskWavy, stroke.points, true, 0xffffff, 1);
            }
            this.wavyOverlayContainer.addChild(display);
        }));
        if (this.freeWavyPoints.length > 0) {
            const preview = new PIXI.Graphics();
            // Cerrado (clic en el punto inicial) se previsualiza con el relleno del terreno; sin cerrar, solo el trazo blanco de siempre.
            const previewColor = this.freeWavyClosed && this.selectedTerrain ? this.colores[this.selectedTerrain] : 0xFFFFFF;
            this.drawFreeWavyPath(preview, this.freeWavyPoints, this.freeWavyClosed, previewColor, 0.6);
            // Puntos de control y, para el seleccionado, sus tiradores (mismo estilo que río/carretera/tren).
            preview.lineStyle(1, 0x000000, 0.8);
            this.freeWavyPoints.forEach((point, index) => {
                const isSelected = index === this.selectedFreeWavyPointIndex;
                preview.beginFill(isSelected ? 0xffd54a : 0xffffff, 1);
                preview.drawCircle(point.x, point.y, isSelected ? 5 : 4);
                preview.endFill();
            });
            if (this.selectedFreeWavyPointIndex !== null) {
                const index = this.selectedFreeWavyPointIndex;
                const point = this.freeWavyPoints[index];
                const handles = this.getFreeWavyHandles(this.freeWavyPoints, index);
                [handles.out, handles.in].forEach((position) => {
                    preview.lineStyle(1, 0x4fc3f7, 0.9);
                    preview.moveTo(point.x, point.y);
                    preview.lineTo(position.x, position.y);
                    preview.lineStyle(1, 0x01579b, 1);
                    preview.beginFill(0x4fc3f7, 1);
                    preview.drawRect(position.x - 3.5, position.y - 3.5, 7, 7);
                    preview.endFill();
                });
                preview.lineStyle(0);
            }
            this.wavyOverlayContainer.addChild(preview);
        }
    }
    // Tiradores de un punto de control: si el punto no tiene tirador propio (no se ha arrastrado nunca),
    // se calcula uno automático a partir de los vecinos con la misma tangente que daba antes el Catmull-Rom
    // (conversión estándar Catmull-Rom → Bézier, factor 1/6), así que una curva sin tocar se ve igual que antes.
    getPointHandles(points, index) {
        const point = points[index];
        const previous = points[Math.max(0, index - 1)];
        const next = points[Math.min(points.length - 1, index + 1)];
        const tangentX = (next.x - previous.x) / 6;
        const tangentY = (next.y - previous.y) / 6;
        return {
            in: point.handleIn ?? { x: point.x - tangentX, y: point.y - tangentY },
            out: point.handleOut ?? { x: point.x + tangentX, y: point.y + tangentY }
        };
    }
    // Curva de Bézier cúbicos que pasa por todos los puntos de control, usando sus tiradores (propios o automáticos).
    sampleLineSpline(points) {
        const stepsPerSegment = LINE_STEPS_PER_SEGMENT;
        const result = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const h1 = this.getPointHandles(points, i).out;
            const h2 = this.getPointHandles(points, i + 1).in;
            for (let step = 0; step < stepsPerSegment; step++) {
                const t = step / stepsPerSegment;
                const mt = 1 - t;
                result.push({
                    x: mt * mt * mt * p1.x + 3 * mt * mt * t * h1.x + 3 * mt * t * t * h2.x + t * t * t * p2.x,
                    y: mt * mt * mt * p1.y + 3 * mt * mt * t * h1.y + 3 * mt * t * t * h2.y + t * t * t * p2.y
                });
            }
        }
        result.push({ ...points[points.length - 1] });
        return result;
    }
    // Contorno cerrado del río: orilla izquierda de ida y orilla derecha de vuelta.
    createLineOutline(line) {
        if (line.points.length < 2)
            return [];
        const raw = this.sampleLineSpline(line.points);
        const path = raw.filter((point, index) => index === 0 || Math.hypot(point.x - raw[index - 1].x, point.y - raw[index - 1].y) > 0.5);
        if (path.length < 2)
            return [];
        const lengths = [0];
        for (let i = 1; i < path.length; i++) {
            lengths.push(lengths[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
        }
        const totalLength = lengths[lengths.length - 1];
        const phases = [0, 1, 2, 3].map((k) => (this.hashSeed(`line:${line.seed}:${k}`) / 4294967296) * Math.PI * 2);
        const halfWidth = line.width / 2;
        const amplitude = (line.waviness / 100) * line.width * 0.3;
        const taperLength = Math.min(totalLength, Math.max(line.width * 3, totalLength * 0.3));
        const smoothstep = (t) => t * t * (3 - 2 * t);
        const left = [];
        const right = [];
        for (let i = 0; i < path.length; i++) {
            const previous = path[Math.max(0, i - 1)];
            const next = path[Math.min(path.length - 1, i + 1)];
            const tangentLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
            const normalX = -(next.y - previous.y) / tangentLength;
            const normalY = (next.x - previous.x) / tangentLength;
            const distance = lengths[i];
            const taperFactor = line.taper
                ? smoothstep(Math.min(1, Math.max(0, (totalLength - distance) / taperLength)))
                : 1;
            // Cada orilla ondula por separado para que el cauce no sea simétrico.
            const bankWave = (phaseIndex) => Math.sin(distance / (line.width * 1.2) + phases[phaseIndex]) * 0.6
                + Math.sin(distance / (line.width * 0.45) + phases[phaseIndex + 1]) * 0.4;
            const leftWidth = Math.max(0, (halfWidth + amplitude * bankWave(0)) * taperFactor);
            const rightWidth = Math.max(0, (halfWidth + amplitude * bankWave(2)) * taperFactor);
            left.push({ x: path[i].x + normalX * leftWidth, y: path[i].y + normalY * leftWidth });
            right.push({ x: path[i].x - normalX * rightWidth, y: path[i].y - normalY * rightWidth });
        }
        const outline = [];
        left.forEach((point) => outline.push(point.x, point.y));
        for (let i = right.length - 1; i >= 0; i--)
            outline.push(right[i].x, right[i].y);
        return outline;
    }
    // Ciudad: cada hexágono pintado genera un grupo de casas; se guardan por capa y no alteran el terreno que hay debajo.
    paintCityHex(layer, hexCoord, erase) {
        const key = `${hexCoord.col}:${hexCoord.fila}`;
        const existing = layer.cities.get(key);
        if (erase) {
            existing?.graphic?.destroy();
            layer.cities.delete(key);
            return;
        }
        if (existing) {
            existing.density = this.cityDensity;
        }
        else {
            layer.cities.set(key, { col: hexCoord.col, fila: hexCoord.fila, density: this.cityDensity, houses: [], graphic: null, builtKey: '' });
        }
    }
    drawCities() {
        this.layers.forEach((layer) => {
            layer.cities.forEach((city) => {
                const builtKey = `${city.density}:${this.radioHex}`;
                if (!city.graphic || city.builtKey !== builtKey) {
                    city.graphic?.destroy();
                    city.houses = this.createCityHouses(layer, city);
                    city.graphic = new PIXI.Graphics();
                    city.houses.forEach((house) => this.drawHouse(city.graphic, house));
                    city.builtKey = builtKey;
                }
            });
            this.drawCityShadows(layer);
            // Orden dentro de la capa: primero la sombra común y encima las casas.
            layer.cities.forEach((city) => layer.container.addChild(city.graphic));
        });
    }
    // Todas las sombras de una capa en un único Graphics opaco con un solo filtro de desenfoque;
    // la opacidad se aplica al conjunto para que las sombras que se solapan no se sumen.
    drawCityShadows(layer) {
        const shadow = this.cityShadow;
        if (!shadow.enabled || layer.cities.size === 0) {
            if (layer.cityShadowGraphic) {
                layer.cityShadowGraphic.destroy();
                layer.cityShadowGraphic = null;
            }
            return;
        }
        if (!layer.cityShadowGraphic)
            layer.cityShadowGraphic = new PIXI.Graphics();
        const graphic = layer.cityShadowGraphic;
        graphic.clear();
        graphic.alpha = shadow.opacity / 100;
        const { offsetX, offsetY, growth } = this.getShadowVector(shadow);
        graphic.beginFill(0x000000, 1);
        layer.cities.forEach((city) => {
            city.houses.forEach((house) => {
                const shadowHouse = { ...house, length: house.length * growth, width: house.width * growth };
                graphic.drawPolygon(this.houseRectangle(shadowHouse, -shadowHouse.width / 2, shadowHouse.width / 2, offsetX, offsetY));
            });
        });
        graphic.endFill();
        this.applyShadowBlur(graphic, shadow.blur);
        layer.container.addChild(graphic);
    }
    // Desplazamiento de la sombra. Dirección: 0° = derecha y crece en sentido horario (eje Y de pantalla hacia abajo).
    // Con luz cenital no hay desplazamiento: la sombra rodea el objeto y se agranda para que asome por los lados.
    getShadowVector(shadow) {
        const distance = shadow.cenital ? 0 : Math.max(1.5, this.radioHex * 0.08);
        const angle = (shadow.direction * Math.PI) / 180;
        return {
            offsetX: Math.cos(angle) * distance,
            offsetY: Math.sin(angle) * distance,
            growth: shadow.cenital ? 1.3 : 1
        };
    }
    // Desenfoque gaussiano de una sombra; reutiliza el filtro si ya existe y lo quita con desenfoque 0.
    applyShadowBlur(graphic, blur) {
        const BlurFilterClass = PIXI.BlurFilter ?? PIXI.filters?.BlurFilter;
        if (blur > 0 && BlurFilterClass) {
            const existing = graphic.filters?.[0];
            if (existing) {
                existing.blur = blur;
            }
            else {
                graphic.filters = [new BlurFilterClass(blur)];
            }
        }
        else {
            graphic.filters = null;
        }
    }
    // Sombras de carreteras y trenes de una capa: un Graphics por tipo, opaco y con un solo desenfoque,
    // colocado justo debajo de los trazos de la capa. La opacidad se aplica al conjunto.
    drawLineShadows(layer) {
        ['carretera', 'tren'].forEach((kind) => {
            const shadow = this.lineShadows[kind];
            const lines = layer.lines.filter((line) => line.kind === kind);
            let graphic = layer.lineShadowGraphics[kind];
            if (!shadow.enabled || lines.length === 0) {
                if (graphic) {
                    graphic.destroy();
                    delete layer.lineShadowGraphics[kind];
                }
                return;
            }
            if (!graphic) {
                graphic = new PIXI.Graphics();
                layer.lineShadowGraphics[kind] = graphic;
            }
            graphic.clear();
            graphic.alpha = (shadow.opacity / 100) * (layer.opacity / 100);
            const { offsetX, offsetY, growth } = this.getShadowVector(shadow);
            lines.forEach((line) => {
                // La sombra es el propio trazo desplazado (y algo más ancho con luz cenital). No lleva los huecos
                // del borrador (drawLineShape ya no los aplica; ver buildErasableFill): la sombra de un trazo
                // borrado en parte se queda completa, imperfección menor aceptada por ahora.
                this.drawLineShape(graphic, {
                    ...line,
                    width: line.width * growth,
                    points: line.points.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY }))
                }, 0x000000, 1);
            });
            this.applyShadowBlur(graphic, shadow.blur);
            this.wavyOverlayContainer.addChild(graphic);
        });
    }
    // Casas dentro de un hexágono: posición, tamaño, orientación y color deterministas a partir de capa y casilla.
    createCityHouses(layer, city) {
        const hexCoord = this.mapaHexes[city.col]?.[city.fila];
        if (!hexCoord)
            return [];
        let state = this.hashSeed(`city:${layer.id}:${city.col}:${city.fila}`) || 1;
        const random = () => {
            state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
            return state / 4294967296;
        };
        const roofColors = [0xb0604a, 0xa3694f, 0xb87a5b, 0xc7ab84, 0xd8ceb8, 0x8497ad, 0x6f829a];
        const areaRadius = this.radioHex * 0.8;
        const blockAngle = random() * Math.PI;
        const houses = [];
        for (let attempts = 0; houses.length < city.density && attempts < city.density * 12; attempts++) {
            const length = this.radioHex * (0.22 + random() * 0.12);
            const width = length * (0.5 + random() * 0.2);
            const radius = length * 0.62;
            const distance = Math.sqrt(random()) * areaRadius;
            const theta = random() * Math.PI * 2;
            const x = hexCoord.x + Math.cos(theta) * distance;
            const y = hexCoord.y + Math.sin(theta) * distance;
            if (houses.some((house) => Math.hypot(house.x - x, house.y - y) < house.radius + radius))
                continue;
            // La mayoría de casas siguen la orientación de la manzana y algunas giran 90°.
            const angle = blockAngle + (random() < 0.25 ? Math.PI / 2 : 0) + (random() - 0.5) * 0.35;
            const roof = roofColors[Math.floor(random() * roofColors.length)];
            houses.push({ x, y, length, width, angle, roof, radius });
        }
        return houses;
    }
    // Rectángulo de la casa entre dos posiciones a lo ancho (fromV..toV), opcionalmente desplazado.
    houseRectangle(house, fromV, toV, offsetX = 0, offsetY = 0) {
        const ux = Math.cos(house.angle);
        const uy = Math.sin(house.angle);
        const vx = -uy;
        const vy = ux;
        const halfLength = house.length / 2;
        return [
            house.x + offsetX - ux * halfLength + vx * fromV, house.y + offsetY - uy * halfLength + vy * fromV,
            house.x + offsetX + ux * halfLength + vx * fromV, house.y + offsetY + uy * halfLength + vy * fromV,
            house.x + offsetX + ux * halfLength + vx * toV, house.y + offsetY + uy * halfLength + vy * toV,
            house.x + offsetX - ux * halfLength + vx * toV, house.y + offsetY - uy * halfLength + vy * toV
        ];
    }
    shadeColor(color, factor) {
        const channel = (shift) => Math.min(255, Math.round(((color >> shift) & 0xff) * factor));
        return (channel(16) << 16) | (channel(8) << 8) | channel(0);
    }
    // Casa vista desde arriba: tejado a dos aguas (dos mitades de distinto tono) y contorno fino.
    drawHouse(graphic, house) {
        const halfWidth = house.width / 2;
        graphic.lineStyle(0);
        graphic.beginFill(this.shadeColor(house.roof, 1.12), 1);
        graphic.drawPolygon(this.houseRectangle(house, -halfWidth, 0));
        graphic.endFill();
        graphic.beginFill(this.shadeColor(house.roof, 0.78), 1);
        graphic.drawPolygon(this.houseRectangle(house, 0, halfWidth));
        graphic.endFill();
        graphic.lineStyle(0.7, 0x3a2c22, 0.75);
        graphic.drawPolygon(this.houseRectangle(house, -halfWidth, halfWidth));
        graphic.lineStyle(0);
    }
    // Vía de tren: dos railes paralelos con traviesas a intervalos regulares, siguiendo la curva.
    drawRailway(graphic, line, color, alpha) {
        if (line.points.length < 2)
            return;
        const raw = this.sampleLineSpline(line.points);
        const path = raw.filter((point, index) => index === 0 || Math.hypot(point.x - raw[index - 1].x, point.y - raw[index - 1].y) > 0.5);
        if (path.length < 2)
            return;
        const normals = path.map((_, i) => {
            const previous = path[Math.max(0, i - 1)];
            const next = path[Math.min(path.length - 1, i + 1)];
            const tangentLength = Math.hypot(next.x - previous.x, next.y - previous.y) || 1;
            return { x: -(next.y - previous.y) / tangentLength, y: (next.x - previous.x) / tangentLength };
        });
        const railOffset = line.width * 0.3;
        const tieHalfLength = line.width * 0.5;
        const tieSpacing = Math.max(4, line.width * 0.7);
        // Traviesas: se colocan cada tieSpacing de longitud de curva, interpolando posición y normal.
        graphic.lineStyle(Math.max(1.5, line.width * 0.14), color, alpha);
        let nextTieDistance = 0;
        let travelled = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const segmentLength = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
            while (nextTieDistance <= travelled + segmentLength) {
                const t = segmentLength === 0 ? 0 : (nextTieDistance - travelled) / segmentLength;
                const cx = path[i].x + (path[i + 1].x - path[i].x) * t;
                const cy = path[i].y + (path[i + 1].y - path[i].y) * t;
                const nx = normals[i].x + (normals[i + 1].x - normals[i].x) * t;
                const ny = normals[i].y + (normals[i + 1].y - normals[i].y) * t;
                const normalLength = Math.hypot(nx, ny) || 1;
                graphic.moveTo(cx - (nx / normalLength) * tieHalfLength, cy - (ny / normalLength) * tieHalfLength);
                graphic.lineTo(cx + (nx / normalLength) * tieHalfLength, cy + (ny / normalLength) * tieHalfLength);
                nextTieDistance += tieSpacing;
            }
            travelled += segmentLength;
        }
        // Railes encima de las traviesas.
        graphic.lineStyle(Math.max(1.5, line.width * 0.1), color, alpha);
        [-1, 1].forEach((side) => {
            graphic.moveTo(path[0].x + normals[0].x * railOffset * side, path[0].y + normals[0].y * railOffset * side);
            for (let i = 1; i < path.length; i++) {
                graphic.lineTo(path[i].x + normals[i].x * railOffset * side, path[i].y + normals[i].y * railOffset * side);
            }
        });
        // El estilo de línea persiste en el Graphics (p. ej. la máscara de ruido), así que se restablece.
        graphic.lineStyle(0);
    }
    // Dibuja la forma final de un trazo según su tipo, para reutilizarla en el dibujo, la vista previa y la máscara de ruido.
    // Dibuja la forma final de un trazo según su tipo, para reutilizarla en el dibujo, la sombra y la máscara de
    // ruido. Los huecos del borrador NO se aplican aquí (ver eraseAt/buildErasableFill): esta función dibuja
    // dentro del Graphics que le pasen, y los huecos necesitan un render aislado propio por trazo.
    drawLineShape(graphic, line, color, alpha) {
        if (line.kind === 'tren') {
            this.drawRailway(graphic, line, color, alpha);
            return;
        }
        const outline = this.createLineOutline(line);
        if (outline.length < 6)
            return;
        graphic.lineStyle(0);
        graphic.beginFill(color, alpha);
        graphic.drawPolygon(outline);
        graphic.endFill();
    }
    drawLines() {
        this.layers.forEach((layer) => {
            if (!layer.visible)
                return;
            this.drawLineShadows(layer);
            layer.lines.forEach((line) => {
                const graphic = new PIXI.Graphics();
                this.drawLineShape(graphic, line, line.color, 1);
                const display = this.buildErasableFill(graphic, line.points, line.erasedHoles, line.width);
                display.alpha = layer.opacity / 100;
                this.wavyOverlayContainer.addChild(display);
                if (layer.noiseLayers.some((noise) => noise.enabled)) {
                    layer.noiseMaskWavy = this.ensureNoiseMask(layer.noiseMaskWavy);
                    this.drawLineShape(layer.noiseMaskWavy, line, 0xffffff, 1);
                }
            });
        });
        this.drawLinePreview();
    }
    // Tipo de trazo (río, carretera o tren) que dibuja el pincel seleccionado, o null si el pincel pinta hexágonos.
    getLineKind() {
        return this.selectedTerrain === 'rio' || this.selectedTerrain === 'carretera' || this.selectedTerrain === 'tren' ? this.selectedTerrain : null;
    }
    // Vista previa del trazo en curso: contorno con la configuración actual, guía de la curva y puntos de control.
    drawLinePreview() {
        const kind = this.getLineKind();
        if (!kind || this.linePoints.length === 0)
            return;
        const settings = this.lineSettings[kind];
        const preview = new PIXI.Graphics();
        this.drawLineShape(preview, { ...settings, kind, points: this.linePoints, seed: this.lineSeedCounter + 1 }, settings.color, 0.6);
        if (this.linePoints.length >= 2) {
            const guide = this.sampleLineSpline(this.linePoints);
            preview.lineStyle(1, 0xffffff, 0.7);
            preview.moveTo(guide[0].x, guide[0].y);
            guide.slice(1).forEach((point) => preview.lineTo(point.x, point.y));
        }
        preview.lineStyle(1, 0x000000, 0.8);
        this.linePoints.forEach((point, index) => {
            const isSelected = index === this.selectedLinePointIndex;
            preview.beginFill(isSelected ? 0xffd54a : 0xffffff, 1);
            preview.drawCircle(point.x, point.y, isSelected ? 5 : 4);
            preview.endFill();
        });
        // Tiradores de ancla (tipo Bézier) del punto seleccionado: línea guía + cuadrado arrastrable en cada extremo.
        if (this.selectedLinePointIndex !== null) {
            const index = this.selectedLinePointIndex;
            const point = this.linePoints[index];
            const handles = this.getPointHandles(this.linePoints, index);
            const sides = [
                { position: handles.out, visible: index < this.linePoints.length - 1 },
                { position: handles.in, visible: index > 0 }
            ];
            sides.filter((side) => side.visible).forEach(({ position }) => {
                preview.lineStyle(1, 0x4fc3f7, 0.9);
                preview.moveTo(point.x, point.y);
                preview.lineTo(position.x, position.y);
                preview.lineStyle(1, 0x01579b, 1);
                preview.beginFill(0x4fc3f7, 1);
                preview.drawRect(position.x - 3.5, position.y - 3.5, 7, 7);
                preview.endFill();
            });
            preview.lineStyle(0);
        }
        const selectedPoint = this.selectedLinePointIndex === null ? null : this.linePoints[this.selectedLinePointIndex];
        if (selectedPoint) {
            const icons = this.getLineIconPositions(selectedPoint);
            const radius = icons.radius;
            const cross = radius * 0.45;
            [{ center: icons.removePoint, color: 0xc0392b }, { center: icons.removeLine, color: 0x555555 }].forEach(({ center, color }) => {
                preview.lineStyle(1 / this.viewport.scale.x, 0xffffff, 1);
                preview.beginFill(color, 1);
                preview.drawCircle(center.x, center.y, radius);
                preview.endFill();
                preview.lineStyle(2 / this.viewport.scale.x, 0xffffff, 1);
                preview.moveTo(center.x - cross, center.y - cross);
                preview.lineTo(center.x + cross, center.y + cross);
                preview.moveTo(center.x + cross, center.y - cross);
                preview.lineTo(center.x - cross, center.y + cross);
            });
        }
        this.wavyOverlayContainer.addChild(preview);
    }
    // Iconos ✕ junto al punto seleccionado: el rojo quita el punto y el gris cancela todo el trazo.
    // Tamaño y separación en píxeles de pantalla para que no dependan del zoom.
    getLineIconPositions(point) {
        const scale = this.viewport.scale.x;
        return {
            removePoint: { x: point.x + 16 / scale, y: point.y - 16 / scale },
            removeLine: { x: point.x + 40 / scale, y: point.y - 16 / scale },
            radius: 9 / scale
        };
    }
    // Tirador ('in' o 'out') del punto seleccionado bajo el cursor. Los tiradores solo se muestran (y se pueden
    // pulsar) para el punto seleccionado, igual que en los editores vectoriales habituales.
    findLineHandleAt(position) {
        if (this.selectedLinePointIndex === null)
            return null;
        const index = this.selectedLinePointIndex;
        const hitRadius = 9 / this.viewport.scale.x;
        const handles = this.getPointHandles(this.linePoints, index);
        if (index < this.linePoints.length - 1 && Math.hypot(handles.out.x - position.x, handles.out.y - position.y) <= hitRadius)
            return 'out';
        if (index > 0 && Math.hypot(handles.in.x - position.x, handles.in.y - position.y) <= hitRadius)
            return 'in';
        return null;
    }
    // Índice del punto de control bajo el cursor (radio en píxeles de pantalla, independiente del zoom).
    findLinePointAt(position) {
        const hitRadius = 9 / this.viewport.scale.x;
        let closestIndex = null;
        let closestDistance = hitRadius;
        this.linePoints.forEach((point, index) => {
            const distance = Math.hypot(point.x - position.x, point.y - position.y);
            if (distance <= closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
        });
        return closestIndex;
    }
    // Tramo de la curva (índice de su primer punto de control) bajo el cursor, o null si no hay ninguno.
    findLineSegmentAt(position) {
        if (this.linePoints.length < 2)
            return null;
        const hitRadius = 9 / this.viewport.scale.x;
        const samples = this.sampleLineSpline(this.linePoints);
        let closestSegment = null;
        let closestDistance = hitRadius;
        for (let i = 0; i < samples.length - 1; i++) {
            const start = samples[i];
            const end = samples[i + 1];
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const lengthSquared = dx * dx + dy * dy;
            const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((position.x - start.x) * dx + (position.y - start.y) * dy) / lengthSquared));
            const distance = Math.hypot(position.x - (start.x + dx * t), position.y - (start.y + dy * t));
            if (distance <= closestDistance) {
                closestDistance = distance;
                closestSegment = Math.min(Math.floor(i / LINE_STEPS_PER_SEGMENT), this.linePoints.length - 2);
            }
        }
        return closestSegment;
    }
    insertLinePoint(index, position) {
        this.linePoints.splice(index, 0, this.snapToGrid(position));
        this.dibujarTableroCompleto();
    }
    moveLinePoint(index, rawPosition) {
        const point = this.linePoints[index];
        if (!point)
            return;
        const position = this.snapToGrid(rawPosition);
        // Los tiradores propios se guardan en posición absoluta, así que se desplazan con el ancla para no perder su forma.
        const dx = position.x - point.x;
        const dy = position.y - point.y;
        this.linePoints[index] = {
            x: position.x,
            y: position.y,
            handleIn: point.handleIn ? { x: point.handleIn.x + dx, y: point.handleIn.y + dy } : undefined,
            handleOut: point.handleOut ? { x: point.handleOut.x + dx, y: point.handleOut.y + dy } : undefined
        };
        this.dibujarTableroCompleto();
    }
    // Arrastra el tirador 'in' u 'out' del punto seleccionado. Por defecto el punto queda "suave": el tirador
    // opuesto gira para seguir alineado (conserva su propia longitud), como el nodo suave típico de un editor
    // vectorial. Con Alt se rompe la simetría y cada tirador se mueve de forma independiente ("punto de esquina").
    setLineHandle(index, which, position, breakSymmetry) {
        const point = this.linePoints[index];
        if (!point)
            return;
        const current = this.getPointHandles(this.linePoints, index);
        const updated = { ...point };
        if (which === 'out')
            updated.handleOut = position;
        else
            updated.handleIn = position;
        if (!breakSymmetry) {
            const opposite = which === 'out' ? current.in : current.out;
            const oppositeLength = Math.hypot(opposite.x - point.x, opposite.y - point.y);
            const angle = Math.atan2(position.y - point.y, position.x - point.x) + Math.PI;
            const mirrored = { x: point.x + Math.cos(angle) * oppositeLength, y: point.y + Math.sin(angle) * oppositeLength };
            if (which === 'out')
                updated.handleIn = mirrored;
            else
                updated.handleOut = mirrored;
        }
        this.linePoints[index] = updated;
        this.dibujarTableroCompleto();
    }
    removeLinePoint(index) {
        this.linePoints.splice(index, 1);
        this.selectedLinePointIndex = null;
        this.draggedLineHandle = null;
        this.dibujarTableroCompleto();
    }
    addLinePoint(point) {
        this.linePoints.push(this.snapToGrid(point));
        this.dibujarTableroCompleto();
    }
    cancelLine() {
        this.selectedLinePointIndex = null;
        this.draggedLineHandle = null;
        if (this.linePoints.length === 0)
            return;
        this.linePoints = [];
        this.dibujarTableroCompleto();
    }
    finishLine() {
        const kind = this.getLineKind();
        if (!kind || this.linePoints.length < 2 || !this.activeLayer) {
            this.cancelLine();
            return;
        }
        this.activeLayer.lines.push({ ...this.lineSettings[kind], kind, points: [...this.linePoints], seed: ++this.lineSeedCounter });
        this.linePoints = [];
        this.selectedLinePointIndex = null;
        this.draggedLineHandle = null;
        this.dibujarTableroCompleto();
    }
    undoLastLine() {
        if (!this.activeLayer || this.activeLayer.lines.length === 0)
            return;
        this.activeLayer.lines.pop();
        this.dibujarTableroCompleto();
    }
    // Añade un punto al final.
    addFreeWavyPoint(point) {
        this.selectedFreeWavyPointIndex = null;
        this.freeWavyPoints.push(this.snapToGrid(point));
        this.dibujarTableroCompleto();
    }
    // Cierra el perfil libre en curso como mancha rellena. Solo se llama desde Ctrl + clic derecho (finishFreeWavy),
    // igual que río/carretera/tren: ya no se cierra automáticamente al pulsar cerca del punto inicial.
    closeFreeWavyStroke() {
        const terrain = this.selectedTerrain;
        if (terrain && this.activeLayer) {
            this.activeLayer.freeWavyStrokes.push({ points: [...this.freeWavyPoints], color: this.colores[terrain] });
        }
        this.freeWavyPoints = [];
        this.freeWavyClosed = false;
        this.selectedFreeWavyPointIndex = null;
        this.draggedFreeWavyHandle = null;
        this.dibujarTableroCompleto();
    }
    // Ctrl + clic derecho finaliza el perfil libre en curso, igual que en río/carretera/tren.
    // Con menos de 3 puntos no forma polígono, así que se cancela en vez de cerrarse.
    finishFreeWavy() {
        if (this.freeWavyPoints.length < 3) {
            this.cancelFreeWavy();
            return;
        }
        this.closeFreeWavyStroke();
    }
    cancelFreeWavy() {
        this.freeWavyClosed = false;
        this.selectedFreeWavyPointIndex = null;
        this.draggedFreeWavyHandle = null;
        if (this.freeWavyPoints.length === 0)
            return;
        this.freeWavyPoints = [];
        this.dibujarTableroCompleto();
    }
    // Índice del punto del perfil libre bajo el cursor (mismo hit-test que los puntos de río/carretera/tren).
    findFreeWavyPointAt(position) {
        const hitRadius = 9 / this.viewport.scale.x;
        let closestIndex = null;
        let closestDistance = hitRadius;
        this.freeWavyPoints.forEach((point, index) => {
            const distance = Math.hypot(point.x - position.x, point.y - position.y);
            if (distance <= closestDistance) {
                closestDistance = distance;
                closestIndex = index;
            }
        });
        return closestIndex;
    }
    // Tirador ('in' o 'out') del punto seleccionado bajo el cursor.
    findFreeWavyHandleAt(position) {
        if (this.selectedFreeWavyPointIndex === null)
            return null;
        const index = this.selectedFreeWavyPointIndex;
        const hitRadius = 9 / this.viewport.scale.x;
        const handles = this.getFreeWavyHandles(this.freeWavyPoints, index);
        if (Math.hypot(handles.out.x - position.x, handles.out.y - position.y) <= hitRadius)
            return 'out';
        if (Math.hypot(handles.in.x - position.x, handles.in.y - position.y) <= hitRadius)
            return 'in';
        return null;
    }
    moveFreeWavyPoint(index, rawPosition) {
        const point = this.freeWavyPoints[index];
        if (!point)
            return;
        const position = this.snapToGrid(rawPosition);
        const dx = position.x - point.x;
        const dy = position.y - point.y;
        this.freeWavyPoints[index] = {
            x: position.x,
            y: position.y,
            handleIn: point.handleIn ? { x: point.handleIn.x + dx, y: point.handleIn.y + dy } : undefined,
            handleOut: point.handleOut ? { x: point.handleOut.x + dx, y: point.handleOut.y + dy } : undefined
        };
        this.dibujarTableroCompleto();
    }
    // Igual que setLineHandle: por defecto el punto queda "suave" (el tirador opuesto gira para seguir alineado);
    // Alt + arrastrar rompe la simetría.
    setFreeWavyHandle(index, which, position, breakSymmetry) {
        const point = this.freeWavyPoints[index];
        if (!point)
            return;
        const current = this.getFreeWavyHandles(this.freeWavyPoints, index);
        const updated = { ...point };
        if (which === 'out')
            updated.handleOut = position;
        else
            updated.handleIn = position;
        if (!breakSymmetry) {
            const opposite = which === 'out' ? current.in : current.out;
            const oppositeLength = Math.hypot(opposite.x - point.x, opposite.y - point.y);
            const angle = Math.atan2(position.y - point.y, position.x - point.x) + Math.PI;
            const mirrored = { x: point.x + Math.cos(angle) * oppositeLength, y: point.y + Math.sin(angle) * oppositeLength };
            if (which === 'out')
                updated.handleIn = mirrored;
            else
                updated.handleOut = mirrored;
        }
        this.freeWavyPoints[index] = updated;
        this.dibujarTableroCompleto();
    }
    removeFreeWavyPoint(index) {
        this.freeWavyPoints.splice(index, 1);
        this.selectedFreeWavyPointIndex = null;
        this.draggedFreeWavyHandle = null;
        this.dibujarTableroCompleto();
    }
    drawGrid() {
        this.gridContainer.removeChildren();
        if (!this.gridVisible)
            return;
        for (let c = 0; c < this.cols; c++) {
            for (let f = 0; f < this.filas; f++) {
                const graphic = new PIXI.Graphics();
                const points = this.createRegularHexPoints();
                graphic.lineStyle(1, 0x444444, 1);
                graphic.drawPolygon(points);
                graphic.x = this.mapaHexes[c][f].x;
                graphic.y = this.mapaHexes[c][f].y;
                this.gridContainer.addChild(graphic);
            }
        }
    }
    // Puntos imán (this.snapPoints, calculados en buildSnapPoints): puntitos discretos, visibles pero sutiles,
    // en un único Graphics para no crear cientos de objetos. Contenedor propio: se activan/desactivan con el
    // botón "Activar/Desactivar imán", independiente de la malla hexagonal (snapGridEnabled).
    drawSnapPoints() {
        this.snapPointsContainer.removeChildren();
        if (!this.snapGridEnabled)
            return;
        const graphic = new PIXI.Graphics();
        graphic.beginFill(0xbfe3ff, 0.4);
        this.snapPoints.forEach((point) => graphic.drawCircle(point.x, point.y, 1.6));
        graphic.endFill();
        this.snapPointsContainer.addChild(graphic);
    }
    // Imagen de referencia: se carga desde archivo local, centrada sobre el tablero y ajustada a su tamaño para
    // partir de un encaje razonable. A partir de ahí, el pan/escala propios de la imagen (modo "Mover/escalar
    // imagen") son cosa del usuario.
    loadReferenceImage(file) {
        const reader = new FileReader();
        reader.onload = () => {
            const image = new Image();
            image.onload = () => {
                const texture = PIXI.Texture.from(image);
                const sprite = new PIXI.Sprite(texture);
                sprite.anchor.set(0.5);
                const boardWidth = this.cols * this.radioHex * 1.5;
                const boardHeight = this.filas * (Math.sqrt(3) * this.radioHex);
                sprite.scale.set(Math.min(boardWidth / image.width, boardHeight / image.height) || 1);
                sprite.x = boardWidth / 2;
                sprite.y = boardHeight / 2;
                sprite.alpha = this.referenceImageOpacity / 100;
                // Si ya había una imagen cargada, se destruye (con su textura) antes de sustituirla.
                this.referenceImageSprite?.destroy({ texture: true, baseTexture: true });
                this.referenceImageContainer.removeChildren();
                this.referenceImageContainer.addChild(sprite);
                this.referenceImageSprite = sprite;
                document.getElementById('reference-image-settings')?.removeAttribute('hidden');
                this.dibujarTableroCompleto();
            };
            image.src = reader.result;
        };
        reader.readAsDataURL(file);
    }
    removeReferenceImage() {
        this.referenceImageSprite?.destroy({ texture: true, baseTexture: true });
        this.referenceImageContainer.removeChildren();
        this.referenceImageSprite = null;
        this.referenceImageEditMode = false;
        document.getElementById('reference-image-settings')?.setAttribute('hidden', '');
        this.dibujarTableroCompleto();
    }
    // Zoom de la imagen de referencia centrado en el cursor (mismo criterio que el zoom del mapa): se ajusta la
    // posición del sprite para que el punto bajo el cursor no se desplace al cambiar de escala.
    zoomReferenceImageAt(clientX, clientY, factor) {
        const sprite = this.referenceImageSprite;
        if (!sprite)
            return;
        const localPosition = this.viewport.toLocal({ x: clientX, y: clientY });
        const relativeX = (localPosition.x - sprite.x) / sprite.scale.x;
        const relativeY = (localPosition.y - sprite.y) / sprite.scale.y;
        const newScale = Math.min(Math.max(sprite.scale.x * factor, 0.02), 20);
        sprite.scale.set(newScale);
        sprite.x = localPosition.x - relativeX * newScale;
        sprite.y = localPosition.y - relativeY * newScale;
        this.dibujarTableroCompleto();
    }
    drawWavyTerrainGroups() {
        this.wavyOverlayContainer.removeChildren();
        // La limpieza de eraseHoleTextures del repintado anterior se hace en dibujarTableroCompleto (antes del
        // bucle de hexágonos), no aquí: esta función se llama después de renderHex, que también las usa.
        const groups = new Map();
        for (let c = 0; c < this.cols; c++) {
            for (let f = 0; f < this.filas; f++) {
                const hexCoord = this.mapaHexes[c][f];
                const visibleTerrain = this.getVisibleTerrain(hexCoord);
                if (!visibleTerrain || visibleTerrain.data.paintMode !== 'ondulado' || !visibleTerrain.data.terreno || visibleTerrain.data.color === null)
                    continue;
                const settings = visibleTerrain.data.wavySettings ?? { coverage: 100, waves: 3, smoothness: 50 };
                const grouping = visibleTerrain.data.wavyGrouping ?? 'stroke';
                const key = `${visibleTerrain.layerIndex}:${visibleTerrain.data.terreno}:${visibleTerrain.data.color}:${settings.coverage}:${settings.waves}:${settings.smoothness}:${grouping}:${visibleTerrain.data.paintGroupId}`;
                const group = groups.get(key) ?? {
                    color: visibleTerrain.data.color,
                    terreno: visibleTerrain.data.terreno,
                    layerIndex: visibleTerrain.layerIndex,
                    hexes: [],
                    settings,
                    grouping
                };
                group.hexes.push(hexCoord);
                groups.set(key, group);
            }
        }
        groups.forEach((group) => {
            const groupLayer = this.layers[group.layerIndex];
            const hasNoise = groupLayer.noiseLayers.some((noise) => noise.enabled);
            const groupCenterX = group.hexes.reduce((sum, hex) => sum + hex.x, 0) / group.hexes.length;
            const groupCenterY = group.hexes.reduce((sum, hex) => sum + hex.y, 0) / group.hexes.length;
            const groupOpacity = groupLayer.opacity / 100;
            // Contorno exacto por aristas (independiente del modo de agrupación): sirve para detectar agujeros
            // interiores (hexágonos ausentes en medio de una zona rodeada por el resto del grupo). "Sólido" vs
            // "hueco" se distingue por el sentido de giro (signedArea), no por dónde cae el centro: con formas
            // cóncavas (islas en forma de L, por ejemplo) el centro puede caer fuera de la propia isla y
            // confundirla con un agujero.
            const traced = this.createGroupContours(group.hexes);
            // Referencia de "sólido": el propio contorno de un hexágono suelto, calculado con esta misma función
            // (no con createConvexHull, que es otro algoritmo y podría no compartir convenio de giro).
            const solidSign = Math.sign(this.signedArea(this.createGroupContours([group.hexes[0]])[0]));
            const holeLoops = traced.filter((loop) => Math.sign(this.signedArea(loop)) !== solidSign);
            // 'stroke': una sola envolvente convexa para todo el grupo (aspecto redondeado de siempre).
            // 'contour': cada isla sólida del grupo por separado, con su forma exacta.
            const outerShapes = group.grouping === 'contour'
                ? traced.filter((loop) => Math.sign(this.signedArea(loop)) === solidSign)
                : [this.createConvexHull(group.hexes)];
            outerShapes.forEach((outer) => {
                const holes = holeLoops.filter((hole) => this.isPointInPolygon(this.polygonCentroid(hole), outer));
                const outerCenter = this.polygonCentroid(outer);
                const centerX = group.grouping === 'contour' ? outerCenter.x : groupCenterX;
                const centerY = group.grouping === 'contour' ? outerCenter.y : groupCenterY;
                const fillGraphic = new PIXI.Graphics();
                fillGraphic.beginFill(group.color, 1);
                this.drawBezierWavyContour(fillGraphic, outer, centerX, centerY, group.settings.coverage, group.settings.waves, group.settings.smoothness);
                fillGraphic.endFill();
                const display = this.cutPolygonHoles(fillGraphic, outer, holes);
                display.alpha = groupOpacity;
                this.wavyOverlayContainer.addChild(display);
                if (hasNoise) {
                    // La máscara de ruido no lleva los agujeros (mismo criterio que perfil libre/río: imperfección
                    // menor aceptada, ver README) — el ruido puede asomar levemente en el hueco.
                    groupLayer.noiseMaskWavy = this.ensureNoiseMask(groupLayer.noiseMaskWavy);
                    groupLayer.noiseMaskWavy.beginFill(0xffffff, 1);
                    this.drawBezierWavyContour(groupLayer.noiseMaskWavy, outer, centerX, centerY, group.settings.coverage, group.settings.waves, group.settings.smoothness);
                    groupLayer.noiseMaskWavy.endFill();
                }
            });
        });
        this.drawFreeWavyStrokes();
        this.drawLines();
        this.drawGrid();
        this.drawSnapPoints();
    }
    renderHex(hexCoord) {
        const baseData = this.layers[0].hexes[hexCoord.col][hexCoord.fila];
        const isSelected = this.selectedHex?.col === hexCoord.col && this.selectedHex?.fila === hexCoord.fila;
        const baseIsWavy = baseData.paintMode === 'ondulado';
        const baseColor = baseData.color ?? 0x1a1a1a;
        const baseBackground = baseData.underlyingColor ?? 0x1a1a1a;
        const backgroundColor = baseIsWavy ? baseBackground : baseColor;
        const backgroundTerreno = baseIsWavy ? baseData.underlyingTerrain : baseData.terreno;
        this.drawHexGraphic(baseData.graphic, hexCoord, backgroundColor, 1, 'normal', 0, 0, baseData.erasedHoles);
        const baseLayer = this.layers[0];
        if (backgroundTerreno && baseLayer.noiseLayers.some((noise) => noise.enabled)) {
            baseLayer.noiseMaskNormal = this.ensureNoiseMask(baseLayer.noiseMaskNormal);
            this.addHexPolygonToNoiseMask(baseLayer.noiseMaskNormal, hexCoord);
        }
        for (let layerIndex = 1; layerIndex < this.layers.length; layerIndex++) {
            const layer = this.layers[layerIndex];
            const data = layer.hexes[hexCoord.col][hexCoord.fila];
            data.graphic.clear();
            data.graphic.removeChildren();
            if (!layer.visible || !data.terreno || data.color === null || data.paintMode === 'ondulado')
                continue;
            this.drawHexGraphic(data.graphic, hexCoord, data.color, 1, 'normal', 0, 0, data.erasedHoles);
            if (layer.noiseLayers.some((noise) => noise.enabled)) {
                layer.noiseMaskNormal = this.ensureNoiseMask(layer.noiseMaskNormal);
                this.addHexPolygonToNoiseMask(layer.noiseMaskNormal, hexCoord);
            }
        }
    }
    dibujarTableroCompleto() {
        this.reorderLayerContainers();
        // Texturas de huecos de borrado (renderIsolatedWithErase) del repintado anterior: se destruyen antes de
        // que el bucle de hexágonos (más abajo) y drawWavyTerrainGroups puedan crear las nuevas de esta pasada.
        this.eraseHoleTextures.forEach((texture) => texture.destroy(true));
        this.eraseHoleTextures = [];
        this.layers.forEach((layer) => {
            layer.noiseMaskNormal?.clear();
            layer.noiseMaskWavy?.clear();
        });
        for (let c = 0; c < this.cols; c++) {
            for (let f = 0; f < this.filas; f++) {
                this.renderHex(this.mapaHexes[c][f]);
            }
        }
        this.drawCities();
        this.drawWavyTerrainGroups();
        this.viewport.removeChild(this.wavyOverlayContainer);
        this.viewport.addChild(this.wavyOverlayContainer);
        this.drawNoiseOverlays();
        this.viewport.removeChild(this.gridContainer);
        this.viewport.addChild(this.gridContainer);
        this.gridContainer.visible = this.gridVisible;
        this.viewport.removeChild(this.snapPointsContainer);
        this.viewport.addChild(this.snapPointsContainer);
        this.snapPointsContainer.visible = this.snapGridEnabled;
        // La imagen de referencia siempre queda por encima de todo (incluida la rejilla) para poder calcarla.
        this.viewport.removeChild(this.referenceImageContainer);
        this.viewport.addChild(this.referenceImageContainer);
        this.viewport.removeChild(this.eraserCursorContainer);
        this.viewport.addChild(this.eraserCursorContainer);
    }
    reorderLayerContainers() {
        this.layers.forEach((layer, index) => {
            this.viewport.removeChild(layer.container);
            this.viewport.addChildAt(layer.container, index + 1);
            layer.container.visible = layer.visible;
            layer.container.alpha = layer.opacity / 100;
        });
    }
    initEvents() {
        const updateWavySettingOutputs = () => {
            this.wavySettings = {
                coverage: Number(this.coverageInput.value),
                waves: Number(this.wavesInput.value),
                smoothness: Number(this.smoothnessInput.value)
            };
            this.coverageOutput.value = `${this.wavySettings.coverage}%`;
            this.wavesOutput.value = String(this.wavySettings.waves);
            this.smoothnessOutput.value = `${this.wavySettings.smoothness}%`;
        };
        this.coverageInput.addEventListener('input', updateWavySettingOutputs);
        this.wavesInput.addEventListener('input', updateWavySettingOutputs);
        this.smoothnessInput.addEventListener('input', updateWavySettingOutputs);
        this.groupingInput.addEventListener('change', () => {
            this.wavyGrouping = this.groupingInput.value;
        });
        document.getElementById('toggleGrid')?.addEventListener('click', (event) => {
            this.gridVisible = !this.gridVisible;
            event.currentTarget.textContent = this.gridVisible ? 'Ocultar malla' : 'Mostrar malla';
            this.drawGrid();
        });
        // Activa/desactiva a la vez los puntos imán y su efecto de enganche (snapToGrid), independiente de la malla.
        document.getElementById('toggleSnapGrid')?.addEventListener('click', (event) => {
            this.snapGridEnabled = !this.snapGridEnabled;
            event.currentTarget.textContent = this.snapGridEnabled ? 'Desactivar imán' : 'Activar imán';
            this.drawSnapPoints();
        });
        document.querySelectorAll('.paint-mode-option').forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.dataset.paintMode;
                if (!mode)
                    return;
                document.querySelector('.paint-mode-option.selected')?.classList.remove('selected');
                document.querySelectorAll('.paint-mode-option').forEach((option) => {
                    option.setAttribute('aria-pressed', String(option === button));
                });
                button.classList.add('selected');
                this.paintMode = mode;
                this.freeWavyPoints = [];
                this.freeWavyClosed = false;
                this.selectedFreeWavyPointIndex = null;
                this.draggedFreeWavyHandle = null;
                this.dibujarTableroCompleto();
            });
        });
        const eraserSettingsPanel = document.getElementById('eraser-settings');
        const citySettingsPanel = document.getElementById('city-settings');
        const cityDensityInput = document.getElementById('cityDensity');
        const cityDensityOutput = document.getElementById('cityDensityValue');
        cityDensityInput?.addEventListener('input', () => {
            this.cityDensity = Number(cityDensityInput.value);
            if (cityDensityOutput)
                cityDensityOutput.textContent = cityDensityInput.value;
        });
        // La sombra es un ajuste común de todas las casas: se actualiza en vivo.
        const cityShadowInput = document.getElementById('cityShadow');
        const cityShadowBlurInput = document.getElementById('cityShadowBlur');
        const cityShadowBlurOutput = document.getElementById('cityShadowBlurValue');
        const cityShadowOpacityInput = document.getElementById('cityShadowOpacity');
        const cityShadowOpacityOutput = document.getElementById('cityShadowOpacityValue');
        const cityShadowDirectionInput = document.getElementById('cityShadowDirection');
        const cityShadowDirectionOutput = document.getElementById('cityShadowDirectionValue');
        const cityShadowCenitalInput = document.getElementById('cityShadowCenital');
        const updateCityShadow = () => {
            if (cityShadowInput)
                this.cityShadow.enabled = cityShadowInput.checked;
            if (cityShadowCenitalInput)
                this.cityShadow.cenital = cityShadowCenitalInput.checked;
            if (cityShadowDirectionInput) {
                this.cityShadow.direction = Number(cityShadowDirectionInput.value);
                // Con luz cenital la dirección no aplica.
                cityShadowDirectionInput.disabled = this.cityShadow.cenital;
            }
            if (cityShadowDirectionOutput && cityShadowDirectionInput)
                cityShadowDirectionOutput.textContent = cityShadowDirectionInput.value + '°';
            if (cityShadowBlurInput)
                this.cityShadow.blur = Number(cityShadowBlurInput.value);
            if (cityShadowOpacityInput)
                this.cityShadow.opacity = Number(cityShadowOpacityInput.value);
            if (cityShadowBlurOutput && cityShadowBlurInput)
                cityShadowBlurOutput.textContent = cityShadowBlurInput.value;
            if (cityShadowOpacityOutput && cityShadowOpacityInput)
                cityShadowOpacityOutput.textContent = cityShadowOpacityInput.value + '%';
            this.dibujarTableroCompleto();
        };
        [cityShadowInput, cityShadowCenitalInput, cityShadowDirectionInput, cityShadowBlurInput, cityShadowOpacityInput].forEach((input) => {
            input?.addEventListener('input', updateCityShadow);
        });
        const lineSettingsPanel = document.getElementById('line-settings');
        const lineColorInput = document.getElementById('lineColor');
        const lineWidthInput = document.getElementById('lineWidth');
        const lineWidthOutput = document.getElementById('lineWidthValue');
        const lineTaperInput = document.getElementById('lineTaper');
        const lineWavinessInput = document.getElementById('lineWaviness');
        const lineWavinessOutput = document.getElementById('lineWavinessValue');
        const riverOnlyControls = document.querySelectorAll('.line-river-only');
        // Sombra de carretera y tren: ajustes por tipo, comunes a todos los trazos de ese tipo y en vivo.
        const lineShadowGroup = document.getElementById('line-shadow-group');
        const lineShadowInput = document.getElementById('lineShadow');
        const lineShadowCenitalInput = document.getElementById('lineShadowCenital');
        const lineShadowDirectionInput = document.getElementById('lineShadowDirection');
        const lineShadowDirectionOutput = document.getElementById('lineShadowDirectionValue');
        const lineShadowBlurInput = document.getElementById('lineShadowBlur');
        const lineShadowBlurOutput = document.getElementById('lineShadowBlurValue');
        const lineShadowOpacityInput = document.getElementById('lineShadowOpacity');
        const lineShadowOpacityOutput = document.getElementById('lineShadowOpacityValue');
        const syncLineShadowControls = (shadow) => {
            if (lineShadowInput)
                lineShadowInput.checked = shadow.enabled;
            if (lineShadowCenitalInput)
                lineShadowCenitalInput.checked = shadow.cenital;
            if (lineShadowDirectionInput) {
                lineShadowDirectionInput.value = String(shadow.direction);
                lineShadowDirectionInput.disabled = shadow.cenital;
            }
            if (lineShadowDirectionOutput)
                lineShadowDirectionOutput.textContent = `${shadow.direction}°`;
            if (lineShadowBlurInput)
                lineShadowBlurInput.value = String(shadow.blur);
            if (lineShadowBlurOutput)
                lineShadowBlurOutput.textContent = String(shadow.blur);
            if (lineShadowOpacityInput)
                lineShadowOpacityInput.value = String(shadow.opacity);
            if (lineShadowOpacityOutput)
                lineShadowOpacityOutput.textContent = `${shadow.opacity}%`;
        };
        const updateLineShadow = () => {
            const kind = this.getLineKind();
            if (kind !== 'carretera' && kind !== 'tren')
                return;
            const shadow = this.lineShadows[kind];
            if (lineShadowInput)
                shadow.enabled = lineShadowInput.checked;
            if (lineShadowCenitalInput)
                shadow.cenital = lineShadowCenitalInput.checked;
            if (lineShadowDirectionInput)
                shadow.direction = Number(lineShadowDirectionInput.value);
            if (lineShadowBlurInput)
                shadow.blur = Number(lineShadowBlurInput.value);
            if (lineShadowOpacityInput)
                shadow.opacity = Number(lineShadowOpacityInput.value);
            syncLineShadowControls(shadow);
            this.dibujarTableroCompleto();
        };
        [lineShadowInput, lineShadowCenitalInput, lineShadowDirectionInput, lineShadowBlurInput, lineShadowOpacityInput].forEach((input) => {
            input?.addEventListener('input', updateLineShadow);
        });
        // Vuelca los ajustes del tipo de trazo activo en los controles y oculta los que no aplican (punta y ondulación son solo de río).
        const syncLineControls = () => {
            const kind = this.getLineKind();
            lineSettingsPanel?.toggleAttribute('hidden', kind === null);
            riverOnlyControls.forEach((control) => control.toggleAttribute('hidden', kind !== 'rio'));
            // La sombra solo existe para carretera y tren.
            lineShadowGroup?.toggleAttribute('hidden', kind !== 'carretera' && kind !== 'tren');
            if (kind === 'carretera' || kind === 'tren')
                syncLineShadowControls(this.lineShadows[kind]);
            if (!kind)
                return;
            const settings = this.lineSettings[kind];
            if (lineColorInput)
                lineColorInput.value = this.colorToHexString(settings.color);
            if (lineWidthInput)
                lineWidthInput.value = String(settings.width);
            if (lineWidthOutput)
                lineWidthOutput.textContent = String(settings.width);
            if (lineTaperInput)
                lineTaperInput.checked = settings.taper;
            if (lineWavinessInput)
                lineWavinessInput.value = String(settings.waviness);
            if (lineWavinessOutput)
                lineWavinessOutput.textContent = `${settings.waviness}%`;
        };
        // Selector "[data-terrain]" para no incluir el botón Borrador, que es una herramienta aparte (no pinta terreno).
        document.querySelectorAll('.terrain-type[data-terrain]').forEach((button) => {
            button.addEventListener('click', () => {
                const terrain = button.dataset.terrain;
                if (button.classList.contains('selected')) {
                    button.classList.remove('selected');
                    this.selectedTerrain = null;
                }
                else {
                    document.querySelector('.terrain-type.selected')?.classList.remove('selected');
                    button.classList.add('selected');
                    this.selectedTerrain = terrain ?? null;
                }
                this.eraserMode = false;
                eraserSettingsPanel?.setAttribute('hidden', '');
                this.drawEraserCursor(null);
                this.linePoints = [];
                this.selectedLinePointIndex = null;
                syncLineControls();
                citySettingsPanel?.toggleAttribute('hidden', this.selectedTerrain !== 'ciudad');
                this.dibujarTableroCompleto();
            });
        });
        // Borrador: herramienta aparte, no un tipo de terreno (comparte el estilo .terrain-type y la exclusión
        // mutua de selección con los botones de arriba, pero no pinta ningún color). Recuerda qué pincel estaba
        // activo para recuperarlo solo al apagarse, en vez de dejar sin pincel seleccionado.
        const eraserToolButton = document.getElementById('eraserToolButton');
        let terrainBeforeEraser = null;
        eraserToolButton?.addEventListener('click', () => {
            this.eraserMode = !this.eraserMode;
            document.querySelectorAll('.terrain-type.selected').forEach((el) => el.classList.remove('selected'));
            eraserSettingsPanel?.toggleAttribute('hidden', !this.eraserMode);
            if (this.eraserMode) {
                terrainBeforeEraser = this.selectedTerrain;
                eraserToolButton.classList.add('selected');
                this.selectedTerrain = null;
                this.linePoints = [];
                this.selectedLinePointIndex = null;
                syncLineControls();
                citySettingsPanel?.setAttribute('hidden', '');
            }
            else {
                this.selectedTerrain = terrainBeforeEraser;
                document.querySelector(`.terrain-type[data-terrain="${terrainBeforeEraser}"]`)?.classList.add('selected');
                syncLineControls();
                citySettingsPanel?.toggleAttribute('hidden', this.selectedTerrain !== 'ciudad');
                this.drawEraserCursor(null);
            }
            this.dibujarTableroCompleto();
        });
        const eraserShapeInput = document.getElementById('eraserShape');
        const eraserRadiusInput = document.getElementById('eraserRadius');
        const eraserRadiusOutput = document.getElementById('eraserRadiusValue');
        const eraserSoftnessInput = document.getElementById('eraserSoftness');
        const eraserSoftnessOutput = document.getElementById('eraserSoftnessValue');
        eraserShapeInput?.addEventListener('change', () => {
            this.eraserSettings.shape = eraserShapeInput.value;
        });
        eraserRadiusInput?.addEventListener('input', () => {
            this.eraserSettings.radius = Number(eraserRadiusInput.value);
            if (eraserRadiusOutput)
                eraserRadiusOutput.textContent = eraserRadiusInput.value;
        });
        eraserSoftnessInput?.addEventListener('input', () => {
            this.eraserSettings.softness = Number(eraserSoftnessInput.value);
            if (eraserSoftnessOutput)
                eraserSoftnessOutput.textContent = `${eraserSoftnessInput.value}%`;
        });
        const updateLineSettings = () => {
            const kind = this.getLineKind();
            if (!kind)
                return;
            const settings = this.lineSettings[kind];
            if (lineColorInput)
                settings.color = this.hexStringToColor(lineColorInput.value);
            if (lineWidthInput)
                settings.width = Number(lineWidthInput.value);
            if (lineTaperInput)
                settings.taper = lineTaperInput.checked;
            if (lineWavinessInput)
                settings.waviness = Number(lineWavinessInput.value);
            if (lineWidthOutput && lineWidthInput)
                lineWidthOutput.textContent = lineWidthInput.value;
            if (lineWavinessOutput && lineWavinessInput)
                lineWavinessOutput.textContent = `${lineWavinessInput.value}%`;
            // Solo el trazo en curso usa estos valores; los ya finalizados conservan los suyos.
            this.dibujarTableroCompleto();
        };
        [lineColorInput, lineWidthInput, lineTaperInput, lineWavinessInput].forEach((input) => {
            input?.addEventListener('input', updateLineSettings);
        });
        document.getElementById('lineUndo')?.addEventListener('click', () => this.undoLastLine());
        window.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape')
                return;
            this.cancelLine();
            this.cancelFreeWavy();
        });
        const baseColorInput = document.getElementById('baseTerrainColor');
        const baseColorSwatch = document.getElementById('baseTerrainSwatch');
        baseColorInput?.addEventListener('input', () => {
            this.colores.base = this.hexStringToColor(baseColorInput.value);
            if (baseColorSwatch)
                baseColorSwatch.style.background = baseColorInput.value;
            // Elegir un color equivale a seleccionar el pincel de terreno base.
            const baseButton = document.querySelector('.terrain-type[data-terrain="base"]');
            if (baseButton && !baseButton.classList.contains('selected'))
                baseButton.click();
        });
        document.getElementById('add-layer-btn')?.addEventListener('click', () => this.addLayer());
        // Imagen de referencia: cargarla, quitarla, opacidad en vivo y el modo de mover/escalarla
        // (pointerdown/pointermove/wheel más abajo).
        const referenceImageInput = document.getElementById('referenceImageInput');
        const referenceImageSettings = document.getElementById('reference-image-settings');
        const referenceImageEditModeInput = document.getElementById('referenceImageEditMode');
        const referenceImageOpacityInput = document.getElementById('referenceImageOpacity');
        const referenceImageOpacityOutput = document.getElementById('referenceImageOpacityValue');
        document.getElementById('loadReferenceImage')?.addEventListener('click', () => referenceImageInput?.click());
        referenceImageInput?.addEventListener('change', () => {
            const file = referenceImageInput.files?.[0];
            if (file)
                this.loadReferenceImage(file);
            referenceImageInput.value = '';
        });
        referenceImageEditModeInput?.addEventListener('change', () => {
            this.referenceImageEditMode = referenceImageEditModeInput.checked;
        });
        referenceImageOpacityInput?.addEventListener('input', () => {
            this.referenceImageOpacity = Number(referenceImageOpacityInput.value);
            if (referenceImageOpacityOutput)
                referenceImageOpacityOutput.textContent = `${this.referenceImageOpacity}%`;
            if (this.referenceImageSprite) {
                this.referenceImageSprite.alpha = this.referenceImageOpacity / 100;
                this.dibujarTableroCompleto();
            }
        });
        document.getElementById('removeReferenceImage')?.addEventListener('click', () => {
            this.removeReferenceImage();
            if (referenceImageEditModeInput)
                referenceImageEditModeInput.checked = false;
            referenceImageSettings?.setAttribute('hidden', '');
        });
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;
        let isPanning = false;
        let panStart = { x: 0, y: 0 };
        let isPainting = false;
        let isErasing = false;
        let draggedLinePointIndex = null;
        let draggedFreeWavyPointIndex = null;
        let referenceImageDragStart = null;
        const stopPainting = () => {
            isPanning = false;
            isPainting = false;
            isErasing = false;
            draggedLinePointIndex = null;
            this.draggedLineHandle = null;
            draggedFreeWavyPointIndex = null;
            this.draggedFreeWavyHandle = null;
            referenceImageDragStart = null;
            this.activePaintGroupId = null;
        };
        this.app.stage.on('pointerdown', (event) => {
            const localPosition = this.viewport.toLocal(event.global);
            // Modo "mover/escalar imagen": el botón izquierdo la arrastra (rueda la escala, más abajo) y el resto
            // de herramientas queda en pausa; el botón derecho sigue moviendo la vista como siempre.
            if (this.referenceImageEditMode && this.referenceImageSprite && event.button === 0) {
                referenceImageDragStart = { x: event.global.x, y: event.global.y };
                return;
            }
            // Borrador: clic izquierdo (y arrastrar) borra; el resto de pinceles/curvas quedan en pausa mientras
            // está activo. El botón derecho sigue moviendo la vista.
            if (this.eraserMode && event.button === 0) {
                isErasing = true;
                this.eraseAt(localPosition.x, localPosition.y);
                return;
            }
            if (this.getLineKind()) {
                // Río, carretera y tren: clic izquierdo añade punto (o arrastra uno existente; con Mayús lo elimina)
                // y Ctrl + clic derecho finaliza. El clic derecho sin Ctrl sigue moviendo la vista.
                if (event.button === 0) {
                    const selectedPoint = this.selectedLinePointIndex === null ? null : this.linePoints[this.selectedLinePointIndex];
                    if (selectedPoint) {
                        const icons = this.getLineIconPositions(selectedPoint);
                        if (Math.hypot(localPosition.x - icons.removePoint.x, localPosition.y - icons.removePoint.y) <= icons.radius) {
                            this.removeLinePoint(this.selectedLinePointIndex);
                            return;
                        }
                        if (Math.hypot(localPosition.x - icons.removeLine.x, localPosition.y - icons.removeLine.y) <= icons.radius) {
                            this.cancelLine();
                            return;
                        }
                    }
                    // Tiradores del punto seleccionado: se comprueban antes que los anclas para poder arrastrarlos.
                    const handle = this.findLineHandleAt(localPosition);
                    if (handle) {
                        this.draggedLineHandle = handle;
                        return;
                    }
                    const pointIndex = this.findLinePointAt(localPosition);
                    if (pointIndex === null) {
                        const segmentIndex = this.findLineSegmentAt(localPosition);
                        if (segmentIndex === null) {
                            this.selectedLinePointIndex = null;
                            this.addLinePoint({ x: localPosition.x, y: localPosition.y });
                        }
                        else {
                            // Insertar en el tramo pulsado y poder arrastrar el punto nuevo sin soltar.
                            this.selectedLinePointIndex = segmentIndex + 1;
                            this.insertLinePoint(segmentIndex + 1, { x: localPosition.x, y: localPosition.y });
                            draggedLinePointIndex = segmentIndex + 1;
                        }
                    }
                    else if (event.shiftKey) {
                        this.removeLinePoint(pointIndex);
                    }
                    else {
                        // Seleccionar el punto (muestra los iconos ✕) y permitir arrastrarlo.
                        this.selectedLinePointIndex = pointIndex;
                        draggedLinePointIndex = pointIndex;
                        this.dibujarTableroCompleto();
                    }
                    return;
                }
                if (event.button === 2 && event.ctrlKey && this.linePoints.length > 0) {
                    this.finishLine();
                    return;
                }
            }
            // Sin terreno seleccionado (p. ej. justo tras usar el Borrador) no se dibuja nada: si no, se podían
            // crear puntos que, al finalizar, no se pintaban (closeFreeWavyStroke exige un terreno seleccionado).
            if (this.paintMode === 'ondulado-libre' && this.selectedTerrain && this.selectedTerrain !== 'ciudad') {
                // Perfil libre: mismo esquema que río/carretera/tren (seleccionar/arrastrar puntos y tiradores,
                // Mayús quita un punto, Ctrl + clic derecho finaliza). Pinchar en el punto inicial cierra la
                // vista previa (línea de cierre + relleno) pero NO finaliza el trazo: se puede seguir editando
                // y solo Ctrl + clic derecho lo da por terminado.
                if (event.button === 0) {
                    const handle = this.findFreeWavyHandleAt(localPosition);
                    if (handle) {
                        this.draggedFreeWavyHandle = handle;
                        return;
                    }
                    const pointIndex = this.findFreeWavyPointAt(localPosition);
                    if (pointIndex === null) {
                        this.addFreeWavyPoint({ x: localPosition.x, y: localPosition.y });
                    }
                    else if (event.shiftKey) {
                        this.removeFreeWavyPoint(pointIndex);
                    }
                    else {
                        if (pointIndex === 0)
                            this.freeWavyClosed = true;
                        this.selectedFreeWavyPointIndex = pointIndex;
                        draggedFreeWavyPointIndex = pointIndex;
                        this.dibujarTableroCompleto();
                    }
                    return;
                }
                if (event.button === 2 && event.ctrlKey && this.freeWavyPoints.length > 0) {
                    this.finishFreeWavy();
                    return;
                }
            }
            if (event.button === 2) {
                isPanning = true;
                panStart = { x: event.global.x - this.viewport.x, y: event.global.y - this.viewport.y };
            }
            else if (event.button === 0) {
                isPainting = true;
                this.activePaintGroupId = ++this.paintGroupCounter;
                this.pintarHexagono(localPosition.x, localPosition.y, event.shiftKey);
            }
        });
        this.app.stage.on('pointermove', (event) => {
            if (this.eraserMode)
                this.drawEraserCursor(this.viewport.toLocal(event.global));
            if (referenceImageDragStart !== null && this.referenceImageSprite) {
                const dx = (event.global.x - referenceImageDragStart.x) / this.viewport.scale.x;
                const dy = (event.global.y - referenceImageDragStart.y) / this.viewport.scale.y;
                this.referenceImageSprite.x += dx;
                this.referenceImageSprite.y += dy;
                referenceImageDragStart = { x: event.global.x, y: event.global.y };
                this.dibujarTableroCompleto();
            }
            else if (isPanning) {
                this.viewport.x = event.global.x - panStart.x;
                this.viewport.y = event.global.y - panStart.y;
            }
            else if (this.draggedLineHandle !== null && this.selectedLinePointIndex !== null) {
                // Con Alt se rompe la simetría del tirador opuesto (punto de esquina en vez de suave).
                const localPosition = this.viewport.toLocal(event.global);
                this.setLineHandle(this.selectedLinePointIndex, this.draggedLineHandle, { x: localPosition.x, y: localPosition.y }, event.altKey);
            }
            else if (draggedLinePointIndex !== null) {
                const localPosition = this.viewport.toLocal(event.global);
                this.moveLinePoint(draggedLinePointIndex, { x: localPosition.x, y: localPosition.y });
            }
            else if (this.draggedFreeWavyHandle !== null && this.selectedFreeWavyPointIndex !== null) {
                const localPosition = this.viewport.toLocal(event.global);
                this.setFreeWavyHandle(this.selectedFreeWavyPointIndex, this.draggedFreeWavyHandle, { x: localPosition.x, y: localPosition.y }, event.altKey);
            }
            else if (draggedFreeWavyPointIndex !== null) {
                const localPosition = this.viewport.toLocal(event.global);
                this.moveFreeWavyPoint(draggedFreeWavyPointIndex, { x: localPosition.x, y: localPosition.y });
            }
            else if (isErasing) {
                const localPosition = this.viewport.toLocal(event.global);
                this.eraseAt(localPosition.x, localPosition.y);
            }
            else if (isPainting) {
                const localPosition = this.viewport.toLocal(event.global);
                this.pintarHexagono(localPosition.x, localPosition.y, event.shiftKey);
            }
        });
        this.app.stage.on('pointerup', stopPainting);
        this.app.stage.on('pointerupoutside', stopPainting);
        this.app.view.addEventListener('pointerup', stopPainting);
        this.app.view.addEventListener('pointercancel', stopPainting);
        window.addEventListener('pointerup', stopPainting);
        window.addEventListener('pointercancel', stopPainting);
        this.app.stage.on('pointerout', () => {
            isPainting = false;
            isErasing = false;
            this.activePaintGroupId = null;
            this.drawEraserCursor(null);
        });
        this.app.view.addEventListener('wheel', (event) => {
            event.preventDefault();
            const zoom = event.deltaY < 0 ? 1.1 : 0.9;
            if (this.referenceImageEditMode && this.referenceImageSprite) {
                this.zoomReferenceImageAt(event.clientX, event.clientY, zoom);
                return;
            }
            const worldPosition = this.viewport.toLocal({ x: event.clientX, y: event.clientY });
            const newScale = Math.min(Math.max(this.viewport.scale.x * zoom, 0.1), 3);
            this.viewport.scale.set(newScale);
            this.viewport.x = event.clientX - worldPosition.x * newScale;
            this.viewport.y = event.clientY - worldPosition.y * newScale;
            // Los iconos ✕ del punto seleccionado se dimensionan según el zoom, así que hay que redibujarlos.
            if (this.selectedLinePointIndex !== null)
                this.dibujarTableroCompleto();
        }, { passive: false });
        this.app.view.addEventListener('contextmenu', (event) => event.preventDefault());
    }
    addLayer(isBase = false) {
        this.layerCounter++;
        const newLayer = {
            id: Date.now() + this.layerCounter,
            name: isBase ? 'Capa Base' : `Capa ${this.layerCounter}`,
            visible: true,
            opacity: 100,
            container: new PIXI.Container(),
            hexes: [],
            freeWavyStrokes: [],
            lines: [],
            cities: new Map(),
            cityShadowGraphic: null,
            lineShadowGraphics: {},
            noiseLayers: [],
            noiseMaskNormal: null,
            noiseMaskWavy: null,
            noiseSpritesNormal: [],
            noiseSpritesWavy: []
        };
        for (let c = 0; c < this.cols; c++) {
            newLayer.hexes[c] = [];
            for (let f = 0; f < this.filas; f++) {
                const hexCoordinate = this.mapaHexes[c][f];
                const hexData = {
                    ...hexCoordinate,
                    terreno: isBase ? 'base' : null,
                    color: isBase ? this.colores.base : null,
                    paintMode: isBase ? 'normal' : null,
                    wavySettings: isBase ? { coverage: 100, waves: 3, smoothness: 50 } : null,
                    wavyGrouping: isBase ? 'stroke' : null,
                    paintGroupId: null,
                    underlyingTerrain: null,
                    underlyingColor: null,
                    graphic: new PIXI.Graphics()
                };
                newLayer.hexes[c][f] = hexData;
                if (isBase) {
                    this.baseLayerContainer.addChild(hexData.graphic);
                }
                else {
                    newLayer.container.addChild(hexData.graphic);
                }
            }
        }
        this.layers.push(newLayer);
        this.viewport.addChild(newLayer.container);
        if (isBase)
            this.dibujarTableroCompleto();
        this.setActiveLayer(newLayer.id);
    }
    setActiveLayer(layerId) {
        const layer = this.layers.find((currentLayer) => currentLayer.id === layerId);
        if (layer)
            this.activeLayer = layer;
        this.updateLayerList();
    }
    isBaseLayer(layerId) {
        return this.layers[0]?.id === layerId;
    }
    deleteLayer(layerId) {
        const layerIndex = this.layers.findIndex((layer) => layer.id === layerId);
        if (layerIndex < 0 || this.isBaseLayer(layerId))
            return;
        const [deletedLayer] = this.layers.splice(layerIndex, 1);
        this.viewport.removeChild(deletedLayer.container);
        deletedLayer.container.destroy();
        deletedLayer.noiseLayers.forEach((noise) => this.destroyNoiseTexture(noise.id));
        if (this.activeLayer?.id === layerId) {
            this.setActiveLayer(this.layers[layerIndex - 1].id);
        }
        else {
            this.updateLayerList();
        }
        this.dibujarTableroCompleto();
    }
    addNoiseLayer(layerId) {
        const layer = this.layers.find((currentLayer) => currentLayer.id === layerId);
        if (!layer)
            return;
        this.noiseLayerCounter++;
        layer.noiseLayers.push({ id: this.noiseLayerCounter, enabled: true, noiseType: 'VALUE', seed: this.noiseLayerCounter, color1: 0xffffff, color2: 0x000000, size: 4, octaves: 2, stretch: 1, strength: 40, opacity: 100, blendMode: 'NORMAL' });
        this.updateLayerList();
        this.dibujarTableroCompleto();
    }
    removeNoiseLayer(layerId, noiseId) {
        const layer = this.layers.find((currentLayer) => currentLayer.id === layerId);
        if (!layer)
            return;
        layer.noiseLayers = layer.noiseLayers.filter((noise) => noise.id !== noiseId);
        this.destroyNoiseTexture(noiseId);
        this.updateLayerList();
        this.dibujarTableroCompleto();
    }
    destroyNoiseTexture(noiseId) {
        const cached = this.noiseTextureCache[noiseId];
        if (!cached)
            return;
        cached.texture.destroy(true);
        delete this.noiseTextureCache[noiseId];
    }
    // Descarga el aspecto de una capa de ruido como .json (id/enabled quedan fuera, son de la instancia).
    // Pide un nombre para el preset: se guarda dentro del .json y también da nombre al archivo descargado.
    exportNoisePreset(noise) {
        const defaultName = NOISE_TYPE_LABELS[noise.noiseType];
        const typedName = prompt('Nombre del preset:', defaultName);
        if (typedName === null)
            return; // cancelado
        const name = typedName.trim() || defaultName;
        const preset = {
            name,
            noiseType: noise.noiseType,
            seed: noise.seed,
            color1: this.colorToHexString(noise.color1),
            color2: this.colorToHexString(noise.color2),
            size: noise.size,
            octaves: noise.octaves,
            stretch: noise.stretch,
            strength: noise.strength,
            opacity: noise.opacity,
            blendMode: noise.blendMode
        };
        const json = JSON.stringify({ tipo: NOISE_PRESET_FILE_MARKER, version: 1, preset }, null, 2);
        const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `${this.sanitizeFileName(name)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }
    // Lee un archivo de preset (el descargado por exportNoisePreset) y lo aplica a esta capa de ruido.
    importNoisePreset(noise, file) {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(String(reader.result));
                // Admite tanto el archivo completo (con "preset" dentro) como solo el objeto de ajustes.
                this.applyNoisePreset(noise, data?.preset ?? data);
            }
            catch {
                alert('El archivo de preset no es válido.');
            }
        };
        reader.readAsText(file);
    }
    // Copia campo a campo lo que venga en el preset (ignora lo que falte o no tenga el tipo esperado) y
    // deja los valores numéricos dentro de los mismos límites que sus controles.
    applyNoisePreset(noise, preset) {
        if (!preset || typeof preset !== 'object') {
            alert('El archivo de preset no es válido.');
            return;
        }
        const clamp = (value, min, max) => typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;
        if (typeof preset.noiseType === 'string' && preset.noiseType in NOISE_TYPE_LABELS)
            noise.noiseType = preset.noiseType;
        const seed = clamp(preset.seed, 0, 999999);
        if (seed !== null)
            noise.seed = Math.floor(seed);
        if (typeof preset.color1 === 'string')
            noise.color1 = this.hexStringToColor(preset.color1);
        if (typeof preset.color2 === 'string')
            noise.color2 = this.hexStringToColor(preset.color2);
        const size = clamp(preset.size, 1, 10);
        if (size !== null)
            noise.size = size;
        const octaves = clamp(preset.octaves, 1, 6);
        if (octaves !== null)
            noise.octaves = octaves;
        const stretch = clamp(preset.stretch, 1, 8);
        if (stretch !== null)
            noise.stretch = stretch;
        const strength = clamp(preset.strength, 0, 100);
        if (strength !== null)
            noise.strength = strength;
        const opacity = clamp(preset.opacity, 0, 100);
        if (opacity !== null)
            noise.opacity = opacity;
        if (typeof preset.blendMode === 'string' && preset.blendMode in NOISE_BLEND_MODE_LABELS)
            noise.blendMode = preset.blendMode;
        this.updateLayerList();
        this.dibujarTableroCompleto();
    }
    toggleLayerVisibility(layerId) {
        const layer = this.layers.find((currentLayer) => currentLayer.id === layerId);
        if (!layer || this.isBaseLayer(layerId))
            return;
        layer.visible = !layer.visible;
        layer.container.visible = layer.visible;
        this.dibujarTableroCompleto();
        this.updateLayerList();
    }
    updateLayerList() {
        this.layerListElement.innerHTML = '';
        const orderedLayers = this.layers.length > 0
            ? [this.layers[0], ...this.layers.slice(1).reverse()]
            : [];
        orderedLayers.forEach((layer) => {
            const isBaseLayer = this.isBaseLayer(layer.id);
            const listItem = document.createElement('li');
            listItem.className = 'layer-item';
            listItem.dataset.layerId = String(layer.id);
            listItem.classList.toggle('active', this.activeLayer?.id === layer.id);
            listItem.classList.toggle('hidden', !layer.visible);
            const layerName = document.createElement('span');
            layerName.className = 'layer-name';
            layerName.textContent = layer.name;
            // La base no es renombrable (título aparte para no sugerir un doble clic que no hace nada).
            layerName.title = isBaseLayer ? 'Capa base (no se puede renombrar)' : 'Doble clic para renombrar';
            listItem.appendChild(layerName);
            let visibilityButton = null;
            if (!isBaseLayer) {
                visibilityButton = document.createElement('button');
                visibilityButton.className = 'layer-btn visibility-btn';
                visibilityButton.textContent = layer.visible ? '👁️' : '🙈';
                listItem.appendChild(visibilityButton);
            }
            if (!isBaseLayer) {
                const deleteButton = document.createElement('button');
                deleteButton.className = 'layer-btn delete-btn';
                deleteButton.textContent = '🗑️';
                listItem.appendChild(deleteButton);
                layerName.addEventListener('dblclick', () => {
                    if (this.isBaseLayer(layer.id))
                        return;
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = layer.name;
                    input.className = 'layer-name-input';
                    layerName.replaceWith(input);
                    input.focus();
                    const saveName = () => {
                        const newName = input.value.trim();
                        if (newName)
                            layer.name = newName;
                        this.updateLayerList();
                    };
                    input.addEventListener('blur', saveName);
                    input.addEventListener('keydown', (event) => {
                        if (event.key === 'Enter')
                            saveName();
                        if (event.key === 'Escape')
                            this.updateLayerList();
                    });
                });
                deleteButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.deleteLayer(layer.id);
                });
            }
            listItem.addEventListener('click', () => this.setActiveLayer(layer.id));
            visibilityButton?.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleLayerVisibility(layer.id);
            });
            if (!isBaseLayer)
                listItem.appendChild(this.buildOpacityControl(layer));
            listItem.appendChild(this.buildNoiseSection(layer));
            this.layerListElement.appendChild(listItem);
        });
    }
    buildOpacityControl(layer) {
        const label = document.createElement('label');
        label.className = 'layer-opacity';
        label.title = 'Opacidad de la capa';
        label.addEventListener('click', (event) => event.stopPropagation());
        const input = document.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = '100';
        input.step = '5';
        input.value = String(layer.opacity);
        const output = document.createElement('output');
        output.textContent = `${layer.opacity}%`;
        label.append('Opacidad', input, output);
        input.addEventListener('input', () => {
            layer.opacity = Number(input.value);
            output.textContent = `${input.value}%`;
            this.dibujarTableroCompleto();
        });
        return label;
    }
    buildNoiseSection(layer) {
        const section = document.createElement('div');
        section.className = 'layer-noise-list';
        section.addEventListener('click', (event) => event.stopPropagation());
        layer.noiseLayers.forEach((noise) => {
            const row = document.createElement('div');
            row.className = 'noise-entry';
            const enabledInput = document.createElement('input');
            enabledInput.type = 'checkbox';
            enabledInput.checked = noise.enabled;
            enabledInput.title = 'Activar esta capa de ruido';
            const color1Input = document.createElement('input');
            color1Input.type = 'color';
            color1Input.value = this.colorToHexString(noise.color1);
            color1Input.title = 'Color base 1';
            const color2Input = document.createElement('input');
            color2Input.type = 'color';
            color2Input.value = this.colorToHexString(noise.color2);
            color2Input.title = 'Color base 2';
            const typeSelect = document.createElement('select');
            typeSelect.title = 'Tipo de ruido';
            typeSelect.className = 'noise-blend-select';
            Object.keys(NOISE_TYPE_LABELS).forEach((type) => {
                const option = document.createElement('option');
                option.value = type;
                option.textContent = NOISE_TYPE_LABELS[type];
                if (type === noise.noiseType)
                    option.selected = true;
                typeSelect.appendChild(option);
            });
            const seedLabel = document.createElement('label');
            seedLabel.title = 'Semilla del ruido';
            const seedInput = document.createElement('input');
            seedInput.type = 'number';
            seedInput.className = 'noise-seed-input';
            seedInput.min = '0';
            seedInput.max = '999999';
            seedInput.step = '1';
            seedInput.value = String(noise.seed);
            const seedRandomButton = document.createElement('button');
            seedRandomButton.type = 'button';
            seedRandomButton.className = 'noise-seed-btn';
            seedRandomButton.textContent = '🎲';
            seedRandomButton.title = 'Semilla aleatoria';
            seedLabel.append('Sem', seedInput, seedRandomButton);
            const octavesLabel = document.createElement('label');
            octavesLabel.title = 'Octavas: capas de detalle superpuestas';
            const octavesInput = document.createElement('input');
            octavesInput.type = 'range';
            octavesInput.min = '1';
            octavesInput.max = '6';
            octavesInput.step = '1';
            octavesInput.value = String(noise.octaves);
            const octavesOutput = document.createElement('output');
            octavesOutput.textContent = String(noise.octaves);
            octavesLabel.append('Oct', octavesInput, octavesOutput);
            const stretchLabel = document.createElement('label');
            stretchLabel.title = 'Estirado horizontal del ruido';
            const stretchInput = document.createElement('input');
            stretchInput.type = 'range';
            stretchInput.min = '1';
            stretchInput.max = '8';
            stretchInput.step = '1';
            stretchInput.value = String(noise.stretch);
            const stretchOutput = document.createElement('output');
            stretchOutput.textContent = String(noise.stretch);
            stretchLabel.append('Est', stretchInput, stretchOutput);
            const sizeLabel = document.createElement('label');
            sizeLabel.title = 'Tamaño del ruido';
            const sizeInput = document.createElement('input');
            sizeInput.type = 'range';
            sizeInput.min = '1';
            sizeInput.max = '10';
            sizeInput.step = '1';
            sizeInput.value = String(noise.size);
            const sizeOutput = document.createElement('output');
            sizeOutput.textContent = String(noise.size);
            sizeLabel.append('Tam', sizeInput, sizeOutput);
            const strengthLabel = document.createElement('label');
            strengthLabel.title = 'Fuerza del ruido';
            const strengthInput = document.createElement('input');
            strengthInput.type = 'range';
            strengthInput.min = '0';
            strengthInput.max = '100';
            strengthInput.step = '5';
            strengthInput.value = String(noise.strength);
            const strengthOutput = document.createElement('output');
            strengthOutput.textContent = `${noise.strength}%`;
            strengthLabel.append('Fza', strengthInput, strengthOutput);
            const opacityLabel = document.createElement('label');
            opacityLabel.title = 'Opacidad de la capa de ruido';
            const opacityInput = document.createElement('input');
            opacityInput.type = 'range';
            opacityInput.min = '0';
            opacityInput.max = '100';
            opacityInput.step = '5';
            opacityInput.value = String(noise.opacity);
            const opacityOutput = document.createElement('output');
            opacityOutput.textContent = `${noise.opacity}%`;
            opacityLabel.append('Op', opacityInput, opacityOutput);
            const blendSelect = document.createElement('select');
            blendSelect.title = 'Modo de fusión';
            blendSelect.className = 'noise-blend-select';
            NOISE_BLEND_MODE_GROUPS.forEach((group) => {
                const groupParent = group.label
                    ? Object.assign(document.createElement('optgroup'), { label: group.label })
                    : blendSelect;
                if (groupParent !== blendSelect)
                    blendSelect.appendChild(groupParent);
                group.modes.forEach((mode) => {
                    const option = document.createElement('option');
                    option.value = mode;
                    option.textContent = NOISE_BLEND_MODE_LABELS[mode];
                    if (mode === noise.blendMode)
                        option.selected = true;
                    groupParent.appendChild(option);
                });
            });
            // Presets: descargar los ajustes de esta capa de ruido como .json, o cargar uno ya descargado.
            const exportPresetButton = document.createElement('button');
            exportPresetButton.type = 'button';
            exportPresetButton.className = 'noise-preset-btn';
            exportPresetButton.textContent = '💾';
            exportPresetButton.title = 'Guardar preset (descarga un .json)';
            const importPresetInput = document.createElement('input');
            importPresetInput.type = 'file';
            importPresetInput.accept = 'application/json';
            importPresetInput.hidden = true;
            const importPresetButton = document.createElement('button');
            importPresetButton.type = 'button';
            importPresetButton.className = 'noise-preset-btn';
            importPresetButton.textContent = '📂';
            importPresetButton.title = 'Cargar preset desde un .json';
            const removeButton = document.createElement('button');
            removeButton.type = 'button';
            removeButton.className = 'noise-remove-btn';
            removeButton.textContent = '×';
            removeButton.title = 'Eliminar esta capa de ruido';
            row.appendChild(enabledInput);
            row.appendChild(color1Input);
            row.appendChild(color2Input);
            row.appendChild(blendSelect);
            row.appendChild(typeSelect);
            row.appendChild(seedLabel);
            row.appendChild(sizeLabel);
            row.appendChild(octavesLabel);
            row.appendChild(stretchLabel);
            row.appendChild(strengthLabel);
            row.appendChild(opacityLabel);
            row.appendChild(exportPresetButton);
            row.appendChild(importPresetButton);
            row.appendChild(importPresetInput);
            row.appendChild(removeButton);
            enabledInput.addEventListener('change', () => {
                noise.enabled = enabledInput.checked;
                this.dibujarTableroCompleto();
            });
            color1Input.addEventListener('input', () => {
                noise.color1 = this.hexStringToColor(color1Input.value);
                this.dibujarTableroCompleto();
            });
            color2Input.addEventListener('input', () => {
                noise.color2 = this.hexStringToColor(color2Input.value);
                this.dibujarTableroCompleto();
            });
            blendSelect.addEventListener('change', () => {
                noise.blendMode = blendSelect.value;
                this.dibujarTableroCompleto();
            });
            typeSelect.addEventListener('change', () => {
                noise.noiseType = typeSelect.value;
                this.dibujarTableroCompleto();
            });
            seedInput.addEventListener('change', () => {
                const parsed = Math.floor(Number(seedInput.value));
                noise.seed = Number.isFinite(parsed) ? Math.min(999999, Math.max(0, parsed)) : 0;
                seedInput.value = String(noise.seed);
                this.dibujarTableroCompleto();
            });
            seedRandomButton.addEventListener('click', () => {
                noise.seed = Math.floor(Math.random() * 1000000);
                seedInput.value = String(noise.seed);
                this.dibujarTableroCompleto();
            });
            octavesInput.addEventListener('input', () => {
                noise.octaves = Number(octavesInput.value);
                octavesOutput.textContent = octavesInput.value;
                this.dibujarTableroCompleto();
            });
            stretchInput.addEventListener('input', () => {
                noise.stretch = Number(stretchInput.value);
                stretchOutput.textContent = stretchInput.value;
                this.dibujarTableroCompleto();
            });
            sizeInput.addEventListener('input', () => {
                noise.size = Number(sizeInput.value);
                sizeOutput.textContent = sizeInput.value;
                this.dibujarTableroCompleto();
            });
            strengthInput.addEventListener('input', () => {
                noise.strength = Number(strengthInput.value);
                strengthOutput.textContent = `${strengthInput.value}%`;
                this.dibujarTableroCompleto();
            });
            opacityInput.addEventListener('input', () => {
                noise.opacity = Number(opacityInput.value);
                opacityOutput.textContent = `${opacityInput.value}%`;
                this.dibujarTableroCompleto();
            });
            removeButton.addEventListener('click', () => this.removeNoiseLayer(layer.id, noise.id));
            exportPresetButton.addEventListener('click', () => this.exportNoisePreset(noise));
            importPresetButton.addEventListener('click', () => importPresetInput.click());
            importPresetInput.addEventListener('change', () => {
                const file = importPresetInput.files?.[0];
                if (file)
                    this.importNoisePreset(noise, file);
                importPresetInput.value = '';
            });
            section.appendChild(row);
        });
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'add-noise-btn';
        addButton.textContent = '+ Ruido';
        addButton.addEventListener('click', () => this.addNoiseLayer(layer.id));
        section.appendChild(addButton);
        return section;
    }
    // ¿(px,py) cae dentro del pincel de borrado centrado en (cx,cy)? Geométrico, sin difuminado: se usa tal cual
    // para decidir si un objeto entero (mancha, trazo, casa) queda dentro del pincel.
    isInsideEraserShape(px, py, cx, cy, shape, radius) {
        const dx = px - cx;
        const dy = py - cy;
        switch (shape) {
            case 'cuadrado': return Math.max(Math.abs(dx), Math.abs(dy)) <= radius;
            case 'diamante': return Math.abs(dx) + Math.abs(dy) <= radius;
            default: return Math.hypot(dx, dy) <= radius;
        }
    }
    // Dibuja (relleno) la silueta de un sello de borrado: para círculo/cuadrado/diamante es la forma limpia de
    // siempre; "orgánico" reparte sus vértices con un desigual tipo borde desgarrado y "disperso" son varias
    // manchitas sueltas en vez de una forma continua. Cuanto más alta la suavidad, más irregular/disperso el
    // resultado (en círculo/cuadrado/diamante la suavidad no afecta a la forma, se queda limpia).
    // Determinista por stamp.seed: el mismo hueco se repinta siempre igual; cada pasada de borrado usa una seed nueva.
    drawEraserStampShape(graphic, stamp) {
        const { x, y, shape, radius, softness, seed } = stamp;
        const rand = (salt) => this.hashSeed(`erase:${seed}:${salt}`) / 4294967296;
        if (shape === 'circulo') {
            graphic.drawCircle(x, y, radius);
            return;
        }
        if (shape === 'cuadrado') {
            graphic.drawRect(x - radius, y - radius, radius * 2, radius * 2);
            return;
        }
        if (shape === 'diamante') {
            graphic.drawPolygon([x, y - radius, x + radius, y, x, y + radius, x - radius, y]);
            return;
        }
        if (shape === 'organico') {
            const sides = 12;
            const wobbleAmount = 0.15 + (softness / 100) * 0.45;
            const points = [];
            for (let i = 0; i < sides; i++) {
                const angle = (Math.PI * 2 * i) / sides;
                const wobble = 1 + (rand(`w${i}`) * 2 - 1) * wobbleAmount;
                points.push(x + Math.cos(angle) * radius * wobble, y + Math.sin(angle) * radius * wobble);
            }
            graphic.drawPolygon(points);
            return;
        }
        // Disperso: varias manchitas sueltas dentro del radio; más suavidad = más manchitas y más repartidas.
        const blobCount = 5 + Math.round((softness / 100) * 6);
        const spread = 0.2 + (softness / 100) * 0.6;
        for (let i = 0; i < blobCount; i++) {
            const angle = rand(`a${i}`) * Math.PI * 2;
            const distance = rand(`d${i}`) * radius * spread;
            const blobRadius = radius * (0.2 + rand(`r${i}`) * 0.3);
            graphic.drawCircle(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, blobRadius);
        }
    }
    // Rellena (con su(s) propio(s) beginFill/endFill) el hueco de un sello de borrado, con difuminado real en
    // círculo/cuadrado/diamante: en vez de un corte limpio, varios anillos concéntricos con opacidad parcial.
    // blendMode ERASE reduce la opacidad de destino según la del propio hueco (no es un corte binario), así que
    // superponer anillos parciales de fuera hacia dentro da un degradado (más "mordido" cuanto más al centro).
    // Orgánico/disperso no usan anillos: su propia irregularidad ya es "la suavidad" (ver drawEraserStampShape).
    drawErasedFill(graphic, stamp) {
        const { x, y, shape, radius, softness } = stamp;
        if (shape !== 'circulo' && shape !== 'cuadrado' && shape !== 'diamante' || softness <= 0) {
            graphic.beginFill(0xffffff, 1);
            this.drawEraserStampShape(graphic, stamp);
            graphic.endFill();
            return;
        }
        const bandStart = radius * (1 - softness / 100);
        const rings = 10;
        for (let i = rings; i >= 1; i--) {
            const ringRadius = bandStart + (radius - bandStart) * (i / rings);
            graphic.beginFill(0xffffff, 1 / rings);
            this.drawEraserStampShape(graphic, { ...stamp, radius: ringRadius });
            graphic.endFill();
        }
        // Núcleo interior (hasta el principio de la banda de suavidad): borrado completo siempre.
        graphic.beginFill(0xffffff, 1);
        this.drawEraserStampShape(graphic, { ...stamp, radius: bandStart });
        graphic.endFill();
    }
    // Contorno del pincel de borrado en (x,y), en coordenadas del viewport (mismas que localPosition). Con
    // position null, o sin modo borrador activo, lo deja vacío. No pasa por dibujarTableroCompleto(): es barato
    // y se llama en cada pointermove para poder ver el radio antes de pulsar. Seed fija (no la de cada borrado
    // real) para que la vista previa no "tiemble" con formas orgánicas/dispersas mientras solo se mueve el ratón.
    drawEraserCursor(position) {
        this.eraserCursorContainer.removeChildren();
        if (!position || !this.eraserMode)
            return;
        const { shape, radius, softness } = this.eraserSettings;
        const worldRadius = radius * this.radioHex;
        const stamp = { x: position.x, y: position.y, shape, radius: worldRadius, softness, seed: 1 };
        const graphic = new PIXI.Graphics();
        graphic.lineStyle(1.5 / this.viewport.scale.x, 0xffffff, 0.9);
        this.drawEraserStampShape(graphic, stamp);
        // En círculo/cuadrado/diamante la suavidad no cambia el contorno exterior, solo difumina el borde hacia
        // dentro (drawErasedFill): se marca aparte con un contorno interior más tenue, donde el borrado ya es 100% seguro.
        if (softness > 0 && (shape === 'circulo' || shape === 'cuadrado' || shape === 'diamante')) {
            graphic.lineStyle(1.5 / this.viewport.scale.x, 0xffffff, 0.35);
            this.drawEraserStampShape(graphic, { ...stamp, radius: worldRadius * (1 - softness / 100) });
        }
        graphic.lineStyle(0);
        this.eraserCursorContainer.addChild(graphic);
    }
    // Caja delimitadora de unos puntos, ampliada por margin: sirve para descartar rápido (sin mirar cada punto)
    // los trazos que el pincel no puede llegar a tocar. Falsos positivos en las esquinas son inofensivos (un
    // hueco que cae fuera del relleno no pinta nada).
    boundsOverlapBrush(points, cx, cy, margin) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        points.forEach((point) => {
            if (point.x < minX)
                minX = point.x;
            if (point.x > maxX)
                maxX = point.x;
            if (point.y < minY)
                minY = point.y;
            if (point.y > maxY)
                maxY = point.y;
        });
        return cx >= minX - margin && cx <= maxX + margin && cy >= minY - margin && cy <= maxY + margin;
    }
    // Borra en (x,y) sobre la capa activa: hexágonos (con suavizado de borde), y en perfil libre/río/carretera
    // recorta un hueco real de la forma del pincel (puede vaciar el interior de la mancha, no solo el borde).
    // Tren no tiene relleno que recortar: se separa en varios trazos donde el pincel corte por en medio.
    // Las casas son por hexágono, así que ya se borran de una en una.
    eraseAt(x, y) {
        if (!this.activeLayer)
            return;
        const layer = this.activeLayer;
        const settings = this.eraserSettings;
        const brushRadius = settings.radius * this.radioHex;
        let changed = false;
        // Un único sello para todo lo que toque este borrado (hexágonos, perfil libre, río/carretera).
        const stamp = { x, y, shape: settings.shape, radius: brushRadius, softness: settings.softness, seed: Math.floor(Math.random() * 1000000) };
        // Hexágonos: igual que perfil libre, un hueco geométrico real (no un borrado de todo o nada). Si se
        // vaciara ya con solo tocar el CENTRO, arrastrar el pincel por encima acaba vaciando casi todos los
        // hexágonos por los que pasa (el centro de cualquier hexágono del camino cae en el pincel en algún
        // momento del arrastre) — eso es lo que se veía como "sigue borrando hexágonos completos". Por eso solo
        // se vacían los datos cuando el pincel cubre el hexágono ENTERO (sus 6 vértices), igual que una mancha de
        // perfil libre solo desaparece del todo si el hueco cubre toda su forma. Si solo lo toca en parte, se
        // queda con un hueco visual y sus datos intactos (sigue contando para perfil ondulado, capas, etc.).
        const hexVertices = this.createRegularHexPoints();
        const isHexFullyCovered = (hexCoordinate) => {
            for (let i = 0; i < hexVertices.length; i += 2) {
                const vx = hexCoordinate.x + hexVertices[i];
                const vy = hexCoordinate.y + hexVertices[i + 1];
                if (!this.isInsideEraserShape(vx, vy, x, y, settings.shape, brushRadius))
                    return false;
            }
            return true;
        };
        const estimatedColumn = Math.round(x / (this.radioHex * 1.5));
        const columnSpan = Math.ceil(brushRadius / (this.radioHex * 1.5)) + 1;
        for (let c = Math.max(0, estimatedColumn - columnSpan); c <= Math.min(this.cols - 1, estimatedColumn + columnSpan); c++) {
            for (let f = 0; f < this.filas; f++) {
                const hexCoordinate = this.mapaHexes[c][f];
                const hexData = layer.hexes[c][f];
                if (hexData.terreno === null && hexData.color === null)
                    continue;
                if (isHexFullyCovered(hexCoordinate)) {
                    hexData.terreno = null;
                    hexData.color = null;
                    hexData.paintMode = null;
                    hexData.wavySettings = null;
                    hexData.wavyGrouping = null;
                    hexData.paintGroupId = null;
                    hexData.underlyingTerrain = null;
                    hexData.underlyingColor = null;
                    hexData.erasedHoles = undefined;
                    changed = true;
                }
                else if (this.isInsideEraserShape(hexCoordinate.x, hexCoordinate.y, x, y, settings.shape, brushRadius + this.radioHex)) {
                    hexData.erasedHoles = [...(hexData.erasedHoles ?? []), stamp];
                    changed = true;
                }
            }
        }
        layer.cities.forEach((city, key) => {
            const hexCoordinate = this.mapaHexes[city.col][city.fila];
            if (!this.isInsideEraserShape(hexCoordinate.x, hexCoordinate.y, x, y, settings.shape, brushRadius))
                return;
            city.graphic?.destroy();
            layer.cities.delete(key);
            changed = true;
        });
        // Perfil libre: relleno, se le añade un hueco geométrico (no toca los puntos de control).
        layer.freeWavyStrokes = layer.freeWavyStrokes.map((stroke) => {
            if (!this.boundsOverlapBrush(stroke.points, x, y, brushRadius))
                return stroke;
            changed = true;
            return { ...stroke, erasedHoles: [...(stroke.erasedHoles ?? []), stamp] };
        });
        // Río/carretera (relleno, igual que el perfil libre) y tren (railes: sin relleno que recortar, así que
        // se corta el trazo en dos donde el pincel toque sus puntos en medio) en un único recorrido.
        const remainingLines = [];
        layer.lines.forEach((line) => {
            if (!this.boundsOverlapBrush(line.points, x, y, brushRadius)) {
                remainingLines.push(line);
                return;
            }
            if (line.kind !== 'tren') {
                changed = true;
                remainingLines.push({ ...line, erasedHoles: [...(line.erasedHoles ?? []), stamp] });
                return;
            }
            const touchedAny = line.points.some((point) => this.isInsideEraserShape(point.x, point.y, x, y, settings.shape, brushRadius));
            if (!touchedAny) {
                remainingLines.push(line);
                return;
            }
            changed = true;
            const runs = [[]];
            line.points.forEach((point) => {
                if (this.isInsideEraserShape(point.x, point.y, x, y, settings.shape, brushRadius)) {
                    if (runs[runs.length - 1].length > 0)
                        runs.push([]);
                }
                else {
                    runs[runs.length - 1].push(point);
                }
            });
            runs.filter((run) => run.length >= 2).forEach((run) => remainingLines.push({ ...line, points: run }));
        });
        layer.lines = remainingLines;
        if (changed)
            this.dibujarTableroCompleto();
    }
    pintarHexagono(x, y, erase = false) {
        let bestHexCoordinate = null;
        let minimumDistance = Infinity;
        const estimatedColumn = Math.round(x / (this.radioHex * 1.5));
        for (let c = Math.max(0, estimatedColumn - 1); c <= Math.min(this.cols - 1, estimatedColumn + 1); c++) {
            for (let f = 0; f < this.filas; f++) {
                const hexCoordinate = this.mapaHexes[c][f];
                const distance = Math.hypot(x - hexCoordinate.x, y - hexCoordinate.y);
                if (distance < this.radioHex && distance < minimumDistance) {
                    minimumDistance = distance;
                    bestHexCoordinate = hexCoordinate;
                }
            }
        }
        if (!bestHexCoordinate)
            return;
        if (this.selectedHex && (this.selectedHex.col !== bestHexCoordinate.col || this.selectedHex.fila !== bestHexCoordinate.fila)) {
            const previousHex = this.selectedHex;
            this.selectedHex = null;
            this.redibujarHexagonoCompleto(previousHex);
        }
        this.selectedHex = bestHexCoordinate;
        if (this.selectedTerrain === 'ciudad' && this.activeLayer) {
            this.paintCityHex(this.activeLayer, bestHexCoordinate, erase);
            this.redibujarHexagonoCompleto(bestHexCoordinate);
            this.actualizarPanelInfo();
            return;
        }
        if (this.selectedTerrain && this.activeLayer) {
            const hexData = this.activeLayer.hexes[bestHexCoordinate.col][bestHexCoordinate.fila];
            if (this.paintMode === 'ondulado' && !hexData.underlyingTerrain) {
                hexData.underlyingTerrain = hexData.terreno;
                hexData.underlyingColor = hexData.color;
            }
            hexData.terreno = this.selectedTerrain;
            hexData.color = this.colores[this.selectedTerrain];
            hexData.paintMode = this.paintMode;
            hexData.wavySettings = this.paintMode === 'ondulado' ? { ...this.wavySettings } : null;
            hexData.wavyGrouping = this.paintMode === 'ondulado' ? this.wavyGrouping : null;
            hexData.paintGroupId = this.paintMode === 'ondulado' ? this.activePaintGroupId : null;
            if (this.paintMode === 'normal') {
                hexData.underlyingTerrain = null;
                hexData.underlyingColor = null;
            }
        }
        this.redibujarHexagonoCompleto(bestHexCoordinate);
        this.actualizarPanelInfo();
    }
    actualizarPanelInfo() {
        const hex = this.selectedHex;
        if (!hex) {
            this.infoPanelContent.innerHTML = '<p>Selecciona un hexágono.</p>';
            return;
        }
        let content = `<p><strong>Col:</strong> ${hex.col}, <strong>Fila:</strong> ${hex.fila}</p><ul>`;
        this.layers.forEach((layer) => {
            const terrain = layer.hexes[hex.col][hex.fila].terreno;
            content += `<li>${layer.name}: ${terrain ? TERRAIN_LABELS[terrain] : 'Sin terreno'}${layer.cities.has(`${hex.col}:${hex.fila}`) ? ' + casas' : ''}</li>`;
        });
        this.infoPanelContent.innerHTML = `${content}</ul>`;
    }
}
window.addEventListener('DOMContentLoaded', () => {
    const editor = new TerrainEditor('canvasContainer');
    const createTerrainButton = document.getElementById('createTerrain');
    const columnsInput = document.getElementById('terrainCols');
    const rowsInput = document.getElementById('terrainRows');
    const hexSizeInput = document.getElementById('hexSize');
    createTerrainButton?.addEventListener('click', () => {
        editor.cols = Number.parseInt(columnsInput?.value ?? '', 10) || 10;
        editor.filas = Number.parseInt(rowsInput?.value ?? '', 10) || 10;
        editor.radioHex = Number.parseInt(hexSizeInput?.value ?? '', 10) || 40;
        editor.crearTablero();
    });
});

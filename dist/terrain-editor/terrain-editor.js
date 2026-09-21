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
        this.paintGroupCounter = 0;
        this.activePaintGroupId = null;
        this.layers = [];
        this.activeLayer = null;
        this.layerCounter = 0;
        this.mapaHexes = [];
        this.freeWavyPoints = [];
        this.lineSettings = {
            rio: { color: this.colores.rio, width: 20, taper: true, waviness: 40 },
            carretera: { color: this.colores.carretera, width: 10, taper: false, waviness: 0 },
            tren: { color: this.colores.tren, width: 12, taper: false, waviness: 0 }
        };
        this.linePoints = [];
        this.lineSeedCounter = 0;
        this.selectedLinePointIndex = null;
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
        this.freeWavyPoints = [];
        this.linePoints = [];
        this.selectedLinePointIndex = null;
        this.mapaHexes = [];
        this.selectedHex = null;
        this.layerCounter = 0;
        this.baseLayerContainer = new PIXI.Container();
        this.wavyOverlayContainer = new PIXI.Container();
        this.gridContainer = new PIXI.Container();
        for (let c = 0; c < this.cols; c++) {
            this.mapaHexes[c] = [];
            for (let f = 0; f < this.filas; f++) {
                const x = c * (this.radioHex * 1.5);
                const y = f * (Math.sqrt(3) * this.radioHex) + (c % 2 === 1 ? (Math.sqrt(3) * this.radioHex) / 2 : 0);
                this.mapaHexes[c][f] = { col: c, fila: f, x, y };
            }
        }
        this.viewport.addChild(this.baseLayerContainer);
        this.viewport.addChild(this.wavyOverlayContainer);
        this.viewport.addChild(this.gridContainer);
        this.addLayer(true);
        this.viewport.x = 50;
        this.viewport.y = 50;
        this.updateLayerList();
    }
    drawHexGraphic(graphic, hexCoord, color, alpha, paintMode, borderColor, borderThickness) {
        graphic.clear();
        graphic.lineStyle(borderThickness, borderColor);
        const points = paintMode === 'ondulado'
            ? this.createWavyHexPoints(hexCoord)
            : this.createRegularHexPoints();
        graphic.beginFill(color, paintMode === 'ondulado' ? alpha * 0.72 : alpha);
        graphic.drawPolygon(points);
        graphic.endFill();
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
    edgeKey(start, end) {
        return [this.pointKey(start), this.pointKey(end)].sort().join('|');
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
    drawFreeWavyPath(graphic, points, closePath, color, alpha) {
        if (points.length < 2)
            return;
        graphic.lineStyle(closePath ? 0 : 2, color, closePath ? 0 : 0.9);
        if (closePath)
            graphic.beginFill(color, alpha);
        graphic.moveTo(points[0].x, points[0].y);
        const segmentCount = closePath ? points.length : points.length - 1;
        for (let i = 0; i < segmentCount; i++) {
            const current = points[i];
            const next = points[(i + 1) % points.length];
            const previous = points[(i - 1 + points.length) % points.length];
            const following = points[(i + 2) % points.length];
            const controlOut = {
                x: current.x + (next.x - previous.x) * 0.18,
                y: current.y + (next.y - previous.y) * 0.18
            };
            const controlIn = {
                x: next.x - (following.x - current.x) * 0.18,
                y: next.y - (following.y - current.y) * 0.18
            };
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
            graphic.alpha = layer.opacity / 100;
            this.drawFreeWavyPath(graphic, stroke.points, true, stroke.color, 1);
            if (layer.noiseLayers.some((noise) => noise.enabled)) {
                layer.noiseMaskWavy = this.ensureNoiseMask(layer.noiseMaskWavy);
                this.drawFreeWavyPath(layer.noiseMaskWavy, stroke.points, true, 0xffffff, 1);
            }
            this.wavyOverlayContainer.addChild(graphic);
        }));
        if (this.freeWavyPoints.length > 0) {
            const preview = new PIXI.Graphics();
            this.drawFreeWavyPath(preview, this.freeWavyPoints, false, 0xFFFFFF, 1);
            this.wavyOverlayContainer.addChild(preview);
        }
    }
    // Curva Catmull-Rom que pasa por todos los puntos marcados con el ratón.
    sampleLineSpline(points) {
        const stepsPerSegment = LINE_STEPS_PER_SEGMENT;
        const result = [];
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];
            for (let step = 0; step < stepsPerSegment; step++) {
                const t = step / stepsPerSegment;
                const t2 = t * t;
                const t3 = t2 * t;
                result.push({
                    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
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
                // La sombra es el propio trazo desplazado (y algo más ancho con luz cenital).
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
                graphic.alpha = layer.opacity / 100;
                this.drawLineShape(graphic, line, line.color, 1);
                this.wavyOverlayContainer.addChild(graphic);
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
        this.linePoints.splice(index, 0, position);
        this.dibujarTableroCompleto();
    }
    moveLinePoint(index, position) {
        if (!this.linePoints[index])
            return;
        this.linePoints[index] = position;
        this.dibujarTableroCompleto();
    }
    removeLinePoint(index) {
        this.linePoints.splice(index, 1);
        this.selectedLinePointIndex = null;
        this.dibujarTableroCompleto();
    }
    addLinePoint(point) {
        this.linePoints.push(point);
        this.dibujarTableroCompleto();
    }
    cancelLine() {
        this.selectedLinePointIndex = null;
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
        this.dibujarTableroCompleto();
    }
    undoLastLine() {
        if (!this.activeLayer || this.activeLayer.lines.length === 0)
            return;
        this.activeLayer.lines.pop();
        this.dibujarTableroCompleto();
    }
    addFreeWavyPoint(point) {
        if (this.freeWavyPoints.length >= 3) {
            const firstPoint = this.freeWavyPoints[0];
            if (Math.hypot(point.x - firstPoint.x, point.y - firstPoint.y) <= this.radioHex * 0.55) {
                const terrain = this.selectedTerrain;
                if (terrain && this.activeLayer) {
                    this.activeLayer.freeWavyStrokes.push({ points: [...this.freeWavyPoints], color: this.colores[terrain] });
                }
                this.freeWavyPoints = [];
                this.dibujarTableroCompleto();
                return;
            }
        }
        this.freeWavyPoints.push(point);
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
    drawWavyTerrainGroups() {
        this.wavyOverlayContainer.removeChildren();
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
            const contours = group.grouping === 'contour'
                ? this.createGroupContours(group.hexes).map((contour) => contour)
                : [this.createConvexHull(group.hexes)];
            const groupOpacity = groupLayer.opacity / 100;
            const graphic = group.grouping === 'stroke' ? new PIXI.Graphics() : null;
            if (graphic) {
                graphic.alpha = groupOpacity;
                graphic.beginFill(group.color, 1);
            }
            contours.forEach((contour) => {
                const contourGraphic = graphic ?? new PIXI.Graphics();
                contourGraphic.alpha = groupOpacity;
                if (!graphic)
                    contourGraphic.beginFill(group.color, 1);
                const contourCenterX = contour.reduce((sum, point) => sum + point.x, 0) / contour.length;
                const contourCenterY = contour.reduce((sum, point) => sum + point.y, 0) / contour.length;
                const centerX = group.grouping === 'contour' ? contourCenterX : groupCenterX;
                const centerY = group.grouping === 'contour' ? contourCenterY : groupCenterY;
                this.drawBezierWavyContour(contourGraphic, contour, centerX, centerY, group.settings.coverage, group.settings.waves, group.settings.smoothness);
                if (hasNoise) {
                    groupLayer.noiseMaskWavy = this.ensureNoiseMask(groupLayer.noiseMaskWavy);
                    groupLayer.noiseMaskWavy.beginFill(0xffffff, 1);
                    this.drawBezierWavyContour(groupLayer.noiseMaskWavy, contour, centerX, centerY, group.settings.coverage, group.settings.waves, group.settings.smoothness);
                    groupLayer.noiseMaskWavy.endFill();
                }
                if (!graphic) {
                    contourGraphic.endFill();
                    this.wavyOverlayContainer.addChild(contourGraphic);
                }
            });
            if (graphic) {
                graphic.endFill();
                this.wavyOverlayContainer.addChild(graphic);
            }
        });
        this.drawFreeWavyStrokes();
        this.drawLines();
        this.drawGrid();
    }
    renderHex(hexCoord) {
        const baseData = this.layers[0].hexes[hexCoord.col][hexCoord.fila];
        const isSelected = this.selectedHex?.col === hexCoord.col && this.selectedHex?.fila === hexCoord.fila;
        const baseIsWavy = baseData.paintMode === 'ondulado';
        const baseColor = baseData.color ?? 0x1a1a1a;
        const baseBackground = baseData.underlyingColor ?? 0x1a1a1a;
        const backgroundColor = baseIsWavy ? baseBackground : baseColor;
        const backgroundTerreno = baseIsWavy ? baseData.underlyingTerrain : baseData.terreno;
        this.drawHexGraphic(baseData.graphic, hexCoord, backgroundColor, 1, 'normal', 0, 0);
        const baseLayer = this.layers[0];
        if (backgroundTerreno && baseLayer.noiseLayers.some((noise) => noise.enabled)) {
            baseLayer.noiseMaskNormal = this.ensureNoiseMask(baseLayer.noiseMaskNormal);
            this.addHexPolygonToNoiseMask(baseLayer.noiseMaskNormal, hexCoord);
        }
        for (let layerIndex = 1; layerIndex < this.layers.length; layerIndex++) {
            const layer = this.layers[layerIndex];
            const data = layer.hexes[hexCoord.col][hexCoord.fila];
            data.graphic.clear();
            if (!layer.visible || !data.terreno || data.color === null || data.paintMode === 'ondulado')
                continue;
            this.drawHexGraphic(data.graphic, hexCoord, data.color, 1, 'normal', 0, 0);
            if (layer.noiseLayers.some((noise) => noise.enabled)) {
                layer.noiseMaskNormal = this.ensureNoiseMask(layer.noiseMaskNormal);
                this.addHexPolygonToNoiseMask(layer.noiseMaskNormal, hexCoord);
            }
        }
    }
    dibujarTableroCompleto() {
        this.reorderLayerContainers();
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
                this.dibujarTableroCompleto();
            });
        });
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
        document.querySelectorAll('.terrain-type').forEach((button) => {
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
                this.linePoints = [];
                this.selectedLinePointIndex = null;
                syncLineControls();
                citySettingsPanel?.toggleAttribute('hidden', this.selectedTerrain !== 'ciudad');
                this.dibujarTableroCompleto();
            });
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
            if (event.key === 'Escape')
                this.cancelLine();
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
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;
        let isPanning = false;
        let panStart = { x: 0, y: 0 };
        let isPainting = false;
        let draggedLinePointIndex = null;
        const stopPainting = () => {
            isPanning = false;
            isPainting = false;
            draggedLinePointIndex = null;
            this.activePaintGroupId = null;
        };
        this.app.stage.on('pointerdown', (event) => {
            const localPosition = this.viewport.toLocal(event.global);
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
            if (event.button === 0 && this.paintMode === 'ondulado-libre' && this.selectedTerrain !== 'ciudad') {
                this.addFreeWavyPoint({ x: localPosition.x, y: localPosition.y });
                return;
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
            if (isPanning) {
                this.viewport.x = event.global.x - panStart.x;
                this.viewport.y = event.global.y - panStart.y;
            }
            else if (draggedLinePointIndex !== null) {
                const localPosition = this.viewport.toLocal(event.global);
                this.moveLinePoint(draggedLinePointIndex, { x: localPosition.x, y: localPosition.y });
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
            this.activePaintGroupId = null;
        });
        this.app.view.addEventListener('wheel', (event) => {
            event.preventDefault();
            const zoom = event.deltaY < 0 ? 1.1 : 0.9;
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

type TerrainType = 'llanura' | 'bosque' | 'montana' | 'agua' | 'desierto' | 'carretera';
type PaintMode = 'normal' | 'ondulado' | 'ondulado-libre';
type WavySettings = {
    coverage: number;
    waves: number;
    smoothness: number;
};
type WavyGrouping = 'stroke' | 'contour';

type HexCoordinate = {
    col: number;
    fila: number;
    x: number;
    y: number;
};

type Point = {
    x: number;
    y: number;
};

type FreeWavyStroke = {
    points: Point[];
    color: number;
};

type HexData = HexCoordinate & {
    terreno: TerrainType | null;
    baseTerrain: TerrainType | null;
    paintMode: PaintMode | null;
    wavySettings: WavySettings | null;
    wavyGrouping: WavyGrouping | null;
    paintGroupId: number | null;
    underlyingTerrain: TerrainType | null;
    graphic: any;
};

type TerrainLayer = {
    id: number;
    name: string;
    visible: boolean;
    container: any;
    hexes: HexData[][];
    freeWavyStrokes: FreeWavyStroke[];
};

declare const PIXI: any;

class TerrainEditor {
    container: HTMLElement;
    cols: number;
    filas: number;
    radioHex: number;
    paintMode: PaintMode;
    wavySettings: WavySettings;
    wavyGrouping: WavyGrouping;
    selectedHex: HexCoordinate | null;
    colores: Record<TerrainType, number>;
    selectedTerrain: TerrainType | null;
    infoPanelContent: HTMLElement;
    layerListElement: HTMLElement;
    coverageInput: HTMLInputElement;
    coverageOutput: HTMLOutputElement;
    wavesInput: HTMLInputElement;
    wavesOutput: HTMLOutputElement;
    smoothnessInput: HTMLInputElement;
    smoothnessOutput: HTMLOutputElement;
    groupingInput: HTMLSelectElement;
    paintGroupCounter: number;
    activePaintGroupId: number | null;
    layers: TerrainLayer[];
    activeLayer: TerrainLayer | null;
    layerCounter: number;
    app: any;
    viewport: any;
    baseLayerContainer: any;
    wavyOverlayContainer: any;
    gridContainer: any;
    gridVisible: boolean;
    mapaHexes: HexCoordinate[][];
    freeWavyPoints: Point[];

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        const infoPanelContent = document.getElementById('hex-info-content');
        const layerListElement = document.getElementById('layer-list');
        const coverageInput = document.getElementById('wavyCoverage') as HTMLInputElement | null;
        const coverageOutput = document.getElementById('wavyCoverageValue') as HTMLOutputElement | null;
        const wavesInput = document.getElementById('wavyWaves') as HTMLInputElement | null;
        const wavesOutput = document.getElementById('wavyWavesValue') as HTMLOutputElement | null;
        const smoothnessInput = document.getElementById('wavySmoothness') as HTMLInputElement | null;
        const smoothnessOutput = document.getElementById('wavySmoothnessValue') as HTMLOutputElement | null;
        const groupingInput = document.getElementById('wavyGrouping') as HTMLSelectElement | null;

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
        this.wavyGrouping = groupingInput.value as WavyGrouping;
        this.selectedHex = null;
        this.colores = {
            llanura: 0x8fbc6b,
            bosque: 0x27632a,
            montana: 0x777777,
            agua: 0x3d82b8,
            desierto: 0xd7bd72,
            carretera: 0x8b7355
        };
        this.selectedTerrain = null;
        this.infoPanelContent = infoPanelContent;
        this.layerListElement = layerListElement;
        this.coverageInput = coverageInput;
        this.coverageOutput = coverageOutput;
        this.wavesInput = wavesInput;
        this.wavesOutput = wavesOutput;
        this.smoothnessInput = smoothnessInput;
        this.smoothnessOutput = smoothnessOutput;
        this.groupingInput = groupingInput;
        this.paintGroupCounter = 0;
        this.activePaintGroupId = null;
        this.layers = [];
        this.activeLayer = null;
        this.layerCounter = 0;
        this.mapaHexes = [];
        this.freeWavyPoints = [];
        this.gridVisible = true;

        this.initPixi();
        this.initEvents();
        this.crearTablero();
    }

    initPixi(): void {
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

    crearTablero(): void {
        this.app.stage.removeChild(this.viewport);
        this.viewport.destroy({ children: true });
        this.viewport = new PIXI.Container();
        this.app.stage.addChild(this.viewport);

        this.layers = [];
        this.freeWavyPoints = [];
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

    private drawHexGraphic(graphic: any, hexCoord: HexCoordinate, color: number, alpha: number, paintMode: PaintMode, borderColor: number, borderThickness: number): void {
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

    private drawSingleHexGraphic(hexCoord: HexCoordinate, color: number, alpha: number, paintMode: PaintMode, borderColor: number, borderThickness: number): void {
        const graphic = this.layers[0].hexes[hexCoord.col][hexCoord.fila].graphic;
        this.drawHexGraphic(graphic, hexCoord, color, alpha, paintMode, borderColor, borderThickness);
    }

    private createRegularHexPoints(): number[] {
        const points: number[] = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i;
            points.push(this.radioHex * Math.cos(angle), this.radioHex * Math.sin(angle));
        }
        return points;
    }

    private createWavyHexPoints(hexCoord: HexCoordinate): number[] {
        const points: number[] = [];
        const pointCount = 18;

        for (let i = 0; i < pointCount; i++) {
            const angle = (Math.PI * 2 * i) / pointCount;
            const wave = Math.sin((i * 1.7) + hexCoord.col * 2.1 + hexCoord.fila * 1.4) * 0.06;
            const radius = this.radioHex * (0.91 + wave);
            points.push(radius * Math.cos(angle), radius * Math.sin(angle));
        }

        return points;
    }

    private pointKey(point: Point): string {
        return `${Math.round(point.x * 100)}:${Math.round(point.y * 100)}`;
    }

    private edgeKey(start: Point, end: Point): string {
        return [this.pointKey(start), this.pointKey(end)].sort().join('|');
    }

    private createGroupContours(hexes: HexCoordinate[]): Point[][] {
        const edges = new Map<string, { start: Point; end: Point }>();

        hexes.forEach((hexCoord) => {
            const localPoints = this.createRegularHexPoints();
            const points: Point[] = [];
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
                } else {
                    edges.set(key, { start, end });
                }
            }
        });

        const contours: Point[][] = [];
        while (edges.size > 0) {
            const firstKey = edges.keys().next().value as string;
            const firstEdge = edges.get(firstKey);
            if (!firstEdge) break;

            edges.delete(firstKey);
            const contour: Point[] = [firstEdge.start];
            let previous = firstEdge.start;
            let current = firstEdge.end;
            let guard = 0;

            while (this.pointKey(current) !== this.pointKey(firstEdge.start) && guard < 10000) {
                contour.push(current);
                guard++;

                let nextKey: string | undefined;
                let nextEdge: { start: Point; end: Point } | undefined;
                let bestTurn = -Infinity;
                const incomingAngle = Math.atan2(current.y - previous.y, current.x - previous.x);
                for (const [key, edge] of edges) {
                    const startsHere = this.pointKey(edge.start) === this.pointKey(current);
                    const endsHere = this.pointKey(edge.end) === this.pointKey(current);
                    if (!startsHere && !endsHere) continue;

                    const candidate = startsHere ? edge.end : edge.start;
                    let turn = Math.atan2(candidate.y - current.y, candidate.x - current.x) - incomingAngle;
                    while (turn < 0) turn += Math.PI * 2;
                    while (turn >= Math.PI * 2) turn -= Math.PI * 2;
                    if (turn > bestTurn) {
                        bestTurn = turn;
                        nextKey = key;
                        nextEdge = edge;
                    }
                }

                if (!nextEdge || !nextKey) break;
                edges.delete(nextKey);
                previous = current;
                current = this.pointKey(nextEdge.start) === this.pointKey(current) ? nextEdge.end : nextEdge.start;
            }

            if (contour.length >= 3) contours.push(contour);
        }

        return contours;
    }

    private createWavyContourPoints(contour: Point[]): number[] {
        return this.createWavyContourPointsWithWaves(contour, 3);
    }

    private createWavyContourPointsWithWaves(contour: Point[], waves: number): number[] {
        let smoothContour = contour;
        for (let pass = 0; pass < 4; pass++) {
            const refinedContour: Point[] = [];
            for (let i = 0; i < smoothContour.length; i++) {
                const current = smoothContour[i];
                const next = smoothContour[(i + 1) % smoothContour.length];
                refinedContour.push(
                    { x: current.x * 0.75 + next.x * 0.25, y: current.y * 0.75 + next.y * 0.25 },
                    { x: current.x * 0.25 + next.x * 0.75, y: current.y * 0.25 + next.y * 0.75 }
                );
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
        const points: number[] = [];
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
                points.push(
                    start.x + deltaX * progress + normalX * wave,
                    start.y + deltaY * progress + normalY * wave
                );
            }
            distanceAlongPerimeter += length;
        }

        return points;
    }

    private getContourArea(contour: Point[]): number {
        let area = 0;
        for (let i = 0; i < contour.length; i++) {
            const current = contour[i];
            const next = contour[(i + 1) % contour.length];
            area += current.x * next.y - next.x * current.y;
        }
        return Math.abs(area) / 2;
    }

    private createConvexHull(hexes: HexCoordinate[]): Point[] {
        const points = hexes.flatMap((hexCoord) => {
            const localPoints = this.createRegularHexPoints();
            const hexPoints: Point[] = [];
            for (let i = 0; i < localPoints.length; i += 2) {
                hexPoints.push({
                    x: localPoints[i] + hexCoord.x,
                    y: localPoints[i + 1] + hexCoord.y
                });
            }
            return hexPoints;
        }).sort((first, second) => first.x - second.x || first.y - second.y);

        const uniquePoints = points.filter((point, index) =>
            index === 0 || this.pointKey(point) !== this.pointKey(points[index - 1])
        );
        const cross = (origin: Point, first: Point, second: Point): number =>
            (first.x - origin.x) * (second.y - origin.y) - (first.y - origin.y) * (second.x - origin.x);

        const lower: Point[] = [];
        uniquePoints.forEach((point) => {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
                lower.pop();
            }
            lower.push(point);
        });

        const upper: Point[] = [];
        [...uniquePoints].reverse().forEach((point) => {
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
                upper.pop();
            }
            upper.push(point);
        });

        return lower.slice(0, -1).concat(upper.slice(0, -1));
    }

    private drawSmoothContour(graphic: any, points: number[]): void {
        const contour: Point[] = [];
        for (let i = 0; i < points.length; i += 2) {
            contour.push({ x: points[i], y: points[i + 1] });
        }

        if (contour.length < 3) return;

        const midpoint = (first: Point, second: Point): Point => ({
            x: (first.x + second.x) / 2,
            y: (first.y + second.y) / 2
        });

        graphic.moveTo(
            midpoint(contour[contour.length - 1], contour[0]).x,
            midpoint(contour[contour.length - 1], contour[0]).y
        );
        for (let i = 0; i < contour.length; i++) {
            const current = contour[i];
            const nextMidpoint = midpoint(current, contour[(i + 1) % contour.length]);
            graphic.quadraticCurveTo(current.x, current.y, nextMidpoint.x, nextMidpoint.y);
        }
        graphic.closePath();
    }

    private drawBezierWavyContour(graphic: any, contour: Point[], centerX: number, centerY: number, coverage: number, waves: number, smoothness: number): void {
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

        if (anchors.length < 3) return;

        const midpoint = (first: Point, second: Point): Point => ({
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

    redibujarHexagonoCompleto(hexCoord: HexCoordinate | null): void {
        if (!hexCoord) return;

        this.dibujarTableroCompleto();
    }

    private getVisibleTerrain(hexCoord: HexCoordinate, maxLayerIndex = this.layers.length - 1): { layerIndex: number; data: HexData } | null {
        for (let i = maxLayerIndex; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible) continue;

            const data = layer.hexes[hexCoord.col][hexCoord.fila];
            if (data.terreno) return { layerIndex: i, data };
        }

        return null;
    }

    private getSolidTerrainBelow(hexCoord: HexCoordinate, maxLayerIndex: number): TerrainType | null {
        for (let i = maxLayerIndex; i >= 0; i--) {
            const layer = this.layers[i];
            if (!layer.visible) continue;

            const data = layer.hexes[hexCoord.col][hexCoord.fila];
            if (!data.terreno) continue;
            if (data.paintMode === 'ondulado') {
                if (data.underlyingTerrain) return data.underlyingTerrain;
                continue;
            }
            return data.terreno;
        }

        return null;
    }

    private getBaseTerrain(hexCoord: HexCoordinate): TerrainType | null {
        return this.layers[0]?.hexes[hexCoord.col][hexCoord.fila].baseTerrain ?? null;
    }

    private drawFreeWavyPath(graphic: any, points: Point[], closePath: boolean, color: number, alpha: number): void {
        if (points.length < 2) return;

        graphic.lineStyle(closePath ? 0 : 2, color, closePath ? 0 : 0.9);
        if (closePath) graphic.beginFill(color, alpha);
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

    private drawFreeWavyStrokes(): void {
        this.layers.forEach((layer) => layer.freeWavyStrokes.forEach((stroke) => {
            if (!layer.visible) return;
            const graphic = new PIXI.Graphics();
            this.drawFreeWavyPath(graphic, stroke.points, true, stroke.color, 1);
            this.wavyOverlayContainer.addChild(graphic);
        }));

        if (this.freeWavyPoints.length > 0) {
            const preview = new PIXI.Graphics();
            this.drawFreeWavyPath(preview, this.freeWavyPoints, false, 0xFFFFFF, 1);
            this.wavyOverlayContainer.addChild(preview);
        }
    }

    private addFreeWavyPoint(point: Point): void {
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

    private drawGrid(): void {
        this.gridContainer.removeChildren();
        if (!this.gridVisible) return;

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

    private drawWavyTerrainGroups(): void {
        this.wavyOverlayContainer.removeChildren();
        const groups = new Map<string, { color: number; hexes: HexCoordinate[]; settings: WavySettings; grouping: WavyGrouping }>();

        for (let c = 0; c < this.cols; c++) {
            for (let f = 0; f < this.filas; f++) {
                const hexCoord = this.mapaHexes[c][f];
                const visibleTerrain = this.getVisibleTerrain(hexCoord);
                if (!visibleTerrain || visibleTerrain.data.paintMode !== 'ondulado' || !visibleTerrain.data.terreno) continue;

                const settings = visibleTerrain.data.wavySettings ?? { coverage: 100, waves: 3, smoothness: 50 };
                const grouping = visibleTerrain.data.wavyGrouping ?? 'stroke';
                const key = `${visibleTerrain.layerIndex}:${visibleTerrain.data.terreno}:${settings.coverage}:${settings.waves}:${settings.smoothness}:${grouping}:${visibleTerrain.data.paintGroupId}`;
                const group = groups.get(key) ?? {
                    color: this.colores[visibleTerrain.data.terreno],
                    hexes: [],
                    settings,
                    grouping
                };
                group.hexes.push(hexCoord);
                groups.set(key, group);
            }
        }

        groups.forEach((group) => {
            const groupCenterX = group.hexes.reduce((sum, hex) => sum + hex.x, 0) / group.hexes.length;
            const groupCenterY = group.hexes.reduce((sum, hex) => sum + hex.y, 0) / group.hexes.length;
            const contours = group.grouping === 'contour'
                ? this.createGroupContours(group.hexes).map((contour) => contour)
                : [this.createConvexHull(group.hexes)];
            const graphic = group.grouping === 'stroke' ? new PIXI.Graphics() : null;
            if (graphic) graphic.beginFill(group.color, 1);
            contours.forEach((contour) => {
                const contourGraphic = graphic ?? new PIXI.Graphics();
                if (!graphic) contourGraphic.beginFill(group.color, 1);
                const contourCenterX = contour.reduce((sum, point) => sum + point.x, 0) / contour.length;
                const contourCenterY = contour.reduce((sum, point) => sum + point.y, 0) / contour.length;
                const centerX = group.grouping === 'contour' ? contourCenterX : groupCenterX;
                const centerY = group.grouping === 'contour' ? contourCenterY : groupCenterY;
                this.drawBezierWavyContour(contourGraphic, contour, centerX, centerY, group.settings.coverage, group.settings.waves, group.settings.smoothness);
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
        this.drawGrid();
    }

    private renderHex(hexCoord: HexCoordinate): void {
        const baseData = this.layers[0].hexes[hexCoord.col][hexCoord.fila];
        const isSelected = this.selectedHex?.col === hexCoord.col && this.selectedHex?.fila === hexCoord.fila;

        const baseIsWavy = baseData.paintMode === 'ondulado';
        const baseColor = baseData.terreno ? this.colores[baseData.terreno] : 0x1a1a1a;
        const baseBackground = baseData.underlyingTerrain
            ? this.colores[baseData.underlyingTerrain]
            : 0x1a1a1a;
        const backgroundColor = baseIsWavy ? baseBackground : baseColor;
        this.drawHexGraphic(
            baseData.graphic,
            hexCoord,
            backgroundColor,
            1,
            'normal',
            0,
            0
        );
        for (let layerIndex = 1; layerIndex < this.layers.length; layerIndex++) {
            const layer = this.layers[layerIndex];
            const data = layer.hexes[hexCoord.col][hexCoord.fila];
            data.graphic.clear();
            if (!layer.visible || !data.terreno || data.paintMode === 'ondulado') continue;

            this.drawHexGraphic(data.graphic, hexCoord, this.colores[data.terreno], 0.75, 'normal', 0, 0);
        }
    }

    dibujarTableroCompleto(): void {
        this.reorderLayerContainers();
        for (let c = 0; c < this.cols; c++) {
            for (let f = 0; f < this.filas; f++) {
                this.renderHex(this.mapaHexes[c][f]);
            }
        }
        this.drawWavyTerrainGroups();
        this.viewport.removeChild(this.wavyOverlayContainer);
        this.viewport.addChild(this.wavyOverlayContainer);
        this.viewport.removeChild(this.gridContainer);
        this.viewport.addChild(this.gridContainer);
        this.gridContainer.visible = this.gridVisible;
    }

    private reorderLayerContainers(): void {
        this.layers.forEach((layer, index) => {
            this.viewport.removeChild(layer.container);
            this.viewport.addChildAt(layer.container, index + 1);
            layer.container.visible = layer.visible;
        });
    }

    initEvents(): void {
        const updateWavySettingOutputs = (): void => {
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
            this.wavyGrouping = this.groupingInput.value as WavyGrouping;
        });
        document.getElementById('toggleGrid')?.addEventListener('click', (event) => {
            this.gridVisible = !this.gridVisible;
            (event.currentTarget as HTMLButtonElement).textContent = this.gridVisible ? 'Ocultar malla' : 'Mostrar malla';
            this.drawGrid();
        });

        document.querySelectorAll<HTMLButtonElement>('.paint-mode-option').forEach((button) => {
            button.addEventListener('click', () => {
                const mode = button.dataset.paintMode as PaintMode | undefined;
                if (!mode) return;

                document.querySelector('.paint-mode-option.selected')?.classList.remove('selected');
                document.querySelectorAll<HTMLButtonElement>('.paint-mode-option').forEach((option) => {
                    option.setAttribute('aria-pressed', String(option === button));
                });
                button.classList.add('selected');
                this.paintMode = mode;
                this.freeWavyPoints = [];
                this.dibujarTableroCompleto();
            });
        });

        document.querySelectorAll<HTMLButtonElement>('.terrain-type').forEach((button) => {
            button.addEventListener('click', () => {
                const terrain = button.dataset.terrain as TerrainType | undefined;
                if (button.classList.contains('selected')) {
                    button.classList.remove('selected');
                    this.selectedTerrain = null;
                } else {
                    document.querySelector('.terrain-type.selected')?.classList.remove('selected');
                    button.classList.add('selected');
                    this.selectedTerrain = terrain ?? null;
                }
            });
        });

        document.getElementById('add-layer-btn')?.addEventListener('click', () => this.addLayer());

        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;

        let isPanning = false;
        let panStart = { x: 0, y: 0 };
        let isPainting = false;
        const stopPainting = (): void => {
            isPanning = false;
            isPainting = false;
            this.activePaintGroupId = null;
        };

        this.app.stage.on('pointerdown', (event: any) => {
            const localPosition = this.viewport.toLocal(event.global);
            if (event.button === 0 && this.paintMode === 'ondulado-libre') {
                this.addFreeWavyPoint({ x: localPosition.x, y: localPosition.y });
                return;
            }

            if (event.button === 2) {
                isPanning = true;
                panStart = { x: event.global.x - this.viewport.x, y: event.global.y - this.viewport.y };
            } else if (event.button === 0) {
                isPainting = true;
                this.activePaintGroupId = ++this.paintGroupCounter;
                this.pintarHexagono(localPosition.x, localPosition.y);
            }
        });

        this.app.stage.on('pointermove', (event: any) => {
            if (isPanning) {
                this.viewport.x = event.global.x - panStart.x;
                this.viewport.y = event.global.y - panStart.y;
            } else if (isPainting) {
                const localPosition = this.viewport.toLocal(event.global);
                this.pintarHexagono(localPosition.x, localPosition.y);
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

        this.app.view.addEventListener('wheel', (event: WheelEvent) => {
            event.preventDefault();
            const zoom = event.deltaY < 0 ? 1.1 : 0.9;
            const worldPosition = this.viewport.toLocal({ x: event.clientX, y: event.clientY });
            const newScale = Math.min(Math.max(this.viewport.scale.x * zoom, 0.1), 3);
            this.viewport.scale.set(newScale);
            this.viewport.x = event.clientX - worldPosition.x * newScale;
            this.viewport.y = event.clientY - worldPosition.y * newScale;
        }, { passive: false });

        this.app.view.addEventListener('contextmenu', (event: MouseEvent) => event.preventDefault());
    }

    addLayer(isBase = false): void {
        this.layerCounter++;
        const newLayer: TerrainLayer = {
            id: Date.now() + this.layerCounter,
            name: isBase ? 'Capa Base' : `Capa ${this.layerCounter}`,
            visible: true,
            container: new PIXI.Container(),
            hexes: [],
            freeWavyStrokes: []
        };

        for (let c = 0; c < this.cols; c++) {
            newLayer.hexes[c] = [];
            for (let f = 0; f < this.filas; f++) {
                const hexCoordinate = this.mapaHexes[c][f];
                const hexData: HexData = {
                    ...hexCoordinate,
                    terreno: isBase ? 'llanura' : null,
                    baseTerrain: isBase ? 'llanura' : null,
                    paintMode: isBase ? 'normal' : null,
                    wavySettings: isBase ? { coverage: 100, waves: 3, smoothness: 50 } : null,
                    wavyGrouping: isBase ? 'stroke' : null,
                    paintGroupId: null,
                    underlyingTerrain: null,
                    graphic: new PIXI.Graphics()
                };
                newLayer.hexes[c][f] = hexData;
                if (isBase) {
                    this.baseLayerContainer.addChild(hexData.graphic);
                } else {
                    newLayer.container.addChild(hexData.graphic);
                }
            }
        }

        this.layers.push(newLayer);
        this.viewport.addChild(newLayer.container);
        if (isBase) this.dibujarTableroCompleto();
        this.setActiveLayer(newLayer.id);
    }

    setActiveLayer(layerId: number): void {
        const layer = this.layers.find((currentLayer) => currentLayer.id === layerId);
        if (layer) this.activeLayer = layer;
        this.updateLayerList();
    }

    private isBaseLayer(layerId: number): boolean {
        return this.layers[0]?.id === layerId;
    }

    deleteLayer(layerId: number): void {
        const layerIndex = this.layers.findIndex((layer) => layer.id === layerId);
        if (layerIndex < 0 || this.isBaseLayer(layerId)) return;

        const [deletedLayer] = this.layers.splice(layerIndex, 1);
        this.viewport.removeChild(deletedLayer.container);
        deletedLayer.container.destroy();

        if (this.activeLayer?.id === layerId) {
            this.setActiveLayer(this.layers[layerIndex - 1].id);
        } else {
            this.updateLayerList();
        }
        this.dibujarTableroCompleto();
    }

    toggleLayerVisibility(layerId: number): void {
        const layer = this.layers.find((currentLayer) => currentLayer.id === layerId);
        if (!layer || this.isBaseLayer(layerId)) return;

        layer.visible = !layer.visible;
        layer.container.visible = layer.visible;
        this.dibujarTableroCompleto();
        this.updateLayerList();
    }

    updateLayerList(): void {
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

            let visibilityButton: HTMLButtonElement | null = null;
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
                    if (this.isBaseLayer(layer.id)) return;

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = layer.name;
                    input.className = 'layer-name-input';
                    layerName.replaceWith(input);
                    input.focus();

                    const saveName = (): void => {
                        const newName = input.value.trim();
                        if (newName) layer.name = newName;
                        this.updateLayerList();
                    };

                    input.addEventListener('blur', saveName);
                    input.addEventListener('keydown', (event: KeyboardEvent) => {
                        if (event.key === 'Enter') saveName();
                        if (event.key === 'Escape') this.updateLayerList();
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
            this.layerListElement.appendChild(listItem);
        });
    }

    pintarHexagono(x: number, y: number): void {
        let bestHexCoordinate: HexCoordinate | null = null;
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

        if (!bestHexCoordinate) return;
        if (this.selectedHex && (this.selectedHex.col !== bestHexCoordinate.col || this.selectedHex.fila !== bestHexCoordinate.fila)) {
            const previousHex = this.selectedHex;
            this.selectedHex = null;
            this.redibujarHexagonoCompleto(previousHex);
        }

        this.selectedHex = bestHexCoordinate;
        if (this.selectedTerrain && this.activeLayer) {
            const hexData = this.activeLayer.hexes[bestHexCoordinate.col][bestHexCoordinate.fila];
            if (this.paintMode === 'ondulado' && !hexData.underlyingTerrain) {
                hexData.underlyingTerrain = hexData.terreno;
            }
            hexData.terreno = this.selectedTerrain;
            hexData.paintMode = this.paintMode;
            hexData.wavySettings = this.paintMode === 'ondulado' ? { ...this.wavySettings } : null;
            hexData.wavyGrouping = this.paintMode === 'ondulado' ? this.wavyGrouping : null;
            hexData.paintGroupId = this.paintMode === 'ondulado' ? this.activePaintGroupId : null;
            if (this.paintMode === 'normal') hexData.underlyingTerrain = null;
        }
        this.redibujarHexagonoCompleto(bestHexCoordinate);
        this.actualizarPanelInfo();
    }

    actualizarPanelInfo(): void {
        const hex = this.selectedHex;
        if (!hex) {
            this.infoPanelContent.innerHTML = '<p>Selecciona un hexágono.</p>';
            return;
        }

        let content = `<p><strong>Col:</strong> ${hex.col}, <strong>Fila:</strong> ${hex.fila}</p><ul>`;
        this.layers.forEach((layer) => {
            const terrain = layer.hexes[hex.col][hex.fila].terreno;
            content += `<li>${layer.name}: ${terrain ?? 'Sin terreno'}</li>`;
        });
        this.infoPanelContent.innerHTML = `${content}</ul>`;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const editor = new TerrainEditor('canvasContainer');
    const createTerrainButton = document.getElementById('createTerrain');
    const columnsInput = document.getElementById('terrainCols') as HTMLInputElement | null;
    const rowsInput = document.getElementById('terrainRows') as HTMLInputElement | null;
    const hexSizeInput = document.getElementById('hexSize') as HTMLInputElement | null;

    createTerrainButton?.addEventListener('click', () => {
        editor.cols = Number.parseInt(columnsInput?.value ?? '', 10) || 10;
        editor.filas = Number.parseInt(rowsInput?.value ?? '', 10) || 10;
        editor.radioHex = Number.parseInt(hexSizeInput?.value ?? '', 10) || 40;
        editor.crearTablero();
    });
});

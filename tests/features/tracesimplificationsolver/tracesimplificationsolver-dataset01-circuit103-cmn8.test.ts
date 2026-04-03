import { expect, test } from "bun:test"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { GraphicsObject } from "graphics-debug"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type {
  HighDensityRoute,
  NodeWithPortPoints,
} from "lib/types/high-density-types"
import type { Obstacle } from "lib/types"
import fixture from "fixtures/features/tracesimplificationsolver/tracesimplificationsolver-dataset01-circuit103-cmn8-input.json" with {
  type: "json",
}

const createNodeLocalVisualization = ({
  node,
  originalRoutes,
  simplifiedRoutes,
  obstacles,
  colorMap,
}: {
  node: NodeWithPortPoints
  originalRoutes: ReadonlyArray<HighDensityRoute>
  simplifiedRoutes: ReadonlyArray<HighDensityRoute>
  obstacles: ReadonlyArray<Obstacle>
  colorMap: Record<string, string>
}): GraphicsObject => {
  const margin = 0.6
  const box = {
    minX: node.center.x - node.width / 2,
    maxX: node.center.x + node.width / 2,
    minY: node.center.y - node.height / 2,
    maxY: node.center.y + node.height / 2,
  }
  const inBox = (point: { x: number; y: number }, extra = 0) =>
    point.x >= box.minX - margin - extra &&
    point.x <= box.maxX + margin + extra &&
    point.y >= box.minY - margin - extra &&
    point.y <= box.maxY + margin + extra

  const visualization: GraphicsObject = {
    title: "Trace simplification input/output around cmn_8",
    coordinateSystem: "cartesian",
    rects: [
      ...obstacles.map((obstacle) => ({
        center: obstacle.center,
        width: obstacle.width,
        height: obstacle.height,
        fill: "rgba(128, 128, 128, 0.12)",
        stroke: "rgba(128, 128, 128, 0.35)",
      })),
      {
        center: node.center,
        width: node.width,
        height: node.height,
        stroke: "black",
        fill: "rgba(255,255,255,0)",
        label: node.capacityMeshNodeId,
      },
    ],
    lines: [],
    circles: [],
    points: node.portPoints.map((portPoint) => ({
      x: portPoint.x,
      y: portPoint.y,
      color: "black",
      label: portPoint.connectionName,
    })),
  }

  for (const route of originalRoutes) {
    for (let i = 0; i < route.route.length - 1; i++) {
      const start = route.route[i]
      const end = route.route[i + 1]
      if (!inBox(start) && !inBox(end)) continue

      visualization.lines!.push({
        points: [
          { x: start.x, y: start.y },
          { x: end.x, y: end.y },
        ],
        strokeColor: "rgba(220, 0, 0, 0.22)",
        strokeWidth: route.traceThickness,
        strokeDash: "0.25,0.25",
        layer: `original-z${start.z.toString()}`,
      })
    }

    for (const via of route.vias) {
      if (!inBox(via, route.viaDiameter / 2)) continue
      visualization.circles!.push({
        center: via,
        radius: route.viaDiameter / 2,
        fill: "rgba(220, 0, 0, 0.08)",
        stroke: "rgba(220, 0, 0, 0.3)",
      })
    }
  }

  for (const route of simplifiedRoutes) {
    const strokeColor = colorMap[route.connectionName] ?? "rgba(80,80,80,0.9)"

    for (let i = 0; i < route.route.length - 1; i++) {
      const start = route.route[i]
      const end = route.route[i + 1]
      if (!inBox(start) && !inBox(end)) continue

      visualization.lines!.push({
        points: [
          { x: start.x, y: start.y },
          { x: end.x, y: end.y },
        ],
        strokeColor,
        strokeWidth: route.traceThickness,
        strokeDash: start.z === 1 ? "0.5,0.5" : undefined,
        layer: `simplified-z${start.z.toString()}`,
      })
    }

    for (const via of route.vias) {
      if (!inBox(via, route.viaDiameter / 2)) continue
      visualization.circles!.push({
        center: via,
        radius: route.viaDiameter / 2,
        fill: "rgba(0, 80, 255, 0.28)",
        stroke: "rgba(0, 80, 255, 0.85)",
      })
    }
  }

  return visualization
}

test(
  "trace simplification standalone dataset01 circuit103 cmn_8 svg snapshot",
  () => {
    const connMap = new ConnectivityMap(fixture.connMap.netMap)
    const solver = new TraceSimplificationSolver({
      ...fixture.traceSimplificationInput,
      connMap,
      colorMap: fixture.colorMap,
    })

    solver.solve()

    const localViz = createNodeLocalVisualization({
      node: fixture.node,
      originalRoutes: fixture.traceSimplificationInput.hdRoutes,
      simplifiedRoutes: solver.simplifiedHdRoutes,
      obstacles: fixture.traceSimplificationInput.obstacles,
      colorMap: fixture.colorMap,
    })

    expect(localViz).toMatchGraphicsSvg(import.meta.path)
  },
  { timeout: 120_000 },
)

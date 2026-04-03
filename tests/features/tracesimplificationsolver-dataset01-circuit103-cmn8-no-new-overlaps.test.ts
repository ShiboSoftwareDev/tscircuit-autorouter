import { expect, test } from "bun:test"
import * as dataset01 from "@tscircuit/autorouting-dataset-01"
import { getGlobalInMemoryCache } from "lib/cache/setupGlobalCaches"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import { TraceSimplificationSolver } from "lib/solvers/TraceSimplificationSolver/TraceSimplificationSolver"
import type { HighDensityRoute } from "lib/types/high-density-types"
import type { SimpleRouteJson } from "lib/types"

type OverlapSignature = string

const pointToSegmentDistanceSq = (
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) => {
  const segmentLengthSq = (start.x - end.x) ** 2 + (start.y - end.y) ** 2
  if (segmentLengthSq === 0) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2
  }

  let t =
    ((point.x - start.x) * (end.x - start.x) +
      (point.y - start.y) * (end.y - start.y)) /
    segmentLengthSq
  t = Math.max(0, Math.min(1, t))

  const projection = {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  }

  return (point.x - projection.x) ** 2 + (point.y - projection.y) ** 2
}

const areCoincident = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6

const getOverlapSignaturesInBox = (
  routes: ReadonlyArray<HighDensityRoute>,
  connMap: AutoroutingPipelineSolver4["connMap"],
  box: { minX: number; maxX: number; minY: number; maxY: number },
) => {
  const inBox = (point: { x: number; y: number }, margin = 0) =>
    point.x >= box.minX - margin &&
    point.x <= box.maxX + margin &&
    point.y >= box.minY - margin &&
    point.y <= box.maxY + margin

  const overlaps = new Set<OverlapSignature>()

  for (const viaRoute of routes) {
    for (const via of viaRoute.vias) {
      if (!inBox(via, 0.6)) continue

      for (const segmentRoute of routes) {
        if (
          connMap.areIdsConnected(
            viaRoute.connectionName,
            segmentRoute.connectionName,
          )
        ) {
          continue
        }

        for (let i = 0; i < segmentRoute.route.length - 1; i++) {
          const start = segmentRoute.route[i]
          const end = segmentRoute.route[i + 1]

          if (start.z !== end.z) continue
          if (!inBox(start, 0.6) && !inBox(end, 0.6)) continue
          if (areCoincident(via, start) || areCoincident(via, end)) continue

          const clearance =
            viaRoute.viaDiameter / 2 + segmentRoute.traceThickness / 2
          const distanceSq = pointToSegmentDistanceSq(via, start, end)
          if (distanceSq < (clearance - 1e-6) ** 2) {
            overlaps.add(
              [
                viaRoute.connectionName,
                segmentRoute.connectionName,
                via.x.toFixed(6),
                via.y.toFixed(6),
                start.x.toFixed(6),
                start.y.toFixed(6),
                end.x.toFixed(6),
                end.y.toFixed(6),
              ].join("|"),
            )
          }
        }
      }
    }
  }

  return overlaps
}

test(
  "trace simplification does not introduce new cmn_8 via-trace overlaps for dataset01 circuit103",
  () => {
    getGlobalInMemoryCache().clearCache()

    const circuit103 = (dataset01 as Record<string, unknown>)
      .circuit103 as SimpleRouteJson
    const pipeline = new AutoroutingPipelineSolver4(structuredClone(circuit103))

    pipeline.solveUntilPhase("traceSimplificationSolver")
    while (
      pipeline.getCurrentPhase() === "traceSimplificationSolver" &&
      !pipeline.traceSimplificationSolver
    ) {
      pipeline.step()
    }

    const node =
      pipeline.highDensityRouteSolver?.nodeSolveMetadataById.get("cmn_8")?.node
    expect(node).toBeDefined()

    const box = {
      minX: node!.center.x - node!.width / 2,
      maxX: node!.center.x + node!.width / 2,
      minY: node!.center.y - node!.height / 2,
      maxY: node!.center.y + node!.height / 2,
    }

    const stitchedRoutes = structuredClone(
      pipeline.highDensityStitchSolver!.mergedHdRoutes,
    )
    const simplifier = new TraceSimplificationSolver({
      hdRoutes: stitchedRoutes,
      obstacles: circuit103.obstacles,
      connMap: pipeline.connMap,
      colorMap: pipeline.colorMap,
      outline: circuit103.outline,
      defaultViaDiameter: pipeline.viaDiameter,
      layerCount: circuit103.layerCount,
    })

    simplifier.solve()

    const stitchedOverlapSignatures = getOverlapSignaturesInBox(
      stitchedRoutes,
      pipeline.connMap,
      box,
    )
    const simplifiedOverlapSignatures = getOverlapSignaturesInBox(
      simplifier.simplifiedHdRoutes,
      pipeline.connMap,
      box,
    )

    const newOverlapSignatures = [...simplifiedOverlapSignatures].filter(
      (signature) => !stitchedOverlapSignatures.has(signature),
    )

    expect(simplifier.solved).toBe(true)
    expect(simplifier.failed).toBe(false)
    expect(newOverlapSignatures).toHaveLength(0)
  },
  { timeout: 120_000 },
)

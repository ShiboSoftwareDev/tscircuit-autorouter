import { expect, test } from "bun:test"
import * as dataset01 from "@tscircuit/autorouting-dataset-01"
import { getGlobalInMemoryCache } from "lib/cache/setupGlobalCaches"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import { HyperSingleIntraNodeSolver } from "lib/solvers/HyperHighDensitySolver/HyperSingleIntraNodeSolver"
import type { SimpleRouteJson } from "lib/types"
import { getCrossNetViaTraceOverlaps } from "lib/utils/getCrossNetViaTraceOverlaps"

test(
  "pipeline4 circuit103 cmn_8 standalone node solver svg snapshot avoids cross-net via-trace overlaps",
  () => {
    getGlobalInMemoryCache().clearCache()

    const circuit103 = (dataset01 as Record<string, unknown>)
      .circuit103 as SimpleRouteJson
    const pipeline = new AutoroutingPipelineSolver4(structuredClone(circuit103))

    pipeline.solveUntilPhase("highDensityRepairSolver")

    const node =
      pipeline.highDensityRouteSolver?.nodeSolveMetadataById.get("cmn_8")?.node

    expect(node).toBeDefined()

    const solver = new HyperSingleIntraNodeSolver({
      nodeWithPortPoints: node!,
      colorMap: pipeline.colorMap,
      connMap: pipeline.connMap,
      viaDiameter: pipeline.viaDiameter,
      traceWidth: pipeline.minTraceWidth,
      obstacleMargin: circuit103.defaultObstacleMargin ?? 0.15,
      effort: pipeline.effort,
    })

    solver.solve()

    expect(solver.solved).toBe(true)
    expect(solver.failed).toBe(false)
    expect(solver.solvedRoutes).toHaveLength(6)
    expect(
      getCrossNetViaTraceOverlaps(solver.solvedRoutes, pipeline.connMap),
    ).toHaveLength(0)
    expect(solver.visualize()).toMatchGraphicsSvg(import.meta.path)
  },
  { timeout: 120_000 },
)

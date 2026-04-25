import { expect, test } from "bun:test"
import * as dataset01 from "@tscircuit/autorouting-dataset-01"
import { getGlobalInMemoryCache } from "lib/cache/setupGlobalCaches"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import type { SimpleRouteJson } from "lib/types"

const getCircuit202 = () =>
  (dataset01 as Record<string, unknown>).circuit202 as SimpleRouteJson

test("pipeline4 dataset01 circuit202 splits cmn_15 before high-density routing", () => {
  getGlobalInMemoryCache().clearCache()

  const pipeline = new AutoroutingPipelineSolver4(
    structuredClone(getCircuit202()),
  )
  pipeline.solveUntilPhase("highDensityForceImproveSolver")

  const edgeSubNodes =
    pipeline.highDensityNodePortPoints?.filter((candidate) =>
      candidate.capacityMeshNodeId.startsWith("cmn_15__edge_sub_"),
    ) ?? []

  expect(edgeSubNodes.length).toBeGreaterThan(1)
  expect(
    pipeline.highDensityNodePortPoints?.some(
      (candidate) => candidate.capacityMeshNodeId === "cmn_15",
    ) ?? false,
  ).toBe(false)
  expect(
    Math.max(
      ...edgeSubNodes.map(
        (node) =>
          new Set(node.portPoints.map((point) => point.connectionName)).size,
      ),
    ),
  ).toBeLessThan(15)
}, 120_000)

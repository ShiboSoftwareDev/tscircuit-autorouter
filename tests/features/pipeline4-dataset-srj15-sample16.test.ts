import { expect, test } from "bun:test"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import type { SimpleRouteJson } from "lib/types"
import sample16 from "fixtures/datasets/dataset-srj15/sample16-region-reroute.srj.json" with {
  type: "json",
}

test("pipeline4 dataset-srj15 sample16 solves with default effort", () => {
  const pipeline = new AutoroutingPipelineSolver4(
    structuredClone(sample16 as SimpleRouteJson),
  )

  pipeline.solve()

  expect(pipeline.solved).toBe(true)
  expect(pipeline.failed).toBe(false)
  expect(pipeline.highDensityRouteSolver?.solved).toBe(true)
  expect(pipeline.highDensityRouteSolver?.failed).toBe(false)
  expect(
    pipeline.highDensityRouteSolver?.nodeSolveMetadataById.get("cmn_5")?.status,
  ).toBe("solved")
}, 60_000)

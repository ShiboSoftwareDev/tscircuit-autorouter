import { expect, test } from "bun:test"
import * as dataset01 from "@tscircuit/autorouting-dataset-01"
import { getGlobalInMemoryCache } from "lib/cache/setupGlobalCaches"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import type { SimpleRouteJson } from "lib/types"

test("pipeline4 dataset01 circuit202 routes after edge-collapse node subdivision", () => {
  getGlobalInMemoryCache().clearCache()

  const circuit202 = (dataset01 as Record<string, unknown>)
    .circuit202 as SimpleRouteJson
  const solver = new AutoroutingPipelineSolver4(structuredClone(circuit202))

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.error).toBeNull()
}, 120_000)

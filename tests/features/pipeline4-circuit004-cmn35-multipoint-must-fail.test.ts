import { expect, test } from "bun:test"
import * as dataset01 from "@tscircuit/autorouting-dataset-01"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import type { SimpleRouteJson } from "lib/types"

test(
  "pipeline4 circuit004 fails when cmn_35 only has a partial multi-point route",
  () => {
    const circuit004 = (dataset01 as Record<string, unknown>)
      .circuit004 as SimpleRouteJson
    const solver = new AutoroutingPipelineSolver4(circuit004)
    solver.solve()

    expect(solver.solved).toBe(false)
    expect(solver.failed).toBe(true)
    expect(solver.error).toContain("cmn_35")

    const cmn35Meta =
      solver.highDensityRouteSolver?.nodeSolveMetadataById.get("cmn_35")
    expect(cmn35Meta).toBeDefined()
    expect(cmn35Meta?.status).toBe("failed")
    expect(cmn35Meta?.error).toContain("partial intra-node routing")
  },
  { timeout: 60000 },
)

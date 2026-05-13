import { expect, test } from "bun:test"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import type { SimpleRouteJson } from "lib/types"
import reproJson from "../../fixtures/repro/repro117-standalone-simple-route.json"
import { getLastStepSvg } from "../fixtures/getLastStepSvg"

test(
  "repro117 standalone simple route pipeline4 snapshot",
  () => {
    const solver = new AutoroutingPipelineSolver4(reproJson as SimpleRouteJson)

    solver.solve()

    expect(getLastStepSvg(solver.visualize())).toMatchSvgSnapshot(
      import.meta.path,
    )
  },
  { timeout: 60_000 },
)

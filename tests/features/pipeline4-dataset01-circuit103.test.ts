import { expect, test } from "bun:test"
import * as dataset01 from "@tscircuit/autorouting-dataset-01"
import { AutoroutingPipelineSolver4 } from "lib/autorouter-pipelines/AutoroutingPipeline4_TinyHypergraph/AutoroutingPipelineSolver4_TinyHypergraph"
import type { SimpleRouteJson } from "lib/types"
import { convertSrjToGraphicsObject } from "lib/utils/convertSrjToGraphicsObject"

test(
  "pipeline4 dataset01 circuit103 svg snapshot",
  () => {
    const circuit103 = (dataset01 as Record<string, unknown>)
      .circuit103 as SimpleRouteJson
    const pipeline = new AutoroutingPipelineSolver4(structuredClone(circuit103))

    pipeline.solve()

    expect(pipeline.solved).toBe(true)
    expect(pipeline.failed).toBe(false)
    expect(pipeline.getOutputSimpleRouteJson().traces?.length).toBeGreaterThan(
      0,
    )
    expect(
      convertSrjToGraphicsObject(pipeline.getOutputSimpleRouteJson()),
    ).toMatchGraphicsSvg(import.meta.path)
  },
  { timeout: 120_000 },
)

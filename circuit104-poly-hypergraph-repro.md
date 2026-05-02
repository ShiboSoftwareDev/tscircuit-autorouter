# Circuit104 Tiny Hypergraph Repro

This is a handoff note for the agent working in the `tiny-hypergraph` repo.

## Issue

`@tscircuit/capacity-autorouter` pipeline6 fails on `@tscircuit/autorouting-dataset-01` `circuit104`.

The failure is localized to poly region `free-81`. The region is physically large, but the tiny hypergraph poly solver assigns 8 route segments through it. Those route endpoints are heavily interleaved around the original polygon boundary, before any rect projection is applied.

Observed failure from autorouter:

```txt
Failed to solve 1 poly nodes, free-81. err0: All solvers failed in hyper solver. Example failures: ViaPossibilitiesSolver2 failed with: Exceeded max via count of 5, ViaPossibilitiesSolver2 failed with: Exceeded max via count of 5, HighDensitySolverA01 ran out of iterations, Convergence failure: exceeded MAX_RIPS 200, SingleHighDensityRouteSolver ran out of iterations (MAX_ITERATIONS=10000)
```

Key facts from diagnostics:

- Failed region: `free-81`
- Route segments assigned through `free-81`: `8`
- Interleaved route pairs on the original polygon boundary: `16`
- The best local high-density attempts route 6 of 8 traces, then fail on `source_net_12`; `source_net_6` remains unrouted.
- This is not caused by `AttachProjectedRectsSolver`. Port/route assignment to `free-81` already exists in `PolyHyperGraphSolver.state.regionSegments` before rect projection.
- The repro belongs in `tiny-hypergraph` because that repo owns `PolyHyperGraphSolver` and the final `state.regionSegments` assignment. `pcb-poly-hyper-graph` only provides the serialized poly graph fixture used by this repro.

## Repro Fixture Generation

From the `tscircuit-autorouter` repo, generate the serialized poly hypergraph fixture that `tiny-hypergraph` can load:

```sh
bun --preload ./tests/fixtures/preload.ts -e '
import * as dataset01 from "@tscircuit/autorouting-dataset-01"
import { AutoroutingPipelineSolver6 } from "./lib/autorouter-pipelines/AutoroutingPipeline6_PolyHypergraph/AutoroutingPipelineSolver6_PolyHypergraph.ts"

const solver = new AutoroutingPipelineSolver6(
  structuredClone((dataset01 as any).circuit104),
  { effort: 1 },
)

solver.solve()

await Bun.write(
  "/tmp/circuit104-poly-hypergraph.json",
  JSON.stringify(solver.polyGraphSolver!.serializedGraph, null, 2),
)
'
```

Copy the generated file into the `tiny-hypergraph` repo, for example:

```txt
tests/assets/circuit104-poly-hypergraph.json
```

## Minimal Repro Test

Add this test in the `tiny-hypergraph` repo. It checks the solved poly graph assignment for `free-81`.

```ts
import { expect, test } from "bun:test"
import circuit104Graph from "../assets/circuit104-poly-hypergraph.json"
import {
  loadSerializedHyperGraphAsPoly,
  PolyHyperGraphSolver,
} from "../../lib/index"

const getBoundaryPosition = (
  topology: any,
  regionId: number,
  portId: number,
) => {
  const [r1, r2] = topology.incidentPortRegion[portId] ?? []
  if (r1 === regionId) return topology.portBoundaryPositionForRegion1[portId]
  if (r2 === regionId) return topology.portBoundaryPositionForRegion2[portId]
  throw new Error(`port ${portId} is not incident to region ${regionId}`)
}

const countInterleavedPairs = (
  topology: any,
  regionId: number,
  segments: Array<[number, number, number]>,
) => {
  const endpoints = segments
    .flatMap(([routeId, fromPortId, toPortId]) => [
      { routeId, portId: fromPortId },
      { routeId, portId: toPortId },
    ])
    .map((endpoint) => ({
      ...endpoint,
      pos: getBoundaryPosition(topology, regionId, endpoint.portId),
    }))
    .sort((a, b) => a.pos - b.pos)

  const routeIds = [...new Set(endpoints.map((endpoint) => endpoint.routeId))]
  const pairs = routeIds.map((routeId) => ({
    routeId,
    indices: endpoints
      .map((endpoint, index) =>
        endpoint.routeId === routeId ? index : null,
      )
      .filter((index): index is number => index !== null),
  }))

  let count = 0
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a, b] = pairs[i]!.indices
      const [c, d] = pairs[j]!.indices
      if ((a < c && c < b && b < d) || (c < a && a < d && d < b)) {
        count++
      }
    }
  }
  return count
}

test("circuit104 routes too many interleaved segments through free-81", () => {
  const loaded = loadSerializedHyperGraphAsPoly(circuit104Graph as any)
  const solver = new PolyHyperGraphSolver(loaded.topology, loaded.problem, {
    DISTANCE_TO_COST: 0.05,
    RIP_THRESHOLD_START: 0.05,
    RIP_THRESHOLD_END: 0.8,
    RIP_CONGESTION_REGION_COST_FACTOR: 0.1,
    RIP_THRESHOLD_RAMP_ATTEMPTS: 10,
    MAX_ITERATIONS: 10_000_000,
  })

  solver.solve()

  expect(solver.solved).toBe(true)

  const free81RegionId = loaded.topology.regionMetadata.findIndex(
    (metadata: any) => metadata?.serializedRegionId === "free-81",
  )
  expect(free81RegionId).toBeGreaterThanOrEqual(0)

  const free81Segments = solver.state.regionSegments[free81RegionId] ?? []
  const interleavedPairCount = countInterleavedPairs(
    loaded.topology,
    free81RegionId,
    free81Segments,
  )

  expect(free81Segments.length).toBe(8)
  expect(interleavedPairCount).toBe(16)
})
```

## Additional Autorouter Repro

The autorouter repo also contains:

```txt
tests/features/pipeline6-dataset01-circuit104.test.ts
tests/features/__snapshots__/pipeline6-dataset01-circuit104.snap.svg
```

Run:

```sh
bun test tests/features/pipeline6-dataset01-circuit104.test.ts
```

That test prints diagnostics for `free-81`, including original polygon boundary order, projected rect boundary order, interleaved pairs, crossing graph, and top supervised solver failures.

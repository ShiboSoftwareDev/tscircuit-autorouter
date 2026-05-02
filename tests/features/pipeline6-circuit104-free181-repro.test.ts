import { expect, test } from "bun:test"
import { PolySingleIntraNodeSolver } from "lib/autorouter-pipelines/AutoroutingPipeline6_PolyHypergraph/PolySingleIntraNodeSolver"
import { computeProjectedRect } from "lib/autorouter-pipelines/AutoroutingPipeline6_PolyHypergraph/geometry"
import type { PolyNodeWithPortPoints } from "lib/autorouter-pipelines/AutoroutingPipeline6_PolyHypergraph/types"

const polygon = [
  { x: 14.65, y: 8.565 },
  { x: 15.3, y: 8.935 },
  { x: 14.65, y: 8.935 },
  { x: 14, y: 8.935 },
  { x: 11, y: 8.935 },
  { x: 11, y: 8.565 },
  { x: 14, y: 8.565 },
]

const free181Node: PolyNodeWithPortPoints = {
  capacityMeshNodeId: "free-181",
  center: { x: 12.991928721174062, y: 8.75504192872122 },
  width: 4.019761477146522,
  height: 0.45,
  availableZ: [0, 1],
  polygon,
  projectedRect: computeProjectedRect(polygon, 2, 0.45),
  portPoints: [
    {
      portPointId: "shared-port-02752::p0::z1",
      x: 15.1371,
      y: 8.8422,
      z: 1,
      connectionName: "source_net_1_mst1",
      rootConnectionName: "source_net_1",
    },
    {
      portPointId: "shared-port-04087::p0::z1::obstacle",
      x: 14.975,
      y: 8.935,
      z: 1,
      connectionName: "source_net_9_mst0",
      rootConnectionName: "source_net_9",
    },
    {
      portPointId: "shared-port-02817::p0::z1",
      x: 11,
      y: 8.75,
      z: 1,
      connectionName: "source_net_2_mst0",
      rootConnectionName: "source_net_2",
    },
    {
      portPointId: "shared-port-02819::p0::z1",
      x: 11.1875,
      y: 8.565,
      z: 1,
      connectionName: "source_net_2_mst0",
      rootConnectionName: "source_net_2",
    },
    {
      portPointId: "shared-port-02829::p5::z1",
      x: 13.375,
      y: 8.565,
      z: 1,
      connectionName: "source_net_9_mst0",
      rootConnectionName: "source_net_9",
    },
    {
      portPointId: "shared-port-02831::p6::z1",
      x: 13.8125,
      y: 8.565,
      z: 1,
      connectionName: "source_net_1_mst1",
      rootConnectionName: "source_net_1",
    },
  ],
}

test("pipeline6 circuit104 free-181 solves skinny same-layer high-density node", () => {
  const solver = new PolySingleIntraNodeSolver({
    nodeWithPortPoints: structuredClone(free181Node),
    traceWidth: 0.15,
    viaDiameter: 0.3,
    obstacleMargin: 0.15,
    effort: 1,
  })

  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.solvedRoutes).toHaveLength(3)
  expect(free181Node.projectedRect?.height).toBe(0.45)
  expect(new Set(free181Node.portPoints.map((point) => point.z))).toEqual(
    new Set([1]),
  )
  expect(new Set(free181Node.portPoints.map((point) => point.connectionName)))
    .toHaveProperty("size", 3)
})

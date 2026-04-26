import { expect, test } from "bun:test"
import { EdgeCollapsedNodeSubdivisionSolver } from "lib/solvers/NodeDimensionSubdivisionSolver/EdgeCollapsedNodeSubdivisionSolver"
import type { CapacityMeshEdge, CapacityMeshNode } from "lib/types"

const createNode = (
  capacityMeshNodeId: string,
  center: { x: number; y: number },
  width: number,
  height: number,
): CapacityMeshNode => ({
  capacityMeshNodeId,
  center,
  width,
  height,
  layer: "top",
  availableZ: [0, 1],
})

test("EdgeCollapsedNodeSubdivisionSolver splits a node when too many neighbors collapse onto one side", () => {
  const node = createNode("cmn_0", { x: 0, y: 0 }, 12, 6)
  const topNeighbors = Array.from({ length: 9 }, (_, index) =>
    createNode(
      `top_${index}`,
      { x: -5.333333333333333 + index * 1.3333333333333333, y: 4 },
      4 / 3,
      2,
    ),
  )
  const leftNeighbor = createNode("left_0", { x: -7, y: 0 }, 2, 6)
  const nodes = [node, ...topNeighbors, leftNeighbor]

  const edges: CapacityMeshEdge[] = [
    ...topNeighbors.map((neighbor, index) => ({
      capacityMeshEdgeId: `edge_top_${index}`,
      nodeIds: [node.capacityMeshNodeId, neighbor.capacityMeshNodeId],
    })),
    {
      capacityMeshEdgeId: "edge_left_0",
      nodeIds: [node.capacityMeshNodeId, leftNeighbor.capacityMeshNodeId],
    },
  ]

  const solver = new EdgeCollapsedNodeSubdivisionSolver(nodes, edges, {
    minEdgeCountOnCollapsedSide: 8,
    minTotalEdgeCount: 10,
    minDominantSideFraction: 0.5,
    minAvailableZCount: 2,
    minSplitSpan: 6,
  })
  solver.solve()

  const splitNodes = solver.outputNodes.filter((candidate) =>
    candidate.capacityMeshNodeId.startsWith("cmn_0__edge_sub_"),
  )

  expect(splitNodes).toHaveLength(2)
  expect(splitNodes.every((candidate) => candidate.width === 6)).toBe(true)
  expect(splitNodes.every((candidate) => candidate.height === 6)).toBe(true)
  expect(solver.stats.subdividedNodeCount).toBe(1)
})

test("EdgeCollapsedNodeSubdivisionSolver default heuristic skips two-layer nodes", () => {
  const node = createNode("cmn_0", { x: 0, y: 0 }, 12, 6)
  const topNeighbors = Array.from({ length: 24 }, (_, index) =>
    createNode(`top_${index}`, { x: -5.75 + index * 0.5, y: 4 }, 0.5, 2),
  )

  const solver = new EdgeCollapsedNodeSubdivisionSolver(
    [node, ...topNeighbors],
    topNeighbors.map((neighbor, index) => ({
      capacityMeshEdgeId: `edge_top_${index}`,
      nodeIds: [node.capacityMeshNodeId, neighbor.capacityMeshNodeId],
    })),
  )

  solver.solve()

  expect(
    solver.outputNodes.some((candidate) =>
      candidate.capacityMeshNodeId.startsWith("cmn_0__edge_sub_"),
    ),
  ).toBe(false)
  expect(solver.stats.subdividedNodeCount).toBe(0)
})

test("EdgeCollapsedNodeSubdivisionSolver leaves balanced nodes alone", () => {
  const node = createNode("cmn_0", { x: 0, y: 0 }, 12, 6)
  const topNeighbor = createNode("top_0", { x: 0, y: 4 }, 12, 2)
  const bottomNeighbor = createNode("bottom_0", { x: 0, y: -4 }, 12, 2)
  const leftNeighbor = createNode("left_0", { x: -7, y: 0 }, 2, 6)
  const rightNeighbor = createNode("right_0", { x: 7, y: 0 }, 2, 6)

  const solver = new EdgeCollapsedNodeSubdivisionSolver(
    [node, topNeighbor, bottomNeighbor, leftNeighbor, rightNeighbor],
    [
      {
        capacityMeshEdgeId: "edge_top_0",
        nodeIds: [node.capacityMeshNodeId, topNeighbor.capacityMeshNodeId],
      },
      {
        capacityMeshEdgeId: "edge_bottom_0",
        nodeIds: [node.capacityMeshNodeId, bottomNeighbor.capacityMeshNodeId],
      },
      {
        capacityMeshEdgeId: "edge_left_0",
        nodeIds: [node.capacityMeshNodeId, leftNeighbor.capacityMeshNodeId],
      },
      {
        capacityMeshEdgeId: "edge_right_0",
        nodeIds: [node.capacityMeshNodeId, rightNeighbor.capacityMeshNodeId],
      },
    ],
  )

  solver.solve()

  expect(solver.outputNodes).toHaveLength(5)
  expect(solver.outputNodes[0]?.capacityMeshNodeId).toBe("cmn_0")
  expect(solver.stats.subdividedNodeCount).toBe(0)
})

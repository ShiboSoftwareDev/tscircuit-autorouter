import type { SerializedPolyHyperGraph } from "pcb-poly-hyper-graph"
import { type Point, getConvexHull, getPolygonArea } from "./geometry"
import type { PolyNodeWithPortPoints } from "./types"

const EPSILON = 1e-9

const pointKey = (point: Point) =>
  `${Math.round(point.x * 1e9) / 1e9},${Math.round(point.y * 1e9) / 1e9}`

const reversedEdgeKey = (a: Point, b: Point) => `${pointKey(b)}|${pointKey(a)}`

const edgeKey = (a: Point, b: Point) => `${pointKey(a)}|${pointKey(b)}`

const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)

const edgesOf = (polygon: readonly Point[]) =>
  polygon.map((point, index) => ({
    a: point,
    b: polygon[(index + 1) % polygon.length]!,
  }))

export const segmentsOverlapCollinearly = (
  a: Point,
  b: Point,
  c: Point,
  d: Point,
) => {
  if (Math.abs(cross(a, b, c)) > EPSILON) return false
  if (Math.abs(cross(a, b, d)) > EPSILON) return false

  const useX = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)
  const a0 = useX ? a.x : a.y
  const b0 = useX ? b.x : b.y
  const c0 = useX ? c.x : c.y
  const d0 = useX ? d.x : d.y

  return (
    Math.min(Math.max(a0, b0), Math.max(c0, d0)) -
      Math.max(Math.min(a0, b0), Math.min(c0, d0)) >
    EPSILON
  )
}

export const polygonsShareBoundary = (
  polygonA: readonly Point[],
  polygonB: readonly Point[],
) => {
  const reversedEdgesA = new Set(
    edgesOf(polygonA).map(({ a, b }) => reversedEdgeKey(a, b)),
  )

  for (const { a, b } of edgesOf(polygonB)) {
    if (reversedEdgesA.has(edgeKey(a, b))) return true
  }

  for (const edgeA of edgesOf(polygonA)) {
    for (const edgeB of edgesOf(polygonB)) {
      if (segmentsOverlapCollinearly(edgeA.a, edgeA.b, edgeB.a, edgeB.b)) {
        return true
      }
    }
  }

  return false
}

const haveSameAvailableZ = (
  nodeA: PolyNodeWithPortPoints,
  nodeB: PolyNodeWithPortPoints,
) => {
  const zA = nodeA.availableZ ?? []
  const zB = nodeB.availableZ ?? []
  return zA.length === zB.length && zA.every((z, index) => z === zB[index])
}

const isMergeableFreeNode = (node: PolyNodeWithPortPoints) =>
  node.capacityMeshNodeId.startsWith("free-") &&
  !node.capacityMeshNodeId.startsWith("connected-obstacle-") &&
  !node.capacityMeshNodeId.startsWith("terminal-") &&
  !node._containsObstacle &&
  !node._containsTarget

export const canCoalescePolyHighDensityNodes = (
  nodeA: PolyNodeWithPortPoints,
  nodeB: PolyNodeWithPortPoints,
) => {
  if (!isMergeableFreeNode(nodeA) || !isMergeableFreeNode(nodeB)) return false
  if (!haveSameAvailableZ(nodeA, nodeB)) return false
  if (!polygonsShareBoundary(nodeA.polygon, nodeB.polygon)) return false

  const inputArea =
    getPolygonArea(nodeA.polygon) + getPolygonArea(nodeB.polygon)
  const hull = getConvexHull([...nodeA.polygon, ...nodeB.polygon])
  const hullArea = getPolygonArea(hull)

  return hullArea <= inputArea + Math.max(1e-6, inputArea * 1e-5)
}

const getBounds = (polygon: readonly Point[]) => {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of polygon) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return { minX, minY, maxX, maxY }
}

const getSourceNodeIds = (node: PolyNodeWithPortPoints) =>
  node.coalescedCapacityMeshNodeIds ?? [node.capacityMeshNodeId]

const mergeNodes = (
  nodeA: PolyNodeWithPortPoints,
  nodeB: PolyNodeWithPortPoints,
): PolyNodeWithPortPoints => {
  const polygon = getConvexHull([...nodeA.polygon, ...nodeB.polygon])
  const bounds = getBounds(polygon)
  const coalescedCapacityMeshNodeIds = [
    ...getSourceNodeIds(nodeA),
    ...getSourceNodeIds(nodeB),
  ]

  return {
    capacityMeshNodeId: coalescedCapacityMeshNodeIds.join("+"),
    center: {
      x: (bounds.minX + bounds.maxX) / 2,
      y: (bounds.minY + bounds.maxY) / 2,
    },
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    polygon,
    portPoints: [...nodeA.portPoints, ...nodeB.portPoints],
    availableZ: nodeA.availableZ,
    coalescedCapacityMeshNodeIds,
  }
}

export const coalescePolyHighDensityNodes = (
  nodes: PolyNodeWithPortPoints[],
  _serializedGraph?: SerializedPolyHyperGraph,
): PolyNodeWithPortPoints[] => {
  const result = [...nodes]

  let merged = true
  while (merged) {
    merged = false
    for (let i = 0; i < result.length && !merged; i++) {
      for (let j = i + 1; j < result.length; j++) {
        if (!canCoalescePolyHighDensityNodes(result[i]!, result[j]!)) continue
        const mergedNode = mergeNodes(result[i]!, result[j]!)
        result.splice(j, 1)
        result.splice(i, 1, mergedNode)
        merged = true
        break
      }
    }
  }

  return result
}

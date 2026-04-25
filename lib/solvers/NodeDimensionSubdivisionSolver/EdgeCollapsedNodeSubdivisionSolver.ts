import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { getNodeEdgeMap } from "lib/solvers/CapacityMeshSolver/getNodeEdgeMap"
import type { CapacityMeshEdge, CapacityMeshNode } from "lib/types"

type EdgeSide = "top" | "bottom" | "left" | "right"

type EdgeCollapseSubdivisionOptions = {
  minEdgeCountOnCollapsedSide?: number
  maxEdgeCountPerChild?: number
  minTotalEdgeCount?: number
  minDominantSideFraction?: number
  minAvailableZCount?: number
  minSplitSpan?: number
  maxChildren?: number
  minChildDimension?: number
}

const DEFAULT_MIN_EDGE_COUNT_ON_COLLAPSED_SIDE = 20
const DEFAULT_MAX_EDGE_COUNT_PER_CHILD = 12
const DEFAULT_MIN_TOTAL_EDGE_COUNT = 30
const DEFAULT_MIN_DOMINANT_SIDE_FRACTION = 0.6
const DEFAULT_MIN_AVAILABLE_Z_COUNT = 4
const DEFAULT_MIN_SPLIT_SPAN = 10
const DEFAULT_MAX_CHILDREN = 3
const DEFAULT_MIN_CHILD_DIMENSION = 2
const EDGE_EPSILON = 0.0001

const getBounds = (
  node: Pick<CapacityMeshNode, "center" | "width" | "height">,
) => ({
  minX: node.center.x - node.width / 2,
  maxX: node.center.x + node.width / 2,
  minY: node.center.y - node.height / 2,
  maxY: node.center.y + node.height / 2,
})

const findOverlappingSegment = (
  node: CapacityMeshNode,
  adjNode: CapacityMeshNode,
): {
  start: { x: number; y: number }
  end: { x: number; y: number }
} | null => {
  const xOverlap = {
    start: Math.max(
      node.center.x - node.width / 2,
      adjNode.center.x - adjNode.width / 2,
    ),
    end: Math.min(
      node.center.x + node.width / 2,
      adjNode.center.x + adjNode.width / 2,
    ),
  }

  const yOverlap = {
    start: Math.max(
      node.center.y - node.height / 2,
      adjNode.center.y - adjNode.height / 2,
    ),
    end: Math.min(
      node.center.y + node.height / 2,
      adjNode.center.y + adjNode.height / 2,
    ),
  }

  const xRange = xOverlap.end - xOverlap.start
  const yRange = yOverlap.end - yOverlap.start

  if (xRange < -EDGE_EPSILON || yRange < -EDGE_EPSILON) {
    return null
  }

  if (xRange < yRange) {
    const x = (xOverlap.start + xOverlap.end) / 2
    return {
      start: { x, y: yOverlap.start },
      end: { x, y: yOverlap.end },
    }
  }

  const y = (yOverlap.start + yOverlap.end) / 2
  return {
    start: { x: xOverlap.start, y },
    end: { x: xOverlap.end, y },
  }
}

const getSharedSide = (
  node: CapacityMeshNode,
  adjNode: CapacityMeshNode,
): EdgeSide | null => {
  const overlap = findOverlappingSegment(node, adjNode)
  if (!overlap) return null

  const bounds = getBounds(node)

  if (Math.abs(overlap.start.y - bounds.maxY) < EDGE_EPSILON) return "top"
  if (Math.abs(overlap.start.y - bounds.minY) < EDGE_EPSILON) return "bottom"
  if (Math.abs(overlap.start.x - bounds.minX) < EDGE_EPSILON) return "left"
  if (Math.abs(overlap.start.x - bounds.maxX) < EDGE_EPSILON) return "right"

  return null
}

export class EdgeCollapsedNodeSubdivisionSolver extends BaseSolver {
  public readonly outputNodes: CapacityMeshNode[] = []

  private readonly minEdgeCountOnCollapsedSide: number
  private readonly maxEdgeCountPerChild: number
  private readonly minTotalEdgeCount: number
  private readonly minDominantSideFraction: number
  private readonly minAvailableZCount: number
  private readonly minSplitSpan: number
  private readonly maxChildren: number
  private readonly minChildDimension: number

  constructor(
    private readonly nodes: CapacityMeshNode[],
    private readonly edges: CapacityMeshEdge[],
    opts: EdgeCollapseSubdivisionOptions = {},
  ) {
    super()
    this.minEdgeCountOnCollapsedSide =
      opts.minEdgeCountOnCollapsedSide ??
      DEFAULT_MIN_EDGE_COUNT_ON_COLLAPSED_SIDE
    this.maxEdgeCountPerChild =
      opts.maxEdgeCountPerChild ?? DEFAULT_MAX_EDGE_COUNT_PER_CHILD
    this.minTotalEdgeCount =
      opts.minTotalEdgeCount ?? DEFAULT_MIN_TOTAL_EDGE_COUNT
    this.minDominantSideFraction =
      opts.minDominantSideFraction ?? DEFAULT_MIN_DOMINANT_SIDE_FRACTION
    this.minAvailableZCount =
      opts.minAvailableZCount ?? DEFAULT_MIN_AVAILABLE_Z_COUNT
    this.minSplitSpan = opts.minSplitSpan ?? DEFAULT_MIN_SPLIT_SPAN
    this.maxChildren = opts.maxChildren ?? DEFAULT_MAX_CHILDREN
    this.minChildDimension =
      opts.minChildDimension ?? DEFAULT_MIN_CHILD_DIMENSION
  }

  override getSolverName(): string {
    return "EdgeCollapsedNodeSubdivisionSolver"
  }

  private getSideEdgeCounts(
    node: CapacityMeshNode,
    nodeMap: Map<string, CapacityMeshNode>,
    nodeEdgeMap: Map<string, CapacityMeshEdge[]>,
  ): Record<EdgeSide, number> {
    const counts: Record<EdgeSide, number> = {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }

    for (const edge of nodeEdgeMap.get(node.capacityMeshNodeId) ?? []) {
      const otherNodeId =
        edge.nodeIds[0] === node.capacityMeshNodeId
          ? edge.nodeIds[1]
          : edge.nodeIds[0]
      const otherNode = nodeMap.get(otherNodeId)
      if (!otherNode) continue

      const side = getSharedSide(node, otherNode)
      if (!side) continue

      counts[side] += 1
    }

    return counts
  }

  private getSubdivisionGrid(
    node: CapacityMeshNode,
    nodeMap: Map<string, CapacityMeshNode>,
    nodeEdgeMap: Map<string, CapacityMeshEdge[]>,
  ): { cols: number; rows: number; side: EdgeSide } | null {
    const sideEdgeCounts = this.getSideEdgeCounts(node, nodeMap, nodeEdgeMap)
    const sortedSides = (
      Object.entries(sideEdgeCounts) as Array<[EdgeSide, number]>
    ).sort((a, b) => b[1] - a[1])
    const [dominantSide, dominantCount] = sortedSides[0] ?? []
    const totalEdgeCount = (nodeEdgeMap.get(node.capacityMeshNodeId) ?? [])
      .length

    if (!dominantSide || dominantCount < this.minEdgeCountOnCollapsedSide) {
      return null
    }
    if (totalEdgeCount < this.minTotalEdgeCount) {
      return null
    }
    if (node.availableZ.length < this.minAvailableZCount) {
      return null
    }
    if (dominantCount / totalEdgeCount < this.minDominantSideFraction) {
      return null
    }

    const splittingAlongX = dominantSide === "top" || dominantSide === "bottom"
    const splitSpan = splittingAlongX ? node.width : node.height
    if (splitSpan < this.minSplitSpan) {
      return null
    }
    const maxChildrenBySize = Math.floor(splitSpan / this.minChildDimension)

    if (maxChildrenBySize < 2) {
      return null
    }

    const childCount = Math.min(
      maxChildrenBySize,
      this.maxChildren,
      Math.max(2, Math.ceil(dominantCount / this.maxEdgeCountPerChild)),
    )

    if (childCount < 2) {
      return null
    }

    return splittingAlongX
      ? { cols: childCount, rows: 1, side: dominantSide }
      : { cols: 1, rows: childCount, side: dominantSide }
  }

  private subdivideNode(
    node: CapacityMeshNode,
    grid: { cols: number; rows: number },
  ): CapacityMeshNode[] {
    const childWidth = node.width / grid.cols
    const childHeight = node.height / grid.rows
    const bounds = getBounds(node)

    const childNodes: CapacityMeshNode[] = []

    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        childNodes.push({
          ...node,
          capacityMeshNodeId: `${node.capacityMeshNodeId}__edge_sub_${row}_${col}`,
          center: {
            x: bounds.minX + childWidth * (col + 0.5),
            y: bounds.minY + childHeight * (row + 0.5),
          },
          width: childWidth,
          height: childHeight,
          availableZ: [...node.availableZ],
          _parent: node,
        })
      }
    }

    return childNodes
  }

  override _step() {
    const nodeMap = new Map(
      this.nodes.map((node) => [node.capacityMeshNodeId, node] as const),
    )
    const nodeEdgeMap = getNodeEdgeMap(this.edges)

    let subdividedNodeCount = 0

    for (const node of this.nodes) {
      const grid = this.getSubdivisionGrid(node, nodeMap, nodeEdgeMap)

      if (!grid) {
        this.outputNodes.push(node)
        continue
      }

      subdividedNodeCount += 1
      this.outputNodes.push(...this.subdivideNode(node, grid))
    }

    this.stats = {
      inputNodeCount: this.nodes.length,
      outputNodeCount: this.outputNodes.length,
      subdividedNodeCount,
      minEdgeCountOnCollapsedSide: this.minEdgeCountOnCollapsedSide,
      maxEdgeCountPerChild: this.maxEdgeCountPerChild,
      minTotalEdgeCount: this.minTotalEdgeCount,
      minDominantSideFraction: this.minDominantSideFraction,
      minAvailableZCount: this.minAvailableZCount,
      minSplitSpan: this.minSplitSpan,
      maxChildren: this.maxChildren,
      minChildDimension: this.minChildDimension,
    }
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return {
      rects: this.outputNodes.map((node) => ({
        center: node.center,
        width: node.width,
        height: node.height,
        label: `${node.capacityMeshNodeId}\n${node.width.toFixed(2)}x${node.height.toFixed(2)}`,
        layer: `z${node.availableZ.join(",")}`,
        fill: "rgba(255, 153, 0, 0.08)",
        stroke: "rgba(200, 90, 0, 0.5)",
      })),
    }
  }
}

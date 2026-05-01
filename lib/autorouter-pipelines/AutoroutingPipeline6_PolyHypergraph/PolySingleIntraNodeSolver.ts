import type { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "lib/solvers/BaseSolver"
import { HyperSingleIntraNodeSolver } from "lib/solvers/HyperHighDensitySolver/HyperSingleIntraNodeSolver"
import type {
  HighDensityIntraNodeRoute,
  NodeWithPortPoints,
  PortPoint,
} from "lib/types/high-density-types"
import { combineVisualizations } from "lib/utils/combineVisualizations"
import {
  computeProjectedRect,
  projectPointToRectBoundary,
  type ProjectedRect,
} from "./geometry"
import type { PolyNodeWithPortPoints } from "./types"

type ProjectedPortRecord = {
  projected: PortPoint
  original: PortPoint
}

type ProjectionAttempt = {
  label: string
  projectedRect: ProjectedRect
  effort: number | undefined
}

export class PolySingleIntraNodeSolver extends BaseSolver {
  override getSolverName(): string {
    return "PolySingleIntraNodeSolver"
  }

  highDensitySolver!: HyperSingleIntraNodeSolver
  projectedNode!: NodeWithPortPoints
  nodeWithPortPoints!: PolyNodeWithPortPoints
  solvedNodeWithPortPoints?: PolyNodeWithPortPoints
  solvedRoutes: HighDensityIntraNodeRoute[] = []
  projectedPorts: ProjectedPortRecord[] = []
  projectionAttempts: ProjectionAttempt[]
  projectionAttemptIndex = 0
  projectionAttemptErrors: string[] = []
  successfulProjectionFallbackLabel?: string

  constructor(
    public params: {
      nodeWithPortPoints: PolyNodeWithPortPoints
      colorMap?: Record<string, string>
      connMap?: ConnectivityMap
      viaDiameter?: number
      traceWidth?: number
      obstacleMargin?: number
      effort?: number
      minProjectedRectDimension?: number
    },
  ) {
    super()
    const { nodeWithPortPoints } = params
    if (!nodeWithPortPoints.projectedRect) {
      throw new Error("Poly node is missing projectedRect")
    }

    this.projectionAttempts = this.getProjectionAttempts()
    this.startProjectionAttempt(0)
  }

  private getProjectionAttempts(): ProjectionAttempt[] {
    const baseEffort = this.params.effort
    const node = this.params.nodeWithPortPoints
    const minProjectedRectDimension =
      this.params.minProjectedRectDimension ??
      (this.params.traceWidth ?? 0.15) * 3

    return [
      {
        label: "initial",
        projectedRect: node.projectedRect!,
        effort: baseEffort,
      },
      ...[1, 4, 8].map((equivalentAreaExpansionFactor) => ({
        label: `equivalent-area-${equivalentAreaExpansionFactor}`,
        projectedRect: computeProjectedRect(
          node.polygon,
          equivalentAreaExpansionFactor,
          minProjectedRectDimension,
        ),
        effort: baseEffort,
      })),
      {
        label: "initial-effort-x2",
        projectedRect: node.projectedRect!,
        effort: (baseEffort ?? 1) * 2,
      },
    ]
  }

  private getNodeForProjectionAttempt(
    attempt: ProjectionAttempt,
  ): PolyNodeWithPortPoints {
    return {
      ...this.params.nodeWithPortPoints,
      center: attempt.projectedRect.center,
      width: attempt.projectedRect.width,
      height: attempt.projectedRect.height,
      portPoints: this.params.nodeWithPortPoints.portPoints,
      projectedRect: attempt.projectedRect,
    }
  }

  private startProjectionAttempt(index: number) {
    this.projectionAttemptIndex = index
    const attempt = this.projectionAttempts[index]!
    const nodeWithPortPoints = this.getNodeForProjectionAttempt(attempt)
    this.nodeWithPortPoints = nodeWithPortPoints

    this.projectedPorts = nodeWithPortPoints.portPoints.map((portPoint) => {
      const projectedPoint = projectPointToRectBoundary(
        portPoint,
        nodeWithPortPoints.projectedRect!,
      )
      return {
        original: portPoint,
        projected: {
          ...portPoint,
          x: projectedPoint.x,
          y: projectedPoint.y,
        },
      }
    })
    const projectedRect = nodeWithPortPoints.projectedRect!
    this.projectedNode = {
      capacityMeshNodeId: nodeWithPortPoints.capacityMeshNodeId,
      center: projectedRect.center,
      width: projectedRect.width,
      height: projectedRect.height,
      availableZ: nodeWithPortPoints.availableZ,
      portPoints: this.projectedPorts.map(({ projected }) => projected),
    }
    this.highDensitySolver = new HyperSingleIntraNodeSolver({
      nodeWithPortPoints: this.projectedNode,
      colorMap: this.params.colorMap,
      connMap: this.params.connMap,
      viaDiameter: this.params.viaDiameter,
      traceWidth: this.params.traceWidth,
      obstacleMargin: this.params.obstacleMargin,
      effort: attempt.effort,
    })
    this.activeSubSolver = this.highDensitySolver
    this.MAX_ITERATIONS = this.highDensitySolver.MAX_ITERATIONS + 1_000
  }

  _step() {
    const attempt = this.projectionAttempts[this.projectionAttemptIndex]!
    this.highDensitySolver.step()
    this.progress =
      (this.projectionAttemptIndex + this.highDensitySolver.progress) /
      this.projectionAttempts.length
    this.stats = {
      ...this.highDensitySolver.stats,
      polyProjectionAttempt: attempt.label,
      polyProjectionAttemptIndex: this.projectionAttemptIndex,
      polyProjectionAttemptCount: this.projectionAttempts.length,
    }

    if (this.highDensitySolver.solved) {
      this.solvedRoutes = this.highDensitySolver.solvedRoutes
      this.solvedNodeWithPortPoints = this.nodeWithPortPoints
      this.successfulProjectionFallbackLabel = attempt.label
      this.stats = {
        ...this.stats,
        polyProjectionFallback: attempt.label,
        polyProjectionFallbackUsed: attempt.label !== "initial",
      }
      this.solved = true
      this.activeSubSolver = null
    } else if (this.highDensitySolver.failed) {
      this.projectionAttemptErrors.push(
        `${attempt.label}: ${this.highDensitySolver.error}`,
      )
      const nextAttemptIndex = this.projectionAttemptIndex + 1
      if (nextAttemptIndex < this.projectionAttempts.length) {
        this.startProjectionAttempt(nextAttemptIndex)
        return
      }

      this.error = `All solvers failed for projection attempts. ${this.projectionAttemptErrors.join(
        " | ",
      )}`
      this.failed = true
      this.activeSubSolver = null
    }
  }

  getConstructorParams() {
    return [this.params] as const
  }

  visualize(): GraphicsObject {
    const node = this.nodeWithPortPoints ?? this.params.nodeWithPortPoints
    const projectedRect = node.projectedRect
    const polygonViz: GraphicsObject = {
      polygons: [
        {
          points: this.params.nodeWithPortPoints.polygon,
          fill: "rgba(60, 160, 220, 0.10)",
          stroke: "rgba(40, 90, 150, 0.7)",
          label: `${node.capacityMeshNodeId} polygon`,
        },
        ...(projectedRect
          ? [
              {
                points: projectedRect.targetQuad,
                fill: "rgba(255, 165, 0, 0.08)",
                stroke: "rgba(255, 120, 0, 0.65)",
                label: `${node.capacityMeshNodeId} distortion target`,
              },
            ]
          : []),
      ],
      rects: projectedRect
        ? [
            {
              center: projectedRect.center,
              width: projectedRect.width,
              height: projectedRect.height,
              ccwRotationDegrees: projectedRect.ccwRotationDegrees,
              fill: "rgba(255, 165, 0, 0.14)",
              stroke: "rgba(255, 120, 0, 0.8)",
              label: `${node.capacityMeshNodeId} projectedRect`,
            },
          ]
        : [],
      points: [
        ...node.portPoints.map((point) => ({
          x: point.x,
          y: point.y,
          color: "rgba(0, 80, 160, 0.85)",
          label: `${point.connectionName} original`,
        })),
        ...this.projectedPorts.map(({ projected }) => ({
          x: projected.x,
          y: projected.y,
          color: "rgba(255, 120, 0, 0.85)",
          label: `${projected.connectionName} projected`,
        })),
      ],
    }

    return combineVisualizations(polygonViz, this.highDensitySolver.visualize())
  }
}

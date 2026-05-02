import { expect, test } from "bun:test"
import * as dataset01 from "@tscircuit/autorouting-dataset-01"
import { AutoroutingPipelineSolver6 } from "lib/autorouter-pipelines/AutoroutingPipeline6_PolyHypergraph/AutoroutingPipelineSolver6_PolyHypergraph"
import type { SimpleRouteJson } from "lib/types"
import { getLastStepSvg } from "tests/fixtures/getLastStepSvg"

const round = (value: unknown) =>
  typeof value === "number" ? Number(value.toFixed(4)) : value

const cleanPoint = (point: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(point).map(([key, value]) => [key, round(value)]),
  )

const getBoundaryOrder = (failedSolver: any) => {
  const node = failedSolver.projectedNode
  const rect = failedSolver.params.nodeWithPortPoints.projectedRect
  const minX = rect.center.x - rect.width / 2
  const maxX = rect.center.x + rect.width / 2
  const minY = rect.center.y - rect.height / 2
  const maxY = rect.center.y + rect.height / 2
  const eps = 1e-3

  const getEdgeAndOrder = (point: any) => {
    if (Math.abs(point.y - minY) < eps) {
      return { edge: "bottom", order: point.x - minX }
    }
    if (Math.abs(point.x - maxX) < eps) {
      return { edge: "right", order: rect.width + point.y - minY }
    }
    if (Math.abs(point.y - maxY) < eps) {
      return {
        edge: "top",
        order: rect.width + rect.height + maxX - point.x,
      }
    }
    if (Math.abs(point.x - minX) < eps) {
      return {
        edge: "left",
        order: 2 * rect.width + rect.height + maxY - point.y,
      }
    }
    return { edge: "interior", order: Number.POSITIVE_INFINITY }
  }

  return node.portPoints
    .map((point: any) => ({
      ...getEdgeAndOrder(point),
      z: point.z,
      connectionName: point.connectionName,
      rootConnectionName: point.rootConnectionName,
      portPointId: point.portPointId,
      x: round(point.x),
      y: round(point.y),
    }))
    .sort((a: any, b: any) => a.order - b.order)
    .map(({ order: _order, ...point }: any, index: number) => ({
      index,
      ...point,
    }))
}

const getInterleavedConnectionPairs = (
  boundaryOrder: Array<{ connectionName: string }>,
) => {
  const connectionNames = [
    ...new Set(boundaryOrder.map((point) => point.connectionName)),
  ]
  const pairs = connectionNames.map((connectionName) => ({
    connectionName,
    indices: boundaryOrder
      .map((point, index) =>
        point.connectionName === connectionName ? index : null,
      )
      .filter((index) => index !== null) as number[],
  }))

  const interleavedPairs: Array<[string, string]> = []
  for (let i = 0; i < pairs.length; i++) {
    for (let j = i + 1; j < pairs.length; j++) {
      const [a, b] = pairs[i]!.indices
      const [c, d] = pairs[j]!.indices
      if (
        (a! < c! && c! < b! && b! < d!) ||
        (c! < a! && a! < d! && d! < b!)
      ) {
        interleavedPairs.push([
          pairs[i]!.connectionName,
          pairs[j]!.connectionName,
        ])
      }
    }
  }

  return interleavedPairs
}

const getOriginalPolygonBoundaryOrder = (failedSolver: any) => {
  const node = failedSolver.params.nodeWithPortPoints

  const pointToSegmentDistanceSquared = (
    point: { x: number; y: number },
    a: { x: number; y: number },
    b: { x: number; y: number },
  ) => {
    const vx = b.x - a.x
    const vy = b.y - a.y
    const lenSquared = vx * vx + vy * vy
    const t =
      lenSquared > 0
        ? Math.max(
            0,
            Math.min(
              1,
              ((point.x - a.x) * vx + (point.y - a.y) * vy) / lenSquared,
            ),
          )
        : 0
    const projected = { x: a.x + vx * t, y: a.y + vy * t }
    const dx = point.x - projected.x
    const dy = point.y - projected.y
    return { t, distanceSquared: dx * dx + dy * dy }
  }

  const getEdgeAndOrder = (point: { x: number; y: number }) => {
    let accumulatedLength = 0
    let best = {
      edge: -1,
      t: 0,
      distanceSquared: Number.POSITIVE_INFINITY,
      order: Number.POSITIVE_INFINITY,
    }

    for (let i = 0; i < node.polygon.length; i++) {
      const a = node.polygon[i]!
      const b = node.polygon[(i + 1) % node.polygon.length]!
      const edgeLength = Math.hypot(b.x - a.x, b.y - a.y)
      const projection = pointToSegmentDistanceSquared(point, a, b)
      if (projection.distanceSquared < best.distanceSquared) {
        best = {
          edge: i,
          t: projection.t,
          distanceSquared: projection.distanceSquared,
          order: accumulatedLength + projection.t * edgeLength,
        }
      }
      accumulatedLength += edgeLength
    }

    return best
  }

  return node.portPoints
    .map((point: any) => ({
      ...getEdgeAndOrder(point),
      z: point.z,
      connectionName: point.connectionName,
      rootConnectionName: point.rootConnectionName,
      portPointId: point.portPointId,
      x: round(point.x),
      y: round(point.y),
    }))
    .sort((a: any, b: any) => a.order - b.order)
    .map(
      (
        { order: _order, distanceSquared, t, ...point }: any,
        index: number,
      ) => ({
        index,
        t: round(t),
        boundaryDistance: round(Math.sqrt(distanceSquared)),
        ...point,
      }),
    )
}

const getCrossingGraph = (
  interleavedPairs: Array<[string, string]>,
  boundaryOrder: Array<{ connectionName: string; z: number }>,
) => {
  const connectionNames = [
    ...new Set(boundaryOrder.map((point) => point.connectionName)),
  ]
  const endpointsByConnection = new Map(
    connectionNames.map((connectionName) => [
      connectionName,
      boundaryOrder
        .filter((point) => point.connectionName === connectionName)
        .map((point) => point.z),
    ]),
  )

  const degreeByConnection = new Map(
    connectionNames.map((connectionName) => [connectionName, 0]),
  )
  for (const [a, b] of interleavedPairs) {
    degreeByConnection.set(a, (degreeByConnection.get(a) ?? 0) + 1)
    degreeByConnection.set(b, (degreeByConnection.get(b) ?? 0) + 1)
  }

  return connectionNames.map((connectionName) => ({
    connectionName,
    endpointZ: endpointsByConnection.get(connectionName),
    crossingDegree: degreeByConnection.get(connectionName),
    crosses: interleavedPairs
      .filter((pair) => pair.includes(connectionName))
      .map(([a, b]) => (a === connectionName ? b : a)),
  }))
}

test("pipeline6 dataset01 circuit104 failure visual snapshot", () => {
  const circuit104 = (dataset01 as Record<string, unknown>)
    .circuit104 as SimpleRouteJson
  const solver = new AutoroutingPipelineSolver6(structuredClone(circuit104), {
    effort: 1,
  })

  solver.solve()

  const failedPolySolver = solver.highDensityRouteSolver?.failedSolvers[0]
  if (failedPolySolver) {
    const node = failedPolySolver.params.nodeWithPortPoints
    const boundaryOrder = getBoundaryOrder(failedPolySolver)
    const originalBoundaryOrder =
      getOriginalPolygonBoundaryOrder(failedPolySolver)
    const interleavedPairs =
      getInterleavedConnectionPairs(originalBoundaryOrder)
    const crossingGraph = getCrossingGraph(
      interleavedPairs,
      originalBoundaryOrder,
    )
    const supervisedFailures =
      failedPolySolver.highDensitySolver.supervisedSolvers
        ?.map((supervisedSolver: any) => ({
          solver: supervisedSolver.solver.constructor.name,
          progress: round(supervisedSolver.solver.progress ?? 0),
          iterations: supervisedSolver.solver.iterations,
          error: supervisedSolver.solver.error,
          hyperParameters: supervisedSolver.hyperParameters,
          solvedRoutes: Array.isArray(supervisedSolver.solver.solvedRoutes)
            ? supervisedSolver.solver.solvedRoutes.map(
                (route: any) => route?.connectionName,
              )
            : undefined,
          remainingConnections: Array.isArray(
            supervisedSolver.solver.unsolvedConnections,
          )
            ? supervisedSolver.solver.unsolvedConnections.map(
                (connection: any) => connection.connectionName,
              )
            : undefined,
          failedSubSolvers: Array.isArray(
            supervisedSolver.solver.failedSubSolvers,
          )
            ? supervisedSolver.solver.failedSubSolvers.map(
                (failedSubSolver: any) => ({
                  connectionName: failedSubSolver.connectionName,
                  error: failedSubSolver.error,
                  iterations: failedSubSolver.iterations,
                  obstacleRoutes: Array.isArray(
                    failedSubSolver.obstacleRoutes,
                  )
                    ? failedSubSolver.obstacleRoutes.map(
                        (route: any) => route.connectionName,
                      )
                    : undefined,
                  futureConnections: Array.isArray(
                    failedSubSolver.futureConnections,
                  )
                    ? failedSubSolver.futureConnections.map(
                        (connection: any) => connection.connectionName,
                      )
                    : undefined,
                }),
              )
            : undefined,
        }))
        .sort((a: any, b: any) => b.progress - a.progress)
        .slice(0, 8)

    console.info(
      "pipeline6 circuit104 failure diagnostics",
      JSON.stringify(
        {
          failedNode: node.capacityMeshNodeId,
          polygon: node.polygon.map(cleanPoint),
          projectedRect: {
            center: cleanPoint(node.projectedRect.center),
            width: round(node.projectedRect.width),
            height: round(node.projectedRect.height),
            rotation: round(node.projectedRect.ccwRotationDegrees),
          },
          originalBoundaryOrder,
          boundaryOrder,
          interleavedPairCount: interleavedPairs.length,
          interleavedPairs,
          crossingGraph,
          supervisedFailures,
        },
        null,
        2,
      ),
    )
  }

  // expect(solver.solved).toBe(false)
  // expect(solver.failed).toBe(true)
  // expect(solver.error).toContain("free-81")
  expect(getLastStepSvg(solver.visualize())).toMatchSvgSnapshot(
    import.meta.path,
  )
}, 120_000)

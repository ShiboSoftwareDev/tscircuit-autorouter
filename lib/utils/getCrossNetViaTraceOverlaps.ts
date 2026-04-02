import type { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { HighDensityIntraNodeRoute } from "lib/types/high-density-types"

type SegmentPoint = { x: number; y: number; z?: number }

export type CrossNetViaTraceOverlap = {
  viaRoute: string
  segmentRoute: string
  via: { x: number; y: number }
  segmentStart: SegmentPoint
  segmentEnd: SegmentPoint
  distance: number
  clearance: number
}

const pointToSegmentDistanceSq = (
  point: SegmentPoint,
  start: SegmentPoint,
  end: SegmentPoint,
) => {
  const segmentLengthSq = (start.x - end.x) ** 2 + (start.y - end.y) ** 2
  if (segmentLengthSq === 0) {
    return (point.x - start.x) ** 2 + (point.y - start.y) ** 2
  }

  let t =
    ((point.x - start.x) * (end.x - start.x) +
      (point.y - start.y) * (end.y - start.y)) /
    segmentLengthSq
  t = Math.max(0, Math.min(1, t))

  const projection = {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  }

  return (point.x - projection.x) ** 2 + (point.y - projection.y) ** 2
}

const arePointsCoincident = (a: SegmentPoint, b: SegmentPoint) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6

const areRoutesConnected = (
  routeA: HighDensityIntraNodeRoute,
  routeB: HighDensityIntraNodeRoute,
  connMap?: Pick<ConnectivityMap, "areIdsConnected">,
) => {
  if (connMap) {
    return connMap.areIdsConnected(routeA.connectionName, routeB.connectionName)
  }

  const routeARoot = routeA.rootConnectionName ?? routeA.connectionName
  const routeBRoot = routeB.rootConnectionName ?? routeB.connectionName

  return (
    routeA.connectionName === routeB.connectionName || routeARoot === routeBRoot
  )
}

export const getCrossNetViaTraceOverlaps = (
  hdRoutes: ReadonlyArray<HighDensityIntraNodeRoute>,
  connMap?: Pick<ConnectivityMap, "areIdsConnected">,
): Array<CrossNetViaTraceOverlap> => {
  const overlaps: Array<CrossNetViaTraceOverlap> = []

  for (const viaRoute of hdRoutes) {
    for (const via of viaRoute.vias) {
      for (const segmentRoute of hdRoutes) {
        if (areRoutesConnected(viaRoute, segmentRoute, connMap)) {
          continue
        }

        for (let index = 0; index < segmentRoute.route.length - 1; index++) {
          const segmentStart = segmentRoute.route[index]
          const segmentEnd = segmentRoute.route[index + 1]

          if (segmentStart.z !== segmentEnd.z) continue
          if (
            arePointsCoincident(via, segmentStart) ||
            arePointsCoincident(via, segmentEnd)
          ) {
            continue
          }

          const clearance =
            viaRoute.viaDiameter / 2 + segmentRoute.traceThickness / 2
          const distanceSq = pointToSegmentDistanceSq(
            via,
            segmentStart,
            segmentEnd,
          )

          if (distanceSq < (clearance - 1e-6) ** 2) {
            overlaps.push({
              viaRoute: viaRoute.connectionName,
              segmentRoute: segmentRoute.connectionName,
              via,
              segmentStart,
              segmentEnd,
              distance: Math.sqrt(distanceSq),
              clearance,
            })
          }
        }
      }
    }
  }

  return overlaps
}

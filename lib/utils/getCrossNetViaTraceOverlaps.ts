import type { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { HighDensityRoute } from "lib/types/high-density-types"

type RoutePoint = { x: number; y: number; z?: number }

export type CrossNetViaTraceOverlap = {
  viaRoute: string
  segmentRoute: string
  via: { x: number; y: number }
  segmentStart: RoutePoint
  segmentEnd: RoutePoint
  distance: number
  clearance: number
}

const pointToSegmentDistanceSq = (
  point: RoutePoint,
  start: RoutePoint,
  end: RoutePoint,
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

const areCoincident = (a: RoutePoint, b: RoutePoint) =>
  Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6

export const getCrossNetViaTraceOverlaps = (
  routes: ReadonlyArray<HighDensityRoute>,
  connMap: Pick<ConnectivityMap, "areIdsConnected">,
): Array<CrossNetViaTraceOverlap> => {
  const overlaps: Array<CrossNetViaTraceOverlap> = []

  for (const viaRoute of routes) {
    for (const via of viaRoute.vias) {
      for (const segmentRoute of routes) {
        if (
          connMap.areIdsConnected(
            viaRoute.connectionName,
            segmentRoute.connectionName,
          )
        ) {
          continue
        }

        for (let i = 0; i < segmentRoute.route.length - 1; i++) {
          const segmentStart = segmentRoute.route[i]
          const segmentEnd = segmentRoute.route[i + 1]

          if (segmentStart.z !== segmentEnd.z) continue
          if (
            areCoincident(via, segmentStart) ||
            areCoincident(via, segmentEnd)
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

export const getCrossNetViaTraceOverlapSignatures = (
  routes: ReadonlyArray<HighDensityRoute>,
  connMap: Pick<ConnectivityMap, "areIdsConnected">,
): Set<string> =>
  new Set(
    getCrossNetViaTraceOverlaps(routes, connMap).map((overlap) =>
      [
        overlap.viaRoute,
        overlap.segmentRoute,
        overlap.via.x.toFixed(6),
        overlap.via.y.toFixed(6),
        overlap.segmentStart.x.toFixed(6),
        overlap.segmentStart.y.toFixed(6),
        overlap.segmentEnd.x.toFixed(6),
        overlap.segmentEnd.y.toFixed(6),
      ].join("|"),
    ),
  )

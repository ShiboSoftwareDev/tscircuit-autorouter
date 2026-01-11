import { segmentToSegmentMinDistance } from "@tscircuit/math-utils"

interface Point2D {
  x: number
  y: number
}

export interface Segment {
  start: Point2D
  end: Point2D
}

export interface ComputeDrawPositionInput {
  cursorPosition: Point2D
  lastCursorPosition: Point2D
  collidingSegments: Segment[]
  keepoutRadius: number
  /** Previous draw position - used to prefer continuing in the same direction */
  lastDrawPosition?: Point2D
}

/**
 * Gets minimum clearance from a projected segment to all obstacle segments.
 * Projects a segment from pos in the direction of dir with length keepoutRadius,
 * then computes the minimum segment-to-segment distance.
 */
function getMinClearance(params: {
  pos: Point2D
  segments: Segment[]
  dir: { x: number; y: number }
  keepoutRadius: number
}): number {
  const { pos, segments, dir, keepoutRadius } = params
  let minClearance = Infinity

  // Project a segment centered on pos in the direction of dir with length keepoutRadius
  const halfLength = keepoutRadius / 4
  const segmentStart = {
    x: pos.x - dir.x * halfLength,
    y: pos.y - dir.y * halfLength,
  }
  const segmentEnd = {
    x: pos.x + dir.x * halfLength,
    y: pos.y + dir.y * halfLength,
  }

  for (const seg of segments) {
    const dist = segmentToSegmentMinDistance(
      segmentStart,
      segmentEnd,
      seg.start,
      seg.end,
    )
    minClearance = Math.min(minClearance, dist)
  }
  return minClearance
}

/**
 * Checks if two line segments intersect
 */
function segmentsIntersect(
  a1: Point2D,
  a2: Point2D,
  b1: Point2D,
  b2: Point2D,
): boolean {
  const d1 = direction(b1, b2, a1)
  const d2 = direction(b1, b2, a2)
  const d3 = direction(a1, a2, b1)
  const d4 = direction(a1, a2, b2)

  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true
  }

  const eps = 0.0001
  if (Math.abs(d1) < eps && onSegment(b1, b2, a1)) return true
  if (Math.abs(d2) < eps && onSegment(b1, b2, a2)) return true
  if (Math.abs(d3) < eps && onSegment(a1, a2, b1)) return true
  if (Math.abs(d4) < eps && onSegment(a1, a2, b2)) return true

  return false
}

function direction(a: Point2D, b: Point2D, c: Point2D): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y)
}

function onSegment(a: Point2D, b: Point2D, c: Point2D): boolean {
  return (
    c.x >= Math.min(a.x, b.x) - 0.0001 &&
    c.x <= Math.max(a.x, b.x) + 0.0001 &&
    c.y >= Math.min(a.y, b.y) - 0.0001 &&
    c.y <= Math.max(a.y, b.y) + 0.0001
  )
}

/**
 * Checks if the path from cursor to position is clear (no segments in between)
 */
function isPathClear(
  cursor: Point2D,
  pos: Point2D,
  segments: Segment[],
): boolean {
  for (const seg of segments) {
    if (segmentsIntersect(cursor, pos, seg.start, seg.end)) {
      return false
    }
  }
  return true
}

/**
 * Computes an optimal draw position that maintains keepoutRadius from all segments.
 *
 * The draw position is constrained to:
 * 1. Lie on the barrier line (perpendicular to trace direction, passing through cursor)
 * 2. Stay within keepoutRadius distance from the cursor position
 *
 * Within these constraints, it finds the position that maximizes the minimum
 * clearance to all colliding segments. This provides the "safest" position
 * even when a fully valid position (clearance >= keepoutRadius) isn't possible.
 *
 * @param input.cursorPosition - Current position along the trace
 * @param input.lastCursorPosition - Previous position (used to determine trace direction)
 * @param input.collidingSegments - Line segments representing obstacle edges and trace outlines
 * @param input.keepoutRadius - Minimum distance to maintain from obstacles (also max distance from cursor)
 *
 * @returns The optimal draw position on the barrier line within keepoutRadius, or null if cursor is valid
 */
export function computeDrawPositionFromCollisions(
  input: ComputeDrawPositionInput,
): Point2D | null {
  const {
    cursorPosition,
    lastCursorPosition,
    collidingSegments,
    keepoutRadius,
    lastDrawPosition,
  } = input
  if (collidingSegments.length === 0) return null

  const epsilon = 0.0001

  // Calculate trace direction
  const tdx = cursorPosition.x - lastCursorPosition.x
  const tdy = cursorPosition.y - lastCursorPosition.y
  const tLen = Math.sqrt(tdx * tdx + tdy * tdy)
  const traceDir =
    tLen > epsilon ? { x: tdx / tLen, y: tdy / tLen } : { x: 1, y: 0 }

  // Barrier direction (perpendicular to trace)
  const barrierDir = { x: -traceDir.y, y: traceDir.x }

  // Determine preferred direction based on where last draw position was
  // relative to the cursor (positive = same side as lastDrawPosition)
  let preferPositive = true
  if (lastDrawPosition) {
    const drawOffsetX = lastDrawPosition.x - cursorPosition.x
    const drawOffsetY = lastDrawPosition.y - cursorPosition.y
    // Project the draw offset onto the barrier direction
    const projectedOffset =
      drawOffsetX * barrierDir.x + drawOffsetY * barrierDir.y
    preferPositive = projectedOffset >= 0
  }

  // Check if cursor position itself is valid
  const cursorClearance = getMinClearance({
    pos: cursorPosition,
    segments: collidingSegments,
    dir: traceDir,
    keepoutRadius,
  })

  if (cursorClearance >= keepoutRadius) {
    return null // No adjustment needed
  }

  // Search outward from cursor along barrier line in both directions
  // Stop as soon as we find a valid position (minimal displacement)
  const steps = 20

  // Search both directions simultaneously, increasing distance from cursor
  for (let i = 1; i <= steps; i++) {
    const d = (i / steps) * keepoutRadius

    // Test positive direction
    const posPlus = {
      x: cursorPosition.x + barrierDir.x * d,
      y: cursorPosition.y + barrierDir.y * d,
    }
    const clearancePlus = getMinClearance({
      pos: posPlus,
      segments: collidingSegments,
      dir: traceDir,
      keepoutRadius,
    })

    // Test negative direction
    const posMinus = {
      x: cursorPosition.x - barrierDir.x * d,
      y: cursorPosition.y - barrierDir.y * d,
    }
    const clearanceMinus = getMinClearance({
      pos: posMinus,
      segments: collidingSegments,
      dir: traceDir,
      keepoutRadius,
    })

    // Return the first valid position found (minimal displacement)
    // Position must have sufficient clearance AND path from cursor must be clear
    const validPlus =
      clearancePlus >= keepoutRadius &&
      isPathClear(cursorPosition, posPlus, collidingSegments)
    const validMinus =
      clearanceMinus >= keepoutRadius &&
      isPathClear(cursorPosition, posMinus, collidingSegments)

    if (validPlus && validMinus) {
      return clearancePlus >= clearanceMinus ? posPlus : posMinus
    }
    if (validPlus) return posPlus
    if (validMinus) return posMinus
  }

  // No valid position found - search for the position with maximum clearance
  // along the barrier line. This finds the center of the gap between obstacles.
  //
  // Strategy: Search outward from cursor in both directions, find the first
  // local maximum in each direction, then pick the better one.
  // Only consider reachable positions (paths that don't cross segments).
  //
  // If we have a previous draw position, extend search range to cover it
  let searchRange = keepoutRadius
  if (lastDrawPosition) {
    const dx = lastDrawPosition.x - cursorPosition.x
    const dy = lastDrawPosition.y - cursorPosition.y
    const prevDrawDist = Math.sqrt(dx * dx + dy * dy)
    // Extend search range to at least cover where we were, plus some margin
    searchRange = Math.max(searchRange, prevDrawDist * 1.2)
  }
  const searchSteps = 60

  // Sample clearance at each position
  const samples: Array<{
    pos: Point2D
    clearance: number
    dist: number
    pathClear: boolean
    index: number
  }> = []
  for (let i = -searchSteps; i <= searchSteps; i++) {
    const d = (i / searchSteps) * searchRange
    const testPos = {
      x: cursorPosition.x + barrierDir.x * d,
      y: cursorPosition.y + barrierDir.y * d,
    }
    const clearance = getMinClearance({
      pos: testPos,
      segments: collidingSegments,
      dir: traceDir,
      keepoutRadius,
    })
    const pathClear = isPathClear(cursorPosition, testPos, collidingSegments)
    samples.push({
      pos: testPos,
      clearance,
      dist: Math.abs(d),
      pathClear,
      index: i,
    })
  }

  // Filter to reachable positions (paths don't cross segments)
  const reachableSamples = samples.filter((s) => s.pathClear)

  // Find center index in all samples array
  const centerIdx = samples.findIndex((s) => s.index === 0)
  const actualCenterIdx =
    centerIdx >= 0 ? centerIdx : Math.floor(samples.length / 2)

  // Search ALL samples to find local maxima in both directions
  // This ensures we find gaps even if path to them crosses segments
  // Also track the best sample in each direction for fallback
  let posMax: (typeof samples)[0] | null = null
  let posBest: (typeof samples)[0] | null = null
  for (let i = actualCenterIdx + 1; i < samples.length - 1; i++) {
    const prev = samples[i - 1]!
    const curr = samples[i]!
    const next = samples[i + 1]!

    if (!posBest || curr.clearance > posBest.clearance) {
      posBest = curr
    }

    if (curr.clearance >= prev.clearance && curr.clearance >= next.clearance) {
      posMax = curr
      break // Take the first (closest) local max
    }
  }

  let negMax: (typeof samples)[0] | null = null
  let negBest: (typeof samples)[0] | null = null
  for (let i = actualCenterIdx - 1; i > 0; i--) {
    const prev = samples[i - 1]!
    const curr = samples[i]!
    const next = samples[i + 1]!

    if (!negBest || curr.clearance > negBest.clearance) {
      negBest = curr
    }

    if (curr.clearance >= prev.clearance && curr.clearance >= next.clearance) {
      negMax = curr
      break // Take the first (closest) local max
    }
  }

  // If no local max found but one direction has much better clearance than the other,
  // use the best sample from the better direction
  const centerSampleClearance =
    samples.find((s) => s.index === 0)?.clearance ?? 0
  if (!posMax && posBest && posBest.clearance > centerSampleClearance) {
    // Positive direction has better clearance than center, use it
    if (!negMax || posBest.clearance > (negMax.clearance ?? 0)) {
      posMax = posBest
    }
  }
  if (!negMax && negBest && negBest.clearance > centerSampleClearance) {
    // Negative direction has better clearance than center, use it
    if (!posMax || negBest.clearance > (posMax.clearance ?? 0)) {
      negMax = negBest
    }
  }

  // Also search reachable samples for local maxima (prefer these if available)
  let reachablePosMax: (typeof samples)[0] | null = null
  let reachableNegMax: (typeof samples)[0] | null = null

  if (reachableSamples.length > 0) {
    const reachableCenterIdx = reachableSamples.findIndex((s) => s.index === 0)
    const actualReachableCenterIdx =
      reachableCenterIdx >= 0
        ? reachableCenterIdx
        : Math.floor(reachableSamples.length / 2)

    for (
      let i = actualReachableCenterIdx + 1;
      i < reachableSamples.length - 1;
      i++
    ) {
      const prev = reachableSamples[i - 1]!
      const curr = reachableSamples[i]!
      const next = reachableSamples[i + 1]!
      if (
        curr.clearance >= prev.clearance &&
        curr.clearance >= next.clearance
      ) {
        reachablePosMax = curr
        break
      }
    }

    for (let i = actualReachableCenterIdx - 1; i > 0; i--) {
      const prev = reachableSamples[i - 1]!
      const curr = reachableSamples[i]!
      const next = reachableSamples[i + 1]!
      if (
        curr.clearance >= prev.clearance &&
        curr.clearance >= next.clearance
      ) {
        reachableNegMax = curr
        break
      }
    }
  }

  const centerSample = samples.find((s) => s.index === 0)

  // Build candidates list: prefer reachable maxima, but include unreachable
  // if they have significantly better clearance
  const allMaxima = [
    posMax,
    negMax,
    reachablePosMax,
    reachableNegMax,
    centerSample,
  ].filter((c): c is NonNullable<typeof c> => c !== null && c !== undefined)

  // Remove duplicates (same position might be found multiple times)
  const seen = new Set<string>()
  const candidates = allMaxima.filter((c) => {
    const key = `${c.pos.x.toFixed(6)},${c.pos.y.toFixed(6)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (candidates.length === 0) {
    // No local maxima found - fall back to sample with best clearance
    let bestSample = samples[0]
    if (!bestSample) return null
    for (const s of samples) {
      if (s.clearance > bestSample.clearance) {
        bestSample = s
      }
    }
    const movedDist = Math.sqrt(
      (bestSample.pos.x - cursorPosition.x) ** 2 +
        (bestSample.pos.y - cursorPosition.y) ** 2,
    )
    return movedDist > epsilon ? bestSample.pos : null
  }

  // Decision logic depends on cursor state:
  // - If cursor has very low clearance (trapped inside obstacle), allow crossing
  //   segments to escape - pick best clearance regardless of reachability
  // - If cursor has moderate clearance (in a gap), prefer reachable positions
  //   to avoid crossing segments unnecessarily
  const cursorTrapped = cursorClearance < keepoutRadius * 0.15

  // Helper to check if a candidate is in the preferred direction AND
  // at least as far from cursor as our previous draw position was
  const getDistFromCursor = (c: (typeof candidates)[0]) => {
    const dx = c.pos.x - cursorPosition.x
    const dy = c.pos.y - cursorPosition.y
    return dx * barrierDir.x + dy * barrierDir.y // signed distance along barrier
  }

  // Calculate how far the previous draw was from current cursor
  let prevDrawOffset = 0
  if (lastDrawPosition) {
    const dx = lastDrawPosition.x - cursorPosition.x
    const dy = lastDrawPosition.y - cursorPosition.y
    prevDrawOffset = dx * barrierDir.x + dy * barrierDir.y
  }

  let bestMax: (typeof candidates)[0]
  if (cursorTrapped) {
    // Trapped - if we were displaced before, try to stay at least that displaced
    // Look for candidates that maintain our previous offset (or close to it)

    // Find candidates that are at least 80% of the way towards where we were
    const minAcceptableOffset = prevDrawOffset * 0.8
    const candidatesInPreferredRegion = candidates.filter((c) => {
      const dist = getDistFromCursor(c)
      // If we were in positive direction, stay positive and at least near where we were
      // If we were in negative direction, stay negative and at least near where we were
      if (preferPositive) {
        return dist >= minAcceptableOffset
      } else {
        return dist <= minAcceptableOffset
      }
    })

    // If we have candidates in the preferred region, pick the one with best clearance
    if (candidatesInPreferredRegion.length > 0) {
      bestMax = candidatesInPreferredRegion[0]!
      for (const c of candidatesInPreferredRegion) {
        if (c.clearance > bestMax.clearance) {
          bestMax = c
        }
      }
    } else {
      // No candidates in preferred region - prefer candidates in the preferred direction
      // even if they don't meet the strict offset threshold
      const candidatesInPreferredDirection = candidates.filter((c) => {
        const dist = getDistFromCursor(c)
        return preferPositive ? dist >= 0 : dist <= 0
      })

      if (candidatesInPreferredDirection.length > 0) {
        // Pick the best candidate in the preferred direction
        bestMax = candidatesInPreferredDirection[0]!
        for (const c of candidatesInPreferredDirection) {
          if (c.clearance > bestMax.clearance) {
            bestMax = c
          }
        }
      } else {
        // No candidates in preferred direction - fall back to best overall
        bestMax = candidates[0]!
        for (const c of candidates) {
          if (c.clearance > bestMax.clearance) {
            bestMax = c
          }
        }
      }
    }
  } else {
    // In a gap - prefer reachable candidates
    const reachableCandidates = candidates.filter((c) => c.pathClear)
    const candidatesToChooseFrom =
      reachableCandidates.length > 0 ? reachableCandidates : candidates

    bestMax = candidatesToChooseFrom[0]!
    for (const c of candidatesToChooseFrom) {
      if (c.clearance > bestMax.clearance) {
        bestMax = c
      }
    }
  }

  const movedDist = Math.sqrt(
    (bestMax.pos.x - cursorPosition.x) ** 2 +
      (bestMax.pos.y - cursorPosition.y) ** 2,
  )

  // When cursor is trapped, always return a position to escape the trap
  // even if movedDist is very small
  if (cursorTrapped) {
    return bestMax.pos
  }

  return movedDist > epsilon ? bestMax.pos : null
}
/**
 * Converts an obstacle (rectangular) to its 4 edge segments
 */
export function obstacleToSegments(obstacle: {
  center: { x: number; y: number }
  width: number
  height: number
}): Segment[] {
  const halfW = obstacle.width / 2
  const halfH = obstacle.height / 2
  const cx = obstacle.center.x
  const cy = obstacle.center.y

  const topLeft = { x: cx - halfW, y: cy + halfH }
  const topRight = { x: cx + halfW, y: cy + halfH }
  const bottomLeft = { x: cx - halfW, y: cy - halfH }
  const bottomRight = { x: cx + halfW, y: cy - halfH }

  return [
    { start: topLeft, end: topRight },
    { start: topRight, end: bottomRight },
    { start: bottomRight, end: bottomLeft },
    { start: bottomLeft, end: topLeft },
  ]
}

/**
 * Converts a trace segment to its outline segments (left and right edges)
 * considering the trace width
 */
export function traceSegmentToOutlineSegments(
  segmentStart: Point2D,
  segmentEnd: Point2D,
  traceWidth: number = 0.1,
): Segment[] {
  const dx = segmentEnd.x - segmentStart.x
  const dy = segmentEnd.y - segmentStart.y
  const len = Math.sqrt(dx * dx + dy * dy)

  if (len === 0) return []

  const nx = dx / len
  const ny = dy / len
  const px = -ny
  const py = nx
  const halfW = traceWidth / 2

  return [
    {
      start: { x: segmentStart.x + px * halfW, y: segmentStart.y + py * halfW },
      end: { x: segmentEnd.x + px * halfW, y: segmentEnd.y + py * halfW },
    },
    {
      start: { x: segmentStart.x - px * halfW, y: segmentStart.y - py * halfW },
      end: { x: segmentEnd.x - px * halfW, y: segmentEnd.y - py * halfW },
    },
  ]
}

/**
 * Converts an entire route to outline segments
 */
export function routeToOutlineSegments(
  route: Array<{ x: number; y: number }>,
  traceWidth: number = 0.1,
): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < route.length - 1; i++) {
    segments.push(
      ...traceSegmentToOutlineSegments(route[i]!, route[i + 1]!, traceWidth),
    )
  }
  return segments
}

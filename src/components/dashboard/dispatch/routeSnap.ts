export type RouteCoordinate = [number, number]

interface ProjectedCoordinate {
  x: number
  y: number
}

type RouteProjector = (coordinate: RouteCoordinate) => ProjectedCoordinate

export function nearestRouteSnap(
  project: RouteProjector,
  position: RouteCoordinate,
  path: RouteCoordinate[],
) {
  if (path.length < 2) return { position, progress: 0, distancePixels: Number.POSITIVE_INFINITY }
  const drop = project(position)
  const segmentLengths = path.slice(1).map((point, index) => coordinateDistance(path[index], point))
  const totalLength = segmentLengths.reduce((total, length) => total + length, 0)
  let best = {
    position: path[0] as RouteCoordinate,
    progress: 0,
    distancePixels: Number.POSITIVE_INFINITY,
  }
  let traversed = 0

  for (let index = 0; index < path.length - 1; index += 1) {
    const from = path[index]
    const to = path[index + 1]
    const fromPixel = project(from)
    const toPixel = project(to)
    const dx = toPixel.x - fromPixel.x
    const dy = toPixel.y - fromPixel.y
    const denominator = dx * dx + dy * dy
    const ratio = denominator <= 0
      ? 0
      : Math.max(0, Math.min(1, ((drop.x - fromPixel.x) * dx + (drop.y - fromPixel.y) * dy) / denominator))
    const x = fromPixel.x + dx * ratio
    const y = fromPixel.y + dy * ratio
    const distancePixels = Math.hypot(drop.x - x, drop.y - y)
    if (distancePixels < best.distancePixels) {
      const segmentLength = segmentLengths[index]
      best = {
        position: [from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio] as RouteCoordinate,
        progress: totalLength <= 0 ? 0 : (traversed + segmentLength * ratio) / totalLength,
        distancePixels,
      }
    }
    traversed += segmentLengths[index]
  }

  return best
}

function coordinateDistance(from: RouteCoordinate, to: RouteCoordinate) {
  const latitude = ((from[1] + to[1]) * Math.PI) / 360
  const x = (to[0] - from[0]) * 111320 * Math.cos(latitude)
  const y = (to[1] - from[1]) * 111320
  return Math.hypot(x, y)
}

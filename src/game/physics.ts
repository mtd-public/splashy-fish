// Logical coordinate space the game simulates in; GameCanvas scales this to
// whatever size the board actually renders at.
export const BOARD_W = 400
export const BOARD_H = 800

// The fish stays parked at a fixed screen row — obstacles scroll up past it —
// which is the same trick Flappy Bird uses (bird fixed on X, pipes scroll
// left), just turned 90°: fish fixed on Y, obstacles scroll up.
export const FISH_Y = BOARD_H * 0.32
export const FISH_R = 18

// The current: a constant leftward pull, standing in for Flappy Bird's
// gravity. A splash is the single available action — it snaps velocity to a
// fixed rightward speed, standing in for the flap.
const CURRENT_PULL = 900
export const SPLASH_VX = 340
const MAX_LEFT_VX = -420

const OBSTACLE_THICKNESS = 26
const BASE_GAP = 152
const MIN_GAP = 100
const GAP_SHRINK_PER_POINT = 1.5
const BASE_SPEED = 190
const MAX_SPEED = 380
const SPEED_GAIN_PER_POINT = 5
const SPAWN_SPACING = 420
const OBSTACLE_MARGIN = 26
const SPAWN_MARGIN = 260
const CULL_MARGIN = 240

export type ObstacleType = 'coral' | 'anchor' | 'mine'

const OBSTACLE_CYCLE: ObstacleType[] = ['coral', 'anchor', 'coral', 'mine']

export interface Obstacle {
  id: number
  y: number
  gapStart: number
  gapWidth: number
  type: ObstacleType
  passed: boolean
}

export interface World {
  fishX: number
  fishVX: number
  tilt: number
  obstacles: Obstacle[]
  score: number
  collided: boolean
  spawnAccumulator: number
  nextId: number
  elapsed: number
}

export function createWorld(): World {
  return {
    fishX: BOARD_W / 2,
    fishVX: 0,
    tilt: 0,
    obstacles: [],
    score: 0,
    collided: false,
    spawnAccumulator: SPAWN_SPACING * 0.6,
    nextId: 1,
    elapsed: 0,
  }
}

function speedForScore(score: number) {
  return Math.min(BASE_SPEED + score * SPEED_GAIN_PER_POINT, MAX_SPEED)
}

function gapForScore(score: number) {
  return Math.max(BASE_GAP - score * GAP_SHRINK_PER_POINT, MIN_GAP)
}

function spawnObstacle(world: World) {
  const gapWidth = gapForScore(world.score)
  const gapStart = OBSTACLE_MARGIN + Math.random() * (BOARD_W - gapWidth - OBSTACLE_MARGIN * 2)
  const type = OBSTACLE_CYCLE[world.nextId % OBSTACLE_CYCLE.length]
  world.obstacles.push({
    id: world.nextId++,
    // Spawned well clear of the board so a tall window (where the camera sees
    // past BOARD_H) never shows a band appearing out of nothing.
    y: BOARD_H + SPAWN_MARGIN,
    gapStart,
    gapWidth,
    type,
    passed: false,
  })
}

export function obstacleThickness() {
  return OBSTACLE_THICKNESS
}

export function step(world: World, dt: number, input: { splash: boolean }) {
  if (world.collided) return

  world.elapsed += dt

  if (input.splash) {
    world.fishVX = SPLASH_VX
  }
  world.fishVX = Math.max(world.fishVX - CURRENT_PULL * dt, MAX_LEFT_VX)
  world.tilt = Math.max(-1, Math.min(1, world.fishVX / SPLASH_VX))

  world.fishX += world.fishVX * dt
  if (world.fishX < FISH_R) {
    world.fishX = FISH_R
    world.fishVX = 0
  } else if (world.fishX > BOARD_W - FISH_R) {
    world.fishX = BOARD_W - FISH_R
    world.fishVX = 0
  }

  const speed = speedForScore(world.score)
  world.spawnAccumulator += speed * dt
  if (world.spawnAccumulator >= SPAWN_SPACING) {
    world.spawnAccumulator -= SPAWN_SPACING
    spawnObstacle(world)
  }

  for (const obstacle of world.obstacles) {
    obstacle.y -= speed * dt
  }
  world.obstacles = world.obstacles.filter((o) => o.y > -CULL_MARGIN)

  for (const obstacle of world.obstacles) {
    const bandTop = obstacle.y - OBSTACLE_THICKNESS / 2
    const bandBottom = obstacle.y + OBSTACLE_THICKNESS / 2
    const fishTop = FISH_Y - FISH_R
    const fishBottom = FISH_Y + FISH_R

    if (bandTop < fishBottom && bandBottom > fishTop) {
      const inGap = world.fishX - FISH_R > obstacle.gapStart && world.fishX + FISH_R < obstacle.gapStart + obstacle.gapWidth
      if (!inGap) {
        world.collided = true
        break
      }
    } else if (!obstacle.passed && bandBottom < fishTop) {
      obstacle.passed = true
      world.score += 1
    }
  }
}

import * as THREE from 'three'
import { BOARD_H, BOARD_W, FISH_R, FISH_Y, SPLASH_VX, type Obstacle, type World } from './physics'
import type { GamePhase } from './types'

const CORAL_COLORS = [0xe8543f, 0xf4795f, 0xff8f66, 0xd8432f, 0xff6a52]
const BUBBLE_COUNT = 32
const SPLASH_PARTICLE_COUNT = 48

function seededRandom(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function boardXToWorld(x: number) {
  return x - BOARD_W / 2
}

function boardYToWorld(y: number) {
  return BOARD_H / 2 - y
}

function buildGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, '#bdeefb')
  gradient.addColorStop(0.35, '#5fc3e4')
  gradient.addColorStop(0.7, '#1f6fa8')
  gradient.addColorStop(1, '#0a2f52')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 2, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

function buildFish(): THREE.Group {
  const group = new THREE.Group()

  const body = new THREE.Mesh(
    new THREE.SphereGeometry(FISH_R, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0xff9a4d, roughness: 0.45, metalness: 0.05 }),
  )
  body.scale.set(1.15, 0.92, 0.85)
  group.add(body)

  const belly = new THREE.Mesh(
    new THREE.SphereGeometry(FISH_R * 0.62, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffc98a, roughness: 0.5 }),
  )
  belly.position.set(1, -3, FISH_R * 0.45)
  belly.scale.set(1, 0.85, 0.5)
  group.add(belly)

  const tail = new THREE.Mesh(
    new THREE.ConeGeometry(FISH_R * 0.8, FISH_R * 1.3, 4),
    new THREE.MeshStandardMaterial({ color: 0xff9a4d, roughness: 0.45 }),
  )
  tail.rotation.z = Math.PI / 2
  tail.position.set(-FISH_R * 1.5, 0, 0)
  tail.scale.set(0.7, 1, 0.35)
  group.add(tail)

  const finGeo = new THREE.ConeGeometry(FISH_R * 0.45, FISH_R * 0.9, 3)
  const finMat = new THREE.MeshStandardMaterial({ color: 0xffb066, roughness: 0.5 })
  const topFin = new THREE.Mesh(finGeo, finMat)
  topFin.position.set(0, FISH_R * 0.75, 0)
  topFin.scale.set(1, 1, 0.25)
  group.add(topFin)

  const eyeWhite = new THREE.Mesh(
    new THREE.SphereGeometry(FISH_R * 0.28, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }),
  )
  eyeWhite.position.set(FISH_R * 0.62, FISH_R * 0.22, FISH_R * 0.55)
  group.add(eyeWhite)

  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(FISH_R * 0.13, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x181818 }),
  )
  pupil.position.set(FISH_R * 0.74, FISH_R * 0.22, FISH_R * 0.68)
  group.add(pupil)

  return group
}

function buildCoral(obstacle: Obstacle): THREE.Group {
  const group = new THREE.Group()
  const rand = seededRandom(obstacle.id * 7919 + 13)

  function cluster(from: number, to: number) {
    if (to - from < 4) return
    let x = from
    while (x < to) {
      const width = 18 + rand() * 14
      const w = Math.min(width, to - x)
      const height = 34 + rand() * 46
      const radius = w * 0.42
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, height, 6),
        new THREE.MeshStandardMaterial({
          color: CORAL_COLORS[Math.floor(rand() * CORAL_COLORS.length)],
          roughness: 0.7,
          flatShading: true,
        }),
      )
      cone.position.set(boardXToWorld(x + w / 2), height / 2, (rand() - 0.5) * 14)
      cone.rotation.y = rand() * Math.PI
      group.add(cone)
      x += w
    }
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(to - from, 14, 22),
      new THREE.MeshStandardMaterial({ color: 0xf4795f, roughness: 0.8, flatShading: true }),
    )
    base.position.set(boardXToWorld((from + to) / 2), 6, 0)
    group.add(base)
  }

  cluster(0, obstacle.gapStart)
  cluster(obstacle.gapStart + obstacle.gapWidth, BOARD_W)

  return group
}

function buildAnchor(obstacle: Obstacle): THREE.Group {
  const group = new THREE.Group()
  const metal = new THREE.MeshStandardMaterial({ color: 0x4a5b6e, roughness: 0.4, metalness: 0.6 })
  const rope = new THREE.MeshStandardMaterial({ color: 0x8a97a3, roughness: 0.6 })

  function block(from: number, to: number) {
    if (to - from < 4) return
    const bar = new THREE.Mesh(new THREE.BoxGeometry(to - from, 22, 20), rope)
    bar.position.set(boardXToWorld((from + to) / 2), 0, 0)
    group.add(bar)
  }

  block(0, obstacle.gapStart)
  block(obstacle.gapStart + obstacle.gapWidth, BOARD_W)

  const leftW = obstacle.gapStart
  const rightW = BOARD_W - (obstacle.gapStart + obstacle.gapWidth)
  const anchorX = leftW >= rightW ? leftW / 2 : obstacle.gapStart + obstacle.gapWidth + rightW / 2

  const anchorGroup = new THREE.Group()
  anchorGroup.position.set(boardXToWorld(anchorX), 0, 12)

  const ring = new THREE.Mesh(new THREE.TorusGeometry(9, 3, 8, 16), metal)
  ring.position.set(0, 30, 0)
  anchorGroup.add(ring)

  const shank = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.5, 44, 8), metal)
  shank.position.set(0, 6, 0)
  anchorGroup.add(shank)

  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 5), metal)
  crossbar.position.set(0, 16, 0)
  anchorGroup.add(crossbar)

  for (const side of [-1, 1]) {
    const fluke = new THREE.Mesh(new THREE.TorusGeometry(16, 4, 8, 16, Math.PI * 0.7), metal)
    fluke.position.set(side * 8, -16, 0)
    fluke.rotation.z = side > 0 ? Math.PI * 0.15 : Math.PI * 1.15
    anchorGroup.add(fluke)
  }

  group.add(anchorGroup)

  return group
}

interface Bubble {
  x: number
  y: number
  z: number
  speed: number
  wobble: number
  phase: number
  scale: number
}

interface SplashParticle {
  active: boolean
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number
  life: number
  scale: number
}

const dummy = new THREE.Object3D()

export class Scene3D {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private fish: THREE.Group
  private obstacleGroups = new Map<number, THREE.Group>()
  private bubbleMesh: THREE.InstancedMesh
  private bubbles: Bubble[] = []
  private splashMesh: THREE.InstancedMesh
  private splashParticles: SplashParticle[] = []
  private prevFishVX = 0
  private cameraDistance: number
  private fov = 42

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(0x0a2f52, 500, 1400)

    this.camera = new THREE.PerspectiveCamera(this.fov, BOARD_W / BOARD_H, 10, 2000)
    const halfFovRad = (this.fov / 2) * (Math.PI / 180)
    this.cameraDistance = BOARD_H / 2 / Math.tan(halfFovRad)
    this.camera.position.set(0, 0, this.cameraDistance)
    this.camera.lookAt(0, 0, 0)

    const backdropTexture = buildGradientTexture()
    backdropTexture.minFilter = THREE.LinearFilter
    backdropTexture.generateMipmaps = false
    this.scene.background = backdropTexture

    this.scene.add(new THREE.HemisphereLight(0xeaffff, 0x0d2c48, 2.6))
    const key = new THREE.DirectionalLight(0xfff3e0, 3.6)
    key.position.set(80, 180, 420)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xbfe8ff, 1.8)
    fill.position.set(-150, -80, 260)
    this.scene.add(fill)

    this.fish = buildFish()
    this.scene.add(this.fish)

    this.bubbleMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({
        color: 0xeaffff,
        transparent: true,
        opacity: 0.45,
      }),
      BUBBLE_COUNT,
    )
    this.scene.add(this.bubbleMesh)
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      this.bubbles.push({
        x: Math.random() * BOARD_W,
        y: Math.random() * BOARD_H,
        z: -80 - Math.random() * 200,
        speed: 30 + Math.random() * 50,
        wobble: 6 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        scale: 2 + Math.random() * 4,
      })
    }

    this.splashMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
      SPLASH_PARTICLE_COUNT,
    )
    this.scene.add(this.splashMesh)
    for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
      this.splashParticles.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, scale: 0 })
    }
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private triggerSplashBurst(x: number, y: number) {
    let spawned = 0
    for (const particle of this.splashParticles) {
      if (particle.active) continue
      const angle = Math.random() * Math.PI * 2
      const speed = 60 + Math.random() * 90
      particle.active = true
      particle.x = x
      particle.y = y
      particle.z = 30 + (Math.random() - 0.5) * 20
      particle.vx = Math.cos(angle) * speed * 0.6 - 40
      particle.vy = Math.abs(Math.sin(angle)) * speed * 0.7 + 30
      particle.vz = (Math.random() - 0.5) * 40
      particle.age = 0
      particle.life = 0.45 + Math.random() * 0.25
      particle.scale = 5 + Math.random() * 5
      spawned++
      if (spawned >= 10) break
    }
  }

  private syncObstacles(world: World) {
    const seen = new Set<number>()
    for (const obstacle of world.obstacles) {
      seen.add(obstacle.id)
      let group = this.obstacleGroups.get(obstacle.id)
      if (!group) {
        group = obstacle.type === 'coral' ? buildCoral(obstacle) : buildAnchor(obstacle)
        this.obstacleGroups.set(obstacle.id, group)
        this.scene.add(group)
      }
      group.position.y = boardYToWorld(obstacle.y)
    }
    for (const [id, group] of this.obstacleGroups) {
      if (seen.has(id)) continue
      this.scene.remove(group)
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose()
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose())
          else child.material.dispose()
        }
      })
      this.obstacleGroups.delete(id)
    }
  }

  private updateFish(world: World, phase: GamePhase, now: number) {
    const idleBob = phase === 'ready' ? Math.sin(now * 2) * 6 : 0
    this.fish.position.set(boardXToWorld(world.fishX), boardYToWorld(FISH_Y + idleBob), 40)
    this.fish.rotation.z = -world.tilt * 0.3
    const targetFacing = world.tilt < -0.05 ? Math.PI : 0
    let delta = targetFacing - this.fish.rotation.y
    delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI
    this.fish.rotation.y += delta * Math.min(1, 8 / 60)
    this.fish.rotation.x = Math.sin(now * 5) * 0.05

    // A splash snaps velocity straight to SPLASH_VX, then physics.step()
    // immediately shaves a frame of drift off before returning it — so we
    // can't match the constant exactly. A sudden jump this large only ever
    // happens from a splash impulse, never from the drift's gentle decay.
    if (world.fishVX - this.prevFishVX > SPLASH_VX * 0.5) {
      this.triggerSplashBurst(world.fishX, FISH_Y + idleBob)
    }
    this.prevFishVX = world.fishVX
  }

  private updateBubbles(dt: number, now: number) {
    for (let i = 0; i < this.bubbles.length; i++) {
      const bubble = this.bubbles[i]
      bubble.y -= bubble.speed * dt
      if (bubble.y < -30) {
        bubble.y = BOARD_H + Math.random() * 60
        bubble.x = Math.random() * BOARD_W
      }
      const wobbleX = bubble.x + Math.sin(now * 1.4 + bubble.phase) * bubble.wobble
      dummy.position.set(boardXToWorld(wobbleX), boardYToWorld(bubble.y), bubble.z)
      dummy.scale.setScalar(bubble.scale)
      dummy.updateMatrix()
      this.bubbleMesh.setMatrixAt(i, dummy.matrix)
    }
    this.bubbleMesh.instanceMatrix.needsUpdate = true
  }

  private updateSplashParticles(dt: number) {
    for (let i = 0; i < this.splashParticles.length; i++) {
      const particle = this.splashParticles[i]
      if (particle.active) {
        particle.age += dt
        if (particle.age >= particle.life) {
          particle.active = false
        } else {
          particle.vy -= 220 * dt
          particle.x += particle.vx * dt
          particle.y += particle.vy * dt
          particle.z += particle.vz * dt
        }
      }
      const t = particle.active ? 1 - particle.age / particle.life : 0
      dummy.position.set(boardXToWorld(particle.x), boardYToWorld(particle.y), particle.z)
      dummy.scale.setScalar(particle.active ? particle.scale * t : 0)
      dummy.updateMatrix()
      this.splashMesh.setMatrixAt(i, dummy.matrix)
    }
    this.splashMesh.instanceMatrix.needsUpdate = true
  }

  update(world: World, phase: GamePhase, dt: number, now: number) {
    this.syncObstacles(world)
    this.updateFish(world, phase, now)
    this.updateBubbles(dt, now)
    this.updateSplashParticles(dt)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    for (const group of this.obstacleGroups.values()) {
      this.scene.remove(group)
    }
    this.renderer.dispose()
  }
}

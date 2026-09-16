import * as THREE from 'three'
import { BOARD_H, BOARD_W, FISH_Y, SPLASH_VX, type Obstacle, type World } from './physics'
import { DARKEN_SCORE, hexToCss, paletteAt, type Palette } from './palette'
import type { GamePhase } from './types'

const BUBBLE_COUNT = 30
const SPLASH_PARTICLE_COUNT = 48
const GRADIENT_STEPS = 24
const FOV = 42
const FISH_SCREEN_Y = FISH_Y / BOARD_H   // where the fish sits down the view

function seededRandom(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
}

function boardXToWorld(x: number) {
  return x - BOARD_W / 2
}

function boardYToWorld(y: number) {
  return BOARD_H / 2 - y
}

function gradientTexture(colors: Palette['water']): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 0, 256)
  colors.forEach((c, i) => gradient.addColorStop(i / (colors.length - 1), hexToCss(c)))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 2, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

/* Every surface is flat-shaded — the facets are the look. */
function flat(color: number, extra?: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, ...extra })
}

interface Materials {
  coral: THREE.MeshStandardMaterial[]
  coralTip: THREE.MeshStandardMaterial
  rock: THREE.MeshStandardMaterial
  chain: THREE.MeshStandardMaterial
  anchor: THREE.MeshStandardMaterial
  mineShell: THREE.MeshStandardMaterial
  mineSpike: THREE.MeshStandardMaterial
  mineLamp: THREE.MeshStandardMaterial
  fishBody: THREE.MeshStandardMaterial
  fishFin: THREE.MeshStandardMaterial
  fishStripe: THREE.MeshStandardMaterial
  eyeWhite: THREE.MeshStandardMaterial
  eyeDark: THREE.MeshStandardMaterial
  bubble: THREE.MeshBasicMaterial
  splash: THREE.MeshBasicMaterial
}

function makeMaterials(p: Palette): Materials {
  return {
    coral: p.coral.map((c) => flat(c, { roughness: 0.72 })),
    coralTip: flat(p.coralTip, { emissive: p.coralTip, emissiveIntensity: p.coralTipGlow, roughness: 0.5 }),
    rock: flat(p.rock, { roughness: 0.95 }),
    chain: flat(p.chain, { metalness: p.metalness, roughness: p.metalRough }),
    anchor: flat(p.anchorMetal, { metalness: p.metalness, roughness: p.metalRough }),
    mineShell: flat(p.mineShell, { metalness: p.metalness * 0.5, roughness: 0.8 }),
    mineSpike: flat(p.mineSpike, { metalness: p.metalness, roughness: 0.45 }),
    mineLamp: flat(p.mineLamp, { emissive: p.mineLamp, emissiveIntensity: p.mineLampGlow, roughness: 0.4 }),
    fishBody: flat(p.fishBody, { roughness: 0.5, emissive: p.fishGlow, emissiveIntensity: p.fishGlowIntensity }),
    fishFin: flat(p.fishFin, { roughness: 0.55 }),
    fishStripe: flat(p.fishStripe, { roughness: 0.6 }),
    eyeWhite: flat(0xffffff, { roughness: 0.3 }),
    eyeDark: flat(0x151b22, { roughness: 0.4 }),
    bubble: new THREE.MeshBasicMaterial({ color: p.bubble, transparent: true, opacity: p.bubbleOpacity }),
    splash: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  }
}

function applyPalette(m: Materials, p: Palette) {
  p.coral.forEach((c, i) => m.coral[i].color.setHex(c))
  m.coralTip.color.setHex(p.coralTip)
  m.coralTip.emissive.setHex(p.coralTip)
  m.coralTip.emissiveIntensity = p.coralTipGlow
  m.rock.color.setHex(p.rock)
  m.chain.color.setHex(p.chain)
  m.chain.metalness = p.metalness
  m.chain.roughness = p.metalRough
  m.anchor.color.setHex(p.anchorMetal)
  m.anchor.metalness = p.metalness
  m.anchor.roughness = p.metalRough
  m.mineShell.color.setHex(p.mineShell)
  m.mineSpike.color.setHex(p.mineSpike)
  m.mineLamp.color.setHex(p.mineLamp)
  m.mineLamp.emissive.setHex(p.mineLamp)
  m.mineLamp.emissiveIntensity = p.mineLampGlow
  m.fishBody.color.setHex(p.fishBody)
  m.fishBody.emissive.setHex(p.fishGlow)
  m.fishBody.emissiveIntensity = p.fishGlowIntensity
  m.fishFin.color.setHex(p.fishFin)
  m.fishStripe.color.setHex(p.fishStripe)
  m.bubble.color.setHex(p.bubble)
  m.bubble.opacity = p.bubbleOpacity
}

/* ---------------------------------------------------------------
   Fish — a lathed, laterally-flattened body with a forked tail,
   dorsal/pectoral/anal fins, banded markings and eyes on both sides
   (it flips to face whichever way it is swimming).
--------------------------------------------------------------- */
interface Fish {
  root: THREE.Group
  swimmer: THREE.Group
  tail: THREE.Group
  pectorals: THREE.Mesh[]
}

function buildFish(m: Materials): Fish {
  const root = new THREE.Group()
  const swimmer = new THREE.Group()
  swimmer.scale.setScalar(0.92)
  root.add(swimmer)

  const profile: THREE.Vector2[] = [
    [2.6, -22], [6, -18], [10.4, -12], [13.4, -5], [14.5, 2],
    [13.2, 9], [10, 15], [6.2, 19.5], [2.4, 22], [0.6, 23.4],
  ].map(([r, y]) => new THREE.Vector2(r, y))

  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 8), m.fishBody)
  body.rotation.z = -Math.PI / 2   // lathe runs up the Y axis; lay it nose-forward
  body.scale.z = 0.74              // laterally compressed, the way a reef fish is
  swimmer.add(body)

  for (const [x, radius] of [[3, 14.6], [-7, 13.2]]) {
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(radius, 1.4, 4, 12), m.fishStripe)
    stripe.position.x = x
    stripe.rotation.y = Math.PI / 2
    stripe.scale.x = 0.74          // local X becomes world Z once rotated
    swimmer.add(stripe)
  }

  const peduncle = new THREE.Mesh(new THREE.BoxGeometry(9, 8, 5), m.fishBody)
  peduncle.position.x = -21
  swimmer.add(peduncle)

  const tail = new THREE.Group()
  tail.position.x = -24
  for (const s of [1, -1]) {
    const lobe = new THREE.Mesh(new THREE.ConeGeometry(7, 21, 3), m.fishFin)
    lobe.position.set(-8, s * 3, 0)
    lobe.rotation.z = Math.PI / 2 - s * 0.45
    lobe.scale.z = 0.24
    tail.add(lobe)
  }
  swimmer.add(tail)

  const dorsal = new THREE.Mesh(new THREE.ConeGeometry(9, 15, 3), m.fishFin)
  dorsal.position.set(-3, 12, 0)
  dorsal.rotation.z = 0.35
  dorsal.scale.z = 0.22
  swimmer.add(dorsal)

  const anal = new THREE.Mesh(new THREE.ConeGeometry(5.5, 10, 3), m.fishFin)
  anal.position.set(-11, -10, 0)
  anal.rotation.z = Math.PI - 0.35
  anal.scale.z = 0.2
  swimmer.add(anal)

  const pectorals: THREE.Mesh[] = []
  for (const s of [1, -1]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(5, 13, 3), m.fishFin)
    fin.position.set(2, -3, s * 6.4)
    fin.rotation.set(s * 0.5, 0, 1.95)
    fin.scale.z = 0.24
    swimmer.add(fin)
    pectorals.push(fin)
  }

  for (const s of [1, -1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(4.2, 0), m.eyeWhite)
    eye.position.set(12.5, 4, s * 6)
    swimmer.add(eye)

    const pupil = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 0), m.eyeDark)
    pupil.position.set(13.6, 4.2, s * 8.2)
    swimmer.add(pupil)
  }

  return { root, swimmer, tail, pectorals }
}

/* ---------------------------------------------------------------
   Obstacles
--------------------------------------------------------------- */

function buildCoralSegment(m: Materials, from: number, to: number, rand: () => number) {
  const g = new THREE.Group()
  if (to - from < 6) return g

  const shelf = new THREE.Mesh(new THREE.BoxGeometry(to - from, 20, 30), m.rock)
  shelf.position.set(boardXToWorld((from + to) / 2), -4, 0)
  g.add(shelf)

  let x = from + 4
  while (x < to - 4) {
    const w = 16 + rand() * 16
    const h = 30 + rand() * 52
    const sides = 4 + Math.floor(rand() * 3)
    const spire = new THREE.Mesh(
      new THREE.ConeGeometry(w * 0.46, h, sides),
      m.coral[Math.floor(rand() * m.coral.length)],
    )
    spire.position.set(boardXToWorld(Math.min(x + w / 2, to - 4)), 4 + h / 2, (rand() - 0.5) * 16)
    spire.rotation.set((rand() - 0.5) * 0.18, rand() * Math.PI, (rand() - 0.5) * 0.22)
    g.add(spire)

    if (rand() > 0.45) {
      const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(w * 0.2, 0), m.coralTip)
      tip.position.set(spire.position.x, 4 + h, spire.position.z)
      g.add(tip)
    }
    x += w * 0.92
  }
  return g
}

function buildChain(m: Materials, from: number, to: number) {
  const g = new THREE.Group()
  if (to - from < 5) return g
  const link = new THREE.TorusGeometry(6, 1.9, 4, 8)
  let i = 0
  for (let x = from + 4; x < to - 2; x += 8.5, i++) {
    const mesh = new THREE.Mesh(link, m.chain)
    mesh.position.set(boardXToWorld(x), 0, 0)
    mesh.rotation.y = Math.PI / 2
    if (i % 2) mesh.rotation.x = Math.PI / 2
    g.add(mesh)
  }
  return g
}

function buildAnchorRig(m: Materials) {
  const g = new THREE.Group()

  const ring = new THREE.Mesh(new THREE.TorusGeometry(6.5, 2.1, 4, 10), m.anchor)
  ring.position.y = 34
  g.add(ring)

  const shank = new THREE.Mesh(new THREE.BoxGeometry(6.5, 52, 6.5), m.anchor)
  shank.position.y = 5
  g.add(shank)

  const stock = new THREE.Mesh(new THREE.BoxGeometry(40, 5, 5), m.anchor)
  stock.position.y = 24
  g.add(stock)

  const crown = new THREE.Group()
  crown.position.y = -21
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(29, 6.5, 6.5), m.anchor)
    arm.position.set(s * 12.5, -8.5, 0)
    arm.rotation.z = -s * 0.55
    crown.add(arm)

    const fluke = new THREE.Mesh(new THREE.ConeGeometry(10.5, 21, 3), m.anchor)
    fluke.position.set(s * 25, -8, 0)
    fluke.rotation.z = -s * 0.5
    fluke.scale.z = 0.4
    crown.add(fluke)
  }
  g.add(crown)

  return g
}

function buildMineRig(m: Materials, r: number) {
  const g = new THREE.Group()

  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), m.mineShell))

  const belt = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, r * 0.08, 4, 14), m.mineSpike)
  belt.rotation.x = Math.PI / 2
  g.add(belt)

  const spikeGeo = new THREE.ConeGeometry(r * 0.22, r * 0.5, 4)
  const lampGeo = new THREE.IcosahedronGeometry(r * 0.14, 0)
  const up = new THREE.Vector3(0, 1, 0)

  const dirs: THREE.Vector3[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    dirs.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0))
  }
  dirs.push(new THREE.Vector3(0, 0.35, 1).normalize())

  for (const d of dirs) {
    const spike = new THREE.Mesh(spikeGeo, m.mineSpike)
    spike.position.copy(d).multiplyScalar(r * 1.08)
    spike.quaternion.setFromUnitVectors(up, d)
    g.add(spike)

    const lamp = new THREE.Mesh(lampGeo, m.mineLamp)
    lamp.position.copy(d).multiplyScalar(r * 1.36)
    g.add(lamp)
  }
  return g
}

/**
 * Anchors and mines hang at the gap edge on a chain that runs back to the
 * wall — the hazard sits exactly where the player has to thread.
 */
function buildTetheredSegment(
  kind: 'anchor' | 'mine',
  m: Materials,
  from: number,
  to: number,
  wall: 'left' | 'right',
  rand: () => number,
) {
  const g = new THREE.Group()
  if (to - from < 10) return { group: g, rig: null as THREE.Group | null }

  const half = (kind === 'mine' ? 44 : 46) / 2
  let rigX: number
  let chainFrom: number
  let chainTo: number

  if (wall === 'left') {
    rigX = Math.max(from + 12, to - half)
    chainFrom = from
    chainTo = rigX
  } else {
    rigX = Math.min(to - 12, from + half)
    chainFrom = rigX
    chainTo = to
  }

  g.add(buildChain(m, chainFrom, chainTo))

  const rig = new THREE.Group()
  if (kind === 'anchor') {
    const anchor = buildAnchorRig(m)
    anchor.position.y = 4
    anchor.scale.setScalar(0.78)
    rig.add(anchor)
  } else {
    rig.add(buildMineRig(m, 15 + rand() * 2))
  }
  rig.position.set(boardXToWorld(rigX), 0, 8)
  g.add(rig)

  return { group: g, rig }
}

interface ObstacleView {
  group: THREE.Group
  parts: Array<{ node: THREE.Group; spin: number; phase: number }>
}

function buildObstacle(obstacle: Obstacle, m: Materials): ObstacleView {
  const rand = seededRandom(obstacle.id * 977 + 31)
  const group = new THREE.Group()
  const parts: ObstacleView['parts'] = []

  const leftEnd = obstacle.gapStart
  const rightStart = obstacle.gapStart + obstacle.gapWidth

  if (obstacle.type === 'coral') {
    group.add(buildCoralSegment(m, 0, leftEnd, rand))
    group.add(buildCoralSegment(m, rightStart, BOARD_W, rand))
  } else {
    const spans: Array<[number, number, 'left' | 'right']> = [
      [0, leftEnd, 'left'],
      [rightStart, BOARD_W, 'right'],
    ]
    for (const [from, to, wall] of spans) {
      const seg = buildTetheredSegment(obstacle.type, m, from, to, wall, rand)
      group.add(seg.group)
      if (seg.rig) {
        parts.push({
          node: seg.rig,
          spin: obstacle.type === 'mine' ? 0.3 + rand() * 0.25 : 0,
          phase: rand() * Math.PI * 2,
        })
      }
    }
  }

  return { group, parts }
}

/* ---------------------------------------------------------------
   Scene
--------------------------------------------------------------- */
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
  private materials: Materials
  private fish: Fish
  private hemi: THREE.HemisphereLight
  private key: THREE.DirectionalLight
  private fill: THREE.DirectionalLight
  private obstacleViews = new Map<number, ObstacleView>()
  private bubbleMesh: THREE.InstancedMesh
  private bubbles: Bubble[] = []
  private splashMesh: THREE.InstancedMesh
  private splashParticles: SplashParticle[] = []
  private prevFishVX = 0
  private facing = 0
  private depth = -1
  private gradientStep = -1

  constructor(canvas: HTMLCanvasElement) {
    const palette = paletteAt(0)
    this.materials = makeMaterials(palette)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(palette.fog.color, palette.fog.near, palette.fog.far)

    this.camera = new THREE.PerspectiveCamera(FOV, BOARD_W / BOARD_H, 10, 2400)
    this.frameCamera(BOARD_W / BOARD_H)

    this.hemi = new THREE.HemisphereLight(palette.hemi.sky, palette.hemi.ground, palette.hemi.intensity)
    this.scene.add(this.hemi)
    this.key = new THREE.DirectionalLight(palette.key.color, palette.key.intensity)
    this.key.position.set(80, 180, 420)
    this.scene.add(this.key)
    this.fill = new THREE.DirectionalLight(palette.fill.color, palette.fill.intensity)
    this.fill.position.set(-150, -80, 260)
    this.scene.add(this.fill)

    this.fish = buildFish(this.materials)
    this.scene.add(this.fish.root)

    const dropletGeo = new THREE.IcosahedronGeometry(1, 0)

    this.bubbleMesh = new THREE.InstancedMesh(dropletGeo, this.materials.bubble, BUBBLE_COUNT)
    this.scene.add(this.bubbleMesh)
    for (let i = 0; i < BUBBLE_COUNT; i++) {
      this.bubbles.push({
        x: Math.random() * BOARD_W,
        y: Math.random() * BOARD_H,
        z: -80 - Math.random() * 200,
        speed: 28 + Math.random() * 46,
        wobble: 6 + Math.random() * 10,
        phase: Math.random() * Math.PI * 2,
        scale: 2 + Math.random() * 4,
      })
    }

    this.splashMesh = new THREE.InstancedMesh(dropletGeo, this.materials.splash, SPLASH_PARTICLE_COUNT)
    this.scene.add(this.splashMesh)
    for (let i = 0; i < SPLASH_PARTICLE_COUNT; i++) {
      this.splashParticles.push({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, scale: 0 })
    }

    this.setDepth(0)
  }

  /**
   * Frames the camera so the full playfield width is always on screen, whatever
   * shape the container is — a band has to reach both edges or the gap stops
   * meaning anything. Taller windows simply see further up and down the water,
   * with the fish held at the same fraction of the view.
   */
  private frameCamera(aspect: number) {
    const visibleHeight = BOARD_W / aspect
    this.camera.aspect = aspect
    this.camera.position.set(0, boardYToWorld(FISH_Y) + visibleHeight * (FISH_SCREEN_Y - 0.5), visibleHeight / 2 / Math.tan((FOV / 2) * (Math.PI / 180)))
    this.camera.rotation.set(0, 0, 0)
    this.camera.updateProjectionMatrix()
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.frameCamera(width / height)
  }

  /** 0 at the surface, 1 once the water has faded all the way to the abyss. */
  private setDepth(depth: number) {
    const next = Math.max(0, Math.min(1, depth))
    if (Math.abs(next - this.depth) < 0.002) return
    this.depth = next

    const palette = paletteAt(next)
    applyPalette(this.materials, palette)

    this.hemi.color.setHex(palette.hemi.sky)
    this.hemi.groundColor.setHex(palette.hemi.ground)
    this.hemi.intensity = palette.hemi.intensity
    this.key.color.setHex(palette.key.color)
    this.key.intensity = palette.key.intensity
    this.fill.color.setHex(palette.fill.color)
    this.fill.intensity = palette.fill.intensity

    const fog = this.scene.fog as THREE.Fog
    fog.color.setHex(palette.fog.color)
    fog.near = palette.fog.near
    fog.far = palette.fog.far

    // Repainting the backdrop is the one costly part, so it moves in steps.
    const step = Math.round(next * GRADIENT_STEPS)
    if (step !== this.gradientStep) {
      this.gradientStep = step
      const old = this.scene.background
      this.scene.background = gradientTexture(palette.water)
      if (old instanceof THREE.Texture) old.dispose()
    }
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

  private syncObstacles(world: World, dt: number, now: number) {
    const seen = new Set<number>()
    for (const obstacle of world.obstacles) {
      seen.add(obstacle.id)
      let view = this.obstacleViews.get(obstacle.id)
      if (!view) {
        view = buildObstacle(obstacle, this.materials)
        this.obstacleViews.set(obstacle.id, view)
        this.scene.add(view.group)
      }
      view.group.position.y = boardYToWorld(obstacle.y)
      for (const part of view.parts) {
        if (part.spin) {
          part.node.rotation.y += part.spin * dt
          part.node.rotation.z += part.spin * 0.35 * dt
        } else {
          part.node.rotation.z = Math.sin(now * 0.9 + part.phase) * 0.12
        }
      }
    }

    for (const [id, view] of this.obstacleViews) {
      if (seen.has(id)) continue
      this.scene.remove(view.group)
      view.group.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose()
      })
      this.obstacleViews.delete(id)
    }
  }

  private updateFish(world: World, phase: GamePhase, dt: number, now: number) {
    const idleBob = phase === 'ready' ? Math.sin(now * 2) * 6 : 0
    this.fish.root.position.set(boardXToWorld(world.fishX), boardYToWorld(FISH_Y + idleBob), 40)
    this.fish.root.rotation.z = -world.tilt * 0.3

    const target = world.tilt < -0.05 ? Math.PI : 0
    let delta = target - this.facing
    delta = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI
    this.facing += delta * Math.min(1, dt * 8)
    this.fish.root.rotation.y = this.facing

    this.fish.swimmer.rotation.y = Math.sin(now * 1.4) * 0.1
    this.fish.tail.rotation.y = Math.sin(now * 9) * 0.5
    this.fish.pectorals.forEach((fin, i) => {
      fin.rotation.x = (i === 0 ? 1 : -1) * (0.5 + Math.sin(now * 7 + i) * 0.35)
    })

    // A splash snaps velocity to SPLASH_VX, then physics.step() shaves a frame
    // of drift off it — so match the jump, not the constant.
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
          particle.y -= particle.vy * dt
          particle.z += particle.vz * dt
        }
      }
      const k = particle.active ? 1 - particle.age / particle.life : 0
      dummy.position.set(boardXToWorld(particle.x), boardYToWorld(particle.y), particle.z)
      dummy.scale.setScalar(particle.active ? particle.scale * k : 0)
      dummy.updateMatrix()
      this.splashMesh.setMatrixAt(i, dummy.matrix)
    }
    this.splashMesh.instanceMatrix.needsUpdate = true
  }

  update(world: World, phase: GamePhase, score: number, dt: number, now: number) {
    this.setDepth(score / DARKEN_SCORE)
    this.syncObstacles(world, dt, now)
    this.updateFish(world, phase, dt, now)
    this.updateBubbles(dt, now)
    this.updateSplashParticles(dt)
    this.renderer.render(this.scene, this.camera)
  }

  dispose() {
    for (const view of this.obstacleViews.values()) {
      this.scene.remove(view.group)
    }
    this.obstacleViews.clear()
    this.renderer.dispose()
  }
}

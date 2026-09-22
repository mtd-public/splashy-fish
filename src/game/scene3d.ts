import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { BOARD_H, BOARD_W, FISH_Y, SPLASH_VX, type Obstacle, type World } from './physics'
import { DARKEN_SCORE, hexToCss, paletteAt, type Palette } from './palette'
import type { GamePhase } from './types'

const BUBBLE_COUNT = 30
const SPLASH_PARTICLE_COUNT = 48
const GRADIENT_STEPS = 24
const FOV = 42
const FISH_SCREEN_Y = FISH_Y / BOARD_H   // where the fish sits down the view
const OUTLINE = 1.3                      // ink line width, in board units
const BACKDROP_Z = -20                   // the plane the soft drop shadows land on
const SUN_DIR = new THREE.Vector3(-0.3, 0.42, 1).normalize()

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

/* Soft, smooth-shaded toy plastic — the same look as the gig-ambulance kit. */
function toy(color: number, extra?: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra })
}

/** A chunky bevelled box; the radius is clamped so thin boxes stay valid. */
function rbox(w: number, h: number, d: number, radius: number) {
  const r = Math.max(0.01, Math.min(radius, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01))
  return new RoundedBoxGeometry(w, h, d, 3, r)
}

function ball(r: number) {
  return new THREE.SphereGeometry(r, 18, 12)
}

/* ---------------------------------------------------------------
   Ink outlines — the inverted-hull trick. Each outlined mesh gets a
   back-faced copy pushed out along its normals in view space. The hull
   uses a welded, smooth-normal copy of the geometry so hard edges (caps,
   bevels) don't split the line open.
--------------------------------------------------------------- */
function makeOutlineMaterial(color: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      thickness: { value: OUTLINE },
    },
    vertexShader: /* glsl */ `
      uniform float thickness;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        mv.xyz += normalize(normalMatrix * normal) * thickness;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
  })
}

const hulls = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>()

function hullOf(geometry: THREE.BufferGeometry) {
  let hull = hulls.get(geometry)
  if (!hull) {
    const bare = new THREE.BufferGeometry()
    bare.setAttribute('position', geometry.getAttribute('position'))
    if (geometry.index) bare.setIndex(geometry.index)
    hull = mergeVertices(bare, 1e-3)
    hull.computeVertexNormals()
    hulls.set(geometry, hull)
  }
  return hull
}

interface Materials {
  coral: THREE.MeshStandardMaterial[]
  coralTip: THREE.MeshStandardMaterial
  rock: THREE.MeshStandardMaterial
  weed: THREE.MeshStandardMaterial
  chain: THREE.MeshStandardMaterial
  anchor: THREE.MeshStandardMaterial
  anchorTrim: THREE.MeshStandardMaterial
  mineShell: THREE.MeshStandardMaterial
  mineNub: THREE.MeshStandardMaterial
  mineLamp: THREE.MeshStandardMaterial
  fishBody: THREE.MeshStandardMaterial
  fishFin: THREE.MeshStandardMaterial
  fishStripe: THREE.MeshStandardMaterial
  eyeWhite: THREE.MeshStandardMaterial
  eyeDark: THREE.MeshStandardMaterial
  eyeShine: THREE.MeshBasicMaterial
  blush: THREE.MeshStandardMaterial
  bubble: THREE.MeshBasicMaterial
  splash: THREE.MeshBasicMaterial
  outline: THREE.ShaderMaterial
}

function makeMaterials(p: Palette): Materials {
  return {
    coral: p.coral.map((c) => toy(c, { roughness: 0.7 })),
    coralTip: toy(p.coralTip, { emissive: p.coralTip, emissiveIntensity: p.coralTipGlow, roughness: 0.45 }),
    rock: toy(p.rock, { roughness: 0.9 }),
    weed: toy(p.weed, { roughness: 0.8 }),
    chain: toy(p.chain, { roughness: 0.35 }),
    anchor: toy(p.anchorMetal, { roughness: 0.5 }),
    anchorTrim: toy(p.anchorTrim, { roughness: 0.25 }),
    mineShell: toy(p.mineShell, { roughness: 0.55 }),
    mineNub: toy(p.mineNub, { roughness: 0.45 }),
    mineLamp: toy(p.mineLamp, { emissive: p.mineLamp, emissiveIntensity: p.mineLampGlow, roughness: 0.3 }),
    fishBody: toy(p.fishBody, { roughness: 0.5, emissive: p.fishGlow, emissiveIntensity: p.fishGlowIntensity }),
    fishFin: toy(p.fishFin, { roughness: 0.45 }),
    fishStripe: toy(p.fishStripe, { roughness: 0.55 }),
    eyeWhite: toy(0xffffff, { roughness: 0.3 }),
    eyeDark: toy(0x2a2433, { roughness: 0.3 }),
    eyeShine: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    blush: toy(0xff93a8, { roughness: 0.8 }),
    bubble: new THREE.MeshBasicMaterial({ color: p.bubble, transparent: true, opacity: p.bubbleOpacity }),
    splash: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
    outline: makeOutlineMaterial(p.ink),
  }
}

function applyPalette(m: Materials, p: Palette) {
  p.coral.forEach((c, i) => m.coral[i].color.setHex(c))
  m.coralTip.color.setHex(p.coralTip)
  m.coralTip.emissive.setHex(p.coralTip)
  m.coralTip.emissiveIntensity = p.coralTipGlow
  m.rock.color.setHex(p.rock)
  m.weed.color.setHex(p.weed)
  m.chain.color.setHex(p.chain)
  m.anchor.color.setHex(p.anchorMetal)
  m.anchorTrim.color.setHex(p.anchorTrim)
  m.mineShell.color.setHex(p.mineShell)
  m.mineNub.color.setHex(p.mineNub)
  m.mineLamp.color.setHex(p.mineLamp)
  m.mineLamp.emissive.setHex(p.mineLamp)
  m.fishBody.color.setHex(p.fishBody)
  m.fishBody.emissive.setHex(p.fishGlow)
  m.fishBody.emissiveIntensity = p.fishGlowIntensity
  m.fishFin.color.setHex(p.fishFin)
  m.fishStripe.color.setHex(p.fishStripe)
  m.bubble.color.setHex(p.bubble)
  m.bubble.opacity = p.bubbleOpacity
  ;(m.outline.uniforms.color.value as THREE.Color).setHex(p.ink)
}

/** A mesh with an ink outline that casts a soft shadow onto the backdrop. */
function inked(geometry: THREE.BufferGeometry, material: THREE.Material, m: Materials) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  mesh.add(new THREE.Mesh(hullOf(geometry), m.outline))
  return mesh
}

/** Small details (eyes, blush, tips) skip the outline so they stay crisp. */
function plain(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material)
  mesh.castShadow = true
  return mesh
}

/* ---------------------------------------------------------------
   Fish — a chibi clownfish: a round body with two white bands, a
   fan tail, rounded fins, big dot eyes with a shine, and blush.
   Its face is on both sides (it flips to face whichever way it swims).
--------------------------------------------------------------- */
interface Fish {
  root: THREE.Group
  swimmer: THREE.Group
  tail: THREE.Group
  pectorals: THREE.Mesh[]
}

const BODY_RX = 18
const BODY_RY = 15
const BODY_RZ = 11.5

/** Half-thickness of the body (along Z) at a point on its side profile. */
function bodySurfaceZ(x: number, y: number) {
  const k = 1 - (x / BODY_RX) ** 2 - (y / BODY_RY) ** 2
  return BODY_RZ * Math.sqrt(Math.max(0, k))
}

function buildFish(m: Materials): Fish {
  const root = new THREE.Group()
  const swimmer = new THREE.Group()
  swimmer.scale.setScalar(0.95)
  root.add(swimmer)

  const body = inked(new THREE.SphereGeometry(1, 28, 20), m.fishBody, m)
  body.scale.set(BODY_RX, BODY_RY, BODY_RZ)
  swimmer.add(body)

  // White bands: short tubes that follow the body's taper where they sit,
  // standing just proud of it so they read as painted-on stripes.
  for (const [x, half] of [[5, 2.8], [-8, 2.6]]) {
    const r = (at: number) => BODY_RY * Math.sqrt(1 - (at / BODY_RX) ** 2) + 0.5
    const band = inked(new THREE.CylinderGeometry(r(x + half), r(x - half), half * 2, 28), m.fishStripe, m)
    band.position.x = x
    band.rotation.z = -Math.PI / 2
    band.scale.z = BODY_RZ / BODY_RY
    swimmer.add(band)
  }

  const tail = new THREE.Group()
  tail.position.x = -15
  for (const s of [1, -1]) {
    const lobe = inked(ball(1), m.fishFin, m)
    lobe.scale.set(10, 5.5, 2.4)
    lobe.position.set(-7, s * 5, 0)
    lobe.rotation.z = s * -0.6
    tail.add(lobe)
  }
  swimmer.add(tail)

  const dorsal = inked(ball(1), m.fishFin, m)
  dorsal.scale.set(8.5, 5, 2.2)
  dorsal.position.set(-3, 13.5, 0)
  dorsal.rotation.z = 0.35
  swimmer.add(dorsal)

  const anal = inked(ball(1), m.fishFin, m)
  anal.scale.set(5.5, 3.2, 2)
  anal.position.set(-8, -12.5, 0)
  anal.rotation.z = -0.4
  swimmer.add(anal)

  const pectorals: THREE.Mesh[] = []
  for (const s of [1, -1]) {
    const fin = inked(ball(1), m.fishFin, m)
    fin.scale.set(6, 3.4, 1.6)
    fin.position.set(-1, -4, s * (bodySurfaceZ(-1, -4) + 0.6))
    fin.rotation.z = -0.5
    swimmer.add(fin)
    pectorals.push(fin)
  }

  for (const s of [1, -1]) {
    const ez = bodySurfaceZ(9.5, 3.5)
    const eye = plain(ball(1), m.eyeDark)
    eye.scale.set(3.2, 4.2, 2)
    eye.position.set(9.5, 3.5, s * ez)
    swimmer.add(eye)

    const shine = new THREE.Mesh(ball(1.3), m.eyeShine)
    shine.position.set(10.4, 5.4, s * (ez + 1.5))
    swimmer.add(shine)

    const blush = plain(ball(1), m.blush)
    blush.scale.set(2.6, 1.5, 0.8)
    blush.position.set(13.2, -3.6, s * (bodySurfaceZ(13.2, -3.6) + 0.1))
    swimmer.add(blush)
  }

  const mouth = plain(ball(1), m.eyeDark)
  mouth.scale.set(0.9, 1.3, 2.4)
  mouth.position.set(17.6, -2.4, 0)
  swimmer.add(mouth)

  return { root, swimmer, tail, pectorals }
}

/* ---------------------------------------------------------------
   Obstacles
--------------------------------------------------------------- */

function coralPiece(m: Materials, cx: number, w: number, h: number, rand: () => number) {
  const g = new THREE.Group()
  const color = m.coral[Math.floor(rand() * m.coral.length)]
  const base = 5
  const kind = rand()

  if (kind < 0.3) {
    // Tiered, like the kit's pine trees.
    const tiers = 3
    for (let i = 0; i < tiers; i++) {
      const r = w * 0.5 * (1 - i * 0.22)
      const th = h * 0.42
      const cone = inked(new THREE.ConeGeometry(r, th, 8), color, m)
      cone.position.set(cx, base + th / 2 + i * h * 0.27, 0)
      g.add(cone)
    }
    const tip = plain(ball(w * 0.11), m.coralTip)
    tip.position.set(cx, base + h * 0.96, 0)
    g.add(tip)
  } else if (kind < 0.58) {
    // Branching coral with glowing knobs on every tip.
    const r = Math.max(3, w * 0.13)
    const trunkLen = h * 0.55
    const trunk = inked(new THREE.CapsuleGeometry(r, trunkLen, 4, 10), color, m)
    trunk.position.set(cx, base + r + trunkLen / 2, 0)
    g.add(trunk)
    const trunkTop = plain(ball(r * 1.15), m.coralTip)
    trunkTop.position.set(cx, base + r * 2 + trunkLen, 0)
    g.add(trunkTop)

    for (const s of [1, -1]) {
      const len = h * (0.26 + rand() * 0.14)
      const angle = s * (0.55 + rand() * 0.25)
      const bx = cx + s * w * 0.18
      const by = base + h * 0.34 + len / 2
      const branch = inked(new THREE.CapsuleGeometry(r * 0.8, len, 4, 10), color, m)
      branch.position.set(bx, by, 0)
      branch.rotation.z = -angle
      g.add(branch)
      const knob = plain(ball(r), m.coralTip)
      knob.position.set(bx + Math.sin(angle) * (len / 2 + r * 0.6), by + Math.cos(angle) * (len / 2 + r * 0.6), 0)
      g.add(knob)
    }
  } else if (kind < 0.82) {
    // A round brain coral dotted with tips.
    const r = w * 0.44
    const blob = inked(ball(r), color, m)
    blob.scale.y = 0.82
    blob.position.set(cx, base + r * 0.7, 0)
    g.add(blob)
    for (let i = 0; i < 3; i++) {
      const a = (i - 1) * 0.7
      const dot = plain(ball(r * 0.18), m.coralTip)
      dot.position.set(cx + Math.sin(a) * r * 0.9, base + r * 0.7 + Math.cos(a) * r * 0.78, r * 0.25)
      g.add(dot)
    }
  } else {
    // A tuft of kelp.
    const blades = 3
    for (let i = 0; i < blades; i++) {
      const len = h * (0.55 + rand() * 0.4)
      const blade = inked(new THREE.CapsuleGeometry(2.8, len, 4, 8), m.weed, m)
      const bx = cx + (i - 1) * w * 0.22
      blade.position.set(bx, base + len / 2 + 2, (i - 1) * 4)
      blade.rotation.z = (i - 1) * -0.14 + (rand() - 0.5) * 0.1
      g.add(blade)
    }
  }

  g.rotation.y = (rand() - 0.5) * 0.4
  return g
}

function buildCoralSegment(m: Materials, from: number, to: number, rand: () => number) {
  const g = new THREE.Group()
  if (to - from < 6) return g

  // The shelf runs on past the board edge so its rounded end never shows there.
  const left = from <= 0 ? from - 30 : from
  const right = to >= BOARD_W ? to + 30 : to
  const shelf = inked(rbox(right - left, 20, 30, 8), m.rock, m)
  shelf.position.set(boardXToWorld((left + right) / 2), -4, 0)
  g.add(shelf)

  let x = from + 4
  while (x < to - 4) {
    const w = 16 + rand() * 16
    const h = 30 + rand() * 52
    const cx = boardXToWorld(Math.min(x + w / 2, to - 4 - w * 0.3))
    const piece = coralPiece(m, 0, w, h, rand)
    piece.position.set(cx, 0, (rand() - 0.5) * 14)
    g.add(piece)
    x += w * 0.92
  }
  return g
}

function buildChain(m: Materials, from: number, to: number) {
  const g = new THREE.Group()
  if (to - from < 5) return g
  // Oval links alternate face-on and edge-on, like a real chain.
  const link = new THREE.TorusGeometry(4.6, 1.9, 8, 18)
  let i = 0
  for (let x = from + 7; x < to - 4; x += 11.5, i++) {
    const mesh = inked(link, m.chain, m)
    mesh.position.set(boardXToWorld(x), 0, 0)
    mesh.scale.x = 1.45
    if (i % 2) mesh.rotation.x = Math.PI / 2
    g.add(mesh)
  }
  return g
}

function buildAnchorRig(m: Materials) {
  const g = new THREE.Group()

  const ring = inked(new THREE.TorusGeometry(6.5, 2.6, 10, 20), m.anchorTrim, m)
  ring.position.y = 35
  g.add(ring)

  const shank = inked(rbox(8.5, 54, 8.5, 3.5), m.anchor, m)
  shank.position.y = 4
  g.add(shank)

  const stock = inked(rbox(38, 7, 7, 3), m.anchor, m)
  stock.position.y = 24
  g.add(stock)
  for (const s of [1, -1]) {
    const cap = inked(ball(4.6), m.anchorTrim, m)
    cap.position.set(s * 20, 24, 0)
    g.add(cap)
  }

  const collar = inked(new THREE.TorusGeometry(5.6, 1.8, 8, 18), m.anchorTrim, m)
  collar.position.y = -12
  collar.rotation.x = Math.PI / 2
  g.add(collar)

  const crown = new THREE.Group()
  crown.position.y = -21
  crown.add(inked(ball(6.5), m.anchor, m))
  for (const s of [1, -1]) {
    const arm = inked(new THREE.CapsuleGeometry(3.8, 20, 4, 10), m.anchor, m)
    arm.position.set(s * 11, -6.5, 0)
    arm.rotation.z = s * 1.02
    crown.add(arm)

    const fluke = inked(ball(1), m.anchor, m)
    fluke.scale.set(6.5, 11, 4)
    fluke.position.set(s * 23, -3, 0)
    fluke.rotation.z = -s * 0.45
    crown.add(fluke)
  }
  g.add(crown)

  return g
}

function buildMineRig(m: Materials, r: number) {
  const g = new THREE.Group()

  g.add(inked(new THREE.SphereGeometry(r, 26, 18), m.mineShell, m))

  const belt = inked(new THREE.TorusGeometry(r * 1.0, r * 0.1, 8, 28), m.anchorTrim, m)
  belt.rotation.x = Math.PI / 2
  g.add(belt)

  const nubGeo = new THREE.CylinderGeometry(r * 0.13, r * 0.17, r * 0.4, 10)
  const lampGeo = ball(r * 0.17)
  const up = new THREE.Vector3(0, 1, 0)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const d = new THREE.Vector3(Math.cos(a), Math.sin(a), 0)

    const nub = inked(nubGeo, m.mineNub, m)
    nub.position.copy(d).multiplyScalar(r * 1.08)
    nub.quaternion.setFromUnitVectors(up, d)
    g.add(nub)

    const lamp = inked(lampGeo, m.mineLamp, m)
    lamp.position.copy(d).multiplyScalar(r * 1.34)
    g.add(lamp)
  }

  // A grumpy little face: white eyes under slanted lids of shell.
  for (const s of [1, -1]) {
    const ex = s * r * 0.34
    const ey = r * 0.1
    const ez = Math.sqrt(r * r - ex * ex - ey * ey)
    const eye = plain(ball(1), m.eyeWhite)
    eye.scale.set(r * 0.22, r * 0.26, r * 0.12)
    eye.position.set(ex, ey, ez)
    g.add(eye)

    const pupil = plain(ball(r * 0.1), m.eyeDark)
    pupil.position.set(ex - s * r * 0.04, ey - r * 0.04, ez + r * 0.1)
    g.add(pupil)

    const lid = plain(rbox(r * 0.56, r * 0.2, r * 0.2, r * 0.08), m.mineShell)
    lid.position.set(ex, ey + r * 0.2, ez + r * 0.04)
    lid.rotation.z = s * 0.4
    g.add(lid)
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
  parts: Array<{ node: THREE.Group; kind: 'anchor' | 'mine'; phase: number }>
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
      if (seg.rig) parts.push({ node: seg.rig, kind: obstacle.type, phase: rand() * Math.PI * 2 })
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
  private backdrop: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>
  private obstacleViews = new Map<number, ObstacleView>()
  private bubbleMesh: THREE.InstancedMesh
  private bubbles: Bubble[] = []
  private splashMesh: THREE.InstancedMesh
  private splashParticles: SplashParticle[] = []
  private prevFishVX = 0
  private facing = 0
  private depth = -1
  private gradientStep = -1
  private lampGlow = 1

  constructor(canvas: HTMLCanvasElement) {
    const palette = paletteAt(0)
    this.materials = makeMaterials(palette)

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap

    this.scene = new THREE.Scene()
    this.scene.fog = new THREE.Fog(palette.fog.color, palette.fog.near, palette.fog.far)

    this.camera = new THREE.PerspectiveCamera(FOV, BOARD_W / BOARD_H, 10, 2400)

    this.hemi = new THREE.HemisphereLight(palette.hemi.sky, palette.hemi.ground, palette.hemi.intensity)
    this.scene.add(this.hemi)

    this.key = new THREE.DirectionalLight(palette.key.color, palette.key.intensity)
    this.key.castShadow = true
    this.key.shadow.mapSize.set(2048, 2048)
    this.key.shadow.bias = -0.0006
    this.key.shadow.normalBias = 0.6
    this.key.shadow.radius = 3
    this.scene.add(this.key, this.key.target)

    this.fill = new THREE.DirectionalLight(palette.fill.color, palette.fill.intensity)
    this.fill.position.set(150, -80, 260)
    this.scene.add(this.fill)

    // Everything floats in front of an invisible plane that only catches
    // shadows, which gives the water the kit's soft toy-diorama drop shadows.
    this.backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_W * 6, 6000),
      new THREE.ShadowMaterial({ color: palette.shadow.color, opacity: palette.shadow.opacity, fog: false }),
    )
    this.backdrop.position.z = BACKDROP_Z
    this.backdrop.receiveShadow = true
    this.scene.add(this.backdrop)

    this.frameCamera(BOARD_W / BOARD_H)

    this.fish = buildFish(this.materials)
    this.scene.add(this.fish.root)

    this.bubbleMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.materials.bubble, BUBBLE_COUNT)
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

    this.splashMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), this.materials.splash, SPLASH_PARTICLE_COUNT)
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
    const centerY = boardYToWorld(FISH_Y) + visibleHeight * (FISH_SCREEN_Y - 0.5)
    this.camera.aspect = aspect
    this.camera.position.set(0, centerY, visibleHeight / 2 / Math.tan((FOV / 2) * (Math.PI / 180)))
    this.camera.rotation.set(0, 0, 0)
    this.camera.updateProjectionMatrix()

    // The sun's shadow box follows the view: just wider than the board and
    // tall enough for obstacles scrolling in and out past either edge.
    this.key.target.position.set(0, centerY, 0)
    this.key.position.copy(SUN_DIR).multiplyScalar(900).add(this.key.target.position)
    const cam = this.key.shadow.camera
    const halfH = visibleHeight / 2 + 160
    cam.left = -BOARD_W * 0.75
    cam.right = BOARD_W * 0.75
    cam.top = halfH
    cam.bottom = -halfH
    cam.near = 500
    cam.far = 1400
    cam.updateProjectionMatrix()
    this.backdrop.position.y = centerY
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
    this.lampGlow = palette.mineLampGlow

    this.hemi.color.setHex(palette.hemi.sky)
    this.hemi.groundColor.setHex(palette.hemi.ground)
    this.hemi.intensity = palette.hemi.intensity
    this.key.color.setHex(palette.key.color)
    this.key.intensity = palette.key.intensity
    this.fill.color.setHex(palette.fill.color)
    this.fill.intensity = palette.fill.intensity
    this.backdrop.material.color.setHex(palette.shadow.color)
    this.backdrop.material.opacity = palette.shadow.opacity

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
      particle.scale = 4 + Math.random() * 4
      spawned++
      if (spawned >= 10) break
    }
  }

  private syncObstacles(world: World, now: number) {
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
        if (part.kind === 'mine') {
          // Mines bob and wobble in place so their grumpy faces stay on camera.
          part.node.position.y = Math.sin(now * 2.2 + part.phase) * 2.5
          part.node.rotation.z = Math.sin(now * 1.6 + part.phase) * 0.14
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
    this.fish.swimmer.scale.y = 0.95 * (1 + Math.sin(now * 4) * 0.02)
    this.fish.tail.rotation.y = Math.sin(now * 9) * 0.5
    this.fish.pectorals.forEach((fin, i) => {
      fin.rotation.x = (i === 0 ? 1 : -1) * (0.4 + Math.sin(now * 7 + i) * 0.35)
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
    // Mine lamps pulse like the ambulance siren.
    this.materials.mineLamp.emissiveIntensity = this.lampGlow * (0.65 + 0.35 * Math.sin(now * 6))
    this.syncObstacles(world, now)
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

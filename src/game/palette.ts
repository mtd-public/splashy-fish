import * as THREE from 'three'

/**
 * The water starts at the bright reef surface and fades to the abyss as the
 * fish descends, reaching full depth after DARKEN_SCORE points (ten levels).
 *
 * Colours follow the gig-ambulance toy-town kit: soft pastels on a lavender
 * base, one ink colour for outlines, and saturated accents kept for gameplay
 * reads (red = danger, yellow = reward). The abyss is a cozy purple twilight
 * rather than black, so the fish and hazards stay readable all the way down.
 */
export const DARKEN_SCORE = 50

export interface Palette {
  water: [number, number, number, number]
  fog: { color: number; near: number; far: number }
  hemi: { sky: number; ground: number; intensity: number }
  key: { color: number; intensity: number }
  fill: { color: number; intensity: number }
  shadow: { color: number; opacity: number }
  ink: number
  coral: [number, number, number, number]
  coralTip: number
  coralTipGlow: number
  rock: number
  weed: number
  chain: number
  anchorMetal: number
  anchorTrim: number
  mineShell: number
  mineNub: number
  mineLamp: number
  mineLampGlow: number
  fishBody: number
  fishFin: number
  fishStripe: number
  fishGlow: number
  fishGlowIntensity: number
  bubble: number
  bubbleOpacity: number
}

const SURFACE: Palette = {
  water: [0xdaf6ff, 0xa6e3f6, 0x86c4f0, 0xa491ea],
  fog: { color: 0xa491ea, near: 1500, far: 3400 },
  hemi: { sky: 0xf1eaff, ground: 0xa58cf2, intensity: 1.9 },
  key: { color: 0xfff1dc, intensity: 2.4 },
  fill: { color: 0xcde8ff, intensity: 0.8 },
  shadow: { color: 0x3b2e5a, opacity: 0.2 },
  ink: 0x3b2e5a,
  coral: [0xff9fbd, 0xff9e4a, 0xa58cf2, 0x35c3b2],
  coralTip: 0xffd45e,
  coralTipGlow: 0,
  rock: 0xcdbeff,
  weed: 0x45c48e,
  chain: 0xbac2ce,
  anchorMetal: 0x3a4572,
  anchorTrim: 0xffc53a,
  mineShell: 0x3a4572,
  mineNub: 0x666c7a,
  mineLamp: 0xff3d52,
  mineLampGlow: 1.2,
  fishBody: 0xff9e4a,
  fishFin: 0xffd45e,
  fishStripe: 0xf6f3ec,
  fishGlow: 0xff9e4a,
  fishGlowIntensity: 0,
  bubble: 0xffffff,
  bubbleOpacity: 0.6,
}

const DEEP: Palette = {
  water: [0x5d4db4, 0x44378f, 0x2e2669, 0x1d1848],
  fog: { color: 0x2e2669, near: 900, far: 2600 },
  hemi: { sky: 0xb3a3ff, ground: 0x2a1f5c, intensity: 1.35 },
  key: { color: 0xd6c9ff, intensity: 1.6 },
  fill: { color: 0x7fd8ff, intensity: 0.7 },
  shadow: { color: 0x120e2b, opacity: 0.22 },
  ink: 0x1a1438,
  coral: [0x8a6fd6, 0x6e5ac8, 0x9b7fe3, 0x3f9aa0],
  coralTip: 0x7dffe0,
  coralTipGlow: 1.6,
  rock: 0x4a3d99,
  weed: 0x2f8f86,
  chain: 0x9a90d6,
  anchorMetal: 0x2a2f5a,
  anchorTrim: 0xe39b1c,
  mineShell: 0x241f4f,
  mineNub: 0x4a4380,
  mineLamp: 0xff4a64,
  mineLampGlow: 2.6,
  fishBody: 0xff9a52,
  fishFin: 0xffc85e,
  fishStripe: 0xf0ebff,
  fishGlow: 0xff9e4a,
  fishGlowIntensity: 0.4,
  bubble: 0xc9f6ff,
  bubbleOpacity: 0.45,
}

const cA = new THREE.Color()
const cB = new THREE.Color()
const cOut = new THREE.Color()

function mixHex(a: number, b: number, t: number): number {
  cA.setHex(a)
  cB.setHex(b)
  return cOut.copy(cA).lerp(cB, t).getHex()
}

/* The water blends through hue, so mid-depth passes through periwinkle
   instead of the grey an RGB mix of aqua and purple would give. */
function mixHueHex(a: number, b: number, t: number): number {
  cA.setHex(a)
  cB.setHex(b)
  return cOut.copy(cA).lerpHSL(cB, t).getHex()
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function paletteAt(t: number): Palette {
  const k = Math.max(0, Math.min(1, t))
  return {
    water: SURFACE.water.map((c, i) => mixHueHex(c, DEEP.water[i], k)) as Palette['water'],
    fog: {
      color: mixHueHex(SURFACE.fog.color, DEEP.fog.color, k),
      near: mix(SURFACE.fog.near, DEEP.fog.near, k),
      far: mix(SURFACE.fog.far, DEEP.fog.far, k),
    },
    hemi: {
      sky: mixHex(SURFACE.hemi.sky, DEEP.hemi.sky, k),
      ground: mixHex(SURFACE.hemi.ground, DEEP.hemi.ground, k),
      intensity: mix(SURFACE.hemi.intensity, DEEP.hemi.intensity, k),
    },
    key: {
      color: mixHex(SURFACE.key.color, DEEP.key.color, k),
      intensity: mix(SURFACE.key.intensity, DEEP.key.intensity, k),
    },
    fill: {
      color: mixHex(SURFACE.fill.color, DEEP.fill.color, k),
      intensity: mix(SURFACE.fill.intensity, DEEP.fill.intensity, k),
    },
    shadow: {
      color: mixHex(SURFACE.shadow.color, DEEP.shadow.color, k),
      opacity: mix(SURFACE.shadow.opacity, DEEP.shadow.opacity, k),
    },
    ink: mixHex(SURFACE.ink, DEEP.ink, k),
    coral: SURFACE.coral.map((c, i) => mixHex(c, DEEP.coral[i], k)) as Palette['coral'],
    coralTip: mixHex(SURFACE.coralTip, DEEP.coralTip, k),
    coralTipGlow: mix(SURFACE.coralTipGlow, DEEP.coralTipGlow, k),
    rock: mixHex(SURFACE.rock, DEEP.rock, k),
    weed: mixHex(SURFACE.weed, DEEP.weed, k),
    chain: mixHex(SURFACE.chain, DEEP.chain, k),
    anchorMetal: mixHex(SURFACE.anchorMetal, DEEP.anchorMetal, k),
    anchorTrim: mixHex(SURFACE.anchorTrim, DEEP.anchorTrim, k),
    mineShell: mixHex(SURFACE.mineShell, DEEP.mineShell, k),
    mineNub: mixHex(SURFACE.mineNub, DEEP.mineNub, k),
    mineLamp: mixHex(SURFACE.mineLamp, DEEP.mineLamp, k),
    mineLampGlow: mix(SURFACE.mineLampGlow, DEEP.mineLampGlow, k),
    fishBody: mixHex(SURFACE.fishBody, DEEP.fishBody, k),
    fishFin: mixHex(SURFACE.fishFin, DEEP.fishFin, k),
    fishStripe: mixHex(SURFACE.fishStripe, DEEP.fishStripe, k),
    fishGlow: mixHex(SURFACE.fishGlow, DEEP.fishGlow, k),
    fishGlowIntensity: mix(SURFACE.fishGlowIntensity, DEEP.fishGlowIntensity, k),
    bubble: mixHex(SURFACE.bubble, DEEP.bubble, k),
    bubbleOpacity: mix(SURFACE.bubbleOpacity, DEEP.bubbleOpacity, k),
  }
}

export function hexToCss(hex: number): string {
  cA.setHex(hex)
  return `#${cA.getHexString()}`
}

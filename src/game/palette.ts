import * as THREE from 'three'

/**
 * The water starts at the bright reef surface and fades to the abyss as the
 * fish descends, reaching full depth after DARKEN_SCORE points (ten levels).
 */
export const DARKEN_SCORE = 50

export interface Palette {
  water: [number, number, number, number]
  fog: { color: number; near: number; far: number }
  hemi: { sky: number; ground: number; intensity: number }
  key: { color: number; intensity: number }
  fill: { color: number; intensity: number }
  coral: [number, number, number, number]
  coralTip: number
  coralTipGlow: number
  rock: number
  chain: number
  anchorMetal: number
  metalness: number
  metalRough: number
  mineShell: number
  mineSpike: number
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
  water: [0xcdf2fb, 0x5fc3e4, 0x1f6fa8, 0x0a2f52],
  fog: { color: 0x0a2f52, near: 620, far: 1560 },
  hemi: { sky: 0xeaffff, ground: 0x0d2c48, intensity: 2.6 },
  key: { color: 0xfff3e0, intensity: 3.6 },
  fill: { color: 0xbfe8ff, intensity: 1.8 },
  coral: [0xff6a44, 0xe8432f, 0xff9a52, 0xd8362a],
  coralTip: 0xffd166,
  coralTipGlow: 0,
  rock: 0x8c5a4a,
  chain: 0xb9c7d4,
  anchorMetal: 0x7b8b9c,
  metalness: 0.55,
  metalRough: 0.32,
  mineShell: 0x2f3a46,
  mineSpike: 0xc8a24a,
  mineLamp: 0xff4438,
  mineLampGlow: 1.1,
  fishBody: 0xff8a3d,
  fishFin: 0xffb066,
  fishStripe: 0xe8543f,
  fishGlow: 0xff7a3a,
  fishGlowIntensity: 0,
  bubble: 0xeaffff,
  bubbleOpacity: 0.42,
}

const DEEP: Palette = {
  water: [0x1a5570, 0x0b3a54, 0x05203a, 0x01101c],
  fog: { color: 0x04182b, near: 380, far: 1120 },
  hemi: { sky: 0x7fd8ff, ground: 0x01070d, intensity: 1.05 },
  key: { color: 0x9fd6ff, intensity: 1.9 },
  fill: { color: 0x1f5f80, intensity: 0.7 },
  coral: [0x123044, 0x0d2230, 0x17384c, 0x0a1b26],
  coralTip: 0x45e3d4,
  coralTipGlow: 2.4,
  rock: 0x081722,
  chain: 0x7fa2bc,
  anchorMetal: 0x36495a,
  metalness: 0.75,
  metalRough: 0.28,
  mineShell: 0x090f16,
  mineSpike: 0x22303c,
  mineLamp: 0xff3b52,
  mineLampGlow: 3,
  fishBody: 0xe2603a,
  fishFin: 0xc4602c,
  fishStripe: 0x8f2e22,
  fishGlow: 0xff7a3a,
  fishGlowIntensity: 1.1,
  bubble: 0x9ff0ff,
  bubbleOpacity: 0.3,
}

const cA = new THREE.Color()
const cB = new THREE.Color()
const cOut = new THREE.Color()

function mixHex(a: number, b: number, t: number): number {
  cA.setHex(a)
  cB.setHex(b)
  return cOut.copy(cA).lerp(cB, t).getHex()
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function paletteAt(t: number): Palette {
  const k = Math.max(0, Math.min(1, t))
  return {
    water: SURFACE.water.map((c, i) => mixHex(c, DEEP.water[i], k)) as Palette['water'],
    fog: {
      color: mixHex(SURFACE.fog.color, DEEP.fog.color, k),
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
    coral: SURFACE.coral.map((c, i) => mixHex(c, DEEP.coral[i], k)) as Palette['coral'],
    coralTip: mixHex(SURFACE.coralTip, DEEP.coralTip, k),
    coralTipGlow: mix(SURFACE.coralTipGlow, DEEP.coralTipGlow, k),
    rock: mixHex(SURFACE.rock, DEEP.rock, k),
    chain: mixHex(SURFACE.chain, DEEP.chain, k),
    anchorMetal: mixHex(SURFACE.anchorMetal, DEEP.anchorMetal, k),
    metalness: mix(SURFACE.metalness, DEEP.metalness, k),
    metalRough: mix(SURFACE.metalRough, DEEP.metalRough, k),
    mineShell: mixHex(SURFACE.mineShell, DEEP.mineShell, k),
    mineSpike: mixHex(SURFACE.mineSpike, DEEP.mineSpike, k),
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

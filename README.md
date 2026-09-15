# splashy-fish

A Flappy Bird-style game turned 90° — vertical instead of horizontal. The
fish swims further down the water column instead of flying rightward, and
a current pulls it sideways the way gravity pulls the bird down. There's
one action: **splash**, which pushes the fish right for a moment, just like
a flap pushes the bird up. Let go and the current drags it left again.
Dodge the coral reefs and hanging anchors that scroll up the screen as you
descend.

Built on [generic-game-template](https://github.com/mtd-public/generic-game-template):
the topbar, footer, score/depth sidebar, and start/pause/game-over overlay
are the template's shell. The game itself lives in `src/game/`: physics
and scoring in `physics.ts` (plain logical coordinates, no rendering
concerns), the React game loop in `useGameEngine.ts`, and a
[three.js](https://threejs.org/) scene in `scene3d.ts` — a 3D fish, coral
and anchor obstacles, ambient bubbles, and a burst of splash particles on
every tap — driven from `src/components/GameCanvas.tsx` into `.board-shell`.

## Controls

- **Tap/click the board**, press **Space** / **↑**, or press the **Splash**
  button — swims the fish right.
- **P** or the Pause button — pause/resume.

## Develop

```
npm install
npm run dev
```

## Build

```
npm run build
```

Update `base` in `vite.config.ts` to match this repo's name before deploying
to GitHub Pages.

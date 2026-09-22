# splashy-fish

A Flappy Bird-style game turned 90° — vertical instead of horizontal. The
fish swims further down the water column instead of flying rightward, and
a current pulls it sideways the way gravity pulls the bird down. There's
one action: **splash**, which pushes the fish right for a moment, just like
a flap pushes the bird up. Let go and the current drags it left again.
Dodge the coral reefs, chained anchors and moored mines that scroll up the
screen as you descend — and the deeper you get, the darker the water, until
the reef shallows have faded into the abyss.

Built on [generic-game-template](https://github.com/mtd-public/generic-game-template):
the topbar, footer, score/depth sidebar, and start/pause/game-over overlay
are the template's shell. The game itself lives in `src/game/`: physics
and scoring in `physics.ts` (plain logical coordinates, no rendering
concerns), the React game loop in `useGameEngine.ts`, the surface-to-abyss
colour ramp in `palette.ts`, and a [three.js](https://threejs.org/) scene in
`scene3d.ts` — a chibi clownfish, coral, anchor and mine bands, ambient
bubbles and splash particles — driven from `src/components/GameCanvas.tsx`
into `.board-shell`.

The art style follows [gig-ambulance](https://github.com/mtd-public/gig-ambulance):
chunky, smooth-shaded toy shapes with thin ink outlines and soft drop
shadows, pastel colours on a lavender base, and a HUD of cream cards with
thick ink borders. The descent fades the reef into a purple twilight rather
than black, so everything stays readable.

The camera always frames the full playfield width, so obstacle bands reach
both edges whatever shape the window is. On phones and tablets held upright
the board fills everything below the topbar; landscape and desktop get the
windowed board with the stats card and the splash button.

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

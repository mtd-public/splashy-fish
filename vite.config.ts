import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves project sites from /<repo-name>/ — update this if
// this repo is ever renamed or forked under a different name.
export default defineConfig({
  base: '/splashy-fish/',
  plugins: [react()],
})

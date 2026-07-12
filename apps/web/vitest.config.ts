import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{spec,test}.ts', 'src/**/*.{spec,test}.tsx'],
  },
})

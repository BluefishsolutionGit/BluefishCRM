import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{spec,test}.ts'],
    // Exclude e2e/integration tests that touch the DB — CI has a Postgres
    // service but unit tests here are meant to be self-contained.
    exclude: ['node_modules', 'dist', 'prisma'],
  },
})

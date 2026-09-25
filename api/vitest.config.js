import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './src/test/testDatabase.js';

export default defineConfig({
  test: {
    environment: 'node',
    // Red-team #25: every test file shares one Postgres. Running files in parallel means
    // two files' "delete everything, seed the cast" setup could interleave and corrupt each other.
    fileParallelism: false,
    globalSetup: ['./src/test/globalSetup.js'],
    env: { NODE_ENV: 'test', DATABASE_URL: TEST_DATABASE_URL },
    hookTimeout: 15_000, // first query after `docker compose up` can be slow while Postgres wakes up
  },
});

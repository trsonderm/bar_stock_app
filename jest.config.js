const nextJest = require('next/jest')

// Loads next.config.mjs and .env files into the test environment.
const createJestConfig = nextJest({
    dir: './',
})

/** Unit tests only; Playwright end-to-end specs live in /tests and run via `npx playwright test`. */
const customJestConfig = {
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    testEnvironment: 'jest-environment-jsdom',
    testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/.next/', '<rootDir>/tests/'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    transformIgnorePatterns: [
        '/node_modules/(?!(jose|bcryptjs)/)',
    ],
}

// Exported this way so next/jest can load the (async) Next.js config.
module.exports = createJestConfig(customJestConfig)

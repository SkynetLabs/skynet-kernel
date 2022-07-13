/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: [
    "src-test/test.ts", // Don't run legacy tests with Jest
  ],
};

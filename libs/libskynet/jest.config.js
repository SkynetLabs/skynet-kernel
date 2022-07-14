/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  preset: "ts-jest",
  resolver: "jest-ts-webcompat-resolver",
  testEnvironment: "node",
  testPathIgnorePatterns: [
    "src-test/test.ts", // Don't run legacy tests with Jest
    "dist-test/",
  ],
};

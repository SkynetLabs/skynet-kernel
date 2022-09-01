/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
export default {
  preset: "ts-jest",
  resolver: "jest-ts-webcompat-resolver",
  testEnvironment: "node",
  testPathIgnorePatterns: ["dist/"],
};

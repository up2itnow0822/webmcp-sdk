import globals from "globals";
export default [
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
      parser: (await import("@typescript-eslint/parser")).default,
    },
    rules: {
      "no-undef": "off", // TypeScript handles this
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-eval": "error",
      "no-implied-eval": "error",
      "prefer-const": "warn",
      "eqeqeq": "warn",
    }
  }
];

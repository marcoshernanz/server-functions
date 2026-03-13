import tsParser from "@typescript-eslint/parser";

import serverFunctionsPlugin from "./eslint/server-functions-plugin.js";

export default [
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "server-functions": serverFunctionsPlugin,
    },
    rules: {
      "server-functions/prefer-server-function": "error",
      "server-functions/no-whole-input-forwarding": "error",
    },
  },
  {
    ignores: ["node_modules/**"],
  },
];

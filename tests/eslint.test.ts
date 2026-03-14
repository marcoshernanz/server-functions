import assert from "node:assert/strict";

import { ESLint } from "eslint";

async function createEslint() {
  return new ESLint({
    overrideConfigFile: "./eslint.config.js",
    cwd: process.cwd(),
    ignore: false,
  });
}

function getSingleResult(results: ESLint.LintResult[]): ESLint.LintResult {
  const [result] = results;

  assert.ok(result, "Expected exactly one lint result");

  return result;
}

const eslint = await createEslint();

const badExportResult = getSingleResult(
  await eslint.lintText(
    `
      "use server";

      export async function updateProfile(input: { name: string }) {
        return input.name;
      }
    `,
    { filePath: "bad-export.ts" },
  ),
);

assert.equal(badExportResult.errorCount, 1);
assert.equal(
  badExportResult.messages[0]?.ruleId,
  "server-functions/prefer-server-function",
);
assert.ok(
  badExportResult.messages[0]?.suggestions?.[0]?.desc?.includes(
    "serverFunction",
  ),
  "Expected a serverFunction conversion suggestion",
);
assert.ok(
  badExportResult.messages[0]?.suggestions?.[0]?.fix?.text?.includes(
    "policies: []",
  ),
  "Expected the suggestion to include a serverFunction skeleton",
);

const badForwardingResult = getSingleResult(
  await eslint.lintText(
    `
      "use server";

      import { serverFunction } from "./src/index.js";
      import { z } from "zod";

      export const updateProfile = serverFunction({
        input: z.object({ name: z.string() }),
        policies: [],
        handler: async (_context, input) => {
          await db.user.update({
            where: { id: "user_123" },
            data: input,
          });

          return { ok: true };
        },
      });
    `,
    { filePath: "bad-forwarding.ts" },
  ),
);

assert.equal(badForwardingResult.errorCount, 1);
assert.equal(
  badForwardingResult.messages[0]?.ruleId,
  "server-functions/no-whole-input-forwarding",
);

const goodResult = getSingleResult(
  await eslint.lintText(
    `
      "use server";

      import { serverFunction } from "./src/index.js";
      import { z } from "zod";

      export const updateProfile = serverFunction({
        input: z.object({ name: z.string() }),
        policies: [],
        handler: async (context, input) => {
          await db.user.update({
            where: { id: context.requestId },
            data: { name: input.name },
          });

          return { ok: true };
        },
      });
    `,
    { filePath: "good.ts" },
  ),
);

assert.equal(goodResult.errorCount, 0);

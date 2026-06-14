import { resolve } from "node:path";
import { validateAllRunReports } from "./index";

async function main(): Promise<void> {
  const projectRoot = resolve(process.argv[2] ?? process.cwd());
  const validations = await validateAllRunReports(projectRoot);

  if (validations.length === 0) {
    console.log(JSON.stringify({ projectRoot, runs: 0, valid: true, message: "No run reports found." }, null, 2));
    return;
  }

  const invalid = validations.filter((validation) => !validation.valid);
  console.log(
    JSON.stringify(
      {
        projectRoot,
        runs: validations.length,
        valid: invalid.length === 0,
        validations
      },
      null,
      2
    )
  );

  if (invalid.length > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

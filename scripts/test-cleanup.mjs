import { TestResources, testConfig } from "./test-resources.mjs";

try {
  if (process.argv.length !== 3) throw new Error("Usage: npm run test:cleanup -- <run-id>");
  const run = await new TestResources(testConfig(process.env.TEST_APP_URL ?? process.env.BASE_URL)).resume(
    process.argv[2],
  );
  await run.cleanup();
  console.log(`Cleaned run ${process.argv[2]}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

#!/usr/bin/env node
import { register } from "tsx/esm/api";
const unregister = register();
const args = process.argv.slice(2);
try {
  const { main } = await import("./cli/main.ts");
  await main(args);
} finally {
  await unregister();
}
// main() awaits Studio's server.close() and releases its resources before
// returning. Dependency-scanner workers can still retain Windows handles after
// an interrupted initial scan. This executable owns the process lifetime;
// finish only after both output streams have flushed the final response.
if (args[0] === "studio") {
  await Promise.all(
    [process.stdout, process.stderr].map(
      (stream) => new Promise((resolve, reject) => {
        stream.write("", (error) => error ? reject(error) : resolve());
      }),
    ),
  );
  process.exit(process.exitCode ?? 0);
}

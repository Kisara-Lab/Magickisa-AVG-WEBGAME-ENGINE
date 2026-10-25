import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit", env: { ...process.env, MAGICKISA_BUILD_EDITOR: "1", NODE_ENV: "production" },
});
process.exit(result.status ?? 1);

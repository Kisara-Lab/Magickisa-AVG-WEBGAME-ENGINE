#!/usr/bin/env node
import { register } from "tsx/esm/api";
register();
const { main } = await import("./cli/main.ts");
await main(process.argv.slice(2));

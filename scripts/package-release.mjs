import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import yazl from "yazl";
import { pipeline } from "node:stream/promises";

const root = process.cwd(),
  ref = process.argv[2] || "HEAD";
const tag = process.argv[3] || "v1.0legacy";
if (!/^[a-zA-Z0-9._-]+$/.test(tag)) throw new Error("Invalid release name");
const output = path.join(root, "release-artifacts");
fs.mkdirSync(output, { recursive: true });
const source = `MAGICKISA-${tag}-source.zip`,
  starter = `MAGICKISA-${tag}-Studio-start.zip`;
execFileSync(
  "git",
  [
    "archive",
    "--format=zip",
    "--prefix=MAGICKISA/",
    "-o",
    path.join(output, source),
    ref,
  ],
  { cwd: root },
);
// Only tracked files at the exact release ref are eligible, never local projects or secrets.
const names = execFileSync("git", ["ls-tree", "-r", "--name-only", "-z", ref], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean);
const archive = new yazl.ZipFile();
const writing = pipeline(
  archive.outputStream,
  fs.createWriteStream(path.join(output, starter)),
);
for (const name of names) {
  if (
    name.startsWith(".github/") ||
    name.startsWith("tests/") ||
    name === ".gitignore"
  )
    continue;
  if (
    /(^|\/)(?:node_modules|workspace-projects|\.studio-transfers|dist-studio)\//.test(
      name,
    ) ||
    /(?:\.env|\.pem|\.key)$/.test(name)
  )
    throw new Error("Forbidden release file: " + name);
  const data = execFileSync("git", ["show", `${ref}:${name}`], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  });
  archive.addBuffer(data, "MAGICKISA/" + name, {
    mode: /\.(sh|command)$/.test(name) ? 0o100755 : 0o100644,
  });
}
archive.end();
await writing;
fs.writeFileSync(
  path.join(output, "SHA256SUMS.txt"),
  [source, starter]
    .map(
      (name) =>
        `${crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.join(output, name)))
          .digest("hex")}  ${name}\n`,
    )
    .join(""),
);
console.log(output);

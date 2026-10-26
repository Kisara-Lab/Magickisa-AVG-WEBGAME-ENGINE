import fs from "node:fs";
import path from "node:path";
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
const sections = [
  "# Third-party notices",
  "MAGICKISA source and original Studio SVG branding are MIT licensed. Dependencies retain their own copyrights and licenses. No third-party game artwork, music, fonts, Cubism SDK or models are distributed in this repository.",
  "This inventory is generated from package-lock.json. Full license texts below are collected from installed packages; platform-specific optional packages remain listed in the inventory. Run `npm run notices:update` after dependency changes.",
  "## Locked dependency inventory",
];
const table = ["| Package | Version | License |", "| --- | --- | --- |"];
for (const [directory, pkg] of Object.entries(lock.packages)) {
  if (!directory) continue;
  const name = directory.replace(/^.*node_modules\//, "");
  table.push(
    `| ${name} | ${pkg.version} | ${pkg.license || "See package license"} |`,
  );
}
const inventory = table.join("\n");
if (process.argv.includes("--check")) {
  const committed = fs
    .readFileSync("THIRD_PARTY_NOTICES.md", "utf8")
    .replaceAll("\r\n", "\n");
  const actual = committed
    .split("## Locked dependency inventory\n\n")[1]
    ?.split("\n\n## Installed dependency license texts")[0];
  if (actual === undefined)
    throw new Error(
      "Third-party inventory section not found. Run npm run notices:update and review the file structure.",
    );
  if (actual !== inventory)
    throw new Error(
      "Third-party inventory is stale or malformed. Run npm run notices:update and review license texts.",
    );
  console.log("Third-party lockfile inventory matches");
  process.exit(0);
}
sections.push(inventory);
sections.push("## Installed dependency license texts");
for (const directory of Object.keys(lock.packages).sort()) {
  if (!directory || !fs.existsSync(directory)) continue;
  const files = fs
    .readdirSync(directory)
    .filter((name) => /^(licen[cs]e|copying|notice)(\.|$|-)/i.test(name));
  for (const file of files) {
    const filename = path.join(directory, file);
    if (!fs.statSync(filename).isFile()) continue;
    sections.push(
      `### ${directory.replace(/^.*node_modules\//, "")} — ${file}`,
      "~~~~text",
      fs.readFileSync(filename, "utf8").trim(),
      "~~~~",
    );
  }
}
fs.writeFileSync(
  "THIRD_PARTY_NOTICES.md",
  sections
    .join("\n\n")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n") + "\n",
);
console.log("Updated third-party inventory and license texts");

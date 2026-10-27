import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import yauzl from "yauzl";
import yazl from "yazl";

const legacy =
  "https://github.com/Kisara-Lab/Magickisa-AVG-WEBGAME-ENGINE/releases/tag/v1.0legacy";

// Change only metadata, keeping every payload byte and its original checksum.
export async function legacyModernPackage(buffer, profile = "modern") {
  const entries = await new Promise((resolve, reject) => {
    const files = [];
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      zip.on("error", reject);
      zip.on("end", () => resolve(files));
      zip.on("entry", (entry) => {
        zip.openReadStream(entry, (error, stream) => {
          if (error) return reject(error);
          const chunks = [];
          stream.on("error", reject);
          stream.on("data", (chunk) => chunks.push(chunk));
          stream.on("end", () => {
            files.push([entry.fileName, Buffer.concat(chunks)]);
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
  const manifest = entries.find(([name]) => name === "manifest.json");
  const data = JSON.parse(manifest[1].toString());
  assert.equal(
    data.studioVersion,
    JSON.parse(fs.readFileSync("package.json", "utf8")).version,
  );
  assert.equal(data.profile, "modern");
  assert.equal(data.version, 1);
  data.studioVersion = "1.0.0";
  data.profile = profile;
  manifest[1] = Buffer.from(JSON.stringify(data));
  const zip = new yazl.ZipFile();
  const output = new Promise((resolve, reject) => {
    const chunks = [];
    zip.outputStream.on("data", (chunk) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
  });
  for (const [name, content] of entries) zip.addBuffer(content, name);
  zip.end();
  return output;
}

export async function rejectLegacyPackages(origin, buffer, workspaceId) {
  const before = fs.readFileSync(
    path.join("workspace-projects", workspaceId, "project.json"),
  );
  for (const profile of ["release", null]) {
    const response = await fetch(
      `${origin}/__studio/packages/upload?workspaceId=${workspaceId}`,
      {
        method: "POST",
        body: await legacyModernPackage(buffer, profile),
      },
    );
    assert.ok(response.ok);
    const { id } = await response.json();
    let task;
    for (let i = 0; i < 100; i++) {
      task = await (
        await fetch(
          `${origin}/__studio/packages/${id}?workspaceId=${workspaceId}`,
        )
      ).json();
      assert.notEqual(task.status, "ready");
      if (task.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(task.status, "failed");
    if (profile === "release") assert.ok(task.error.includes(legacy));
    const commit = await fetch(
      `${origin}/__studio/packages/commit?workspaceId=${workspaceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      },
    );
    assert.equal(commit.ok, false);
    await fetch(
      `${origin}/__studio/packages/cancel?workspaceId=${workspaceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      },
    );
  }
  assert.deepEqual(
    fs.readFileSync(
      path.join("workspace-projects", workspaceId, "project.json"),
    ),
    before,
  );
  console.log(
    "PASS legacy/invalid packages rejected without modifying the source project",
  );
}

export async function modernBoundaryRegression(origin, page) {
  const root = path.resolve("workspace-projects");
  const id = crypto.randomUUID();
  const directory = path.join(root, id);
  fs.mkdirSync(directory, { recursive: true });
  const files = {
    "workspace.json": JSON.stringify({
      id,
      profile: "release",
      name: "legacy fixture",
    }),
    "project.json": JSON.stringify({ id: "legacy", nodes: [] }),
  };
  try {
    for (const [name, data] of Object.entries(files))
      fs.writeFileSync(path.join(directory, name), data);
    const list = await (await fetch(`${origin}/__studio/workspaces`)).json();
    assert.ok(list.unsupportedProjects >= 1);
    assert.ok(!list.projects.some((p) => p.id === id));
    for (const route of [
      "project?profile=release",
      `project?workspaceId=${id}`,
      "media/release/file.png",
    ]) {
      const response = await fetch(`${origin}/__studio/${route}`);
      assert.equal(response.ok, false);
      assert.ok((await response.text()).includes(legacy));
    }
    await page.goto(`${origin}/engine.html`);
    await page.evaluate(() =>
      localStorage.setItem("magickisa-legacy-test", "keep-original"),
    );
    await page.goto(`${origin}/engine.html?profile=release`);
    await page.getByRole("alert").waitFor();
    assert.equal(
      await page
        .getByRole("link", { name: "v1.0legacy", exact: true })
        .getAttribute("href"),
      legacy,
    );
    assert.equal(
      await page.evaluate(() => localStorage.getItem("magickisa-legacy-test")),
      "keep-original",
    );
    for (const [name, data] of Object.entries(files))
      assert.equal(fs.readFileSync(path.join(directory, name), "utf8"), data);
    console.log(
      "PASS legacy URLs/workspaces rejected, originals and browser records retained",
    );
  } finally {
    if (path.dirname(directory) !== root)
      throw new Error("Invalid fixture cleanup target");
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

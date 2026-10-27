import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

export async function cliBrowserRegression(browser, origin) {
  const root = process.cwd();
  async function cli(args, value, expected = 0) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.join(root, "scripts/magickisa.mjs"), ...args, "--json"],
        { cwd: root, windowsHide: true },
      );
      let output = "",
        errors = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (errors += chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        try {
          resolve({ code, ...JSON.parse(output) });
        } catch {
          reject(new Error(output + errors));
        }
      });
      child.stdin.end(value);
    });
    assert.equal(result.code, expected, JSON.stringify(result));
    return expected === 0 ? result.data : result.error;
  }
  const created = await cli([
    "project",
    "create",
    "--name",
    "CLI Studio interop",
  ]);
  const id = created.workspaceId;
  const directory = path.resolve(root, "workspace-projects", id);
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const args = ["edit", "--workspace", id, "--data", "-"];
    await cli(
      args,
      JSON.stringify({
        operations: [
          {
            op: "line.update",
            scene: "scene-001",
            id: "line-001",
            value: { text: "CLI first" },
          },
        ],
      }),
    );
    await cli(["agent", "init", "--workspace", id]);
    const moduleFile = path.join(directory, "authoring/modules/story.json");
    const module = {
      formatVersion: 1,
      nodes: [
        { id: "scene-001", lines: [{ id: "line-001", text: "CLI first" }] },
      ],
    };
    fs.writeFileSync(moduleFile, JSON.stringify(module));
    const resolutions = path.join(directory, "adoption.json"),
      syncPlan = path.join(directory, "plan.json");
    fs.writeFileSync(
      resolutions,
      JSON.stringify({
        formatVersion: 1,
        resolutions: [{ path: "/nodes/@scene-001", take: "incoming" }],
      }),
    );
    await cli([
      "sync",
      "plan",
      "--workspace",
      id,
      "--resolutions",
      resolutions,
      "--out",
      syncPlan,
    ]);
    await cli(["sync", "apply", "--workspace", id, "--file", syncPlan]);
    await page.goto(`${origin}/engine.html?workspaceId=${id}`);
    const line = page.locator(".st-line textarea").first();
    await line.waitFor();
    assert.equal(await line.inputValue(), "CLI first");
    await line.fill("browser stale draft");
    await cli(
      args,
      JSON.stringify({
        operations: [
          {
            op: "line.update",
            scene: "scene-001",
            id: "line-001",
            value: { text: "CLI latest" },
          },
        ],
      }),
    );
    await page.keyboard.press("Control+s");
    await page
      .getByText(/工程文件已变化/)
      .first()
      .waitFor();
    assert.equal(
      (await cli(["project", "show", "--workspace", id])).project.nodes[0]
        .lines[0].text,
      "CLI latest",
    );
    const lock = path.join(directory, ".magickisa-write.lock");
    fs.mkdirSync(lock);
    fs.writeFileSync(
      path.join(lock, "owner.json"),
      JSON.stringify({ pid: process.pid, token: "browser-test" }),
    );
    try {
      const response = await fetch(
        `${origin}/__studio/project?workspaceId=${id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project: created.project,
            revision: created.revision,
          }),
        },
      );
      assert.equal(response.status, 409);
    } finally {
      fs.rmSync(lock, { recursive: true });
    }
    const freshContext = await browser.newContext();
    try {
      const fresh = await freshContext.newPage();
      await fresh.goto(`${origin}/engine.html?workspaceId=${id}`);
      const updated = fresh.locator(".st-line textarea").first();
      await updated.waitFor();
      assert.equal(await updated.inputValue(), "CLI latest");
      await updated.fill("Studio continues CLI project");
      await fresh.keyboard.press("Control+s");
      for (let i = 0; i < 100; i++) {
        if (
          (await cli(["project", "show", "--workspace", id])).project.nodes[0]
            .lines[0].text === "Studio continues CLI project"
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      assert.equal(
        (await cli(["project", "show", "--workspace", id])).project.nodes[0]
          .lines[0].text,
        "Studio continues CLI project",
      );
    } finally {
      await freshContext.close();
    }
    module.nodes[0].lines[0].text = "New incoming script";
    fs.writeFileSync(moduleFile, JSON.stringify(module));
    const conflictingPlan = path.join(directory, "conflict.json");
    await cli(
      ["sync", "plan", "--workspace", id, "--out", conflictingPlan],
      undefined,
      1,
    );
    assert.ok(
      JSON.parse(fs.readFileSync(conflictingPlan, "utf8")).conflicts.some(
        (item) => item.path === "/nodes/@scene-001/lines/@line-001/text",
      ),
    );
    console.log(
      "PASS CLI/Studio: shared project editing, stale draft 409, cross-process write lock, continued save",
    );
  } finally {
    try {
      await context.close();
    } catch (error) {
      console.error("Browser cleanup failed", error);
      process.exitCode = 1;
    }
    if (path.dirname(directory) !== path.resolve(root, "workspace-projects")) {
      console.error("Invalid cleanup: skipped");
      process.exitCode = 1;
    } else
      try {
        fs.rmSync(directory, { recursive: true, force: true });
      } catch (error) {
        console.error("Workspace cleanup failed", error);
        process.exitCode = 1;
      }
  }
}

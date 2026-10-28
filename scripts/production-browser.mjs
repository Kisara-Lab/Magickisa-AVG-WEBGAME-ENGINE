import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

export async function productionBrowser(browser, origin) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let id;
  const api = async (route, body) => {
    const response = await fetch(
      `${origin}/__studio/${route}?profile=modern${id ? "&workspaceId=" + id : ""}`,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    const data = await response.json();
    assert.equal(response.status, 200, JSON.stringify(data));
    return data;
  };
  try {
    id = (await api("workspaces/create", { name: "多轨创作验收" })).id;
    const initial = await api("project");
    const project = initial.project;
    project.sequences = [
      {
        id: "test",
        name: "多轨检验",
        duration: 10,
        skippable: true,
        waits: [],
        tracks: [
          {
            id: "caption",
            kind: "text",
            target: "字幕",
            text: "测试字幕",
            start: 1,
            duration: 4,
            properties: {},
          },
        ],
      },
    ];
    await api("project", { project, revision: initial.revision });
    await page.goto(`${origin}/engine.html?profile=modern&workspaceId=${id}`);
    await page.getByRole("button", { name: "演出", exact: true }).click();
    await page.getByRole("heading", { name: "多轨演出与舞台" }).waitFor();
    const clip = page.locator(".production-track button").first();
    await clip.click();
    await page.getByText("当前轨道检查器", { exact: false }).first().click();
    await page.getByLabel("开始时间", { exact: true }).waitFor();
    await clip.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.getByLabel("开始时间", { exact: true }).inputValue(),
      "1.1",
    );
    const rect = await clip.boundingBox();
    await page.mouse.move(rect.x + 25, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + 65, rect.y + rect.height / 2, { steps: 5 });
    await page.mouse.up();
    assert.equal(
      await page.getByLabel("开始时间", { exact: true }).inputValue(),
      "2.1",
    );
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    assert.equal(
      await page.getByLabel("开始时间", { exact: true }).inputValue(),
      "1.1",
    );
    await page
      .getByRole("button", { name: "在播放头添加关键帧", exact: true })
      .click();
    await page.getByLabel("横向位置 (%)", { exact: true }).fill("25");
    await page.getByLabel("演出播放头", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "在播放头添加关键帧", exact: true })
      .click();
    assert.equal(
      await page.getByRole("button", { name: /^删除关键帧/ }).count(),
      2,
    );
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS production browser: timeline keyboard/drag, one-step undo, visual keyframes, mobile overflow",
    );
  } finally {
    await context.close();
    if (id) {
      const target = path.resolve("workspace-projects", id);
      assert.equal(path.dirname(target), path.resolve("workspace-projects"));
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = await createServer({ server: { port: 0, open: false } });
  let browser;
  try {
    await server.listen();
    browser = await chromium.launch({
      headless: true,
      ...(process.env.MAGICKISA_BROWSER
        ? { executablePath: process.env.MAGICKISA_BROWSER }
        : {}),
    });
    await productionBrowser(
      browser,
      `http://127.0.0.1:${server.httpServer.address().port}`,
    );
  } finally {
    await browser?.close();
    await server.close();
  }
}

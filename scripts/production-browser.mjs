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
      `${origin}/__studio/${route}${route.includes("?") ? "&" : "?"}profile=modern${id ? "&workspaceId=" + id : ""}`,
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
    const assetRequest = async (route, body) => {
      const response = await fetch(
        `${origin}/__studio/${route}&profile=modern&workspaceId=${id}`,
        { method: "POST", body },
      );
      const data = await response.json();
      assert.equal(response.status, 200, JSON.stringify(data));
      return data;
    };
    const asset = await assetRequest(
      "assets/upload?name=fixture.svg",
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
    );
    const inspected = await api(
      `assets/inspect?url=${encodeURIComponent(asset.url)}`,
    );
    const replaced = await assetRequest(
      `assets/replace?${new URLSearchParams({ url: asset.url, sha256: inspected.sha256, revision: inspected.revision, name: "replacement.svg" })}`,
      '<svg xmlns="http://www.w3.org/2000/svg"><title>更新</title></svg>',
    );
    const restore = await api(`assets/restore-plan?id=${replaced.backupId}`);
    await api("assets/restore", restore);
    assert.equal(
      (await api(`assets/inspect?url=${encodeURIComponent(asset.url)}`)).sha256,
      inspected.sha256,
    );
    assert.equal((await api("assets/history")).backups.length, 2);
    const initial = await api("project");
    const project = initial.project;
    project.variables = { clue: { type: "boolean", initial: false } };
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
    await page.getByRole("button", { name: "工程", exact: true }).click();
    await page.locator("summary").filter({ hasText: "协调重命名变量" }).click();
    await page.getByLabel("原变量名", { exact: true }).fill("clue");
    await page.getByLabel("新变量名", { exact: true }).fill("evidence");
    await page
      .getByRole("button", { name: "检查变量重命名", exact: true })
      .click();
    await page
      .getByRole("button", { name: "备份并重命名变量", exact: true })
      .click();
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"]'),
    );
    assert.equal(
      (await api("project")).project.variables.evidence.initial,
      false,
    );
    await page.getByRole("button", { name: "演出", exact: true }).click();
    await page.getByRole("heading", { name: "多轨演出与舞台" }).waitFor();
    const clip = page.locator(".production-track button").first();
    await clip.click();
    await page.getByText("当前轨道检查器", { exact: false }).first().click();
    await page.getByLabel("开始时间", { exact: true }).waitFor();
    await page.getByLabel("锁定当前轨道（本次编辑）", { exact: true }).check();
    assert.equal(
      await page.getByLabel("开始时间", { exact: true }).isDisabled(),
      true,
    );
    await clip.focus();
    await page.keyboard.press("ArrowRight");
    assert.equal(
      await page.getByLabel("开始时间", { exact: true }).inputValue(),
      "1",
    );
    await page
      .getByLabel("锁定当前轨道（本次编辑）", { exact: true })
      .uncheck();
    await page.getByLabel("独奏预览（不影响发行）", { exact: true }).check();
    await page.getByLabel("独奏预览（不影响发行）", { exact: true }).uncheck();
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
    if (process.env.MAGICKISA_SCREENSHOTS) {
      await page.locator(".production-timeline").scrollIntoViewIfNeeded();
      await page.screenshot({ path: "docs/images/production-timeline.png" });
    }
    await page.locator("summary").filter({ hasText: "复用演出预设" }).click();
    await page
      .getByRole("button", { name: "复制为独立演出", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("选择通用演出", { exact: true })
        .locator("option")
        .count(),
      3,
    );
    assert.notEqual(
      await page.getByLabel("选择通用演出", { exact: true }).inputValue(),
      "test",
    );
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    assert.equal(
      await page
        .getByLabel("选择通用演出", { exact: true })
        .locator("option")
        .count(),
      2,
    );
    await page.getByRole("button", { name: "剧本", exact: true }).click();
    await page.keyboard.press("Control+Enter");
    const previewFrame = page.frameLocator('iframe[title="游戏预览"]');
    await page.getByText("录制路线测试", { exact: true }).click();
    await page
      .getByRole("button", { name: "开始录制路线", exact: true })
      .click();
    await page
      .getByRole("button", { name: "停止录制并检查", exact: true })
      .waitFor();
    const frame = page.frames().find((f) => f.url().includes("studio-preview"));
    await frame.waitForFunction(() => !!window.__MAGICKISA_ENGINE__);
    await frame.evaluate(() => window.__MAGICKISA_ENGINE__.advance());
    await page
      .getByRole("button", { name: "停止录制并检查", exact: true })
      .click();
    await page
      .getByRole("button", { name: "加入创作测试（待保存）", exact: true })
      .click();
    await page.getByRole("button", { name: "工程", exact: true }).click();
    await page
      .getByRole("button", { name: "运行全部剧情测试", exact: true })
      .click();
    await page.getByText("全部测试通过", { exact: true }).waitFor();
    if (process.env.MAGICKISA_SCREENSHOTS) {
      await page
        .getByText("全部测试通过", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: "docs/images/production-tests.png" });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 2,
      ),
    );
    if (process.env.MAGICKISA_SCREENSHOTS) {
      await page
        .getByText("全部测试通过", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: "docs/images/production-mobile.png" });
    }
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

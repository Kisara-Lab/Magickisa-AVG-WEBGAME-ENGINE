import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

export async function investigationBrowser(browser, origin) {
  const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      reducedMotion: "reduce",
    }),
    page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (dialog) => dialog.accept());
  let id;
  const created = [];
  async function api(route, body, expected = 200) {
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
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  }
  try {
    id = (await api("workspaces/create", { name: "调查画布验收" })).id;
    created.push(id);
    const before = await api("project"),
      project = before.project;
    project.startNodeId = "hub";
    project.materials = [
      {
        id: "key",
        title: "书房钥匙",
        category: "线索",
        body: "一把旧钥匙",
        unlock: { type: "flag", key: "found" },
      },
    ];
    project.nodes = [
      {
        id: "hub",
        title: "调查大厅",
        chapter: "第一章",
        lines: [{ id: "hub-line", text: "调查大厅，决定下一步。" }],
        onEnter: [{ type: "increment", key: "visits", amount: 1 }],
        onComplete: [{ type: "set", key: "complete", value: true }],
        next: "end",
        choices: [
          {
            id: "search",
            label: "搜查书房",
            target: "room",
            once: true,
            condition: { type: "flag", key: "complete" },
            effects: [{ type: "set", key: "found", value: true }],
          },
          { id: "ask", label: "再次询问", target: "hub" },
        ],
      },
      {
        id: "room",
        title: "书房",
        chapter: "第二章",
        lines: [{ id: "room-line", text: "钥匙旁有一份证词。" }],
        condition: { type: "flag", key: "found" },
        next: "hub",
      },
      {
        id: "end",
        title: "案件终了",
        lines: [{ id: "end-line", text: "真相大白。" }],
        ending: "solved",
      },
    ];
    await api("project", { project, revision: before.revision });
    const initial = await api("studio-data");
    const data = {
      formatVersion: 1,
      positions: {
        hub: { x: 0, y: 0 },
        room: { x: 500, y: 0 },
        end: { x: 1000, y: 0 },
      },
      variables: {
        found: {
          label: "取得钥匙",
          type: "boolean",
          description: "搜查后为真",
        },
      },
      presets: [
        {
          id: "investigate",
          name: "大厅读取开始",
          nodeId: "hub",
          phase: "start",
          variables: { visits: 8 },
          visitedNodes: [],
          usedChoices: [],
          unlockedMaterials: [],
          readMaterials: [],
        },
      ],
    };
    await api("studio-data", { data, revision: initial.revision });
    await api(
      "studio-data",
      { data: { ...data, positions: {} }, revision: initial.revision },
      409,
    );
    await page.goto(`${origin}/engine.html?profile=modern&workspaceId=${id}`);
    await page.locator(".st-line textarea").first().waitFor();
    await page.getByRole("button", { name: "流程图", exact: true }).click();
    await page.getByLabel("可编辑剧情画布", { exact: true }).waitFor();
    await page.locator(".react-flow__node").first().waitFor();
    await page.getByRole("button", { name: "适应视图", exact: true }).click();
    const roomNode = page.locator('.react-flow__node[data-id="room"]'),
      hubNode = page.locator('.react-flow__node[data-id="hub"]');
    await roomNode.focus();
    await roomNode.press("Enter");
    assert.equal(
      await page.getByLabel("场景标题", { exact: true }).inputValue(),
      "书房",
    );
    await hubNode.focus();
    await hubNode.press("Enter");
    await hubNode.press("ArrowRight");
    await page.getByText("创作资料：未保存", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "撤销布局／资料", exact: true })
      .click();
    await page.getByText("创作资料：已保存", { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "hub → 搜查书房 → room", exact: true })
      .click();
    await page.getByLabel("分支文案", { exact: true }).fill("调查书房");
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    assert.equal(
      await page.getByLabel("分支文案", { exact: true }).inputValue(),
      "搜查书房",
    );
    await page.getByRole("button", { name: "重做", exact: true }).click();
    assert.equal(
      await page.getByLabel("分支文案", { exact: true }).inputValue(),
      "调查书房",
    );
    await page.getByLabel("门槛解释状态来源").selectOption("investigate");
    await page.getByText("search：可用", { exact: true }).waitFor();
    await page.getByRole("button", { name: "适应视图", exact: true }).click();
    await page
      .getByLabel("可编辑剧情画布", { exact: true })
      .scrollIntoViewIfNeeded();
    // Use real pointer events for graph wiring; applying is a single undo step.
    const source = page.locator(
      '.react-flow__node[data-id="hub"] .react-flow__handle[data-handleid="new"]',
    );
    const target = page.locator(
      '.react-flow__node[data-id="room"] .react-flow__handle[data-handleid="in"]',
    );
    const a = await source.boundingBox(),
      b = await target.boundingBox();
    assert(a && b);
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 15 });
    await page.mouse.up();
    await page.getByLabel("新分支文案", { exact: true }).fill("图上新增的连接");
    await page.getByRole("button", { name: "应用连接", exact: true }).click();
    await page
      .getByRole("button", { name: "hub → 图上新增的连接 → room", exact: true })
      .waitFor();
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    assert.equal(
      await page
        .getByRole("button", {
          name: "hub → 图上新增的连接 → room",
          exact: true,
        })
        .count(),
      0,
    );
    const imageDir = path.resolve("docs/images");
    fs.mkdirSync(imageDir, { recursive: true });
    await page.locator(".st-content").evaluate((e) => (e.scrollTop = 0));
    await page.locator(".st-flow-inspector").evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({
      path: path.join(imageDir, "investigation-flow.png"),
      fullPage: true,
    });
    // A visit can return to the precise edge inspector through navigation history.
    await page
      .getByRole("button", { name: "查看目标", exact: true })
      .first()
      .click();
    await page.getByLabel("场景标题", { exact: true }).waitFor();
    assert.equal(
      await page.getByLabel("场景标题", { exact: true }).inputValue(),
      "书房",
    );
    await page.getByRole("button", { name: "变量与线索", exact: true }).click();
    await page.getByLabel("选择测试预设").selectOption("investigate");
    await page
      .getByRole("button", { name: "带此状态真实预览", exact: true })
      .click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("iframe")).some(
        (frame) =>
          frame.contentWindow?.__MAGICKISA_ENGINE__?.save.variables.visits ===
          9,
      ),
    );
    const preview = page
      .frames()
      .find((frame) => frame.url().includes("studio-preview.html"));
    const checkpoint = await preview.evaluate(
      () => window.__MAGICKISA_ENGINE__.save,
    );
    assert.equal(checkpoint.nodeId, "hub");
    assert.equal(checkpoint.variables.visits, 9);
    await page.screenshot({
      path: path.join(imageDir, "investigation-debug.png"),
      fullPage: true,
    });
    assert.equal(
      (await api("project")).project.nodes[0].choices[0].label,
      "搜查书房",
      "test/preview must not save draft",
    );
    await page.getByLabel("预设名称", { exact: true }).fill("更新的测试状态");
    await page
      .getByRole("button", { name: "保存创作资料", exact: true })
      .click();
    await page.getByText("创作资料：已保存", { exact: true }).waitFor();
    const current = await api("studio-data");
    await api("studio-data", {
      data: {
        ...current.data,
        positions: { ...current.data.positions, hub: { x: 50, y: 50 } },
      },
      revision: current.revision,
    });
    await page.getByLabel("预设名称", { exact: true }).fill("保留的本地修改");
    await page
      .getByRole("button", { name: "保存创作资料", exact: true })
      .click();
    await page
      .getByRole("alert")
      .filter({ hasText: "创作资料已被其他标签页" })
      .waitFor();
    assert.equal(
      await page.getByLabel("预设名称", { exact: true }).inputValue(),
      "保留的本地修改",
    );
    for (const width of [1920, 1440, 1280, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.getByRole("button", { name: "流程图", exact: true }).click();
      assert(
        await page
          .getByRole("button", { name: "新增分支", exact: true })
          .isVisible(),
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
        `horizontal overflow at ${width}`,
      );
      if (width === 390)
        await page.screenshot({
          path: path.join(imageDir, "investigation-mobile.png"),
          fullPage: true,
        });
    }
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      window.__restoreGraphStorage = () =>
        (Storage.prototype.setItem = original);
      Storage.prototype.setItem = function (k, v) {
        if (k.startsWith("magickisa:graph:"))
          throw new DOMException("Storage full", "QuotaExceededError");
        return original.call(this, k, v);
      };
    });
    await page.getByLabel("筛选流程节点").fill("hub");
    await page.getByRole("alert").filter({ hasText: "偏好未保存" }).waitFor();
    await page.evaluate(() => window.__restoreGraphStorage());
    await page.getByLabel("筛选流程节点").fill("");
    id = (await api("workspaces/create", { name: "大型调查性能验收" })).id;
    created.push(id);
    const large = await api("project");
    large.project.startNodeId = "n0";
    large.project.nodes = Array.from({ length: 1000 }, (_, i) => ({
      id: "n" + i,
      title: "调查节点 " + i,
      chapter: "第" + (i % 8) + "章",
      lines: [{ id: "l" + i, text: "调查记录" }],
      choices: Array.from({ length: 5 }, (_, j) => ({
        id: `c${i}-${j}`,
        label: "线索 " + j,
        target: "n" + ((i + j + 1) % 1000),
      })),
    }));
    await api("project", { project: large.project, revision: large.revision });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`${origin}/engine.html?workspaceId=${id}`);
    await page.locator(".st-line textarea").first().waitFor();
    const start = performance.now();
    await page.getByRole("button", { name: "流程图", exact: true }).click();
    await page.locator(".react-flow__node").first().waitFor();
    console.log(
      "Large initial visible",
      await page.locator(".react-flow__node").count(),
      Math.round(performance.now() - start),
    );
    await page.getByLabel("视图", { exact: true }).selectOption("neighbors");
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length <= 11,
    );
    await page.getByLabel("场景标题", { exact: true }).fill("大型工程编辑");
    console.log("Large filtered", Math.round(performance.now() - start));
    assert(
      performance.now() - start < 20000,
      "large graph selection/filter/edit exceeded 20s",
    );
    console.log(
      `Large graph 1000/5000 browser render/filter/edit: ${Math.round(performance.now() - start)}ms`,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS investigation browser: graph/inspector, undo/redo, target search, real seeded preview, separate save/409 and 1920/1440/1280/390 layouts",
    );
  } finally {
    await context.close();
    for (const id of created) {
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
    await investigationBrowser(
      browser,
      `http://127.0.0.1:${server.httpServer.address().port}`,
    );
  } finally {
    await browser?.close();
    await server.close();
  }
}

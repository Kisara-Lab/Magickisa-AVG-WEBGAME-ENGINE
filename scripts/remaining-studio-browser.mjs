import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
export async function remainingStudioBrowser(browser, origin) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage(),
    errors = [];
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
    const result = await response.json();
    assert.equal(response.status, 200, JSON.stringify(result));
    return result;
  };
  try {
    id = (await api("workspaces/create", { name: "门槛与窄屏验收" })).id;
    const before = await api("project"),
      project = before.project;
    project.variables = { known: { type: "boolean", initial: false } };
    project.nodes[0].lines = [
      {
        id: "hidden-line",
        text: "笔误门槛隐藏文本",
        condition: { type: "flag", key: "knwon" },
      },
      { id: "shown-line", text: "正常可见文本" },
    ];
    await api("project", { project, revision: before.revision });
    const report = await api("validate", { project });
    assert.ok(
      report.issues.some(
        (i) =>
          i.code === "undeclared-variable" &&
          i.lineId === "hidden-line" &&
          i.position,
      ),
    );
    await page.goto(`${origin}/engine.html?profile=modern&workspaceId=${id}`);
    await page.getByLabel("场景标题", { exact: true }).waitFor();
    await page.keyboard.press("Control+Enter");
    await page.getByText("✓ 预览已同步", { exact: true }).waitFor();
    const diagnostics = page
      .locator("details")
      .filter({
        has: page.locator("summary").filter({ hasText: "条件求值与跳过台词" }),
      });
    await diagnostics.locator("summary").click();
    await diagnostics
      .getByRole("button", { name: /跳过台词.*hidden-line/ })
      .waitFor();
    await diagnostics.getByRole("button", { name: /不成立/ }).waitFor();
    await page.getByLabel("场景标题", { exact: true }).fill("改后的场景");
    await diagnostics.getByText(/诊断待更新/).waitFor();
    assert.equal(
      await diagnostics.getByRole("button", { name: /不成立/ }).isDisabled(),
      true,
    );
    const sidebarClosed = await page
      .locator(".studio-root")
      .evaluate((e) => e.classList.contains("sidebar-closed"));
    for (const width of [1050, 900, 701, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.equal(
        await page
          .getByRole("button", { name: "切换章节栏", exact: true })
          .isVisible(),
        false,
      );
      await page.getByLabel("跳转节点", { exact: true }).waitFor();
      const nav = page.locator(".st-mobile-node");
      if (!(await nav.locator("details").evaluate((e) => e.open)))
        await nav.locator("summary").click();
      await nav.getByLabel("窄屏搜索场景").fill("shown-line-not-present");
      await nav.getByText(/没有匹配场景/).waitFor();
      await nav.getByLabel("窄屏搜索场景").fill("正常可见文本");
      await nav.locator(`[data-scene-id="${project.nodes[0].id}"]`).click();
      assert.equal(
        await page
          .locator(".studio-root")
          .evaluate((e) => e.classList.contains("sidebar-closed")),
        sidebarClosed,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 2,
        ),
        `${width}px overflow`,
      );
    }
    await page
      .locator(".st-mobile-node")
      .getByRole("button", { name: "添加场景", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("跳转节点", { exact: true })
        .locator("option")
        .count(),
      project.nodes.length + 1,
    );
    await page.keyboard.press("Control+z");
    assert.equal(
      await page
        .getByLabel("跳转节点", { exact: true })
        .locator("option")
        .count(),
      project.nodes.length,
    );
    await page.setViewportSize({ width: 1280, height: 1000 });
    assert.equal(
      await page
        .getByRole("button", { name: "切换章节栏", exact: true })
        .isVisible(),
      true,
    );
    assert.equal(
      await page
        .locator(".studio-root")
        .evaluate((e) => e.classList.contains("sidebar-closed")),
      sidebarClosed,
    );
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    if (id) {
      const target = path.resolve("workspace-projects", id);
      assert.equal(path.dirname(target), path.resolve("workspace-projects"));
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
  console.log(
    "PASS remaining Studio: variable warnings, real condition/skip report, stale diagnostics and 1050/900/701/390 navigation",
  );
}

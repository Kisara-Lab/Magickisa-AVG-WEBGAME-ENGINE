import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright";
export async function playerBrowser(browser, origin) {
  const project = {
    schemaVersion: 3,
    id: "generated-player-test",
    title: "黄昏调查 · 玩家验收",
    version: "1.0.0",
    startNodeId: "hall",
    nodes: [
      {
        id: "hall",
        title: "门厅",
        chapter: "第一章",
        lines: [
          { id: "hall-1", text: "黄昏时分，侦探收到了一封信。👨‍👩‍👧‍👦 é 𠮷" },
          { id: "hall-2", text: "你听见远处传来钟声。" },
          { id: "hall-3", text: "请决定下一步。" },
        ],
        choices: [
          {
            id: "read-gate",
            label: "解读信件",
            target: "end",
            condition: { type: "material", id: "letter", state: "read" },
          },
          { id: "leave", label: "离开门厅", target: "end" },
        ],
      },
      {
        id: "end",
        title: "离开",
        ending: "departure",
        lines: [{ id: "end-1", text: "你的旅程暂告一段落。" }],
      },
      {
        id: "input",
        title: "署名",
        next: "end",
        lines: [
          {
            id: "name-line",
            text: "请填写你的名字。",
            input: { key: "playerName", label: "你的名字", maxLength: 40 },
          },
        ],
      },
    ],
    materials: [
      {
        id: "letter",
        title: "黄昏的信",
        body: "请在黄昏之前回来。",
        category: "clue",
      },
      {
        id: "key",
        title: "旧钥匙",
        body: "一把尚未细看的钥匙。",
        category: "clue",
      },
    ],
    characters: [],
    backdrops: [],
    audio: [],
    resources: { assetsBase: "/assets", sceneRules: [] },
    media: {},
    titleScreen: {
      overline: "MAGICKISA",
      subtitle: "生成的最小验收作品",
      studio: "Kisara-Lab",
    },
    ui: {},
  };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.route("**/content/engine-story.json", (r) =>
    r.fulfill({ json: project }),
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const button = (name) => page.getByRole("button", { name, exact: true });
  const snapshot = () => page.evaluate(() => window.__MAGICKISA_ENGINE__.save);
  const close = () =>
    page
      .getByRole("dialog")
      .last()
      .getByRole("button", { name: "关闭面板" })
      .click();
  async function menu(name) {
    await button("菜单").click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name, exact: true })
      .click();
  }
  try {
    await page.goto(origin);
    await button("开始游戏").waitFor();
    assert.equal(await button("继续游戏").isDisabled(), true);
    await button("设置").click();
    await page.getByRole("slider", { name: "主音量", exact: true }).fill("0.4");
    await close();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("magickisa-avg:v3:generated-player-test:auto"),
      ),
      null,
    );
    await page.reload();
    await button("开始游戏").waitFor();
    assert.equal(await button("继续游戏").isDisabled(), true);
    assert.equal((await snapshot()).audio.volume, 0.4);
    fs.mkdirSync("docs/images", { recursive: true });
    await page.screenshot({
      path: "docs/images/player-title.png",
      fullPage: true,
    });
    await button("开始游戏").click();
    await page.locator(".engine-splash").waitFor({ state: "hidden" });
    await page
      .locator(".dialogue-text")
      .getByText("黄昏时分", { exact: false })
      .waitFor();
    await menu("证据 · 未读");
    assert.deepEqual((await snapshot()).readMaterials, []);
    assert.equal(
      await page.evaluate(() =>
        window.__MAGICKISA_DEBUG__.testCondition({
          type: "material",
          id: "letter",
          state: "read",
        }),
      ),
      false,
    );
    await page
      .getByRole("button", { name: "黄昏的信 · 未读", exact: true })
      .click();
    await page.waitForFunction(() =>
      window.__MAGICKISA_ENGINE__.save.readMaterials.includes("letter"),
    );
    assert.equal((await snapshot()).readMaterials.includes("key"), false);
    assert.equal(
      await page.evaluate(() =>
        window.__MAGICKISA_DEBUG__.testCondition({
          type: "material",
          id: "letter",
          state: "read",
        }),
      ),
      true,
    );
    await close();
    await button("存读档").click();
    assert.equal(await page.locator("[data-slot]").count(), 13);
    await page
      .locator('[data-slot="manual-01"]')
      .getByRole("button", { name: "保存到此槽", exact: true })
      .click();
    const saved = await context.storageState();
    assert.ok(
      saved.origins[0].localStorage.some((x) => x.name.endsWith(":manual-01")),
    );
    await page.screenshot({
      path: "docs/images/player-saves.png",
      fullPage: true,
    });
    const automatic = await page.evaluate(() =>
      localStorage.getItem("magickisa-avg:v3:generated-player-test:auto"),
    );
    await page.getByLabel("导入存档", { exact: true }).setInputFiles({
      name: "中文 存档.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(await snapshot())),
    });
    await page.locator(".import-preview").waitFor();
    await page
      .locator('[data-slot="manual-02"]')
      .getByRole("button", { name: "导入到此槽", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "确认操作" })
      .getByRole("button", { name: "确认继续", exact: true })
      .click();
    await page.locator(".import-preview").waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("magickisa-avg:v3:generated-player-test:auto"),
      ),
      automatic,
    );
    assert.ok(
      await page.evaluate(() =>
        localStorage.getItem(
          "magickisa-avg:v3:generated-player-test:manual-02",
        ),
      ),
    );
    await page.evaluate(() => {
      window.originalPlayerSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.endsWith(":manual-12"))
          throw new DOMException("full", "QuotaExceededError");
        return window.originalPlayerSet.call(this, key, value);
      };
    });
    await page
      .locator('[data-slot="manual-12"]')
      .getByRole("button", { name: "保存到此槽", exact: true })
      .click();
    await page.getByRole("alert").filter({ hasText: "操作未完成" }).waitFor();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem(
          "magickisa-avg:v3:generated-player-test:manual-12",
        ),
      ),
      null,
    );
    await page.evaluate(() => {
      Storage.prototype.setItem = window.originalPlayerSet;
    });
    await close();
    await button("继续 ›").click();
    assert.equal((await snapshot()).lineIndex, 1);
    await button("存读档").click();
    await page
      .locator('[data-slot="manual-01"]')
      .getByRole("button", { name: "读取", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "确认操作" })
      .getByRole("button", { name: "确认继续", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal((await snapshot()).lineIndex, 0);
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              "magickisa-avg:v3:generated-player-test:auto:player-recovery",
            ),
          ).lineIndex,
      ),
      1,
    );
    // Preferences, first click reveals without changing runtime, repeat/composition never advances.
    await menu("阅读与演出设置");
    const speed = page.getByRole("slider", {
      name: "每字间隔（毫秒，0 为整句）",
      exact: true,
    });
    await speed.focus();
    await speed.press("End");
    await close();
    const before = await snapshot();
    await button("继续 ›").click();
    assert.equal((await snapshot()).lineIndex, before.lineIndex);
    assert.ok(
      (await page.locator(".dialogue-text").innerText()).includes("👨‍👩‍👧‍👦"),
    );
    await page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", repeat: true }),
      ),
    );
    await page.evaluate(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", isComposing: true }),
      ),
    );
    assert.equal((await snapshot()).lineIndex, 0);
    await button("继续 ›").click();
    assert.equal((await snapshot()).lineIndex, 1);
    // A paused menu returns keyboard focus, and preferences survive refresh.
    await button("菜单").click();
    await page.keyboard.press("Escape");
    assert.equal(
      await button("菜单").evaluate((e) => e === document.activeElement),
      true,
    );
    await page.reload();
    await button("继续游戏").click();
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              "magickisa:player-preferences:generated-player-test",
            ),
          ).characterDelay,
      ),
      120,
    );
    await menu("阅读与演出设置");
    await page
      .getByRole("slider", { name: "每字间隔（毫秒，0 为整句）", exact: true })
      .press("Home");
    await close();
    await button("自动").click();
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    assert.equal(await button("自动").getAttribute("aria-pressed"), "false");
    // Second page cannot acquire writes; release and reacquire reloads latest progress.
    const other = await context.newPage();
    await other.goto(origin);
    await other
      .getByRole("heading", { name: "游戏尚未取得存档写权限", exact: true })
      .waitFor();
    await menu("释放存档写权限");
    await page
      .getByRole("dialog", { name: "确认操作" })
      .getByRole("button", { name: "确认继续", exact: true })
      .click();
    await other.getByRole("button", { name: "重新接管", exact: true }).click();
    await other
      .getByRole("button", { name: "继续游戏", exact: true })
      .waitFor();
    assert.equal(
      await other
        .getByRole("button", { name: "继续游戏", exact: true })
        .isEnabled(),
      true,
    );
    await other.close();
    await button("重新接管").click();
    await button("继续游戏").click();
    // All responsive widths preserve visible controls and modal access.
    for (const width of [1920, 1440, 1280, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await button("菜单").click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "阅读与演出设置", exact: true })
        .click();
      assert.equal(
        await page
          .getByRole("slider", { name: "正文字号", exact: true })
          .isVisible(),
        true,
      );
      if (width === 390)
        await page.screenshot({
          path: "docs/images/player-mobile.png",
          fullPage: true,
        });
      await close();
    }
    // Corrupt automatic slot must not hide good manual slots.
    await page.evaluate(() =>
      localStorage.setItem(
        "magickisa-avg:v3:generated-player-test:auto",
        "broken",
      ),
    );
    await page.reload();
    await page
      .getByRole("heading", { name: "存档需要处理", exact: true })
      .waitFor();
    await page
      .locator('[data-slot="manual-01"]')
      .getByRole("button", { name: "读取", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "确认操作" })
      .getByRole("button", { name: "确认继续", exact: true })
      .click();
    await button("继续游戏").waitFor();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem(
          "magickisa-avg:v3:generated-player-test:auto:player-recovery",
        ),
      ),
      "broken",
    );
    await button("继续游戏").click();
    const lastWritten = await page.evaluate(() =>
      localStorage.getItem("magickisa-avg:v3:generated-player-test:auto"),
    );
    await page.evaluate(() => {
      window.originalPlayerSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "magickisa-avg:v3:generated-player-test:auto")
          throw new DOMException("full", "QuotaExceededError");
        return window.originalPlayerSet.call(this, key, value);
      };
    });
    const progressBeforeRestart = await snapshot();
    await menu("重新开始");
    await page
      .getByRole("dialog", { name: "确认操作" })
      .getByRole("button", { name: "确认继续", exact: true })
      .click();
    assert.deepEqual(await snapshot(), progressBeforeRestart);
    await close();
    await page
      .locator(".runtime-error")
      .getByRole("button", { name: "关闭", exact: true })
      .click();
    await button("继续 ›").click();
    await page
      .locator(".recovery-error")
      .filter({ hasText: "进度未保存" })
      .waitFor();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("magickisa-avg:v3:generated-player-test:auto"),
      ),
      lastWritten,
    );
    await page.evaluate(() => {
      Storage.prototype.setItem = window.originalPlayerSet;
    });
    await button("重试保存").click();
    await page.locator(".recovery-error").waitFor({ state: "hidden" });
    assert.equal(
      await page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("magickisa-avg:v3:generated-player-test:auto"),
          ).lineIndex,
      ),
      1,
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await button("继续 ›").click();
    await button("继续 ›").click();
    await page.locator('[data-choice-id="read-gate"]').waitFor();
    await page.locator('[data-choice-id="read-gate"]').click();
    assert.equal((await snapshot()).nodeId, "end");
    await page.evaluate(() => window.__MAGICKISA_ENGINE__.jump("input"));
    await page.setViewportSize({ width: 390, height: 420 });
    await page
      .getByRole("textbox", { name: "你的名字", exact: true })
      .fill("中文 署名");
    await page
      .getByRole("textbox", { name: "你的名字", exact: true })
      .press("ArrowRight");
    assert.equal((await snapshot()).lineIndex, 0);
    assert.equal((await snapshot()).variables.playerName, "中文 署名");
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.setViewportSize({ width: 844, height: 390 });
    await button("菜单").click();
    assert.equal(
      await page.getByRole("dialog", { name: "游戏菜单" }).isVisible(),
      true,
    );
    await close();
    assert.deepEqual(errors, []);
  } finally {
    if (!page.isClosed())
      await page
        .evaluate(() => {
          if (window.originalPlayerSet)
            Storage.prototype.setItem = window.originalPlayerSet;
        })
        .catch(() => {});
    await context.close();
  }
  // Missing lock API offers only explicit temporary play, never persists actual slots.
  const fallback = await browser.newContext();
  await fallback.route("**/content/engine-story.json", (r) =>
    r.fulfill({ json: project }),
  );
  await fallback.addInitScript(() =>
    Object.defineProperty(navigator, "locks", { value: undefined }),
  );
  const p = await fallback.newPage();
  try {
    await p.goto(origin);
    await p
      .getByRole("heading", { name: "当前环境无法安全保存", exact: true })
      .waitFor();
    await p
      .getByRole("button", { name: "临时游玩（不自动保存）", exact: true })
      .click();
    await p.getByRole("button", { name: "开始游戏", exact: true }).click();
    await p.locator(".engine-splash").waitFor({ state: "hidden" });
    await p.getByRole("button", { name: "继续 ›", exact: true }).click();
    assert.equal(
      await p.evaluate(() =>
        localStorage.getItem("magickisa-avg:v3:generated-player-test:auto"),
      ),
      null,
    );
  } finally {
    await fallback.close();
  }
  console.log(
    "Player browser: saves, reading, clues, keyboard, ownership, recovery and responsive layouts passed.",
  );
}
if (
  process.argv[1] &&
  new URL(import.meta.url).pathname
    .toLowerCase()
    .endsWith(
      process.argv[1].replaceAll("\\", "/").split("/").at(-1).toLowerCase(),
    )
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
    await playerBrowser(
      browser,
      `http://127.0.0.1:${server.httpServer.address().port}`,
    );
  } finally {
    await browser?.close();
    await server.close();
  }
}

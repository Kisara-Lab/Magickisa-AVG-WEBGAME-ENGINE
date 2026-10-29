import assert from "node:assert/strict";
export async function issuePlayerBrowser(browser, origin) {
  const project = {
    schemaVersion: 3,
    id: "generated-issue-player",
    title: "Issue 回归",
    version: "1",
    startNodeId: "hall",
    nodes: [
      {
        id: "hall",
        title: "门厅",
        lines: [
          {
            id: "voice",
            text: "错误配音仍可自动阅读",
            voice: "/missing-issue-voice.wav",
          },
          { id: "two", text: "第二句" },
          { id: "three", text: "第三句" },
        ],
        onEnter: [{ type: "unlockMaterial", id: "clue" }],
      },
      {
        id: "invalid-number",
        title: "数值错误",
        lines: [],
        onEnter: [{ type: "set", key: "count", value: "abc" }],
        onComplete: [{ type: "increment", key: "count", amount: 1 }],
      },
    ],
    materials: [
      {
        id: "clue",
        title: "显式解锁线索",
        body: "已经拿到的线索不会消失",
        category: "clue",
        unlock: { type: "flag", key: "locked" },
      },
    ],
    characters: [],
    backdrops: [],
    audio: [],
    resources: { assetsBase: "/assets", sceneRules: [] },
    media: {},
    titleScreen: {},
    theme: {
      mode: "adv",
      fontFamily: "system-ui",
      fontSize: 36,
      textColor: "#ffffff",
      accentColor: "#e0bd77",
      panelColor: "#121318",
      panelOpacity: 0.9,
      dialogueWidth: 94,
    },
    ui: {
      labels: { newGame: "开始调查", music: "私人曲库", load: "读取调查档案" },
      enabled: { musicGallery: false },
    },
  };
  const context = await browser.newContext();
  const key = `magickisa-avg:collections:v1:${project.id}`;
  await context.addInitScript(
    ({ id, key }) => {
      if (!localStorage.getItem("issue-initialized")) {
        localStorage.setItem(key, "broken collection");
        localStorage.setItem(
          `magickisa:player-preferences:${id}`,
          JSON.stringify({ fontSize: 36, autoDelay: 1, characterDelay: 0 }),
        );
        localStorage.setItem("issue-initialized", "yes");
      }
    },
    { id: project.id, key },
  );
  await context.route("**/content/engine-story.json", (r) =>
    r.fulfill({ json: project }),
  );
  await context.route("**/missing-issue-voice.wav", (r) => r.abort());
  const page = await context.newPage();
  const button = (name) => page.getByRole("button", { name, exact: true });
  const close = () =>
    page
      .getByRole("dialog")
      .last()
      .getByRole("button", { name: "关闭面板" })
      .click();
  const menu = async (name) => {
    await button("菜单").click();
    await button(name).click();
  };
  const confirm = () =>
    page
      .getByRole("dialog", { name: "确认操作" })
      .getByRole("button", { name: "确认继续", exact: true })
      .click();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(origin);
    await button("开始调查").waitFor();
    await button("读取调查档案").waitFor();
    await button("开始调查").click();
    await page.locator(".engine-splash").waitFor({ state: "hidden" });
    await button("自动").click();
    await page.waitForFunction(
      () => window.__MAGICKISA_ENGINE__.save.lineIndex > 0,
    );
    await button("菜单").click();
    assert.equal(
      await button("私人曲库").count(),
      0,
      "disabled music entry is hidden",
    );
    await page.getByRole("button", { name: /^证据/ }).click();
    await page.getByRole("button", { name: /显式解锁线索/ }).click();
    await page.getByText("已经拿到的线索不会消失", { exact: true }).waitFor();
    await page.waitForFunction(() =>
      window.__MAGICKISA_ENGINE__.save.readMaterials.includes("clue"),
    );
    await close();
    await menu("画廊与结局");
    await button("重新读取收藏记录").click();
    await button("备份并重建收藏").click();
    await confirm();
    assert.equal(
      await page.evaluate(
        (key) => localStorage.getItem(key + ":recovery"),
        key,
      ),
      "broken collection",
    );
    assert.equal(await button("备份并重建收藏").count(), 0);
    await close();
    await menu("阅读与演出设置");
    const font = page.getByRole("slider", { name: "正文字号", exact: true });
    assert.equal(await font.inputValue(), "36");
    assert.equal(await font.getAttribute("max"), "40");
    await page
      .getByRole("slider", { name: "背景音乐音量", exact: true })
      .fill("0.4");
    await close();
    await page.reload();
    await button("继续游戏").click();
    await menu("阅读与演出设置");
    assert.equal(await font.inputValue(), "36");
    await close();
    await page.evaluate(() => {
      const store = window.__MAGICKISA_ENGINE__,
        save = structuredClone(store.save);
      save.readLineIds = ["voice", "two", "three"];
      store.restore(save);
      store.jump("hall");
    });
    await button("快进").click();
    await page.waitForFunction(
      () => window.__MAGICKISA_ENGINE__.save.lineIndex > 0,
    );
    project.ui.enabled.musicGallery = true;
    await page.reload();
    await button("继续游戏").click();
    await menu("私人曲库");
    await close();
    await page.evaluate(() =>
      window.__MAGICKISA_ENGINE__.jump("invalid-number"),
    );
    await page
      .locator(".runtime-error")
      .filter({ hasText: "有限数值" })
      .waitFor();
    assert.equal(
      await page.evaluate(
        () => window.__MAGICKISA_ENGINE__.save.variables.count,
      ),
      "abc",
    );
    await button("菜单").click();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  console.log(
    "PASS issue player: failed voice auto/fast, persistent clue unlocks, collection rebuild, font range and UI settings",
  );
}

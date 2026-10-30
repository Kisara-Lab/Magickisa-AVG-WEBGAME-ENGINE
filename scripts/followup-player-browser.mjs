import assert from "node:assert/strict";

export async function followupPlayerBrowser(browser, origin) {
  const context = await browser.newContext();
  const project = {
    schemaVersion: 3,
    id: "generated-followup-player",
    title: "收藏回归",
    version: "1",
    startNodeId: "hall",
    nodes: [
      { id: "hall", title: "门厅", lines: [{ id: "one", text: "开始调查" }], choices: [
        { id: "once-ask", label: "一次询问", target: "hall", once: true },
        { id: "locked-path", label: "秘密路径", target: "study", condition: { type: "flag", key: "never" } },
      ] },
      {
        id: "study",
        title: "书房",
        lines: [{ id: "two", text: "发现新的线索" }],
        onEnter: [{ type: "unlockMaterial", id: "photo" }],
      },
    ],
    characters: [],
    backdrops: [],
    audio: [],
    materials: [
      {
        id: "photo",
        title: "照片线索",
        body: "照片背后的字迹",
        category: "clue",
        unlock: { type: "flag", key: "never" },
      },
    ],
    resources: { assetsBase: "/assets", sceneRules: [] },
    media: {
      chapterMusic: { default: "/followup-bgm.wav" },
      musicGallery: [
        {
          id: "theme",
          title: "书房主题",
          src: "/followup-theme.wav",
          unlockNode: "study",
        },
      ],
    },
    gallery: [
      {
        id: "study-cg",
        title: "书房画面",
        asset: "/followup.svg",
        unlock: { type: "visited", nodeId: "study" },
      },
    ],
    titleScreen: {},
  };
  // Real silent PCM media lets us verify element identity, pause and resume time.
  const samples = 8000 * 30,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24);
  wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  await context.route("**/content/engine-story.json", (r) =>
    r.fulfill({ json: project }),
  );
  await context.route("**/followup-*.wav", (r) =>
    r.fulfill({ contentType: "audio/wav", body: wav }),
  );
  await context.route("**/followup.svg", (r) =>
    r.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    }),
  );
  await context.addInitScript(() => {
    const Original = window.Audio;
    window.__testAudio = [];
    window.Audio = function (...args) {
      const audio = new Original(...args);
      window.__testAudio.push(audio);
      return audio;
    };
  });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  try {
    await page.goto(origin);
    await button("开始游戏").click();
    await page.locator(".engine-splash").waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      window.__testAudio.some(
        (a) => a.src.endsWith("followup-bgm.wav") && !a.paused,
      ),
    );
    await menu("证据");
    await page.evaluate(() => window.__MAGICKISA_ENGINE__.jump("study"));
    await page.waitForTimeout(4400);
    assert.equal(
      await page.locator(".unlock-notice").count(),
      0,
      "notice waits behind modal",
    );
    await close();
    await page
      .locator(".unlock-notice")
      .filter({ hasText: "资料" })
      .getByRole("button", { name: "查看" })
      .click();
    await page.getByText("照片背后的字迹", { exact: true }).waitFor();
    await close();
    await page
      .locator(".unlock-notice")
      .filter({ hasText: "画廊" })
      .getByRole("button", { name: "查看" })
      .click();
    await page.getByRole("img", { name: "书房画面" }).waitFor();
    await close();
    await page
      .locator(".unlock-notice")
      .filter({ hasText: "新曲目" })
      .getByRole("button", { name: "查看" })
      .click();
    await page.getByText(/已解锁 1 \/ 1 首/).waitFor();
    assert.equal(
      await page.evaluate(
        () =>
          window.__testAudio.find((a) => a.src.endsWith("followup-bgm.wav"))
            .paused,
      ),
      true,
    );
    await page.locator(".material-list audio").evaluate((a) => a.play());
    await page.evaluate(() => {
      const bgm = window.__testAudio.find((a) =>
        a.src.endsWith("followup-bgm.wav"),
      );
      bgm.currentTime = 8;
      window.__bgmIdentity = bgm;
      window.__MAGICKISA_ENGINE__.jump("hall");
    });
    await close();
    assert.equal(
      await page.evaluate(
        () =>
          window.__testAudio.filter((a) => a.src.endsWith("followup-bgm.wav"))
            .length,
      ),
      1,
    );
    await page.waitForFunction(
      () =>
        !window.__bgmIdentity.paused && window.__bgmIdentity.currentTime >= 8,
    );
    await menu("音乐鉴赏");
    await page.getByRole("heading", { name: "书房主题" }).waitFor();
    await close();
    await page.reload();
    await button("继续游戏").click();
    await menu("音乐鉴赏");
    await page.getByRole("heading", { name: "书房主题" }).waitFor();
    await close();
    await page.evaluate(() => { const s = window.__MAGICKISA_ENGINE__; s.jump("hall"); s.advance(); });
    assert.equal(await page.locator('[data-choice-id="locked-path"]').count(), 0, "locked choices stay hidden by default");
    project.ui = { enabled: { choiceHints: true } };
    await page.reload();
    await button("继续游戏").click();
    const locked = page.locator('[data-choice-id="locked-path"]');
    await locked.waitFor();
    assert.equal(await locked.isDisabled(), true);
    await locked.getByText("尚未满足选项条件", { exact: true }).waitFor();
    await page.locator('[data-choice-id="once-ask"]').click();
    await page.evaluate(() => window.__MAGICKISA_ENGINE__.advance());
    const used = page.locator('[data-choice-id="once-ask"]');
    assert.equal(await used.isDisabled(), true);
    await used.getByText("已选择（本周目仅一次）", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
  console.log(
    "PASS followup player: queued unlocks, direct targets, permanent music and BGM pause/resume",
  );
}

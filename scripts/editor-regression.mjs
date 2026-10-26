import assert from "node:assert/strict";

// Exercise actual shared React controls in a browser, independent of project fixtures.
export async function editorRegression(browser, origin) {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/engine.html`);
    await page
      .getByRole("heading", { name: "创建空白工程", exact: true })
      .waitFor();
    await page.evaluate(async () => {
      document.getElementById("root").style.display = "none";
      const { default: React } =
        await import("/node_modules/.vite/deps/react.js");
      const { default: ReactDOM } =
        await import("/node_modules/.vite/deps/react-dom_client.js");
      const { Field, JsonField } = await import("/src/studio/fields.tsx");
      const { GalleryAudio } = await import("/src/engine/GalleryAudio.tsx");
      const host = document.createElement("div");
      host.id = "regression";
      document.body.append(host);
      window.fieldWrites = [];
      function Harness() {
        const [value, setValue] = React.useState({ a: 1 });
        const [audio, setAudio] = React.useState({ volume: 0.4, muted: false });
        return React.createElement(
          "div",
          {},
          React.createElement(Field, {
            label: "numeric regression",
            type: "number",
            min: 1,
            step: 1,
            value: 5,
            onChange: (v) => window.fieldWrites.push(v),
          }),
          React.createElement(Field, {
            label: "optional regression",
            type: "number",
            allowEmpty: true,
            value: 0.5,
            onChange: (v) => window.fieldWrites.push(v),
          }),
          React.createElement(JsonField, {
            label: "json regression",
            value,
            onChange: setValue,
          }),
          React.createElement(
            "button",
            { onClick: () => setValue({ a: 3 }) },
            "parent refresh regression",
          ),
          React.createElement(
            "button",
            { onClick: () => setAudio({ ...audio, muted: true }) },
            "mute regression",
          ),
          React.createElement(
            "div",
            { className: "material-list" },
            React.createElement(GalleryAudio, { src: "", audio, volume: 0.5 }),
            React.createElement(GalleryAudio, { src: "", audio, volume: 0 }),
          ),
          React.createElement(
            "output",
            { id: "applied-regression" },
            JSON.stringify(value),
          ),
        );
      }
      window.regressionRoot = ReactDOM.createRoot(host);
      window.regressionRoot.render(React.createElement(Harness));
    });
    const root = page.locator("#regression");
    const numeric = root.getByLabel("numeric regression", { exact: true });
    await numeric.fill("");
    await root.getByRole("alert").waitFor();
    assert.deepEqual(await page.evaluate(() => window.fieldWrites), []);
    await numeric.fill("0");
    assert.deepEqual(await page.evaluate(() => window.fieldWrites), []);
    await numeric.fill("2");
    await root.getByLabel("optional regression", { exact: true }).fill("");
    assert.deepEqual(await page.evaluate(() => window.fieldWrites), ["2", ""]);
    await root.getByLabel("json regression", { exact: true }).fill('{"a":2}');
    await root
      .getByRole("button", { name: "parent refresh regression" })
      .click();
    assert.equal(
      await root.getByLabel("json regression", { exact: true }).inputValue(),
      '{"a":2}',
    );
    assert.equal(await root.locator("output").innerText(), '{"a":3}');
    await root.getByRole("button", { name: "应用此项", exact: true }).click();
    assert.equal(await root.locator("output").innerText(), '{"a":2}');
    assert.deepEqual(
      await root
        .locator("audio")
        .evaluateAll((items) => items.map((a) => a.volume)),
      [0.2, 0],
    );
    await root.getByRole("button", { name: "mute regression" }).click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll("#regression audio")].every(
        (a) => a.muted && a.volume === 0,
      ),
    );
    await page.evaluate(async () => {
      const { default: React } =
        await import("/node_modules/.vite/deps/react.js");
      const { EngineStore } = await import("/src/engine/store.ts");
      const { assertProject } = await import("/src/engine/schema.ts");
      const { GameSession } = await import("/src/game/GameApp.tsx");
      window.audioPlayers = [];
      window.Audio = class extends EventTarget {
        constructor(src) {
          super();
          this.src = src;
          this.currentTime = 37;
          this.volume = 1;
          this.paused = true;
          window.audioPlayers.push(this);
        }
        play() {
          this.paused = false;
          return Promise.resolve();
        }
        pause() {
          this.paused = true;
        }
        removeAttribute() {
          this.src = "";
        }
        load() {}
      };
      const project = assertProject({
        schemaVersion: 2,
        id: "audio-regression",
        title: "Audio",
        version: "1",
        startNodeId: "start",
        nodes: [
          {
            id: "start",
            title: "start",
            lines: [{ id: "line", text: "audio test" }],
          },
        ],
        materials: [],
        characters: [],
        backdrops: [],
        audio: [{ id: "track", src: "/test.wav", volume: 0.5 }],
        resources: { sceneRules: [] },
        media: { chapterMusic: { default: "/test.wav" } },
        titleScreen: {},
        ui: {},
      });
      window.audioStore = new EngineStore(project, { persist: false });
      window.regressionRoot.render(
        React.createElement(GameSession, {
          store: window.audioStore,
          embedded: true,
        }),
      );
    });
    await page.waitForFunction(() => window.audioPlayers.length === 1);
    await page.evaluate(() => window.audioStore.setAudio(0.4, true));
    await page.waitForFunction(() => window.audioPlayers[0].volume === 0);
    assert.equal(
      await page.evaluate(() => window.audioPlayers.length),
      1,
      "mute must not reconstruct BGM",
    );
    assert.equal(
      await page.evaluate(() => window.audioPlayers[0].currentTime),
      37,
    );
    await page.evaluate(() => window.audioStore.setAudio(0.4, false));
    await page.waitForFunction(
      () => Math.abs(window.audioPlayers[0].volume - 0.13) < 1e-6,
    );
    await root.getByTitle("音乐鉴赏", { exact: true }).click();
    await page.waitForFunction(() => window.audioPlayers[0].paused);
    await root.getByTitle("关闭面板", { exact: true }).click();
    await page.waitForFunction(
      () => window.audioPlayers.length === 2 && !window.audioPlayers[1].paused,
    );
  } finally {
    await page.close();
  }
}

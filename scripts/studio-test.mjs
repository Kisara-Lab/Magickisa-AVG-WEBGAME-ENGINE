import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import http from "node:http";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({ server: { port: 0, open: false } });
let browser;
const created = new Set();
const errors = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.MAGICKISA_BROWSER ? { executablePath: process.env.MAGICKISA_BROWSER } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", e => errors.push(e.message));
  page.on("response", r => { if (r.status() >= 400 && !r.url().includes("/__studio/")) errors.push(`${r.status()} ${new URL(r.url()).pathname}`); });
  const api = async (profile, route, body, id) => {
    const response = await fetch(`${origin}/__studio/${route}?${new URLSearchParams({ profile, ...(id ? { workspaceId: id } : {}) })}`, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    assert.equal(response.ok, true, JSON.stringify(data));
    return data;
  };
  const poll = async fn => {
    for (let i = 0; i < 300; i++) {
      const value = await fn();
      if (value) return value;
      await new Promise(r => setTimeout(r, 200));
    }
    throw new Error("Operation timed out");
  };
  for (const profile of ["modern", "release"]) {
    await page.goto(`${origin}/engine.html?profile=${profile}`);
    await page.getByRole("heading", { name: "创建空白工程", exact: true }).waitFor();
    await page.getByLabel("工程名称", { exact: true }).fill(`测试 ${profile}`);
    await page.getByLabel("运行模式", { exact: true }).selectOption(profile);
    await page.getByRole("button", { name: "创建并打开", exact: true }).click();
    await page.waitForURL(/workspaceId=/, { timeout: 10000 }).catch(async e => {
      console.error((await page.locator("body").innerText()).slice(-6000));
      throw e;
    });
    const id = new URL(page.url()).searchParams.get("workspaceId");
    created.add(id);
    const before = await api(profile, "project", undefined, id);
    assert.equal(before.project.nodes[0].lines[0].text, "");
    const draft = structuredClone(before.project);
    draft.nodes[0].lines[0].text = `未保存 ${profile}`;
    draft.nodes[0].speaker = "NODE SPEAKER";
    draft.nodes[0].lines[0].speaker = "FIRST SPEAKER";
    draft.nodes[0].lines[0].input = { key: "playerName", label: "测试姓名", maxLength: 8 };
    draft.nodes[0].lines.push({ id: "input-accepted", text: "INPUT ACCEPTED", speaker: "SECOND SPEAKER" });
    draft.media.opening = { duration: 10, pages: [{ at: 0, text: "TEST OP" }] };
    draft.media.ending = { duration: 10, lines: [{ at: 0, en: "TEST ED", zh: "TEST END" }] };
    draft.media.dedication = { pages: [["TEST DEDICATION"]] };
    const publicDir = path.join("workspace-projects", id, "public");
    fs.mkdirSync(path.join(publicDir, "中文 空格"), { recursive: true });
    const asset = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
    fs.writeFileSync(path.join(publicDir, "中文 空格", "未使用.svg"), asset);
    fs.writeFileSync(path.join(publicDir, "large-unused.wav"), Buffer.alloc(8 * 1024 ** 2 + 1));
    const task = await api(profile, "packages/export", { project: draft, revision: before.revision }, id);
    await poll(async () => {
      const t = await api(profile, `packages/${task.id}`, undefined, id);
      assert.notEqual(t.status, "failed", t.error);
      return t.status === "ready";
    });
    const zip = Buffer.from(await (await fetch(`${origin}/__studio/packages/${task.id}/download?profile=${profile}&workspaceId=${id}`)).arrayBuffer());
    const checksum = await (await fetch(`${origin}/__studio/packages/${task.id}/checksum?profile=${profile}&workspaceId=${id}`)).text();
    assert.ok(checksum.startsWith(crypto.createHash("sha256").update(zip).digest("hex")));
    assert.equal((await api(profile, "project", undefined, id)).project.nodes[0].lines[0].text, "");
    const upload = await fetch(`${origin}/__studio/packages/upload?profile=${profile}&workspaceId=${id}`, { method: "POST", headers: { "Content-Type": "application/zip" }, body: zip });
    assert.ok(upload.ok);
    const imported = await upload.json();
    await poll(async () => {
      const t = await api(profile, `packages/${imported.id}`, undefined, id);
      assert.notEqual(t.status, "failed", t.error);
      return t.status === "ready";
    });
    const next = await api(profile, "packages/commit", { id: imported.id, name: `导入 ${profile}` }, id);
    created.add(next.id);
    assert.notEqual(next.id, id);
    const nextData = await api(profile, "project", undefined, next.id);
    assert.deepEqual(nextData.project, draft);
    assert.deepEqual(fs.readFileSync(path.join("workspace-projects", next.id, "public", "中文 空格", "未使用.svg")), asset);
    assert.equal(fs.statSync(path.join("workspace-projects", next.id, "public", "large-unused.wav")).size, 8 * 1024 ** 2 + 1);
    await page.goto(`${origin}/engine.html?profile=${profile}&workspaceId=${next.id}`);
    const line = page.locator(".st-line textarea").first();
    await line.fill(`继续编辑 ${profile}`);
    let writes = 0;
    let unblock;
    const gate = new Promise(resolve => { unblock = resolve; });
    const delaySave = async route => {
      if (route.request().method() === "POST") { writes++; await gate; }
      await route.continue();
    };
    await page.route("**/__studio/project?*", delaySave);
    try {
      await page.keyboard.press("Control+s");
      await poll(async () => writes > 0);
      for (let press = 0; press < 5; press++) await page.keyboard.press("Control+s");
      await page.waitForTimeout(100);
      assert.equal(writes, 1, "repeated Ctrl+S must share one in-flight save");
    } finally { unblock(); }
    await poll(async () => (await api(profile, "project", undefined, next.id)).project.nodes[0].lines[0].text === `继续编辑 ${profile}`);
    await page.unroute("**/__studio/project?*", delaySave);
    const backupRoot = path.join("workspace-projects", next.id, "backups");
    const backups = fs.readdirSync(backupRoot);
    assert.equal(backups.length, 1, "one save must produce one backup");
    assert.equal(JSON.parse(fs.readFileSync(path.join(backupRoot, backups[0], "project.json"), "utf8")).nodes[0].lines[0].text, `未保存 ${profile}`);
    await page.keyboard.press("Control+Enter");
    await poll(async () => {
      const frames = page.frames().filter(f => f.url().includes("studio-preview.html"));
      return frames.length && await frames[0].getByText(`继续编辑 ${profile}`, { exact: true }).count();
    });
    const saved = await api(profile, "project", undefined, next.id);
    const conditional = structuredClone(saved.project);
    conditional.nodes[0].choices = [{ id: "optional", label: "optional", target: conditional.startNodeId, condition: { type: "flag", key: "ready" } }];
    assert.ok((await api(profile, "validate", { project: conditional }, next.id)).issues.some(i => i.code === "branch-fallback"));
    const invalid = structuredClone(saved.project);
    invalid.materials.push({ id: "bad-reference", title: "Bad reference", body: "", category: "clue", unlockNode: "missing-scene" });
    const rejected = await fetch(`${origin}/__studio/project?profile=${profile}&workspaceId=${next.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project: invalid, revision: saved.revision }),
    });
    assert.equal(rejected.status, 400, "dangling unlock references must not be saved");
    assert.equal((await api(profile, "project", undefined, next.id)).revision, saved.revision);
    for (const [mode, text] of [["opening", "TEST OP"], ["ending", "TEST ED"], ["dedication", "TEST DEDICATION"]]) {
      await page.evaluate(data => {
        document.querySelector("iframe").contentWindow.postMessage(data, location.origin);
      }, { type: "studio:load", project: saved.project, profile, mode, time: 0, pageIndex: 0 });
      await poll(async () => {
        const frame = page.frames().find(f => f.url().includes("studio-preview.html"));
        return frame && await frame.getByText(text, { exact: true }).count();
      });
    }
    const build = await api(profile, "build", { revision: saved.revision }, next.id);
    assert.equal(build.status, "running");
    await poll(async () => {
      const t = await api(profile, "build", undefined, next.id);
      assert.notEqual(t.status, "failed", t.log);
      return t.status === "complete";
    });
    const built = JSON.parse(fs.readFileSync(path.join("workspace-projects", next.id, "dist/content/engine-story.json"), "utf8"));
    assert.equal(built.nodes[0].lines[0].text, `继续编辑 ${profile}`);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.setViewportSize({ width: 1440, height: 1000 });
    const outputRoot = path.resolve("workspace-projects", next.id, "dist");
    const gameServer = http.createServer((req, res) => {
      const relative = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
      const file = path.resolve(outputRoot, "." + (relative === "/" ? "/index.html" : relative));
      if (!file.startsWith(outputRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
      res.setHeader("Content-Type", ({ ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" })[path.extname(file)] || "application/octet-stream");
      fs.createReadStream(file).pipe(res);
    });
    await new Promise(resolve => gameServer.listen(0, "127.0.0.1", resolve));
    try {
      await page.goto(`http://127.0.0.1:${gameServer.address().port}/`);
      await page.locator('[data-action="new-game"]').waitFor();
      if (profile === "release") {
        await page.waitForFunction(() => window.__MAGICKISA_ENGINE__);
        const beforeKeys = await page.evaluate(() => JSON.stringify(window.__MAGICKISA_ENGINE__.getSnapshot()));
        await page.keyboard.press("Space");
        await page.keyboard.press("ArrowRight");
        assert.equal(await page.evaluate(() => JSON.stringify(window.__MAGICKISA_ENGINE__.getSnapshot())), beforeKeys, "title-screen shortcuts must not advance");
        assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith("magickisa-avg:release:"))), false, "title screen must not create an autosave");
        await page.evaluate(() => { localStorage.setItem("magickisa:view", "old-view"); localStorage.setItem("magickisa-avg:slot:auto", "old-save"); });
      }
      await page.locator('[data-action="new-game"]').click();
      await page.locator(".engine-splash").waitFor({ state: "visible" });
      await page.locator(".engine-splash").waitFor({ state: "detached" });
      await page.getByText(`继续编辑 ${profile}`, { exact: true }).waitFor();
      assert.equal(await page.locator(".speaker").innerText(), "FIRST SPEAKER");
      const input = page.getByLabel("测试姓名", { exact: true });
      await input.fill("   ");
      await page.locator(".scene-caption").click();
      assert.equal(await input.count(), 1, "blank input must block advance");
      await input.fill("小 明");
      await input.press("Space");
      await input.press("ArrowRight");
      assert.equal(await input.count(), 1, "text-editing keys must not advance");
      assert.equal(await input.inputValue(), "小 明 ");
      if (profile === "release") {
        const beforeControls = await page.evaluate(() => window.__MAGICKISA_ENGINE__.getSnapshot().lineIndex);
        const notebook = page.locator(".notebook-strip input");
        await notebook.fill("note");
        await notebook.press("Space");
        await notebook.press("ArrowLeft");
        assert.equal(await notebook.inputValue(), "note ");
        await page.getByTitle("演出设置", { exact: true }).click();
        const auto = page.getByLabel("自动播放", { exact: true });
        await auto.press("Space");
        assert.equal(await auto.isChecked(), true);
        await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true, cancelable: true })));
        assert.equal(await page.evaluate(() => window.__MAGICKISA_ENGINE__.getSnapshot().lineIndex), beforeControls);
        await auto.press("Space");
        assert.equal(await auto.isChecked(), false);
        await auto.press("Escape");
        await page.locator(".settings-panel").waitFor({ state: "detached" });
      }
      await page.locator(".scene-caption").click();
      await page.getByText("INPUT ACCEPTED", { exact: true }).waitFor();
      assert.equal(await page.locator(".speaker").innerText(), "SECOND SPEAKER");
      if (profile === "release") {
        const key = await page.evaluate(() => {
          const save = window.__MAGICKISA_ENGINE__.getSnapshot();
          const key = `magickisa-avg:release:${encodeURIComponent(save.projectId)}:auto`;
          localStorage.setItem(key, "{broken-save"); return key;
        });
        await page.reload();
        await page.getByRole("heading", { name: "存档需要处理", exact: true }).waitFor();
        assert.equal(await page.evaluate(k => localStorage.getItem(k), key), "{broken-save");
        await page.getByRole("button", { name: "打开临时新周目", exact: true }).click();
        await page.getByLabel("测试姓名", { exact: true }).fill("临时");
        await page.locator(".scene-caption").click();
        await page.getByText("INPUT ACCEPTED", { exact: true }).waitFor();
        assert.equal(await page.evaluate(k => localStorage.getItem(k), key), "{broken-save", "temporary progress must not overwrite unreadable saves");
        assert.equal(await page.evaluate(() => localStorage.getItem("magickisa:view")), "old-view");
        assert.equal(await page.evaluate(() => localStorage.getItem("magickisa-avg:slot:auto")), "old-save");
      }
    } finally { await new Promise(resolve => gameServer.close(resolve)); }
    await api(profile, "packages/cancel", { id: task.id }, id);
    console.log(`PASS ${profile}: create, unsaved export, checksum, independent import, edit, save, scene/OP/ED/dedication preview, build, startup animation, mobile`);
  }
  assert.deepEqual(errors, []);
  console.log("PASS no browser errors or missing game dependencies");
} finally {
  await browser?.close();
  await server.close();
  const root = path.resolve("workspace-projects");
  for (const id of created) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Unexpected test workspace id");
    const target = path.resolve(root, id);
    if (path.dirname(target) !== root) throw new Error("Invalid cleanup target");
    fs.rmSync(target, { recursive: true, force: true });
  }
}

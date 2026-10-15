/** Actual native/CSP and deterministic-wallet browser checks. No live keys or funds. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import { createBrotliDecompress } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { inflate } from "@sparticuz/chromium";
import { isViteReadyOutput } from "./vite-readiness.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = resolve(root, "apps/studio");
const appDist = resolve(appRoot, "dist");
const fixtureOrigin = "http://127.0.0.1:4188";
const recipient = "0x2222222222222222222222222222222222222222";
const csp =
  "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
const helloHTML =
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Native CSP fixture</title></head><body><main><h1>Native CSP fixture</h1></main><script>window.__INLINE_RAN = true</script><script type="module" src="/hello.mjs"></script></body></html>';
const helloModule = `import {createKit} from '/dist/index.mjs';
window.__CSP_BLOCKED = false;
try { new Function('return 1')(); } catch (error) { window.__CSP_BLOCKED = error instanceof EvalError; }
const kit = createKit({prefix:'demo'});
kit.register({name:'hello',description:'Return a greeting',inputSchema:{type:'object',properties:{name:{type:'string'}},required:['name'],additionalProperties:false},handler:({name})=>({message:'Hello, '+name+'!'})});
await kit.ready(); window.__HELLO = kit;`;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "application/javascript",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};
const pageErrors = [];
const results = [];
const evidence = {};
let browser;
let context;
let vite;
let viteOutput = "";
let viteError;
let staticOrigin;
let activeCheck = "preflight";

function childPath(base, relative) {
  const file = resolve(base, relative);
  if (!file.startsWith(base + sep)) throw new Error("Invalid fixture path");
  return file;
}
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname,
    );
    response.setHeader("Content-Security-Policy", csp);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", "no-store");
    let body;
    let extension;
    if (pathname === "/hello") {
      body = helloHTML;
      extension = ".html";
    } else if (pathname === "/hello.mjs") {
      body = helloModule;
      extension = ".mjs";
    } else {
      let file;
      if (pathname === "/" || pathname === "/index.html")
        file = resolve(appDist, "index.html");
      else if (pathname.startsWith("/assets/"))
        file = childPath(appDist, pathname.slice(1));
      else if (pathname.startsWith("/dist/"))
        file = childPath(
          resolve(root, "dist"),
          pathname.slice("/dist/".length),
        );
      else if (pathname.startsWith("/examples/browser-hello/"))
        file = childPath(
          resolve(root, "examples/browser-hello"),
          pathname.slice("/examples/browser-hello/".length) || "index.html",
        );
      else {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      body = await readFile(file);
      extension = extname(file);
    }
    response.setHeader(
      "Content-Type",
      mime[extension] ?? "application/octet-stream",
    );
    response.writeHead(200);
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(error?.code === "ENOENT" ? 404 : 400);
    response.end("Unavailable fixture");
  }
});

/** Use the pinned package's trusted archives without unsupported root chown operations.
 * tar-fs is resolved from that package's locked dependency, rather than relying on hoisting.
 */
async function bundledExecutablePath() {
  const entry = import.meta.resolve("@sparticuz/chromium");
  const archiveRoot = resolve(dirname(fileURLToPath(entry)), "../bin");
  const { extract } = createRequire(entry)("tar-fs");
  const unpack = (name, output) =>
    pipeline(
      createReadStream(resolve(archiveRoot, name)),
      createBrotliDecompress(),
      extract(output, { chown: false }),
    );
  const [executable] = await Promise.all([
    inflate(resolve(archiveRoot, "chromium.br")),
    unpack("fonts.tar.br", resolve(tmpdir(), "fonts")),
    unpack("swiftshader.tar.br", tmpdir()),
    ...(existsSync(resolve(archiveRoot, "al2023.tar.br"))
      ? [unpack("al2023.tar.br", resolve(tmpdir(), "al2023"))]
      : []),
  ]);
  return executable;
}

async function check(name, fn) {
  activeCheck = name;
  const start = Date.now();
  await fn();
  assert.deepEqual(
    pageErrors,
    [],
    `Unexpected browser page errors: ${pageErrors.join("; ")}`,
  );
  results.push({ name, elapsedMs: Date.now() - start });
  console.log(`PASS ${results.length}/7 ${name}`);
}
async function newPage() {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => pageErrors.push(error.message));
  return page;
}
async function nativeTools(page) {
  return page.evaluate(async () => {
    if (
      !document.modelContext ||
      typeof document.modelContext.getTools !== "function" ||
      typeof document.modelContext.executeTool !== "function"
    )
      throw new Error(
        "Current native document.modelContext discovery/execution API missing",
      );
    return (await document.modelContext.getTools()).map((tool) => ({
      name: tool.name,
    }));
  });
}
async function nativeInvoke(page, name, input) {
  return page.evaluate(
    async ({ name, input }) => {
      const tools = await document.modelContext.getTools();
      const tool = tools.find((value) => value.name === name);
      if (!tool) throw new Error("Native tool missing: " + name);
      const result = await document.modelContext.executeTool(
        tool,
        JSON.stringify(input),
      );
      if (typeof result !== "string")
        throw new Error("Unexpected native consumer result type");
      return JSON.parse(result);
    },
    { name, input },
  );
}
async function waitFixture(predicate, label) {
  await expect.poll(predicate, { timeout: 20000, message: label }).toBe(true);
}
async function fixtureState(page) {
  return page.evaluate(() => window.__STUDIO_TEST__.state());
}
async function sentCount(page) {
  return page.evaluate(() => window.__STUDIO_TEST__.provider.sent.length);
}
async function reviewConsent(page, buttonName) {
  const checkbox = page.getByRole("checkbox", {
    name: /I reviewed the network/,
  });
  await expect(checkbox).not.toBeChecked();
  const authorize = page.getByRole("button", { name: buttonName });
  await expect(authorize).toBeDisabled();
  await checkbox.check();
  await expect(authorize).toBeEnabled();
  await authorize.click();
}
async function waitForVite(child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (viteError) throw viteError;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `Fixture Vite exited (${child.exitCode ?? child.signalCode}): ${viteOutput}`,
      );
    if (!isViteReadyOutput(viteOutput)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    try {
      const response = await fetch(fixtureOrigin, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Fixture Vite did not become ready: ${viteOutput}`);
}
async function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  let timer;
  await Promise.race([
    exited,
    new Promise((resolve) => {
      timer = setTimeout(resolve, 3000);
    }),
  ]);
  clearTimeout(timer);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await exited;
  }
}

try {
  await Promise.all([
    stat(resolve(root, "dist/index.mjs")),
    stat(resolve(appDist, "index.html")),
  ]);
  const viteCLI = resolve(root, "node_modules/vite/bin/vite.js");
  assert.ok(existsSync(viteCLI), "Root Vite CLI is required");
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  staticOrigin = `http://127.0.0.1:${server.address().port}`;
  vite = spawn(
    process.execPath,
    [
      viteCLI,
      "--config",
      resolve(appRoot, "vite.config.ts"),
      "--mode",
      "test",
      "--host",
      "127.0.0.1",
      "--port",
      "4188",
      "--strictPort",
    ],
    { cwd: appRoot, stdio: ["ignore", "pipe", "pipe"] },
  );
  vite.on("error", (error) => {
    viteError = error;
  });
  for (const stream of [vite.stdout, vite.stderr])
    stream.on("data", (chunk) => {
      viteOutput = (viteOutput + chunk.toString()).slice(-12000);
    });
  await waitForVite(vite);
  const installed = chromium.executablePath();
  const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
    (existsSync(installed) ? installed : await bundledExecutablePath());
  const args = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--no-zygote",
    "--enable-experimental-web-platform-features",
    "--enable-blink-features=WebMCP",
    "--enable-features=WebMCP",
  ];
  assert.ok(
    !args.some((arg) =>
      /disable-web-security|allow-running-insecure-content/.test(arg),
    ),
  );
  browser = await chromium.launch({ executablePath, headless: true, args });
  context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    locale: "en-US",
  });
  console.log(
    JSON.stringify({
      browser: browser.version(),
      executablePath,
      staticOrigin,
      fixtureOrigin,
      strictCSP: csp,
      launchArgs: args,
      realFunds: false,
    }),
  );

  await check(
    "native registration, consumer invocation, cleanup and strict CSP",
    async () => {
      const page = await newPage();
      const response = await page.goto(`${staticOrigin}/hello`);
      assert.equal(response.headers()["content-security-policy"], csp);
      await page.waitForFunction(() => !!window.__HELLO);
      assert.equal(
        await page.evaluate(() => window.__CSP_BLOCKED),
        true,
        "CSP must block Function construction",
      );
      assert.equal(
        await page.evaluate(() => window.__INLINE_RAN),
        undefined,
        "CSP must block inline script",
      );
      assert.deepEqual(
        (await nativeTools(page)).map((tool) => tool.name),
        ["demo.hello"],
      );
      assert.deepEqual(
        await nativeInvoke(page, "demo.hello", { name: "Native" }),
        { message: "Hello, Native!" },
      );
      await page.evaluate(() => window.__HELLO.unregisterAll());
      await expect.poll(async () => (await nativeTools(page)).length).toBe(0);
      await page.close();
    },
  );

  await check(
    "canonical browser hello example direct and native invocation",
    async () => {
      const page = await newPage();
      await page.goto(`${staticOrigin}/examples/browser-hello/index.html`);
      await expect(page.getByRole("status")).toHaveText(
        "document.modelContext ready. Registered: demo.hello",
      );
      await expect(page.locator("#result")).toContainText("Hello, Bill!");
      await page.getByLabel("Name", { exact: true }).fill("Reviewer");
      await page
        .getByRole("button", { name: "Run demo.hello", exact: true })
        .click();
      await expect(page.locator("#result")).toContainText("Hello, Reviewer!");
      assert.deepEqual(
        await nativeInvoke(page, "demo.hello", { name: "Consumer" }),
        { message: "Hello, Consumer!" },
      );
      await page.evaluate(() => window.__HELLO.unregisterAll());
      await expect.poll(async () => (await nativeTools(page)).length).toBe(0);
      await page.close();
    },
  );

  const production = await newPage();
  await check(
    "production Studio build and deterministic fixture exclusion",
    async () => {
      await production.goto(staticOrigin);
      await expect(
        production.getByRole("heading", {
          name: "Your wallet. Your decision.",
          exact: true,
        }),
      ).toBeVisible();
      assert.equal(
        await production.evaluate(() => "__STUDIO_TEST__" in window),
        false,
      );
      const assets = await readdir(resolve(appDist, "assets"));
      assert.ok(assets.some((name) => name.endsWith(".js")));
      assert.ok(
        !assets.some((name) => /^fixture[-.]/.test(name)),
        "Production must not include a fixture chunk",
      );
      for (const asset of assets.filter((name) => name.endsWith(".js"))) {
        const source = await readFile(
          resolve(appDist, "assets", asset),
          "utf8",
        );
        assert.doesNotMatch(
          source,
          /__STUDIO_TEST__|Unsupported fixture method|FixtureProvider/,
          "Production code must exclude fixture interface/provider",
        );
      }
    },
  );
  await check("production WCAG 2 A/AA and 2.1 AA accessibility", async () => {
    const report = await new AxeBuilder({ page: production })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    assert.equal(
      report.violations.length,
      0,
      JSON.stringify(
        report.violations.map((value) => ({
          id: value.id,
          impact: value.impact,
          nodes: value.nodes.map((node) => node.target),
        })),
      ),
    );
    assert.ok(report.passes.length > 0, "Axe must perform nonempty checks");
    evidence.accessibility = {
      violations: report.violations.length,
      passes: report.passes.length,
      tags: ["wcag2a", "wcag2aa", "wcag21aa"],
    };
  });
  await check("production mobile layout at 390 CSS pixels", async () => {
    await production.setViewportSize({ width: 390, height: 844 });
    await expect(
      production.getByRole("heading", {
        name: "Your wallet. Your decision.",
        exact: true,
      }),
    ).toBeVisible();
    const layout = await production.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    assert.ok(
      layout.document <= layout.viewport && layout.body <= layout.viewport,
      JSON.stringify(layout),
    );
    evidence.mobile = layout;
    await production.close();
  });

  const fixture = await newPage();
  await check(
    "saved live policy rejection and reviewed transfer, exact approval, swap",
    async () => {
      await fixture.goto(fixtureOrigin);
      await fixture.waitForFunction(() => !!window.__STUDIO_TEST__);
      await fixture.getByLabel("USDC limit", { exact: true }).fill("20");
      await fixture
        .getByRole("button", { name: "Save limits", exact: true })
        .click();
      await fixture
        .getByRole("button", { name: "Live wallet", exact: true })
        .click();
      await fixture.getByRole("button", { name: /^Connect wallet/ }).click();
      await waitFixture(
        async () => !!(await fixtureState(fixture)).context,
        "Fixture wallet must connect",
      );
      assert.equal((await fixtureState(fixture)).policy.maxUSDC, "20");
      await fixture
        .getByRole("button", { name: "Send a transfer", exact: true })
        .click();
      await fixture.getByLabel("Asset", { exact: true }).selectOption("USDC");
      await fixture.getByLabel("You send", { exact: true }).fill("25");
      await fixture
        .getByLabel("Recipient wallet address", { exact: true })
        .fill(recipient);
      await fixture.getByRole("button", { name: /^Propose transfer/ }).click();
      await expect(fixture.getByRole("alert")).toContainText("Amount exceeds");
      assert.equal((await fixtureState(fixture)).proposals.length, 0);
      assert.equal(await sentCount(fixture), 0);
      await fixture.getByLabel("USDC limit", { exact: true }).fill("100");
      await fixture
        .getByRole("button", { name: "Save limits", exact: true })
        .click();
      await fixture.getByLabel("Asset", { exact: true }).selectOption("ETH");
      await fixture.getByLabel("You send", { exact: true }).fill("0.01");
      await fixture.getByRole("button", { name: /^Propose transfer/ }).click();
      await fixture
        .getByRole("button", { name: "Simulate & review", exact: true })
        .click();
      await reviewConsent(fixture, /^Authorize in wallet.*transfer/);
      await waitFixture(
        async () =>
          (await fixtureState(fixture)).proposals.some(
            (p) => p.id === "P-1" && p.status === "confirmed",
          ),
        "Transfer must confirm from fixture receipt",
      );
      assert.equal(await sentCount(fixture), 1);
      await fixture
        .getByRole("button", { name: "Swap assets", exact: true })
        .click();
      await fixture.getByLabel("Asset", { exact: true }).selectOption("USDC");
      await fixture.getByLabel("You pay", { exact: true }).fill("25");
      await fixture
        .getByRole("button", { name: /^Get quote & propose swap/ })
        .click();
      await fixture
        .getByRole("button", { name: "Simulate & review", exact: true })
        .click();
      await reviewConsent(fixture, /^Authorize in wallet.*exact approval/);
      await waitFixture(
        async () =>
          !!(await fixtureState(fixture)).proposals.find((p) => p.id === "P-2")
            ?.approvalHash,
        "Exact approval must confirm before swap review",
      );
      assert.equal(await sentCount(fixture), 2);
      await fixture
        .getByRole("button", { name: "Simulate & review", exact: true })
        .click();
      await reviewConsent(fixture, /^Authorize in wallet.*swap/);
      await waitFixture(
        async () =>
          (await fixtureState(fixture)).proposals.some(
            (p) => p.id === "P-2" && p.status === "confirmed",
          ),
        "Swap must confirm from fixture receipt",
      );
      assert.equal(await sentCount(fixture), 3);
    },
  );
  await check(
    "native agent proposal-only authority, rejection and account revocation",
    async () => {
      const tools = await nativeTools(fixture);
      assert.deepEqual(tools.map((tool) => tool.name).sort(), [
        "studio.studio_propose",
        "studio.studio_state",
      ]);
      assert.ok(
        tools.every((tool) => !/execute|sign|approve/i.test(tool.name)),
      );
      const proposal = await nativeInvoke(fixture, "studio.studio_propose", {
        kind: "transfer",
        asset: "USDC",
        amount: "10",
        recipient,
      });
      assert.equal(proposal.id, "P-3");
      assert.equal(proposal.status, "proposed");
      assert.equal(await sentCount(fixture), 3);
      await fixture.getByRole("button", { name: /P-3 ·/ }).click();
      await fixture
        .getByRole("button", { name: "Reject proposal", exact: true })
        .click();
      await waitFixture(
        async () =>
          (await fixtureState(fixture)).proposals.some(
            (p) => p.id === "P-3" && p.status === "cancelled",
          ),
        "Agent proposal must be rejected in UI",
      );
      assert.equal(await sentCount(fixture), 3);
      await fixture.evaluate(() =>
        window.__STUDIO_TEST__.provider.changeAccount(
          "0x3333333333333333333333333333333333333333",
        ),
      );
      await waitFixture(
        async () => ((await fixtureState(fixture)).context ?? null) === null,
        "Account change must revoke current wallet context",
      );
      await expect(
        fixture.getByRole("button", { name: /^Get quote & propose swap/ }),
      ).toBeDisabled();
      assert.equal(await sentCount(fixture), 3);
      await fixture.close();
    },
  );
  assert.equal(results.length, 7, "Every named browser check must execute");
  console.log(
    JSON.stringify({
      passed: results.length,
      total: 7,
      checks: results,
      evidence,
      pageErrors,
      realFunds: false,
    }),
  );
} catch (error) {
  console.error(`FAIL ${activeCheck}: ${error.stack ?? error}`);
  console.error(
    JSON.stringify({
      passed: results.length,
      total: 7,
      completed: results.map((result) => result.name),
      pageErrors,
      viteOutput,
    }),
  );
  process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  for (const cleanup of [
    async () => {
      await context?.close();
    },
    async () => {
      await browser?.close();
    },
    async () => {
      await stopChild(vite);
    },
    async () => {
      if (server.listening) {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
      }
    },
  ]) {
    try {
      await cleanup();
    } catch (error) {
      cleanupErrors.push(String(error));
    }
  }
  if (cleanupErrors.length) {
    console.error("Browser verifier cleanup failed", cleanupErrors);
    process.exitCode = 1;
  }
}

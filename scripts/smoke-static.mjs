import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";

import puppeteer from "puppeteer";

const mountPath = "/fictor-test/";
const distDirectory = resolve(process.cwd(), "dist");

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

const auditManifestPath = resolve(process.cwd(), "assets/manifests/t022-m2-assets-audit-v1.json");

function currentIndexBundleFiles() {
  const indexHtml = readFileSync(resolve(distDirectory, "index.html"), "utf8");
  const references = [...indexHtml.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((reference) => /\.(?:js|css)(?:[?#]|$)/.test(reference));
  if (references.length === 0) throw new Error("dist/index.html에 JS/CSS entrypoint 참조가 없습니다.");
  const invalid = references.filter((reference) => !/^\.\/assets\/[^/?#]+\.(?:js|css)$/.test(reference));
  if (invalid.length > 0) throw new Error(`dist/index.html bundle 참조 형식이 잘못되었습니다: ${invalid.join(", ")}`);
  if (new Set(references).size !== references.length) throw new Error(`dist/index.html bundle 참조가 중복되었습니다: ${references.join(", ")}`);
  return references.map((reference) => {
    const filePath = resolve(distDirectory, reference);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) throw new Error(`dist/index.html 참조 파일이 없습니다: ${reference}`);
    return filePath;
  });
}

async function verifyMountedPngs(origin) {
  const manifest = JSON.parse(readFileSync(auditManifestPath, "utf8"));
  const records = manifest?.assets?.records;
  if (!Array.isArray(records) || records.length !== 621) {
    throw new Error("T022 감사 manifest의 621개 asset record를 읽을 수 없습니다.");
  }
  let cursor = 0;
  let verified = 0;
  let notFound = 0;
  const failures = [];
  const worker = async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= records.length) return;
      const record = records[index];
      const relativePath = String(record.public_path).replace(/^public\//, "");
      const url = `${origin}${mountPath}${relativePath}`;
      const response = await fetch(url);
      if (response.status === 404) notFound += 1;
      if (response.status !== 200) { failures.push(`${response.status} ${relativePath}`); continue; }
      const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
      if (contentType !== "image/png") { failures.push(`CONTENT_TYPE ${relativePath}: ${contentType ?? "missing"}`); continue; }
      if (response.body === null) { failures.push(`EMPTY_BODY ${relativePath}`); continue; }
      const hash = createHash("sha256");
      for await (const chunk of response.body) hash.update(chunk);
      const actual = hash.digest("hex");
      if (actual !== record.sha256) { failures.push(`SHA256 ${relativePath}`); continue; }
      verified += 1;
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  if (failures.length > 0 || verified !== 621 || notFound !== 0) {
    throw new Error(`정적 PNG 검증 실패: verified=${verified}, 404=${notFound}, failures=${failures.slice(0, 10).join(", ")}`);
  }
  return { requested: 621, verified, http200: verified, imagePng: verified, sha256Matched: verified, notFound, concurrency: 6 };
}

function resolveRequestPath(requestUrl) {
  const url = new URL(requestUrl, "http://127.0.0.1");

  if (!url.pathname.startsWith(mountPath)) {
    return null;
  }

  let requestedPath;
  try {
    requestedPath = decodeURIComponent(url.pathname.slice(mountPath.length));
  } catch {
    return null;
  }

  if (requestedPath === "") {
    requestedPath = "index.html";
  }

  const segments = requestedPath.split("/");
  if (
    requestedPath.includes("\0") ||
    requestedPath.includes("\\") ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }

  const filePath = resolve(distDirectory, ...segments);
  const pathFromDist = relative(distDirectory, filePath);

  if (
    pathFromDist === ".." ||
    pathFromDist.startsWith(`..${sep}`) ||
    isAbsolute(pathFromDist)
  ) {
    return null;
  }

  return filePath;
}

function serve(request, response) {
  const filePath = resolveRequestPath(request.url ?? "/");

  if (filePath === null || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": contentTypes.get(extname(filePath)) ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}

async function main() {
  if (!existsSync(distDirectory) || !statSync(distDirectory).isDirectory()) {
    throw new Error("dist 디렉터리가 없습니다. 먼저 npm run build를 실행하세요.");
  }

  const server = createServer(serve);
  let browser;
  let runError;

  try {
    await new Promise((resolveListening, rejectListening) => {
      server.once("error", rejectListening);
      server.listen(0, "127.0.0.1", resolveListening);
    });

    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("임시 정적 서버 주소를 확인할 수 없습니다.");
    }

    const origin = `http://127.0.0.1:${address.port}`;
    const pageUrl = `${origin}${mountPath}`;
    const browserErrors = [];
    const failedResponses = [];
    const externalRequests = [];
    const apiRequests = [];
    const webSocketRequests = [];
    const browserImageRequests = [];
    const discoveryCheckpoints = [];
    const saveCheckpoints = [];

    const disableSandbox = process.env.PUPPETEER_DISABLE_SANDBOX === "true";
    browser = await puppeteer.launch({
      headless: true,
      args: disableSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    });
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => window.localStorage.setItem("fictor.race.v1", "Stillkin"));
    const devtools = await page.createCDPSession();
    await devtools.send("Network.enable");

    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      browserErrors.push(`page: ${error.message}`);
    });
    page.on("requestfailed", (request) => {
      browserErrors.push(`request: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`);
    });
    page.on("request", (request) => {
      const requestUrl = new URL(request.url());
      if (requestUrl.origin !== origin) {
        externalRequests.push(request.url());
      }
      if (["fetch", "xhr"].includes(request.resourceType())) {
        apiRequests.push(request.url());
      }
      if (request.resourceType() === "image") {
        browserImageRequests.push(request.url());
      }
    });
    page.on("response", (response) => {
      if (!response.ok()) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });
    devtools.on("Network.webSocketCreated", ({ url }) => {
      webSocketRequests.push(url);
    });

    const readCanonicalSaveV2 = async (targetPage, label) => {
      const envelope = await targetPage.evaluate(() => {
        const bytes = window.localStorage.getItem("fictor.save.v2");
        return bytes === null ? null : JSON.parse(bytes);
      });
      const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
        && Object.keys(value).sort().join("|") === [...keys].sort().join("|");
      if (!exactKeys(envelope, ["schemaVersion", "saveGeneration", "saveRevision", "profile", "runtime", "flow"])
        || envelope.schemaVersion !== 2 || !Number.isSafeInteger(envelope.saveRevision)
        || typeof envelope.saveGeneration !== "string" || envelope.saveGeneration.length === 0
        || !exactKeys(envelope.profile, ["schemaVersion", "discoveredRecipeIds", "ownedHeartIds", "featureFlags"])
        || !exactKeys(envelope.runtime, ["schemaVersion", "engineVersion", "resolverVersion", "sourceHash", "revision", "run"])
        || !exactKeys(envelope.runtime.run, ["fuel", "nextInstanceSequence", "ownedInstances", "deck", "activeCombat"])
        || !exactKeys(envelope.flow, ["schemaVersion", "controllerVersion", "revision", "runSequence", "runId", "scenarioId", "scenarioHash", "configId", "configHash", "phase", "nextNodeIndex", "currentNodeIndex", "pendingOfferId", "workshopEntitlementNodeId", "nextEncounterNonce", "combatBinding", "playerHp", "randomState"])) {
        throw new Error(`${label} canonical v2 save envelope가 exact tracked schema와 일치하지 않습니다.`);
      }
      saveCheckpoints.push({ label, saveRevision: envelope.saveRevision, flowRevision: envelope.flow.revision, phase: envelope.flow.phase });
      return envelope;
    };

    const assertFreshStarterVisible = async (targetPage, label) => {
      const values = await targetPage.$$eval(".stats-strip div", (items) => Object.fromEntries(items.map((item) => [item.querySelector("dt")?.textContent?.trim(), item.querySelector("dd")?.textContent?.trim()])));
      const firstNode = await targetPage.$eval(".journey-node:first-child", (node) => ({ label: node.querySelector("small")?.textContent?.trim(), current: node.classList.contains("is-current") }));
      if (values["체력"] !== "30 / 30" || values["연료"] !== "4" || values["덱"] !== "30장" || firstNode.label !== "첫 조우" || !firstNode.current) {
        throw new Error(`${label} starter가 HP30/fuel4/deck30/first node와 일치하지 않습니다: ${JSON.stringify({ values, firstNode })}`);
      }
      return { hp: 30, fuel: 4, deck: 30, firstNode: "d1-normal-swarm" };
    };

    const verifyFirstUserAccessibilityAndCodexBudget = async () => {
      const context = await browser.createBrowserContext();
      const freshPage = await context.newPage();
      const freshImages = [];
      const errors = [];
      const aiDisclosureSmallViewports = [];
      freshPage.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
      freshPage.on("pageerror", (error) => errors.push(`page: ${error.message}`));
      freshPage.on("requestfailed", (request) => errors.push(`request: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
      freshPage.on("request", (request) => { if (request.resourceType() === "image") freshImages.push(request.url()); });
      await freshPage.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      const clickAndWait = async (selector) => {
        const before = await freshPage.$eval("main", (element) => element.getAttribute("data-screen-key"));
        await freshPage.click(selector);
        await freshPage.waitForFunction((screenKey) => {
          const main = document.querySelector("main");
          return main?.getAttribute("aria-busy") === "false" && main.getAttribute("data-screen-key") !== screenKey;
        }, {}, before);
      };
      const verifyAiDisclosureAtSmallViewports = async (surface) => {
        const originalViewport = freshPage.viewport();
        try {
          for (const width of [320, 375]) {
            await freshPage.setViewport({ width, height: 568, deviceScaleFactor: 1 });
            await freshPage.click(".ai-disclosure-trigger");
            await freshPage.waitForFunction(() => document.querySelector(".ai-disclosure-trigger")?.getAttribute("aria-expanded") === "true");
            const observation = await freshPage.$eval(".ai-disclosure-panel", (panel, expected) => {
              const rect = panel.getBoundingClientRect();
              const style = getComputedStyle(panel);
              return {
                exactText: panel.querySelector("p")?.textContent === expected,
                visible: !panel.hidden && style.display !== "none" && style.visibility !== "hidden",
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                panelWidth: rect.width,
                panelHeight: rect.height,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                overflowY: style.overflowY,
                documentScrollWidth: document.documentElement.scrollWidth,
              };
            }, "카드와 세계 아트는 Higgsfield의 생성형 AI 모델을 활용해 제작했으며, 프롬프트 설계·선별·편집은 FICTOR 제작 과정에서 수행했습니다.");
            if (!observation.exactText || !observation.visible || observation.panelWidth <= 0 || observation.panelHeight <= 0
              || observation.left < 0 || observation.right > observation.viewportWidth
              || observation.top < 0 || observation.bottom > observation.viewportHeight
              || observation.overflowY !== "auto" || observation.documentScrollWidth > observation.viewportWidth) {
              throw new Error(`${surface} AI 제작 고지 ${width}px viewport 경계가 다릅니다: ${JSON.stringify(observation)}`);
            }
            aiDisclosureSmallViewports.push({ surface, targetViewportWidth: width, ...observation });
            await freshPage.click(".ai-disclosure-trigger");
            await freshPage.waitForFunction(() => document.querySelector(".ai-disclosure-trigger")?.getAttribute("aria-expanded") === "false");
          }
        } finally {
          if (originalViewport) await freshPage.setViewport(originalViewport);
        }
      };
      try {
        const response = await freshPage.goto(pageUrl, { waitUntil: "networkidle0" });
        if (response === null || !response.ok()) throw new Error(`fresh user 문서 응답 실패: ${response?.status() ?? "응답 없음"}`);
        await freshPage.waitForSelector(".race-select-screen");
        const raceInitial = await freshPage.evaluate(() => ({
          images: document.images.length,
          headingFocused: document.activeElement === document.querySelector(".race-select-screen h1"),
          namedButtons: [...document.querySelectorAll(".race-choice button")].every((button) => button.textContent?.trim()),
        }));
        if (raceInitial.images !== 0 || freshImages.length !== 0 || !raceInitial.headingFocused || !raceInitial.namedButtons) {
          throw new Error(`fresh race-select 초기 접근성/asset 경계가 다릅니다: ${JSON.stringify({ ...raceInitial, requests: freshImages.length })}`);
        }
        await verifyAiDisclosureAtSmallViewports("pre-run");
        await freshPage.$eval(".race-select-screen h1", (heading) => { if (heading instanceof HTMLElement) heading.focus(); });
        await freshPage.keyboard.press("Tab");
        const firstChoiceFocused = await freshPage.$eval(".race-choice button", (button) => document.activeElement === button);
        if (!firstChoiceFocused) throw new Error("race-select H1 다음 Tab이 첫 붙이 선택으로 이동하지 않았습니다.");
        await freshPage.keyboard.press("Enter");
        await freshPage.waitForSelector("main.phase-between_nodes");
        const selectedProfile = await freshPage.evaluate(() => ({
          images: document.images.length,
          guideName: document.querySelector(".first-run-guide")?.getAttribute("aria-labelledby"),
          guideDescription: document.querySelector(".first-run-guide")?.getAttribute("aria-describedby"),
          guideCopy: document.querySelector(".first-run-guide")?.textContent ?? "",
        }));
        if (selectedProfile.images !== 1 || freshImages.length !== 1 || !selectedProfile.guideName || !selectedProfile.guideDescription
          || !selectedProfile.guideCopy.includes("연료 1") || !selectedProfile.guideCopy.includes("영구 소모")) {
          throw new Error(`fresh selected profile 안내/asset 경계가 다릅니다: ${JSON.stringify({ ...selectedProfile, requests: freshImages.length })}`);
        }
        await verifyAiDisclosureAtSmallViewports("active-gameplay");
        await freshPage.$eval('button[aria-label^="공방 열기"]', (button) => { button.setAttribute("data-t045-exact-opener", "true"); if (button instanceof HTMLElement) button.focus(); });
        await freshPage.keyboard.press("Enter");
        await freshPage.waitForSelector(".forge-panel");
        const workshopFocused = await freshPage.$eval(".forge-panel h2", (heading) => document.activeElement === heading);
        if (!workshopFocused) throw new Error("유료 공방이 panel H2로 초점을 이동하지 않았습니다.");
        await freshPage.keyboard.press("Escape");
        const returnedToOpener = await freshPage.$eval('[data-t045-exact-opener="true"]', (button) => document.activeElement === button);
        if (!returnedToOpener) throw new Error("유료 공방 Escape가 정확한 opener로 초점을 돌려보내지 않았습니다.");
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
        await freshPage.waitForSelector("main.phase-in_combat");
        const combatGuide = await freshPage.$eval(".first-run-guide", (guide) => ({ copy: guide.textContent ?? "", named: Boolean(guide.getAttribute("aria-labelledby") && guide.getAttribute("aria-describedby")) }));
        if (!combatGuide.named || !combatGuide.copy.includes("재료 두 장") || !combatGuide.copy.includes("이번 전투뿐") || !combatGuide.copy.includes("도감에 영구 기록")) {
          throw new Error(`fresh combat 안내가 다릅니다: ${JSON.stringify(combatGuide)}`);
        }
        let forged = false;
        for (let turns = 0; turns < 8 && !forged; turns += 1) {
          const start = await freshPage.$('button[data-action-kind="START_TURN"]:not([disabled])');
          if (start) await clickAndWait('button[data-action-kind="START_TURN"]');
          const pair = await freshPage.$$eval("button.combat-card:not([disabled])", (cards) => {
            const left = cards.find((card) => !card.getAttribute("data-card-id")?.startsWith("forge__"));
            const right = cards.find((card) => !card.getAttribute("data-card-id")?.startsWith("forge__") && card.getAttribute("data-card-id") !== left?.getAttribute("data-card-id"));
            return left && right ? [left.getAttribute("data-card-id"), right.getAttribute("data-card-id")] : null;
          });
          if (!pair) { await clickAndWait('button[data-action-kind="END_TURN"]'); continue; }
          await freshPage.click(".instant-mode-toggle");
          await freshPage.$$eval("button.combat-card:not([disabled])", (cards, ids) => ids.forEach((id) => cards.find((card) => card.getAttribute("data-card-id") === id)?.click()), pair);
          await clickAndWait(".instant-preview .primary-cta");
          forged = true;
        }
        if (!forged) throw new Error("fresh user 첫 전투에서 FIRST 발견을 만들지 못했습니다.");
        await freshPage.waitForSelector('.discovery-overlay[data-discovery-phase="FINAL"]');
        const discoveryAx = await freshPage.$eval(".discovery-overlay", (dialog) => ({
          role: dialog.getAttribute("role"),
          labelled: Boolean(dialog.getAttribute("aria-labelledby")),
          namedControls: [...dialog.querySelectorAll("button")].every((button) => button.textContent?.trim() || button.getAttribute("aria-label")),
        }));
        if (discoveryAx.role !== "dialog" || !discoveryAx.labelled || !discoveryAx.namedControls) throw new Error(`FIRST discovery AX 이름이 다릅니다: ${JSON.stringify(discoveryAx)}`);
        await freshPage.click(".discovery-overlay button.primary-cta");
        await freshPage.click(".codex-open");
        await freshPage.waitForSelector(".codex-surface");
        const firstCodex = await freshPage.$eval(".codex-surface", (surface) => ({
          summary: surface.querySelector(".codex-heading p")?.textContent?.trim(),
          named: Boolean(surface.getAttribute("aria-labelledby") && surface.getAttribute("aria-describedby")),
        }));
        if (firstCodex.summary !== "발견한 기록 1 / 1326" || !firstCodex.named) throw new Error(`fresh FIRST 도감 증거가 다릅니다: ${JSON.stringify(firstCodex)}`);
      } finally {
        if (errors.length > 0) browserErrors.push(...errors.map((error) => `fresh-user ${error}`));
        await context.close();
      }

      const budgetContext = await browser.createBrowserContext();
      const budgetPage = await budgetContext.newPage();
      const budgetImages = [];
      budgetPage.on("request", (request) => { if (request.resourceType() === "image") budgetImages.push(request.url()); });
      await budgetPage.evaluateOnNewDocument(() => window.localStorage.setItem("fictor.race.v1", "Stillkin"));
      const recipeIds = JSON.parse(readFileSync(resolve(process.cwd(), "src/data/generated/cards.generated.json"), "utf8")).items
        .slice(0, 96).map((card) => card.recipe_id);
      if (recipeIds.length !== 96 || new Set(recipeIds).size !== 96) throw new Error("high-discovery canonical recipe 96개를 고정할 수 없습니다.");
      const budgetDevtools = await budgetPage.createCDPSession();
      try {
        await budgetPage.goto(pageUrl, { waitUntil: "networkidle0" });
        await budgetPage.waitForSelector("main.phase-between_nodes");
        const before = await budgetPage.$eval("main", (element) => element.getAttribute("data-screen-key"));
        await budgetPage.click('button[data-action-kind="ENTER_NEXT_NODE"]');
        await budgetPage.waitForFunction((screenKey) => document.querySelector("main")?.getAttribute("data-screen-key") !== screenKey, {}, before);
        await budgetPage.evaluate((discoveries) => {
          const bytes = window.localStorage.getItem("fictor.save.v2");
          if (!bytes) throw new Error("canonical v2 save missing");
          const envelope = JSON.parse(bytes);
          envelope.profile.discoveredRecipeIds = discoveries;
          window.localStorage.setItem("fictor.save.v2", JSON.stringify(envelope));
        }, recipeIds);
        await budgetPage.reload({ waitUntil: "networkidle0" });
        await budgetPage.waitForSelector("main.phase-in_combat");
        const label = await budgetPage.$eval(".codex-open", (button) => button.getAttribute("aria-label"));
        if (label !== "도감 열기 · 발견 96 / 1326") throw new Error(`high-discovery save가 valid projection으로 열리지 않았습니다: ${label}`);
        const imagesBeforeCodex = budgetImages.length;
        await budgetPage.click(".codex-open");
        await budgetPage.waitForSelector(".codex-surface");
        const pageOneImages = await budgetPage.$$(".codex-entry img");
        if (pageOneImages.length !== 48) throw new Error(`high-discovery page 1 mounted img가 48이 아닙니다: ${pageOneImages.length}`);
        await budgetPage.click('button[aria-label="다음 도감 페이지"]');
        await budgetPage.waitForFunction(() => document.querySelector(".codex-pagination span")?.textContent?.trim() === "2 / 28");
        const pageTwoImages = await budgetPage.$$(".codex-entry img");
        if (pageTwoImages.length !== 48) throw new Error(`high-discovery page 2 mounted img가 48이 아닙니다: ${pageTwoImages.length}`);
        await budgetPage.waitForNetworkIdle();
        const cumulativeCodexRequests = budgetImages.length - imagesBeforeCodex;
        if (cumulativeCodexRequests > 96) throw new Error(`high-discovery page 1→2 image 요청이 96을 넘었습니다: ${cumulativeCodexRequests}`);
        await budgetPage.click(".codex-heading .surface-close");
        const closed = await budgetPage.evaluate(() => ({
          codexImages: document.querySelectorAll(".codex-entry img").length,
          imagePreloads: document.querySelectorAll('link[rel="preload"][as="image"], link[rel="modulepreload"][as="image"]').length,
        }));
        if (closed.codexImages !== 0 || closed.imagePreloads !== 0) throw new Error(`high-discovery close/preload 경계가 다릅니다: ${JSON.stringify(closed)}`);
        await budgetDevtools.send("HeapProfiler.enable");
        await budgetDevtools.send("HeapProfiler.collectGarbage");
        const heapAfterGc = await budgetDevtools.send("Runtime.getHeapUsage");
        return {
          freshRaceImages: 0,
          selectedProfileImages: 1,
          reducedMotion: true,
          firstDiscoveryAndCodex: true,
          aiDisclosureSmallViewports,
          highDiscovery: { validDiscoveries: 96, pageOneMountedImages: 48, pageTwoMountedImages: 48, cumulativeImageRequests: cumulativeCodexRequests, afterCloseCodexImages: 0, imagePreloads: 0 },
          heapAfterGcObservation: { usedSize: heapAfterGc.usedSize, totalSize: heapAfterGc.totalSize, hardGate: false },
        };
      } finally {
        await budgetContext.close();
      }
    };
    const firstUserAccessibility = await verifyFirstUserAccessibilityAndCodexBudget();

    const navigationResponse = await page.goto(pageUrl, { waitUntil: "networkidle0" });
    if (navigationResponse === null || !navigationResponse.ok()) {
      throw new Error(`문서 응답 실패: ${navigationResponse?.status() ?? "응답 없음"}`);
    }

    await page.waitForSelector("main h1");
    const heading = await page.$eval("main h1", (element) => element.textContent?.trim());
    const status = await page.$eval('[role="status"]', (element) => element.textContent?.trim());

    if (heading !== "어름의 터 · 깊이 1 / 3" || status !== "진행 기록을 불러왔습니다.") {
      throw new Error(`한국어 bootstrap 문구가 일치하지 않습니다: ${heading} / ${status}`);
    }
    const initialStarter = await assertFreshStarterVisible(page, "main fresh win");
    const initialImagePaths = browserImageRequests.map((value) => new URL(value).pathname);
    if (initialImagePaths.length !== 1 || initialImagePaths[0] !== `${mountPath}assets/backgrounds/background__still__depth_01.png`) {
      throw new Error(`초기 화면 밖 asset이 요청되었습니다: ${initialImagePaths.join(", ")}`);
    }
    const initialAssetBytes = statSync(resolve(distDirectory, "assets/backgrounds/background__still__depth_01.png")).size;
    if (initialAssetBytes > 2_296_255) throw new Error(`초기 asset budget 초과: ${initialAssetBytes}`);

    const bundleFiles = currentIndexBundleFiles();
    const javascriptBytes = bundleFiles.filter((path) => extname(path) === ".js").reduce((sum, path) => sum + statSync(path).size, 0);
    const cssBytes = bundleFiles.filter((path) => extname(path) === ".css").reduce((sum, path) => sum + statSync(path).size, 0);
    if (javascriptBytes > 409_600 || cssBytes > 32_768) {
      throw new Error(`bundle budget 초과: js=${javascriptBytes}, css=${cssBytes}`);
    }

    const verifyFreshLossAndRestart = async () => {
      const context = await browser.createBrowserContext();
      const lossPage = await context.newPage();
      await lossPage.evaluateOnNewDocument(() => window.localStorage.setItem("fictor.race.v1", "Stillkin"));
      const lossWebSockets = [];
      const lossDevtools = await lossPage.createCDPSession();
      await lossDevtools.send("Network.enable");
      lossPage.on("console", (message) => { if (message.type() === "error") browserErrors.push(`loss console: ${message.text()}`); });
      lossPage.on("pageerror", (error) => browserErrors.push(`loss page: ${error.message}`));
      lossPage.on("requestfailed", (request) => browserErrors.push(`loss request: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
      lossPage.on("request", (request) => {
        const requestUrl = new URL(request.url());
        if (requestUrl.origin !== origin) externalRequests.push(request.url());
        if (["fetch", "xhr"].includes(request.resourceType())) apiRequests.push(request.url());
      });
      lossPage.on("response", (response) => { if (!response.ok()) failedResponses.push(`${response.status()} ${response.url()}`); });
      lossDevtools.on("Network.webSocketCreated", ({ url }) => lossWebSockets.push(url));
      const clickLossAndWait = async (selector) => {
        const before = await lossPage.$eval("main", (element) => element.getAttribute("data-screen-key"));
        await lossPage.click(selector);
        await lossPage.waitForFunction((screenKey) => {
          const main = document.querySelector("main");
          return main?.getAttribute("aria-busy") === "false" && main.getAttribute("data-screen-key") !== screenKey;
        }, {}, before);
      };
      try {
        const response = await lossPage.goto(pageUrl, { waitUntil: "networkidle0" });
        if (response === null || !response.ok()) throw new Error(`loss 문서 응답 실패: ${response?.status() ?? "응답 없음"}`);
        await lossPage.waitForSelector("main.phase-between_nodes");
        const starter = await assertFreshStarterVisible(lossPage, "fresh loss");
        await clickLossAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
        let turns = 0;
        while (await lossPage.$("main.phase-in_combat")) {
          if (turns++ > 100) throw new Error("fresh loss smoke가 RUN_LOST에 도달하지 못했습니다.");
          const start = await lossPage.$('button[data-action-kind="START_TURN"]:not([disabled])');
          const end = await lossPage.$('button[data-action-kind="END_TURN"]:not([disabled])');
          if (start) await clickLossAndWait('button[data-action-kind="START_TURN"]');
          else if (end) await clickLossAndWait('button[data-action-kind="END_TURN"]');
          else throw new Error("fresh loss smoke에서 공개 턴 행동을 찾지 못했습니다.");
        }
        await lossPage.waitForSelector("main.phase-run_lost");
        const lostSave = await readCanonicalSaveV2(lossPage, "fresh-loss-terminal");
        if (lostSave.flow.phase !== "RUN_LOST" || lostSave.flow.playerHp !== 0 || lostSave.runtime.run.activeCombat !== null) {
          throw new Error(`loss terminal save가 정리되지 않았습니다: ${JSON.stringify({ phase: lostSave.flow.phase, hp: lostSave.flow.playerHp, activeCombat: lostSave.runtime.run.activeCombat !== null })}`);
        }
        await clickLossAndWait('button[data-action-kind="RESTART"]');
        await lossPage.waitForSelector("main.phase-between_nodes");
        const restarted = await assertFreshStarterVisible(lossPage, "loss restart");
        const restartSave = await readCanonicalSaveV2(lossPage, "fresh-loss-restart");
        if (restartSave.flow.phase !== "BETWEEN_NODES" || restartSave.flow.nextNodeIndex !== 0 || restartSave.flow.currentNodeIndex !== null
          || restartSave.flow.playerHp !== 30 || restartSave.runtime.run.fuel !== 4 || restartSave.runtime.run.deck.length !== 30
          || restartSave.runtime.run.ownedInstances.length !== 30 || restartSave.runtime.run.activeCombat !== null) {
          throw new Error(`loss restart save가 starter와 일치하지 않습니다: ${JSON.stringify({ flow: restartSave.flow, fuel: restartSave.runtime.run.fuel, deck: restartSave.runtime.run.deck.length, owned: restartSave.runtime.run.ownedInstances.length })}`);
        }
        if (lossWebSockets.length > 0) webSocketRequests.push(...lossWebSockets);
        return { isolatedContext: true, lossPhase: "RUN_LOST", restartPhase: "BETWEEN_NODES", starter, restarted, turns };
      } finally {
        await context.close();
      }
    };
    const lossRestart = await verifyFreshLossAndRestart();

    const verifyBurnkinCompletion = async () => {
      const context = await browser.createBrowserContext();
      const burnkinPage = await context.newPage();
      await burnkinPage.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      const errors = [];
      burnkinPage.on("console", (message) => {
        if (message.type() === "error") errors.push(`console: ${message.text()}`);
      });
      burnkinPage.on("pageerror", (error) => errors.push(`page: ${error.message}`));
      burnkinPage.on("requestfailed", (request) => errors.push(`request: ${request.url()} (${request.failure()?.errorText ?? "unknown"})`));
      const clickAndWait = async (selector) => {
        const before = await burnkinPage.$eval("main", (element) => element.getAttribute("data-screen-key"));
        await burnkinPage.click(selector);
        await burnkinPage.waitForFunction((screenKey) => {
          const main = document.querySelector("main");
          return main?.getAttribute("aria-busy") === "false" && main.getAttribute("data-screen-key") !== screenKey;
        }, {}, before);
      };
      try {
        const response = await burnkinPage.goto(pageUrl, { waitUntil: "networkidle0" });
        if (response === null || !response.ok()) throw new Error(`Burnkin 선택 문서 응답 실패: ${response?.status() ?? "응답 없음"}`);
        await burnkinPage.waitForSelector(".race-select-screen");
        const selected = await burnkinPage.$$eval(".race-choice button", (buttons) => {
          const button = buttons.find((candidate) => candidate.textContent?.includes("사름붙이로 시작"));
          if (!(button instanceof HTMLButtonElement)) return false;
          button.click();
          return true;
        });
        if (!selected) throw new Error("Burnkin 선택 버튼을 찾지 못했습니다.");
        await burnkinPage.waitForSelector("main.phase-between_nodes");
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
        await burnkinPage.waitForSelector("main.phase-in_combat");
        await clickAndWait('button[data-action-kind="START_TURN"]');
        await burnkinPage.waitForSelector('button[data-action-kind="BURNKIN_PAY_HP"]');
        const state = await burnkinPage.evaluate(() => {
          const bytes = window.localStorage.getItem("fictor.burnkin.save.v2");
          const envelope = bytes ? JSON.parse(bytes) : null;
          return {
            selectedRace: window.localStorage.getItem("fictor.race.v1"),
            stillkinSavePresent: window.localStorage.getItem("fictor.save.v2") !== null,
            configId: envelope?.flow?.configId,
            resonanceRate: envelope?.runtime?.run?.activeCombat?.state?.rules?.resonanceRate,
            starterIds: [...new Set((envelope?.runtime?.run?.ownedInstances ?? []).map((instance) => instance.cardId))].sort(),
          };
        });
        if (state.selectedRace !== "Burnkin" || state.stillkinSavePresent || state.configId !== "burnkin-track1-provisional-v1"
          || state.resonanceRate !== 0.16 || JSON.stringify(state.starterIds) !== JSON.stringify(["burn_01", "burn_02", "burn_03", "burn_04", "burn_05", "ore_burn"])) {
          throw new Error(`Burnkin browser authority가 일치하지 않습니다: ${JSON.stringify(state)}`);
        }

        let steps = 0;
        while (!(await burnkinPage.$("main.phase-run_won"))) {
          if (steps++ > 3_000) throw new Error("Burnkin 브라우저 완주가 종료되지 않았습니다.");
          if (await burnkinPage.$("main.phase-run_lost")) throw new Error("Burnkin 브라우저 완주가 보스 전에 패배했습니다.");
          if (await burnkinPage.$("main.phase-in_combat")) {
            const start = await burnkinPage.$('button[data-action-kind="START_TURN"]:not([disabled])');
            const card = await burnkinPage.$("button.combat-card:not([disabled])");
            const end = await burnkinPage.$('button[data-action-kind="END_TURN"]:not([disabled])');
            if (start) await clickAndWait('button[data-action-kind="START_TURN"]');
            else if (card) await clickAndWait("button.combat-card:not([disabled])");
            else if (end) await clickAndWait('button[data-action-kind="END_TURN"]');
            else throw new Error("Burnkin 전투에서 조작 가능한 행동을 찾지 못했습니다.");
          } else if (await burnkinPage.$("main.phase-awaiting_reward")) {
            await clickAndWait(".reward-card button:not([disabled])");
          } else if (await burnkinPage.$("main.phase-between_nodes")) {
            await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
          } else if (await burnkinPage.$("main.phase-in_event")) {
            await clickAndWait(".event-choice:not([disabled])");
          } else if (await burnkinPage.$("main.phase-event_resolved")) {
            const leave = await burnkinPage.$('button[data-action-kind="LEAVE_EVENT"]');
            if (leave) {
              await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
            } else {
              const selected = await burnkinPage.$$eval(".workshop-materials button", (buttons) => {
                for (let left = 0; left < buttons.length; left += 1) {
                  const leftId = buttons[left].getAttribute("data-material-card-id");
                  if (!leftId || leftId.startsWith("forge__")) continue;
                  const right = buttons.slice(left + 1).find((button) => {
                    const rightId = button.getAttribute("data-material-card-id");
                    return rightId && rightId !== leftId && !rightId.startsWith("forge__");
                  });
                  if (!(buttons[left] instanceof HTMLButtonElement) || !(right instanceof HTMLButtonElement)) continue;
                  buttons[left].click();
                  right.click();
                  return true;
                }
                return false;
              });
              if (!selected) throw new Error("Burnkin 무료 공방에서 서로 다른 두 재료를 찾지 못했습니다.");
              await burnkinPage.waitForSelector(".forge-panel .canonical-preview");
              await burnkinPage.click(".resolved-screen .primary-cta:not([disabled])");
              await burnkinPage.waitForSelector('.forge-dialog[role="dialog"]');
              await clickAndWait('.forge-dialog .primary-cta:not([disabled])');
              await burnkinPage.waitForSelector(".discovery-overlay, .discovery-toast");
              if (await burnkinPage.$(".discovery-overlay")) {
                await burnkinPage.waitForSelector('.discovery-overlay[data-discovery-phase="FINAL"]');
                await burnkinPage.click(".discovery-overlay button.primary-cta");
                await burnkinPage.waitForSelector(".discovery-overlay", { hidden: true });
              } else {
                await burnkinPage.click(".discovery-toast button");
                await burnkinPage.waitForSelector(".discovery-toast", { hidden: true });
              }
              await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
            }
          } else {
            const phase = await burnkinPage.$eval("main", (element) => element.className);
            throw new Error(`Burnkin 브라우저 완주가 알 수 없는 화면에 멈췄습니다: ${phase}`);
          }
        }

        const won = await burnkinPage.evaluate(() => {
          const bytes = window.localStorage.getItem("fictor.burnkin.save.v2");
          const envelope = bytes ? JSON.parse(bytes) : null;
          return {
            phase: envelope?.flow?.phase,
            activeCombat: envelope?.runtime?.run?.activeCombat,
            hearts: envelope?.profile?.ownedHeartIds,
          };
        });
        if (won.phase !== "RUN_WON" || won.activeCombat !== null || JSON.stringify(won.hearts) !== JSON.stringify(["heart__still"])) {
          throw new Error(`Burnkin 보스 승리 상태가 다릅니다: ${JSON.stringify(won)}`);
        }
        await clickAndWait('button[data-action-kind="RESTART"]');
        const restarted = await burnkinPage.evaluate(() => {
          const bytes = window.localStorage.getItem("fictor.burnkin.save.v2");
          const envelope = bytes ? JSON.parse(bytes) : null;
          return {
            phase: envelope?.flow?.phase,
            fuel: envelope?.runtime?.run?.fuel,
            cards: envelope?.runtime?.run?.ownedInstances?.length,
            hearts: envelope?.profile?.ownedHeartIds,
          };
        });
        if (restarted.phase !== "BETWEEN_NODES" || restarted.fuel !== 4 || restarted.cards !== 30
          || JSON.stringify(restarted.hearts) !== JSON.stringify(["heart__still"])) {
          throw new Error(`Burnkin 승리 재시작 상태가 다릅니다: ${JSON.stringify(restarted)}`);
        }
        if (errors.length > 0) throw new Error(`Burnkin 브라우저 오류:\n${errors.join("\n")}`);
        return { race: "Burnkin", phase: "RUN_WON", resonanceRate: 0.16, starterCards: 30, bossVictory: true, restart: true, browserErrors: 0 };
      } finally {
        await context.close();
      }
    };
    const burnkinCompletion = await verifyBurnkinCompletion();

    const verifyJoinkinSelection = async () => {
      const context = await browser.createBrowserContext();
      const joinkinPage = await context.newPage();
      await joinkinPage.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
      const clickAndWait = async (selector) => {
        const before = await joinkinPage.$eval("main", (element) => element.getAttribute("data-screen-key"));
        await joinkinPage.click(selector);
        await joinkinPage.waitForFunction((screenKey) => {
          const main = document.querySelector("main");
          return main?.getAttribute("aria-busy") === "false" && main.getAttribute("data-screen-key") !== screenKey;
        }, {}, before);
      };
      const readSave = async (label) => joinkinPage.evaluate((checkpoint) => {
        const bytes = window.localStorage.getItem("fictor.joinkin.save.v2");
        if (!bytes) throw new Error(`${checkpoint}: Joinkin save가 없습니다.`);
        return JSON.parse(bytes);
      }, label);
      const settleDiscovery = async (label) => {
        await joinkinPage.waitForSelector(".discovery-overlay, .discovery-toast");
        const overlay = await joinkinPage.$(".discovery-overlay");
        if (overlay) {
          await joinkinPage.waitForSelector('.discovery-overlay[data-discovery-phase="FINAL"]');
          const usedMaterialCount = await joinkinPage.$eval(".discovery-materials", (element) => element.children.length);
          if (usedMaterialCount !== 3) throw new Error(`${label}: 발견 연출 재료가 ${usedMaterialCount}장입니다.`);
          await joinkinPage.click(".discovery-overlay button.primary-cta");
          await joinkinPage.waitForSelector(".discovery-overlay", { hidden: true });
        } else {
          await joinkinPage.click(".discovery-toast button");
          await joinkinPage.waitForSelector(".discovery-toast", { hidden: true });
        }
      };
      const selectTriple = async (selector, excludedRecipeId = null) => joinkinPage.$$eval(selector, (buttons, excluded) => {
        for (let left = 0; left < buttons.length; left += 1) {
          const leftId = buttons[left].getAttribute("data-material-card-id") ?? buttons[left].getAttribute("data-card-id");
          if (!leftId || leftId.startsWith("forge__")) continue;
          for (let right = left + 1; right < buttons.length; right += 1) {
            const rightId = buttons[right].getAttribute("data-material-card-id") ?? buttons[right].getAttribute("data-card-id");
            if (!rightId || rightId === leftId || rightId.startsWith("forge__")
              || (leftId.startsWith("tool_") && rightId.startsWith("tool_"))) continue;
            const recipeId = [leftId, rightId].sort().join("|");
            if (recipeId === excluded) continue;
            for (let third = 0; third < buttons.length; third += 1) {
              const thirdId = buttons[third].getAttribute("data-material-card-id") ?? buttons[third].getAttribute("data-card-id");
              if (!thirdId || thirdId === leftId || thirdId === rightId || thirdId.startsWith("forge__")) continue;
              for (const button of [buttons[left], buttons[right], buttons[third]]) {
                if (!(button instanceof HTMLButtonElement)) return null;
                button.click();
              }
              return { cardIds: [leftId, rightId, thirdId], recipeId };
            }
          }
        }
        return null;
      }, excludedRecipeId);
      const winCombat = async () => {
        let steps = 0;
        while (await joinkinPage.$("main.phase-in_combat")) {
          if (steps++ > 1_000) throw new Error("Joinkin 전투가 종료되지 않았습니다.");
          const start = await joinkinPage.$('button[data-action-kind="START_TURN"]:not([disabled])');
          const card = await joinkinPage.$("button.combat-card:not([disabled])");
          const end = await joinkinPage.$('button[data-action-kind="END_TURN"]:not([disabled])');
          if (start) await clickAndWait('button[data-action-kind="START_TURN"]');
          else if (card) await clickAndWait("button.combat-card:not([disabled])");
          else if (end) await clickAndWait('button[data-action-kind="END_TURN"]');
          else throw new Error("Joinkin 전투에서 조작 가능한 행동을 찾지 못했습니다.");
        }
      };
      try {
        const response = await joinkinPage.goto(pageUrl, { waitUntil: "networkidle0" });
        if (response === null || !response.ok()) throw new Error(`Joinkin 선택 문서 응답 실패: ${response?.status() ?? "응답 없음"}`);
        await joinkinPage.waitForSelector(".race-select-screen");
        const selected = await joinkinPage.$$eval(".race-choice button", (buttons) => {
          const button = buttons.find((candidate) => candidate.textContent?.includes("이음붙이로 시작"));
          if (!(button instanceof HTMLButtonElement)) return false;
          button.click();
          return true;
        });
        if (!selected) throw new Error("Joinkin 선택 버튼을 찾지 못했습니다.");
        await joinkinPage.waitForSelector("main.phase-between_nodes");

        await joinkinPage.click('.journey-actions > button:not(.primary-cta)');
        await joinkinPage.waitForSelector('.forge-panel[aria-label="공방 빚기"]');
        const starterCards = await joinkinPage.$$eval(".workshop-materials button", (buttons) => buttons.map((button) => button.getAttribute("data-material-card-id")));
        const starterTools = starterCards.filter((cardId) => cardId?.startsWith("tool_"));
        const starterJoin = starterCards.filter((cardId) => cardId === "ore_join" || cardId?.startsWith("join_"));
        if (starterCards.length !== 30 || starterJoin.length !== 20 || starterTools.length !== 10 || new Set(starterTools).size !== 10) {
          throw new Error(`Joinkin starter가 다릅니다: ${JSON.stringify({ total: starterCards.length, join: starterJoin.length, tools: starterTools })}`);
        }
        const paidSelection = await selectTriple(".workshop-materials button");
        if (!paidSelection) throw new Error("Joinkin 공방 3-slot 선택에 실패했습니다.");
        await joinkinPage.waitForSelector(".forge-panel .canonical-preview");
        const workshopText = await joinkinPage.$eval(".forge-panel", (element) => element.textContent ?? "");
        if (!workshopText.includes("기본 재료 A") || !workshopText.includes("기본 재료 B") || !workshopText.includes("세 번째 공명 재료")
          || !workshopText.includes("세 번째 재료") || !workshopText.includes("공명 오버레이")) {
          throw new Error(`Joinkin 공방 slot/overlay 표시가 없습니다: ${workshopText}`);
        }
        await joinkinPage.click(".forge-panel .primary-cta:not([disabled])");
        await joinkinPage.waitForSelector('.forge-dialog[role="dialog"]');
        const dialogText = await joinkinPage.$eval('.forge-dialog[role="dialog"]', (element) => element.textContent ?? "");
        if (!dialogText.includes("선택한 세 재료는 영구적으로 소모") || !dialogText.includes("영구 소모 세 번째 재료")) {
          throw new Error(`Joinkin 영구 소모 확인 문구가 없습니다: ${dialogText}`);
        }
        await clickAndWait('.forge-dialog .primary-cta:not([disabled])');
        await settleDiscovery("paid workshop");
        const paidAfter = await readSave("paid-after");
        if (paidAfter.runtime.run.fuel !== 3 || paidAfter.runtime.run.ownedInstances.length !== 28
          || paidAfter.runtime.run.joinkinThirdOverlays.length !== 1
          || !paidAfter.profile.discoveredRecipeIds.includes(paidSelection.recipeId)) {
          throw new Error(`Joinkin 유료 공방 수명이 다릅니다: ${JSON.stringify({ fuel: paidAfter.runtime.run.fuel, owned: paidAfter.runtime.run.ownedInstances.length, overlays: paidAfter.runtime.run.joinkinThirdOverlays, discoveries: paidAfter.profile.discoveredRecipeIds })}`);
        }
        if (await joinkinPage.$(".forge-panel-heading .surface-close")) await joinkinPage.click(".forge-panel-heading .surface-close");

        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
        await clickAndWait('button[data-action-kind="START_TURN"]');
        await joinkinPage.waitForSelector('button[data-action-kind="JOINKIN_EXTEND"]');
        await clickAndWait('button[data-action-kind="JOINKIN_EXTEND"]');
        let instantSelection = null;
        for (let turn = 0; turn < 8 && !instantSelection; turn += 1) {
          if (!(await joinkinPage.$(".instant-mode-toggle.is-active"))) await joinkinPage.click(".instant-mode-toggle");
          instantSelection = await selectTriple("button.combat-card:not([disabled])", paidSelection.recipeId);
          if (!instantSelection) {
            if (await joinkinPage.$(".instant-mode-toggle.is-active")) await joinkinPage.click(".instant-mode-toggle");
            await clickAndWait('button[data-action-kind="END_TURN"]');
            await clickAndWait('button[data-action-kind="START_TURN"]');
          }
        }
        if (!instantSelection) throw new Error("Joinkin 즉석 3-slot 선택을 결정론적 8턴 안에 찾지 못했습니다.");
        await joinkinPage.waitForSelector(".instant-preview .canonical-preview");
        const instantText = await joinkinPage.$eval(".instant-preview", (element) => element.textContent ?? "");
        if (!instantText.includes("세 번째 재료") || !instantText.includes("공명 오버레이")) {
          throw new Error(`Joinkin 즉석 overlay 표시가 없습니다: ${instantText}`);
        }
        await clickAndWait(".instant-preview .primary-cta");
        await settleDiscovery("instant forge");
        const instantCreated = await readSave("instant-created");
        const active = instantCreated.runtime.run.activeCombat;
        const ephemeral = active?.ephemeralResults?.[0];
        if (!active || active.isolatedMaterials.length !== 3 || active.ephemeralResults.length !== 1
          || ephemeral.provenance?.kind !== "JOINKIN_THREE" || active.forgeActionsRemaining !== 1) {
          throw new Error(`Joinkin 즉석 3장 수명이 다릅니다: ${JSON.stringify({ active })}`);
        }
        const isolatedIds = active.isolatedMaterials.map(({ instance }) => instance.instanceId);
        const ephemeralInstanceId = ephemeral.instanceId;
        await joinkinPage.click(".codex-open");
        await joinkinPage.waitForSelector(".codex-surface");
        const codexSummary = await joinkinPage.$eval(".codex-heading p", (element) => element.textContent?.trim() ?? "");
        if (!/^발견한 기록 \d+ \/ 1326$/.test(codexSummary)) throw new Error(`Joinkin 도감 총계가 다릅니다: ${codexSummary}`);
        await joinkinPage.click(".codex-heading .surface-close");
        await joinkinPage.reload({ waitUntil: "networkidle0" });
        await joinkinPage.waitForSelector("main.phase-in_combat");
        const reloaded = await readSave("instant-reloaded");
        if (reloaded.runtime.run.activeCombat?.ephemeralResults?.[0]?.instanceId !== ephemeralInstanceId
          || reloaded.runtime.run.activeCombat?.isolatedMaterials?.length !== 3) {
          throw new Error("Joinkin 즉석 provenance가 reload 뒤 유지되지 않았습니다.");
        }
        await winCombat();
        await joinkinPage.waitForSelector("main.phase-awaiting_reward");
        const cleaned = await readSave("instant-cleaned");
        const cleanedOwned = new Set(cleaned.runtime.run.ownedInstances.map(({ instanceId }) => instanceId));
        const cleanedDeck = new Set(cleaned.runtime.run.deck);
        if (cleaned.runtime.run.activeCombat !== null || isolatedIds.some((id) => !cleanedOwned.has(id) || !cleanedDeck.has(id))
          || cleanedOwned.has(ephemeralInstanceId) || cleanedDeck.has(ephemeralInstanceId)) {
          throw new Error("Joinkin 즉석 종료 cleanup이 정확하지 않습니다.");
        }

        await clickAndWait(".reward-card button");
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // CACHE
        await clickAndWait(".event-choice");
        await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // WORKSHOP
        await clickAndWait(".event-choice");
        await joinkinPage.waitForSelector(".workshop-materials");
        const freeBefore = await readSave("free-before");
        const freeSelection = await selectTriple(".workshop-materials button");
        if (!freeSelection) throw new Error("Joinkin 무료 공방 재료를 찾지 못했습니다.");
        await joinkinPage.click('.resolved-screen .primary-cta:not([disabled])');
        await joinkinPage.waitForSelector('.forge-dialog[role="dialog"]');
        await clickAndWait('.forge-dialog .primary-cta:not([disabled])');
        await settleDiscovery("free workshop");
        const freeAfter = await readSave("free-after");
        if (freeAfter.runtime.run.fuel !== freeBefore.runtime.run.fuel
          || freeAfter.runtime.run.ownedInstances.length !== freeBefore.runtime.run.ownedInstances.length - 2) {
          throw new Error("Joinkin 무료 공방 연료/영구 수명이 다릅니다.");
        }
        await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // ELITE
        await winCombat();
        await joinkinPage.waitForSelector("main.phase-awaiting_reward");
        const odditySelected = await joinkinPage.$$eval(".reward-card", (cards) => {
          const card = cards.find((candidate) => candidate.querySelector("p")?.textContent?.includes("기괴 산물"));
          const button = card?.querySelector("button");
          if (!(button instanceof HTMLButtonElement)) return false;
          button.click();
          return true;
        });
        if (!odditySelected) throw new Error("Joinkin 엘리트 oddity 보상을 선택하지 못했습니다.");
        await joinkinPage.waitForSelector("main.phase-between_nodes");
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // COLLAPSE
        await clickAndWait(".event-choice");
        if (await joinkinPage.$('button[data-action-kind="LEAVE_EVENT"]')) await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // FICTOR
        await clickAndWait(".event-choice:last-child");
        await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // RECORD
        await clickAndWait(".event-choice");
        await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // ODDITY
        await clickAndWait(".event-choice");
        await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
        await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // BOSS
        await winCombat();
        await joinkinPage.waitForSelector("main.phase-run_won");
        const won = await readSave("won");
        if (won.flow.phase !== "RUN_WON" || won.runtime.run.activeCombat !== null || !won.profile.ownedHeartIds.includes("heart__still")) {
          throw new Error("Joinkin 보스 승리 상태가 다릅니다.");
        }
        await clickAndWait('button[data-action-kind="RESTART"]');
        await joinkinPage.waitForSelector("main.phase-between_nodes");
        const restarted = await readSave("restarted");
        const restartedCards = restarted.runtime.run.ownedInstances.map(({ cardId }) => cardId);
        if (restarted.flow.phase !== "BETWEEN_NODES" || restartedCards.length !== 30
          || restartedCards.filter((cardId) => cardId === "ore_join" || cardId.startsWith("join_")).length !== 20
          || restartedCards.filter((cardId) => cardId.startsWith("tool_")).length !== 10
          || !restarted.profile.ownedHeartIds.includes("heart__still")) {
          throw new Error("Joinkin 승리 재시작 상태가 다릅니다.");
        }
        const selectedRace = await joinkinPage.evaluate(() => ({
          race: window.localStorage.getItem("fictor.race.v1"),
          stillkin: window.localStorage.getItem("fictor.save.v2"),
          burnkin: window.localStorage.getItem("fictor.burnkin.save.v2"),
        }));
        if (selectedRace.race !== "Joinkin" || selectedRace.stillkin !== null || selectedRace.burnkin !== null) {
          throw new Error(`Joinkin 저장 격리가 다릅니다: ${JSON.stringify(selectedRace)}`);
        }
        return {
          race: "Joinkin", starterCards: 30, joinMaterials: 20, uniqueTools: 10,
          paidWorkshop: true, instantForge: true, reload: true, cleanup: true,
          codexTotal: 1326, freeWorkshop: true, bossVictory: true, restart: true,
        };
      } finally {
        await context.close();
      }
    };
    const joinkinSelection = await verifyJoinkinSelection();

    const verifyUnsafeAssetPolicy = async () => {
      const probePage = await browser.newPage();
      await probePage.evaluateOnNewDocument(() => window.localStorage.setItem("fictor.race.v1", "Stillkin"));
      const imageRequests = [];
      try {
        await probePage.setRequestInterception(true);
        probePage.on("request", (request) => {
          if (request.resourceType() === "image") imageRequests.push(request.url());
          const requestOrigin = new URL(request.url()).origin;
          void (requestOrigin === origin ? request.continue() : request.abort());
        });
        const response = await probePage.goto(`${pageUrl}?t030-asset-policy-probe=1`, { waitUntil: "networkidle0" });
        if (response === null || !response.ok()) throw new Error(`asset policy probe 문서 응답 실패: ${response?.status() ?? "응답 없음"}`);
        await probePage.waitForSelector('[data-asset-policy-probe="ready"]');
        const probeState = await probePage.$eval('[data-asset-policy-probe="ready"]', (element) => ({
          placeholders: element.querySelectorAll("[data-asset-placeholder]").length,
          images: element.querySelectorAll("img").length,
          srcsetAttributes: Array.from(element.querySelectorAll("img")).filter((image) => image.hasAttribute("srcset") || image.hasAttribute("srcSet")).length,
        }));
        const allowedProbeImages = new Set([
          `${mountPath}assets/backgrounds/background__still__depth_01.png`,
          `${mountPath}assets/cards/ore_still.png`,
        ]);
        const unexpected = imageRequests.filter((requestUrl) => new URL(requestUrl).origin !== origin || !allowedProbeImages.has(new URL(requestUrl).pathname));
        if (probeState.placeholders !== 3 || probeState.images !== 1 || probeState.srcsetAttributes !== 0 || unexpected.length > 0) {
          throw new Error(`unsafe asset 요청 차단 실패: state=${JSON.stringify(probeState)}, requests=${imageRequests.join(", ")}`);
        }
        return { cases: ["NEWLINE_SCHEME", "PROTOCOL_RELATIVE", "FIVE_LEVEL_ENCODED_TRAVERSAL", "LOWERCASE_EXTERNAL_SRCSET"], unsafeImageRequests: 0, unsafeSrcsetAttributes: 0 };
      } finally {
        await probePage.close();
      }
    };
    const unsafeAssetPolicy = await verifyUnsafeAssetPolicy();

    async function clickAndWait(selector) {
      const before = await page.$eval("main", (element) => element.getAttribute("data-screen-key"));
      await page.click(selector);
      await page.waitForFunction((screenKey) => {
        const main = document.querySelector("main");
        return main?.getAttribute("aria-busy") === "false" && main.getAttribute("data-screen-key") !== screenKey;
      }, {}, before);
    }

    async function settleFirstDiscovery(label) {
      const checkpoints = [];
      for (const phase of ["BURNING", "REVEALING", "PRINTING", "FINAL"]) {
        await page.waitForSelector(`.discovery-overlay[data-discovery-phase="${phase}"]`);
        checkpoints.push(phase);
      }
      const locked = await page.$eval("main", (element) => element.hasAttribute("inert") && element.getAttribute("aria-hidden") === "true");
      if (!locked) throw new Error(`${label} FIRST discovery 동안 underlay가 잠기지 않았습니다.`);
      const continueLabel = await page.$eval(".discovery-overlay button.primary-cta", (element) => element.textContent?.trim());
      const finalCopy = await page.$eval(".discovery-final-copy", (element) => element.textContent?.trim());
      if (continueLabel !== "계속" || !finalCopy?.includes("도감에 남았습니다")) throw new Error(`${label} FINAL이 완전한 정적 결과가 아닙니다.`);
      await page.click(".discovery-overlay button.primary-cta");
      await page.waitForSelector(".discovery-overlay", { hidden: true });
      const unlocked = await page.$eval("main", (element) => !element.hasAttribute("inert") && !element.hasAttribute("aria-hidden"));
      if (!unlocked) throw new Error(`${label} FIRST discovery 종료 뒤 underlay가 복구되지 않았습니다.`);
      discoveryCheckpoints.push({ label, phases: checkpoints, continued: true });
    }

    async function winVisibleCombat() {
      let steps = 0;
      while (await page.$("main.phase-in_combat")) {
        if (steps++ > 1_000) throw new Error("전투 smoke가 종료되지 않았습니다.");
        const start = await page.$('button[data-action-kind="START_TURN"]:not([disabled])');
        const card = await page.$("button.combat-card:not([disabled])");
        const end = await page.$('button[data-action-kind="END_TURN"]:not([disabled])');
        if (start) await clickAndWait('button[data-action-kind="START_TURN"]');
        else if (card) await clickAndWait("button.combat-card:not([disabled])");
        else if (end) await clickAndWait('button[data-action-kind="END_TURN"]');
        else throw new Error("전투에서 조작 가능한 행동을 찾지 못했습니다.");
      }
    }

    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
    await page.waitForSelector("main.phase-in_combat");
    const firstEnemySrc = await page.$eval(".enemy-record img", (element) => element instanceof HTMLImageElement ? element.src : "");
    if (new URL(firstEnemySrc).pathname !== `${mountPath}assets/enemies/enemy__still__swarm.png`) {
      throw new Error(`첫 적 asset 경로가 subpath-safe하지 않습니다: ${firstEnemySrc}`);
    }
    let combatSteps = 0;
    let instantDiscovery = null;
    let reloadedAfterInstant = false;
    while (await page.$("main.phase-in_combat")) {
      if (combatSteps++ > 1_000) throw new Error("첫 전투 smoke가 종료되지 않았습니다.");
      const start = await page.$('button[data-action-kind="START_TURN"]:not([disabled])');
      const card = await page.$("button.combat-card:not([disabled])");
      const end = await page.$('button[data-action-kind="END_TURN"]:not([disabled])');
      if (start) await clickAndWait('button[data-action-kind="START_TURN"]');
      else if (!instantDiscovery) {
        const pair = await page.$$eval("button.combat-card:not([disabled])", (cards) => {
          const left = cards.find((candidate) => !candidate.getAttribute("data-card-id")?.startsWith("forge__"));
          const right = cards.find((candidate) => !candidate.getAttribute("data-card-id")?.startsWith("forge__") && candidate.getAttribute("data-card-id") !== left?.getAttribute("data-card-id"));
          return left && right ? [left.getAttribute("data-card-id"), right.getAttribute("data-card-id")] : null;
        });
        if (!pair) {
          if (end) await clickAndWait('button[data-action-kind="END_TURN"]');
          else if (card) await clickAndWait("button.combat-card:not([disabled])");
          continue;
        }
        if (!(await page.$('.instant-mode-toggle:not([disabled])'))) throw new Error("서로 다른 현재 손 재료가 있는데 즉석 빚기 선택 모드가 비활성입니다.");
        await page.click(".instant-mode-toggle");
        const selected = await page.$$eval("button.combat-card:not([disabled])", (cards, materialIds) => {
          const selectedButtons = materialIds.map((id) => cards.find((candidate) => candidate.getAttribute("data-card-id") === id));
          if (!selectedButtons.every((candidate) => candidate instanceof HTMLButtonElement)) return false;
          selectedButtons.forEach((candidate) => candidate.click());
          return true;
        }, pair);
        if (!selected) throw new Error("즉석 빚기 재료 선택에 실패했습니다.");
        await page.waitForSelector(".instant-preview .canonical-preview");
        const resultName = await page.$eval(".instant-preview .preview-result strong", (element) => element.textContent?.trim());
        await clickAndWait(".instant-preview .primary-cta");
        const ephemeralCardId = await page.$eval('button.combat-card[data-card-id^="forge__"]', (element) => element.getAttribute("data-card-id"));
        const instantSave = await readCanonicalSaveV2(page, "instant-created");
        const active = instantSave.runtime.run.activeCombat;
        const recipeId = [...pair].sort().join("|");
        const isolated = active?.isolatedMaterials ?? [];
        const ephemeral = active?.ephemeralResults ?? [];
        const isolatedCardIds = isolated.map(({ instance }) => instance.cardId).sort();
        if (instantSave.flow.phase !== "IN_COMBAT" || active?.forgeActionsRemaining !== 0 || isolated.length !== 2 || ephemeral.length !== 1
          || isolatedCardIds.join("|") !== [...pair].sort().join("|") || ephemeral[0].cardId !== ephemeralCardId
          || ephemeral[0].recipeId !== recipeId || ephemeral[0].location !== "HAND"
          || !instantSave.profile.discoveredRecipeIds.includes(recipeId) || instantSave.runtime.run.ownedInstances.length !== 30) {
          throw new Error(`즉석 빚기 v2 수명/행동/격리 상태가 다릅니다: ${JSON.stringify({ phase: instantSave.flow.phase, remaining: active?.forgeActionsRemaining, isolatedCardIds, ephemeral, discovered: instantSave.profile.discoveredRecipeIds, owned: instantSave.runtime.run.ownedInstances.length })}`);
        }
        instantDiscovery = { materialIds: pair, materialInstanceIds: isolated.map(({ instance }) => instance.instanceId), resultName, recipeId, ephemeralCardId, ephemeralInstanceId: ephemeral[0].instanceId };
        await settleFirstDiscovery("instant");
        const imagesBeforeCodex = browserImageRequests.length;
        await page.click(".codex-open");
        await page.waitForSelector(".codex-surface");
        const codexSummary = await page.$eval(".codex-heading p", (element) => element.textContent?.trim());
        if (codexSummary !== "발견한 기록 1 / 1326") throw new Error(`즉석 발견 도감 요약이 다릅니다: ${codexSummary}`);
        let foundDiscoveredEntry = false;
        for (let codexPage = 0; codexPage < 28; codexPage += 1) {
          if ((await page.$$(".codex-entry.is-discovered")).length === 1) { foundDiscoveredEntry = true; break; }
          const nextCodex = await page.$('button[aria-label="다음 도감 페이지"]:not([disabled])');
          if (!nextCodex) break;
          await nextCodex.click();
          await page.waitForFunction((previousPage) => document.querySelector(".codex-pagination span")?.textContent?.trim() !== previousPage, {}, `${codexPage + 1} / 28`);
        }
        if (!foundDiscoveredEntry) throw new Error("즉석 발견 도감 항목을 28개 page에서 찾지 못했습니다.");
        const codexImagePaths = browserImageRequests.slice(imagesBeforeCodex).map((value) => new URL(value).pathname);
        const unexpectedCodexImages = codexImagePaths.filter((path) => !path.endsWith(`/assets/cards/${ephemeralCardId}.png`));
        if (unexpectedCodexImages.length > 0 || codexImagePaths.length > 1) throw new Error(`도감이 현재 발견 외 asset을 요청했습니다: ${codexImagePaths.join(", ")}`);
        await page.click(".codex-heading .surface-close");
        await page.reload({ waitUntil: "networkidle0" });
        await page.waitForSelector("main.phase-in_combat");
        const codexLabel = await page.$eval(".codex-open", (element) => element.getAttribute("aria-label"));
        if (!codexLabel?.includes("발견 1 / 1326")) throw new Error(`reload 뒤 즉석 발견이 유지되지 않았습니다: ${codexLabel}`);
        reloadedAfterInstant = true;
      }
      else if (card) await clickAndWait("button.combat-card:not([disabled])");
      else if (end) await clickAndWait('button[data-action-kind="END_TURN"]');
      else throw new Error("첫 전투에서 조작 가능한 행동을 찾지 못했습니다.");
    }
    if (!instantDiscovery || !reloadedAfterInstant) throw new Error("즉석 발견 → 도감 → reload smoke가 실행되지 않았습니다.");
    await page.waitForSelector("main.phase-awaiting_reward");
    const instantCleaned = await readCanonicalSaveV2(page, "instant-cleaned-after-combat");
    const cleanedOwnedIds = new Set(instantCleaned.runtime.run.ownedInstances.map(({ instanceId }) => instanceId));
    const cleanedDeckIds = new Set(instantCleaned.runtime.run.deck);
    if (instantCleaned.runtime.run.activeCombat !== null || instantDiscovery.materialInstanceIds.some((id) => !cleanedOwnedIds.has(id) || !cleanedDeckIds.has(id))
      || cleanedOwnedIds.has(instantDiscovery.ephemeralInstanceId) || cleanedDeckIds.has(instantDiscovery.ephemeralInstanceId)) {
      throw new Error(`즉석 전투 종료 복구/결과 제거가 다릅니다: ${JSON.stringify({ activeCombat: instantCleaned.runtime.run.activeCombat, materialInstanceIds: instantDiscovery.materialInstanceIds, result: instantDiscovery.ephemeralInstanceId })}`);
    }
    const normalReward = await page.$$eval(".reward-card", (cards) => cards.map((card) => ({ name: card.querySelector("h3")?.textContent?.trim(), kind: card.querySelector("p")?.textContent?.trim() })));
    if (normalReward.length !== 3 || normalReward.some(({ kind }) => kind !== "재료 · 어름") || normalReward.some(({ name, kind }) => /forge__|장비|빚기 결과/i.test(`${name} ${kind}`))) {
      throw new Error(`일반 보상이 material 3 제한과 다릅니다: ${JSON.stringify(normalReward)}`);
    }
    await clickAndWait(".reward-card button");
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
    await page.waitForSelector("main.phase-in_event");
    await clickAndWait(".event-choice");
    await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
    await page.waitForSelector("main.phase-in_event");
    await clickAndWait(".event-choice");
    await page.waitForSelector(".workshop-materials");
    const freeBefore = await readCanonicalSaveV2(page, "free-workshop-before");
    const freeSelected = await page.$$eval(".workshop-materials button", (buttons) => {
      const ore = buttons.find((button) => button.getAttribute("data-material-card-id") === "ore_still");
      const still03 = buttons.find((button) => button.getAttribute("data-material-card-id") === "still_03");
      if (!(ore instanceof HTMLButtonElement) || !(still03 instanceof HTMLButtonElement)) return null;
      ore.click();
      still03.click();
      return {
        cardIds: [ore.getAttribute("data-material-card-id"), still03.getAttribute("data-material-card-id")],
        instanceIds: [ore.getAttribute("data-material-instance-id"), still03.getAttribute("data-material-instance-id")],
      };
    });
    if (!freeSelected) throw new Error("공방에서 ore_still + still_03 재료를 찾지 못했습니다.");
    // The UI intentionally exposes card IDs but not persistence instance IDs. Bind the two
    // selected material definitions to their unique current owned instances in canonical v2.
    freeSelected.instanceIds = freeSelected.cardIds.map((cardId) => freeBefore.runtime.run.ownedInstances.find(({ instanceId, cardId: ownedCardId }) => ownedCardId === cardId && !freeSelected.instanceIds.includes(instanceId))?.instanceId ?? null);
    if (freeSelected.instanceIds.some((id) => id === null)) throw new Error(`무료 공방 재료 instance를 v2 owned state에서 결속하지 못했습니다: ${JSON.stringify(freeSelected)}`);
    await page.waitForSelector('.resolved-screen .primary-cta:not([disabled])');
    await page.click('.resolved-screen .primary-cta:not([disabled])');
    await page.waitForSelector('.forge-dialog[role="dialog"]');
    await clickAndWait('.forge-dialog .primary-cta:not([disabled])');
    await settleFirstDiscovery("free-workshop");
    const freeAfter = await readCanonicalSaveV2(page, "free-workshop-after");
    const freeOwnedIds = new Set(freeAfter.runtime.run.ownedInstances.map(({ instanceId }) => instanceId));
    const freeResult = freeAfter.runtime.run.ownedInstances.filter(({ cardId }) => cardId === "forge__ore_still__still_03");
    if (freeBefore.runtime.run.fuel !== 4 || freeAfter.runtime.run.fuel !== freeBefore.runtime.run.fuel
      || freeSelected.instanceIds.some((id) => freeOwnedIds.has(id)) || freeResult.length !== 1
      || freeAfter.runtime.run.ownedInstances.length !== freeBefore.runtime.run.ownedInstances.length - 1
      || freeAfter.runtime.run.deck.length !== freeBefore.runtime.run.deck.length - 1) {
      throw new Error(`무료 공방 영구 소모/연료/결과가 다릅니다: ${JSON.stringify({ beforeFuel: freeBefore.runtime.run.fuel, afterFuel: freeAfter.runtime.run.fuel, beforeOwned: freeBefore.runtime.run.ownedInstances.length, afterOwned: freeAfter.runtime.run.ownedInstances.length, resultCount: freeResult.length, selected: freeSelected.instanceIds })}`);
    }
    await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
    await page.waitForSelector('img[alt="눌린 불의 잔해"]');
    let fallbackAssetUrl = "";
    const observedEliteHands = [];
    for (let actions = 0; actions < 24 && await page.$("main.phase-in_combat"); actions += 1) {
      observedEliteHands.push(await page.$$eval("button.combat-card", (cards) => cards.map((card) => card.getAttribute("data-card-id"))));
      const fallbackCard = await page.$('button.combat-card[data-card-id="forge__ore_still__still_03"]');
      if (fallbackCard) {
        fallbackAssetUrl = await fallbackCard.$eval("img", (element) => element instanceof HTMLImageElement ? element.src : "");
        const marker = await fallbackCard.$eval(".card-art-note", (element) => element.textContent?.trim());
        if (marker !== "굳은 조각 재료 도판") throw new Error(`missing canonical fallback 표시가 없습니다: ${marker}`);
        break;
      }
      const start = await page.$('button[data-action-kind="START_TURN"]:not([disabled])');
      const end = await page.$('button[data-action-kind="END_TURN"]:not([disabled])');
      if (start) await clickAndWait('button[data-action-kind="START_TURN"]');
      else if (end) await clickAndWait('button[data-action-kind="END_TURN"]');
      else break;
    }
    if (!fallbackAssetUrl || new URL(fallbackAssetUrl).pathname !== `${mountPath}assets/cards/ore_still.png`) {
      throw new Error(`missing canonical fallback asset 경로가 올바르지 않습니다: ${fallbackAssetUrl}; hands=${JSON.stringify(observedEliteHands)}`);
    }
    const fallbackAssetResponse = await fetch(fallbackAssetUrl);
    if (fallbackAssetResponse.status !== 200 || fallbackAssetResponse.headers.get("content-type")?.split(";", 1)[0] !== "image/png") {
      throw new Error(`missing canonical fallback asset 응답 실패: ${fallbackAssetResponse.status}`);
    }

    await winVisibleCombat();
    await page.waitForSelector("main.phase-awaiting_reward");
    const eliteRewardSave = await readCanonicalSaveV2(page, "elite-reward");
    const eliteReward = await page.$$eval(".reward-card", (cards) => cards.map((card) => ({ name: card.querySelector("h3")?.textContent?.trim(), kind: card.querySelector("p")?.textContent?.trim() })));
    if (eliteRewardSave.flow.pendingOfferId !== "elite-d2" || eliteReward.length !== 2
      || eliteReward.map(({ kind }) => kind).sort().join("|") !== ["기괴 산물 · 어름", "도구 · 어름"].sort().join("|")
      || eliteReward.some(({ name, kind }) => /forge__|장비|빚기 결과/i.test(`${name} ${kind}`))) {
      throw new Error(`엘리트 보상이 tool-or-oddity 제한과 다릅니다: ${JSON.stringify({ pending: eliteRewardSave.flow.pendingOfferId, eliteReward })}`);
    }
    await clickAndWait(".reward-card:nth-child(2) button");
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // COLLAPSE
    await clickAndWait(".event-choice");
    if (await page.$('button[data-action-kind="LEAVE_EVENT"]')) await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
    if (!(await page.$("main.phase-between_nodes"))) throw new Error("COLLAPSE 이후 런이 계속되지 않았습니다.");
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // FICTOR
    await clickAndWait(".event-choice:last-child");
    await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // RECORD
    await clickAndWait(".event-choice");
    await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // ODDITY
    await clickAndWait(".event-choice");
    await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]'); // BOSS
    const bossBefore = await readCanonicalSaveV2(page, "boss-entered");
    if (bossBefore.flow.phase !== "IN_COMBAT" || bossBefore.flow.combatBinding?.encounterId !== "the_stilling" || bossBefore.profile.ownedHeartIds.length !== 0) {
      throw new Error(`보스 진입/heart 사전 상태가 다릅니다: ${JSON.stringify({ phase: bossBefore.flow.phase, binding: bossBefore.flow.combatBinding, hearts: bossBefore.profile.ownedHeartIds })}`);
    }
    await winVisibleCombat();
    await page.waitForSelector("main.phase-run_won");
    const wonSave = await readCanonicalSaveV2(page, "boss-victory");
    if (wonSave.flow.phase !== "RUN_WON" || wonSave.runtime.run.activeCombat !== null
      || wonSave.profile.ownedHeartIds.join("|") !== "heart__still") {
      throw new Error(`보스 heart/victory save가 다릅니다: ${JSON.stringify({ phase: wonSave.flow.phase, hearts: wonSave.profile.ownedHeartIds, activeCombat: wonSave.runtime.run.activeCombat !== null })}`);
    }
    const discoveriesAtVictory = [...wonSave.profile.discoveredRecipeIds];
    await clickAndWait('button[data-action-kind="RESTART"]');
    await page.waitForSelector("main.phase-between_nodes");
    const wonRestartStarter = await assertFreshStarterVisible(page, "victory restart");
    const wonRestartSave = await readCanonicalSaveV2(page, "boss-victory-restart");
    if (wonRestartSave.flow.phase !== "BETWEEN_NODES" || wonRestartSave.runtime.run.fuel !== 4
      || wonRestartSave.runtime.run.deck.length !== 30 || wonRestartSave.runtime.run.ownedInstances.length !== 30
      || wonRestartSave.profile.ownedHeartIds.join("|") !== "heart__still"
      || wonRestartSave.profile.discoveredRecipeIds.join("|") !== discoveriesAtVictory.join("|")) {
      throw new Error(`승리 재시작 starter/profile 상태가 다릅니다: ${JSON.stringify({ phase: wonRestartSave.flow.phase, fuel: wonRestartSave.runtime.run.fuel, deck: wonRestartSave.runtime.run.deck.length, owned: wonRestartSave.runtime.run.ownedInstances.length, hearts: wonRestartSave.profile.ownedHeartIds, discoveries: wonRestartSave.profile.discoveredRecipeIds })}`);
    }

    const codexBeforePaid = await page.$eval(".codex-open", (element) => element.getAttribute("aria-label"));
    const paidBefore = await readCanonicalSaveV2(page, "paid-workshop-before");
    await page.click('.journey-actions > button:not(.primary-cta)');
    await page.waitForSelector('.forge-panel[aria-label="공방 빚기"]');
    const paidSelected = await page.$$eval(".workshop-materials button", (buttons, materialIds) => {
      const selectedButtons = materialIds.map((id) => buttons.find((button) => button.getAttribute("data-material-card-id") === id));
      if (!selectedButtons.every((candidate) => candidate instanceof HTMLButtonElement)) return null;
      selectedButtons.forEach((candidate) => candidate.click());
      return selectedButtons.map((candidate) => candidate.getAttribute("data-material-card-id"));
    }, instantDiscovery.materialIds);
    if (!paidSelected) throw new Error("새 런 공방에서 즉석 발견과 같은 재료를 찾지 못했습니다.");
    const paidMaterialInstanceIds = paidSelected.map((cardId) => paidBefore.runtime.run.ownedInstances.find(({ cardId: ownedCardId }) => ownedCardId === cardId)?.instanceId ?? null);
    if (paidMaterialInstanceIds.some((id) => id === null)) throw new Error(`유료 공방 재료 instance를 v2 owned state에서 결속하지 못했습니다: ${JSON.stringify(paidSelected)}`);
    await page.waitForSelector('.forge-panel .preview-result strong');
    const paidResultName = await page.$eval('.forge-panel .preview-result strong', (element) => element.textContent?.trim());
    if (paidResultName !== instantDiscovery.resultName) throw new Error(`즉석/공방 canonical 결과가 다릅니다: ${instantDiscovery.resultName} / ${paidResultName}`);
    await page.click('.forge-panel .primary-cta:not([disabled])');
    await page.waitForSelector('.forge-dialog[role="dialog"]');
    await clickAndWait('.forge-dialog .primary-cta:not([disabled])');
    await page.waitForSelector(".discovery-toast");
    const repeatState = await page.$eval("main", (element) => ({ inert: element.hasAttribute("inert"), hidden: element.getAttribute("aria-hidden") }));
    if (repeatState.inert || repeatState.hidden !== null) throw new Error(`REPEAT toast가 underlay를 잠갔습니다: ${JSON.stringify(repeatState)}`);
    const repeatCopy = await page.$eval(".discovery-toast", (element) => element.textContent?.trim());
    if (!repeatCopy?.includes("알고 있는 제법") || !repeatCopy.includes(instantDiscovery.resultName)) throw new Error(`REPEAT toast 결과가 다릅니다: ${repeatCopy}`);
    await page.click(".discovery-toast button");
    await page.waitForSelector(".discovery-toast", { hidden: true });
    const codexAfterPaid = await page.$eval(".codex-open", (element) => element.getAttribute("aria-label"));
    if (codexAfterPaid !== codexBeforePaid) throw new Error(`같은 recipe의 공방 빚기가 도감 항목을 중복했습니다: ${codexBeforePaid} / ${codexAfterPaid}`);
    const fuelAfterPaid = await page.$$eval(".stats-strip div", (items) => items.find((item) => item.querySelector("dt")?.textContent === "연료")?.querySelector("dd")?.textContent?.trim());
    if (fuelAfterPaid !== "3") throw new Error(`새 런 유료 공방 연료 결과가 다릅니다: ${fuelAfterPaid}`);
    const paidAfter = await readCanonicalSaveV2(page, "paid-workshop-after");
    const paidOwnedIds = new Set(paidAfter.runtime.run.ownedInstances.map(({ instanceId }) => instanceId));
    const paidResults = paidAfter.runtime.run.ownedInstances.filter(({ cardId }) => cardId === instantDiscovery.ephemeralCardId);
    if (paidBefore.runtime.run.fuel !== 4 || paidAfter.runtime.run.fuel !== 3
      || paidMaterialInstanceIds.some((id) => paidOwnedIds.has(id)) || paidResults.length !== 1
      || paidAfter.runtime.run.ownedInstances.length !== paidBefore.runtime.run.ownedInstances.length - 1
      || paidAfter.runtime.run.deck.length !== paidBefore.runtime.run.deck.length - 1
      || paidAfter.profile.discoveredRecipeIds.join("|") !== paidBefore.profile.discoveredRecipeIds.join("|")) {
      throw new Error(`유료 공방 연료/영구 소모/canonical/도감 중복 상태가 다릅니다: ${JSON.stringify({ beforeFuel: paidBefore.runtime.run.fuel, afterFuel: paidAfter.runtime.run.fuel, selected: paidMaterialInstanceIds, resultCard: instantDiscovery.ephemeralCardId, resultCount: paidResults.length, beforeDiscoveries: paidBefore.profile.discoveredRecipeIds, afterDiscoveries: paidAfter.profile.discoveredRecipeIds })}`);
    }

    if (browserErrors.length > 0) {
      throw new Error(`브라우저 오류:\n${browserErrors.join("\n")}`);
    }
    if (failedResponses.length > 0) {
      throw new Error(`실패 응답:\n${failedResponses.join("\n")}`);
    }
    if (externalRequests.length > 0) {
      throw new Error(`외부 요청:\n${externalRequests.join("\n")}`);
    }
    if (apiRequests.length > 0) {
      throw new Error(`API 요청:\n${apiRequests.join("\n")}`);
    }
    if (webSocketRequests.length > 0) {
      throw new Error(`WebSocket 요청:\n${webSocketRequests.join("\n")}`);
    }
    const staticAssets = await verifyMountedPngs(origin);

    console.log(
      JSON.stringify({
        command: "smoke:static",
        mountPath,
        heading,
        status,
        browserErrors: 0,
        failedResponses: 0,
        externalRequests: 0,
        apiRequests: 0,
        webSocketRequests: 0,
        browserImageRequests: browserImageRequests.length,
        performanceBudgets: { initialRequests: 1, initialAssetBytes, javascriptBytes, cssBytes, noncurrentInitialAssets: 0 },
        unsafeAssetPolicy,
        firstUserAccessibility,
        discoveryCheckpoints,
        saveCheckpoints,
        lossRestart,
        initialStarter,
        wonRestartStarter,
        rewardRestrictions: { normal: normalReward, elite: eliteReward, forgeOrEquipmentDirect: 0 },
        workshopInvariants: {
          free: { fuelBefore: freeBefore.runtime.run.fuel, fuelAfter: freeAfter.runtime.run.fuel, permanentMaterialsConsumed: 2, permanentResultsAdded: 1 },
          paid: { fuelBefore: paidBefore.runtime.run.fuel, fuelAfter: paidAfter.runtime.run.fuel, permanentMaterialsConsumed: 2, permanentResultsAdded: 1, canonicalCardId: instantDiscovery.ephemeralCardId, duplicateDiscoveries: 0 },
        },
        boss: { heartId: "heart__still", phase: wonSave.flow.phase, restartPhase: wonRestartSave.flow.phase },
        threeRaceCompletion: {
          Stillkin: { phase: wonSave.flow.phase, bossVictory: true, restart: true },
          Burnkin: burnkinCompletion,
          Joinkin: { phase: "RUN_WON", bossVictory: joinkinSelection.bossVictory, restart: joinkinSelection.restart },
        },
        joinkinSelection,
        corePath: "race selection -> Burnkin full ice run -> boss victory -> restart; Joinkin paid triple -> instant triple -> Codex -> reload -> cleanup -> free triple -> boss victory -> restart; isolated fresh loss -> RUN_LOST -> restart; Stillkin instant discovery -> Codex -> reload -> full run -> boss victory -> restart -> paid workshop same recipe",
        instantDiscovery: { ...instantDiscovery, reloaded: reloadedAfterInstant, codexBeforePaid, codexAfterPaid, fuelAfterPaid },
        missingCanonicalFallback: { cardId: "forge__ore_still__still_03", assetPath: new URL(fallbackAssetUrl).pathname, httpStatus: fallbackAssetResponse.status },
        staticAssets,
      }),
    );
  } catch (error) {
    runError = error;
  } finally {
    const cleanupErrors = [];

    try {
      try {
        await browser?.close();
      } catch (error) {
        cleanupErrors.push(error);
      }
    } finally {
      try {
        if (server.listening) {
          server.closeAllConnections();
          await new Promise((resolveClose, rejectClose) => {
            server.close((error) => (error ? rejectClose(error) : resolveClose()));
          });
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }

    if (runError !== undefined && cleanupErrors.length > 0) {
      const messages = [runError, ...cleanupErrors].map((error) =>
        error instanceof Error ? error.message : String(error),
      );
      throw new AggregateError(
        [runError, ...cleanupErrors],
        `정적 smoke 실행 및 정리 실패:\n${messages.join("\n")}`,
      );
    }
    if (runError !== undefined) {
      throw runError;
    }
    if (cleanupErrors.length === 1) {
      throw cleanupErrors[0];
    }
    if (cleanupErrors.length > 1) {
      const messages = cleanupErrors.map((error) =>
        error instanceof Error ? error.message : String(error),
      );
      throw new AggregateError(cleanupErrors, `정적 smoke 정리 실패:\n${messages.join("\n")}`);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

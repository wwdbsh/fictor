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

    const disableSandbox = process.env.PUPPETEER_DISABLE_SANDBOX === "true";
    browser = await puppeteer.launch({
      headless: true,
      args: disableSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    });
    const page = await browser.newPage();
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
    const initialImagePaths = browserImageRequests.map((value) => new URL(value).pathname);
    if (initialImagePaths.length !== 1 || initialImagePaths[0] !== `${mountPath}assets/backgrounds/background__still__depth_01.png`) {
      throw new Error(`초기 화면 밖 asset이 요청되었습니다: ${initialImagePaths.join(", ")}`);
    }

    async function clickAndWait(selector) {
      const before = await page.$eval("main", (element) => element.getAttribute("data-screen-key"));
      await page.click(selector);
      await page.waitForFunction((screenKey) => {
        const main = document.querySelector("main");
        return main?.getAttribute("aria-busy") === "false" && main.getAttribute("data-screen-key") !== screenKey;
      }, {}, before);
    }

    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
    await page.waitForSelector("main.phase-in_combat");
    const firstEnemySrc = await page.$eval(".enemy-record img", (element) => element instanceof HTMLImageElement ? element.src : "");
    if (new URL(firstEnemySrc).pathname !== `${mountPath}assets/enemies/enemy__still__swarm.png`) {
      throw new Error(`첫 적 asset 경로가 subpath-safe하지 않습니다: ${firstEnemySrc}`);
    }
    let combatSteps = 0;
    while (await page.$("main.phase-in_combat")) {
      if (combatSteps++ > 1_000) throw new Error("첫 전투 smoke가 종료되지 않았습니다.");
      const start = await page.$('button[data-action-kind="START_TURN"]:not([disabled])');
      const card = await page.$("button.combat-card:not([disabled])");
      const end = await page.$('button[data-action-kind="END_TURN"]:not([disabled])');
      if (start) await clickAndWait('button[data-action-kind="START_TURN"]');
      else if (card) await clickAndWait("button.combat-card:not([disabled])");
      else if (end) await clickAndWait('button[data-action-kind="END_TURN"]');
      else throw new Error("첫 전투에서 조작 가능한 행동을 찾지 못했습니다.");
    }
    await page.waitForSelector("main.phase-awaiting_reward");
    await clickAndWait(".reward-card button");
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
    await page.waitForSelector("main.phase-in_event");
    await clickAndWait(".event-choice");
    await clickAndWait('button[data-action-kind="LEAVE_EVENT"]');
    await clickAndWait('button[data-action-kind="ENTER_NEXT_NODE"]');
    await page.waitForSelector("main.phase-in_event");
    await clickAndWait(".event-choice");
    await page.waitForSelector(".workshop-materials");
    const selected = await page.$$eval(".workshop-materials button", (buttons) => {
      const ore = buttons.find((button) => button.getAttribute("data-material-card-id") === "ore_still");
      const still03 = buttons.find((button) => button.getAttribute("data-material-card-id") === "still_03");
      if (!(ore instanceof HTMLButtonElement) || !(still03 instanceof HTMLButtonElement)) return false;
      ore.click();
      still03.click();
      return true;
    });
    if (!selected) throw new Error("공방에서 ore_still + still_03 재료를 찾지 못했습니다.");
    await page.waitForSelector('.resolved-screen .primary-cta:not([disabled])');
    await clickAndWait('.resolved-screen .primary-cta:not([disabled])');
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
        corePath: "first combat -> reward -> cache -> workshop -> elite",
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

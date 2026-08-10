import { createReadStream, existsSync, statSync } from "node:fs";
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
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

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

    browser = await puppeteer.launch({ headless: true });
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

    if (heading !== "FICTOR · 픽토르" || status !== "게임의 실행 기반을 준비했습니다.") {
      throw new Error(`한국어 bootstrap 문구가 일치하지 않습니다: ${heading} / ${status}`);
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
      }),
    );
  } finally {
    await browser?.close();
    if (server.listening) {
      await new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error ? rejectClose(error) : resolveClose()));
      });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

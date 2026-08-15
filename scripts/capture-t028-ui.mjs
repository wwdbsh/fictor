import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import puppeteer from "puppeteer";

const origin = process.argv[2] ?? "http://127.0.0.1:5173/";
const output = resolve(process.cwd(), "docs/design/t028");
mkdirSync(output, { recursive: true });

async function clickAndWait(page, selector) {
  const before = await page.$eval("main", (element) => element.getAttribute("data-screen-key"));
  await page.click(selector);
  await page.waitForFunction((key) => {
    const main = document.querySelector("main");
    return main?.getAttribute("aria-busy") === "false" && main.getAttribute("data-screen-key") !== key;
  }, {}, before);
}

async function winCombat(page) {
  let steps = 0;
  while (await page.$("main.phase-in_combat")) {
    if (steps++ > 1_000) throw new Error("combat capture loop exceeded 1,000 steps");
    if (await page.$('button[data-action-kind="START_TURN"]:not([disabled])')) await clickAndWait(page, 'button[data-action-kind="START_TURN"]');
    else if (await page.$("button.combat-card:not([disabled])")) await clickAndWait(page, "button.combat-card:not([disabled])");
    else await clickAndWait(page, 'button[data-action-kind="END_TURN"]');
  }
}

async function enter(page) { await clickAndWait(page, 'button[data-action-kind="ENTER_NEXT_NODE"]'); }
async function leaveEvent(page) { await clickAndWait(page, 'button[data-action-kind="LEAVE_EVENT"]'); }
async function simpleEvent(page) { await clickAndWait(page, ".event-choice"); await leaveEvent(page); }

async function prepare(page, viewport) {
  await page.setViewport(viewport);
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
}

const browser = await puppeteer.launch({ headless: true });
try {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await prepare(page, { width: 1536, height: 1024, deviceScaleFactor: 1 });
  await enter(page);
  await clickAndWait(page, 'button[data-action-kind="START_TURN"]');
  await page.screenshot({ path: resolve(output, "combat-render.png") });
  await winCombat(page);
  await page.screenshot({ path: resolve(output, "reward-render.png") });
  await clickAndWait(page, ".reward-card button");
  await enter(page);
  await simpleEvent(page); // CACHE
  await enter(page);
  await clickAndWait(page, ".event-choice"); // WORKSHOP entitlement
  await page.$$eval(".workshop-materials button", (buttons) => {
    const first = buttons[0];
    const second = buttons.find((button) => button.textContent?.trim() !== first?.textContent?.trim());
    if (first instanceof HTMLButtonElement && second instanceof HTMLButtonElement) { first.click(); second.click(); }
  });
  await page.waitForSelector(".resolved-screen .primary-cta:not([disabled])");
  await clickAndWait(page, ".resolved-screen .primary-cta:not([disabled])");
  await leaveEvent(page);
  await enter(page);
  await winCombat(page);
  await clickAndWait(page, ".reward-card:nth-child(2) button");
  await enter(page);
  await simpleEvent(page); // COLLAPSE
  await enter(page);
  await page.waitForSelector("main.phase-in_event");
  await page.screenshot({ path: resolve(output, "event-render.png") });

  const mobileContext = await browser.createBrowserContext();
  const mobile = await mobileContext.newPage();
  await prepare(mobile, { width: 900, height: 1000, deviceScaleFactor: 1 });
  await enter(mobile);
  await clickAndWait(mobile, 'button[data-action-kind="START_TURN"]');
  await mobile.screenshot({ path: resolve(output, "combat-render-900.png"), fullPage: true });
  await mobileContext.close();
  await context.close();
  console.log(JSON.stringify({ command: "capture-t028-ui", viewport: "1536x1024", responsiveViewport: "900x1000", files: ["combat-render.png", "reward-render.png", "event-render.png", "combat-render-900.png"] }));
} finally {
  await browser.close();
}

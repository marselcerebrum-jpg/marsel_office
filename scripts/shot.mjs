// Ambil screenshot halaman lewat Microsoft Edge lokal (untuk verifikasi visual saat pengembangan).
import { chromium } from "playwright-core";
const url = process.argv[2] ?? "http://localhost:3100/";
const out = process.argv[3] ?? ".shots/home.png";
const actions = process.argv[4] ?? "";
const browser = await chromium.launch({ channel: "msedge", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const logs = [];
page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(4000);
for (const step of actions.split(";").filter(Boolean)) {
  const [cmd, ...rest] = step.split(":");
  const arg = rest.join(":");
  if (cmd === "key") { await page.keyboard.down(arg.split("@")[0]); await page.waitForTimeout(Number(arg.split("@")[1] ?? 800)); await page.keyboard.up(arg.split("@")[0]); }
  if (cmd === "click") await page.click(arg);
  if (cmd === "fill") { const i = arg.lastIndexOf("|"); const sel = arg.slice(0, i), val = arg.slice(i + 1); await page.fill(sel, val); }
  if (cmd === "wait") await page.waitForTimeout(Number(arg));
  if (cmd === "wheel") { await page.mouse.move(800, 400); for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, Number(arg) / 10); await page.waitForTimeout(40); } }
  if (cmd === "mouse") { const [x, y] = arg.split(",").map(Number); await page.mouse.click(x, y); }
}
await page.waitForTimeout(1200);
await page.screenshot({ path: out });
console.log(logs.slice(0, 15).join("\n") || "no console errors");
await browser.close();

import "./style.css";
import "./extras.css";
import type { ParsedContent } from "../src/types";

const form = document.querySelector<HTMLFormElement>("#parse-form")!;
const input = document.querySelector<HTMLInputElement>("#link")!;
const submit = document.querySelector<HTMLButtonElement>("#submit")!;
const detected = document.querySelector<HTMLElement>("#detected")!;
const status = document.querySelector<HTMLElement>("#status")!;
const result = document.querySelector<HTMLElement>("#result")!;
const turnstile = document.querySelector<HTMLElement>("#turnstile")!;
let token = "";
let widgetId: string | undefined;
declare global { interface Window { turnstile?: { render: (el: HTMLElement, options: Record<string, unknown>) => string; reset: (id?: string) => void } } }

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
function identify(value: string) { if (/xhslink|xiaohongshu/.test(value)) return "小红书"; if (/zhihu/.test(value)) return "知乎"; if (/(?:x|twitter)\.com|t\.co/.test(value)) return "X / Twitter"; return "自动识别"; }
input.addEventListener("input", () => { detected.textContent = identify(input.value); });

async function initTurnstile() {
  const config = await fetch("/config.json").then(r => r.json()) as { turnstileSiteKey: string };
  if (!config.turnstileSiteKey) { status.textContent = "站点验证尚未配置，网页解析暂不可用。"; return; }
  const script = document.createElement("script"); script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; script.async = true;
  script.onload = () => { widgetId = window.turnstile?.render(turnstile, { sitekey: config.turnstileSiteKey, action: "parse", callback: (value: string) => { token = value; }, "expired-callback": () => { token = ""; } }); };
  document.head.appendChild(script);
}
void initTurnstile().catch(() => { status.textContent = "验证组件加载失败，请刷新页面重试。"; });

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (!token) { status.textContent = "请先完成人机验证。"; return; }
  submit.disabled = true; submit.textContent = "解析中…"; result.replaceChildren(); status.textContent = "正在读取公开内容，请稍候…";
  try {
    const response = await fetch("/api/v1/parse", { method: "POST", headers: { "content-type": "application/json", "x-client-type": "web" }, body: JSON.stringify({ link: input.value, turnstileToken: token }) });
    const body = await response.json() as { ok: boolean; data?: ParsedContent; error?: { message: string } };
    if (!body.ok || !body.data) throw new Error(body.error?.message || "解析失败");
    render(body.data); status.textContent = `已解析 ${body.data.media.length} 项媒体资源`;
  } catch (cause) { status.textContent = cause instanceof Error ? cause.message : "解析失败"; }
  finally { submit.disabled = false; submit.innerHTML = "开始解析 <span aria-hidden=\"true\">↗</span>"; token = ""; window.turnstile?.reset(widgetId); }
});

function render(content: ParsedContent) {
  const labels = { x: "X / Twitter", xiaohongshu: "小红书", zhihu: "知乎" };
  const media = content.media.map((item, index) => {
    const first = item.variants[0];
    const previewVariant = item.kind === "image" ? first : item.variants.find(v => v.width && v.width <= 640) || item.variants.at(-1) || first;
    const previewUrl = previewVariant.downloadUrl ? `${previewVariant.downloadUrl}?inline=1` : previewVariant.url;
    const preview = item.kind === "image" ? `<img src="${escapeHtml(previewUrl)}" alt="资源 ${index + 1}" loading="lazy" />` : `<video src="${escapeHtml(previewUrl)}" controls preload="metadata" poster="${escapeHtml(item.thumbnail || "")}"></video>`;
    const choices = item.variants.map(variant => `<a class="download" href="${escapeHtml(variant.downloadUrl || variant.url)}" download rel="noopener">${escapeHtml(variant.label)} <span>↓</span></a>`).join("");
    const gif = item.kind !== "image" ? `<button class="gif-button" type="button" data-gif-url="${escapeHtml(previewUrl)}" data-gif-index="${index}">转为 GIF（前 4 秒）</button>` : "";
    return `<div class="media-card"><div class="media-preview">${preview}</div><div class="media-foot"><span>${item.kind === "image" ? "图片" : item.kind === "gif" ? "动图视频" : "视频"} ${index + 1}${item.watermarkFree ? " · 无水印源" : ""}</span><div class="downloads">${choices}${gif}</div></div></div>`;
  }).join("");
  result.innerHTML = `<article class="content-card"><div class="content-head"><span class="platform-badge">${labels[content.platform]}</span><a href="${escapeHtml(content.sourceUrl)}" target="_blank" rel="noopener noreferrer">查看原文 ↗</a></div><h2>${escapeHtml(content.title || content.text.slice(0, 50) || "公开内容")}</h2><div class="author">${content.author.avatar ? `<img src="${escapeHtml(content.author.avatar)}" alt="" />` : ""}<span>${escapeHtml(content.author.name || "未知作者")}</span></div>${content.text ? `<p class="body-text">${escapeHtml(content.text)}</p>` : ""}</article>${content.media.length ? `<div class="media-heading"><h3>媒体资源</h3><span>${content.media.length} 项</span></div><div class="media-grid">${media}</div>` : ""}${content.warnings.length ? `<div class="warning">${content.warnings.map(escapeHtml).join("<br>")}</div>` : ""}`;
}

result.addEventListener("click", async event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-gif-url]");
  if (!button) return;
  button.disabled = true; button.textContent = "正在转换…";
  try {
    const { videoToGif } = await import("./to-gif");
    const blob = await videoToGif(button.dataset.gifUrl!);
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `media-${button.dataset.gifIndex}.gif`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    button.textContent = "重新转换 GIF";
  } catch (cause) { button.textContent = cause instanceof Error ? cause.message : "转换失败"; }
  finally { button.disabled = false; }
});

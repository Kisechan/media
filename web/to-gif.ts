import { GIFEncoder, applyPalette, quantize } from "gifenc";

function once(target: EventTarget, event: string, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error("视频加载超时")); }, timeoutMs);
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error("视频无法读取")); };
    const cleanup = () => { clearTimeout(timer); target.removeEventListener(event, done); target.removeEventListener("error", failed); };
    target.addEventListener(event, done, { once: true }); target.addEventListener("error", failed, { once: true });
  });
}

export async function videoToGif(url: string): Promise<Blob> {
  const video = document.createElement("video");
  video.muted = true; video.preload = "auto"; video.src = url;
  try {
    await once(video, "loadedmetadata");
    if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error("视频时长不可用");
    const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("浏览器无法创建画布");
    const gif = GIFEncoder();
    const frames = Math.min(32, Math.ceil(Math.min(4, video.duration) * 8));
    for (let i = 0; i < frames; i++) {
      const seek = once(video, "seeked");
      video.currentTime = Math.min(video.duration - 0.01, i / 8);
      await seek;
      context.drawImage(video, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height).data;
      const palette = quantize(pixels, 128);
      gif.writeFrame(applyPalette(pixels, palette), width, height, { palette, delay: 125 });
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    gif.finish();
    return new Blob([gif.bytes() as BlobPart], { type: "image/gif" });
  } finally { video.removeAttribute("src"); video.load(); }
}

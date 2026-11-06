import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const [base, link, output] = process.argv.slice(2);
if (!base || !link || !output || !process.env.API_KEY) throw new Error("Provide base URL, public share link, output directory and API_KEY");
const endpoint = new URL("/api/v1/parse", base);
endpoint.searchParams.set("link", link);
const result = await (await fetch(endpoint, { headers: { authorization: `Bearer ${process.env.API_KEY}` } })).json();
if (!result.ok) throw new Error(JSON.stringify(result.error));
await mkdir(output, { recursive: true });
let index = 0;
for (const item of result.data.media.filter(item => item.kind === "image")) {
  const variant = item.variants[0];
  if (!item.original || !variant.downloadUrl) throw new Error("Missing original image download");
  const response = await fetch(new URL(variant.downloadUrl, base));
  if (!response.ok) throw new Error(`Image ${index + 1}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get("content-type");
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[type];
  if (!ext) throw new Error(`Unrecognized image type: ${type}`);
  const file = `${output}/${++index}.${ext}`;
  await writeFile(file, bytes);
  console.log(JSON.stringify({ image: index, bytes: bytes.length, type, sha256: createHash("sha256").update(bytes).digest("hex"), file }));
}
if (!index) throw new Error("No original images returned");

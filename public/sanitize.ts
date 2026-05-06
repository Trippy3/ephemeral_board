import DOMPurify from "dompurify";

const ALLOWED_TAGS = ["b", "strong", "br", "div", "span", "p"];
const ALLOWED_ATTR = ["style"];

// font-weight は execCommand("bold") が `<b>` ではなく
// `<span style="font-weight: bold">` を挿入してくる文脈（既存 inline style と絡む場合等）で
// 必要。剥がすと特定文字に太字が乗らない / 解除されない事象が再発する。
const STYLE_ALLOWLIST = /^(text-align|font-size|font-weight)\s*:\s*([\w.-]+)\s*;?\s*$/;

function sanitizeStyleAttribute(value: string): string {
  return value
    .split(";")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0)
    .map((rule) => {
      const m = STYLE_ALLOWLIST.exec(`${rule};`);
      return m ? `${m[1]}:${m[2]}` : null;
    })
    .filter((r): r is string => r !== null)
    .join(";");
}

DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  if (data.attrName === "style") {
    data.attrValue = sanitizeStyleAttribute(data.attrValue);
    if (!data.attrValue) {
      data.keepAttr = false;
    }
  }
});

export function sanitizeNoteHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    KEEP_CONTENT: true,
  });
}

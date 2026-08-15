/** Accepts local browser paths only; unsafe values must never reach an img src. */
export function isSafeLocalAssetUrl(value: string): boolean {
  if (!value || value.trim() !== value || value.includes("\u0000") || value.includes("\\")) return false;
  if (value.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(value)) return false;

  const path = value.split(/[?#]/, 1)[0];
  if (!path || path === ".." || path.startsWith("../") || path.includes("/../") || path.endsWith("/..")) return false;
  return true;
}

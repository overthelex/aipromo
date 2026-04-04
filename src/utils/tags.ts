// Tag utilities — safe parsing for comma-separated tag strings

export function parseTags(tagStr: string): string[] {
  if (!tagStr) return [];
  return tagStr.split(",").map(t => t.trim()).filter(Boolean);
}

export function hasTag(tagStr: string, tag: string): boolean {
  return parseTags(tagStr).includes(tag);
}

export function hasTagPrefix(tagStr: string, prefix: string): boolean {
  return parseTags(tagStr).some(t => t.startsWith(prefix));
}

export function addTag(tagStr: string, tag: string): string {
  const tags = parseTags(tagStr);
  if (!tags.includes(tag)) tags.push(tag);
  return tags.join(",");
}

export function removeTag(tagStr: string, tag: string): string {
  return parseTags(tagStr).filter(t => t !== tag).join(",");
}

export function tagsToDisplay(tagStr: string): string[] {
  return parseTags(tagStr);
}

/** "Maya Rodriguez" → "Maya". */
export function firstName(name?: string | null): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/** Students are shown as first name + last initial: "Maya Rodriguez" → "Maya R.". */
export function displayName(name?: string | null): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  const last = parts[parts.length - 1]!;
  return last.endsWith(".") && last.length <= 2 ? parts.join(" ") : `${parts[0]} ${last[0]!.toUpperCase()}.`;
}

/** "12" → "12th". */
export function gradeLabel(grade?: number | null): string {
  if (!grade) return "";
  return `${grade}th`;
}

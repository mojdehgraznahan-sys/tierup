/** Google's transcript speaker names → our labels, by first name (Meet shows Workspace display names). */
export function speakerFor(displayName: string | null | undefined, people: { label: string; name: string | null }[]): string | null {
  const first = (n: string | null | undefined) => n?.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const spoken = first(displayName);
  return (spoken && people.find((p) => first(p.name) === spoken)?.label) || null;
}

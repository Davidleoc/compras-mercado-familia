export function normalizeProductName(name: string): string {
  if (!name) return '';
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

export function areProductsEquivalent(nameA: string, nameB: string): boolean {
  return normalizeProductName(nameA) === normalizeProductName(nameB);
}

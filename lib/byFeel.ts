const SUFFIX = " By Feel";

export function isByFeel(name: string): boolean {
  return name.endsWith(SUFFIX);
}

export function addByFeel(name: string): string {
  return isByFeel(name) ? name : name + SUFFIX;
}

export function removeByFeel(name: string): string {
  return isByFeel(name) ? name.slice(0, -SUFFIX.length) : name;
}

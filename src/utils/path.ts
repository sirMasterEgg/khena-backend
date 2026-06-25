/**
 * Normalize a folder path so it always starts with a single "/",
 * never ends with a trailing "/", and contains no duplicate slashes.
 * Empty input or "/" resolves to the root path "/".
 */
export function normalizePath(input: string): string {
  const collapsed = `/${input}`.replace(/\/+/g, "/");
  if (collapsed === "/") {
    return "/";
  }
  return collapsed.replace(/\/$/, "");
}

/**
 * Sanitize a folder/file name into a URL/storage friendly slug:
 * lowercase, spaces to dashes, and only [a-z0-9.-] kept.
 */
export function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/^\.+/, "")
    .replace(/\.+$/, "");
}

/**
 * Join a parent folder path with a child name, producing a normalized path.
 * The name is sanitized before joining.
 */
export function joinPath(parentPath: string, name: string): string {
  const parent = normalizePath(parentPath);
  const safeName = sanitizeName(name);
  if (parent === "/") {
    return normalizePath(`/${safeName}`);
  }
  return normalizePath(`${parent}/${safeName}`);
}

/** Whether the given normalized path is the root path. */
export function isRootPath(path: string): boolean {
  return normalizePath(path) === "/";
}

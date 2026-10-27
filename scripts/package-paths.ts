// Track files and ancestor directories using the importer's portable identity.
export function registerPackagePath(
  occupied: Map<string, "file" | "directory">,
  name: string,
) {
  const parts = name.normalize("NFC").toLowerCase().split("/");
  for (let i = 1; i < parts.length; i++) {
    const parent = parts.slice(0, i).join("/");
    if (occupied.get(parent) === "file")
      throw new Error("工程文件存在大小写或 Unicode 路径冲突：" + name);
    occupied.set(parent, "directory");
  }
  const key = parts.join("/");
  if (occupied.has(key))
    throw new Error("工程文件存在大小写或 Unicode 路径冲突：" + name);
  occupied.set(key, "file");
}

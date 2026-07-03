// Daftarkan setiap module beserta action-nya di sini.
// permission.code akan dibentuk sebagai `${module}.${action}`.
export const MODULE_REGISTRY = {
  product: ["create", "read", "update", "delete"],
  color: ["create", "read", "update", "delete"],
  finish: ["create", "read", "update", "delete"],
  category: ["create", "read", "update", "delete"],
  collection: ["create", "read", "update", "delete"],
  roomType: ["create", "read", "update", "delete"],
  media: ["create", "read", "update", "delete"],
  role: ["create", "read", "update", "delete"],
  permission: ["read"],
  administrator: ["create", "read", "update", "delete"],
} as const;

export type ModuleName = keyof typeof MODULE_REGISTRY;

export interface GeneratedPermission {
  code: string; // contoh: "product.create"
  module: string;
  action: string;
  description: string;
}

export function generatePermissions(): GeneratedPermission[] {
  const result: GeneratedPermission[] = [];
  for (const [module, actions] of Object.entries(MODULE_REGISTRY)) {
    for (const action of actions) {
      result.push({
        code: `${module}.${action}`,
        module,
        action,
        description: `Allow to ${action} ${module}`,
      });
    }
  }
  return result;
}

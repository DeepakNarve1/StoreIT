import { prisma } from "../utils/prisma";

type CapabilityMap = Record<string, boolean>;

export const FILE_CAPABILITIES = [
  "add_files",
  "see_files",
  "preview_files",
  "download_files",
  "edit_file_attrs",
  "view_metadata",
  "edit_metadata",
  "update_versions",
  "edit_online",
  "move_files",
  "delete_files",
  "duplicate_files",
  "share_files",
  "share_public_link_file",
  "see_audit_trails_file",
] as const;

export const FOLDER_CAPABILITIES = [
  "create_folders",
  "see_folders",
  "download_folders",
  "edit_folders",
  "move_folders",
  "delete_folders",
  "duplicate_folders",
  "view_metadata",
  "edit_metadata",
  "share_folders",
  "share_public_link_folder",
  "see_audit_trails",
] as const;

export const ALL_ROLE_CAPABILITIES = [
  ...FILE_CAPABILITIES,
  ...FOLDER_CAPABILITIES,
] as const;

export type RoleCapabilityKey = (typeof ALL_ROLE_CAPABILITIES)[number];
export type BaseRole = "SUPERADMIN" | "ORG_ADMIN" | "MANAGER" | "EDITOR" | "VIEWER";

type RoleProfileLike = {
  id?: string;
  name?: string;
  baseRole: BaseRole;
  capabilities?: unknown;
};

const SYSTEM_ROLE_DEFINITIONS: Array<{
  key: Exclude<BaseRole, "SUPERADMIN">;
  name: string;
  description: string;
  capabilities: CapabilityMap;
}> = [
  {
    key: "ORG_ADMIN",
    name: "Org Admin",
    description: "Full workspace permissions with organization administration access.",
    capabilities: allCaps(true),
  },
  {
    key: "MANAGER",
    name: "Manager",
    description: "Operational control across files and folders, including delete, share, and audit access.",
    capabilities: normalizeCapabilities({
      add_files: true,
      see_files: true,
      preview_files: true,
      download_files: true,
      edit_file_attrs: true,
      view_metadata: true,
      edit_metadata: true,
      update_versions: true,
      edit_online: true,
      move_files: true,
      delete_files: true,
      duplicate_files: true,
      share_files: true,
      share_public_link_file: true,
      see_audit_trails_file: true,
      create_folders: true,
      see_folders: true,
      download_folders: true,
      edit_folders: true,
      move_folders: true,
      delete_folders: true,
      duplicate_folders: true,
      share_folders: true,
      share_public_link_folder: true,
      see_audit_trails: true,
    }),
  },
  {
    key: "EDITOR",
    name: "Editor",
    description: "Create and edit content across the workspace without delete, share, or audit powers.",
    capabilities: normalizeCapabilities({
      add_files: true,
      see_files: true,
      preview_files: true,
      download_files: true,
      edit_file_attrs: true,
      view_metadata: true,
      edit_metadata: true,
      update_versions: true,
      edit_online: true,
      move_files: true,
      duplicate_files: true,
      create_folders: true,
      see_folders: true,
      download_folders: true,
      edit_folders: true,
      move_folders: true,
      duplicate_folders: true,
    }),
  },
  {
    key: "VIEWER",
    name: "Viewer",
    description: "Read-focused access that still relies on shared visibility.",
    capabilities: normalizeCapabilities({
      see_files: true,
      see_folders: true,
      preview_files: true,
      view_metadata: true,
    }),
  },
];

function allCaps(value: boolean): CapabilityMap {
  return ALL_ROLE_CAPABILITIES.reduce(
    (acc, key) => {
      acc[key] = value;
      return acc;
    },
    {} as CapabilityMap,
  );
}

export function normalizeCapabilities(input?: unknown): CapabilityMap {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};

  return ALL_ROLE_CAPABILITIES.reduce(
    (acc, key) => {
      acc[key] = source[key] === true;
      return acc;
    },
    {} as CapabilityMap,
  );
}

export function mergeCapabilities(
  ...maps: Array<Record<string, boolean> | null | undefined>
): CapabilityMap {
  const merged = allCaps(false);
  for (const map of maps) {
    if (!map) continue;
    for (const key of ALL_ROLE_CAPABILITIES) {
      if (map[key] === true) merged[key] = true;
    }
  }
  return merged;
}

export function getDefaultCapabilitiesForBaseRole(baseRole: BaseRole): CapabilityMap {
  if (baseRole === "SUPERADMIN") return allCaps(true);
  const systemRole = SYSTEM_ROLE_DEFINITIONS.find((role) => role.key === baseRole);
  return systemRole ? { ...systemRole.capabilities } : allCaps(false);
}

export async function ensureTenantRoleProfiles(tenantId: string) {
  const existing = await prisma.roleProfile.findMany({
    where: { tenantId, isSystem: true },
    select: {
      id: true,
      systemKey: true,
      name: true,
      description: true,
      baseRole: true,
      capabilities: true,
    },
  });

  const existingByKey = new Map(
    existing
      .filter(
        (
          profile,
        ): profile is typeof profile & {
          systemKey: Exclude<BaseRole, "SUPERADMIN">;
        } => typeof profile.systemKey === "string",
      )
      .map((profile) => [profile.systemKey, profile]),
  );

  const missing = SYSTEM_ROLE_DEFINITIONS.filter(
    (definition) => !existingByKey.has(definition.key),
  );

  for (const definition of missing) {
    await prisma.roleProfile.create({
      data: {
        tenantId,
        name: definition.name,
        description: definition.description,
        baseRole: definition.key,
        systemKey: definition.key,
        isSystem: true,
        capabilities: definition.capabilities,
      },
    });
  }

  // Only sync structural fields (name, description, baseRole) for existing system roles.
  // Capabilities are intentionally excluded — admins can customise them and we must
  // not overwrite their changes on every request.
  const updates = SYSTEM_ROLE_DEFINITIONS.flatMap((definition) => {
    const existingProfile = existingByKey.get(definition.key);
    if (!existingProfile) return [];

    const needsUpdate =
      existingProfile.name !== definition.name ||
      existingProfile.description !== definition.description ||
      existingProfile.baseRole !== definition.key;

    if (!needsUpdate) return [];

    return [
      prisma.roleProfile.update({
        where: { id: existingProfile.id },
        data: {
          name: definition.name,
          description: definition.description,
          baseRole: definition.key,
          // capabilities intentionally not updated — preserve admin customisations
        },
      }),
    ];
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

export async function getTenantRoleProfiles(tenantId: string) {
  await ensureTenantRoleProfiles(tenantId);
  return prisma.roleProfile.findMany({
    where: { tenantId },
    orderBy: [{ isSystem: "desc" }, { baseRole: "asc" }, { name: "asc" }],
  });
}

export function serializeRoleProfile(profile: RoleProfileLike | null | undefined) {
  if (!profile) return null;
  return {
    id: profile.id ?? null,
    name: profile.name ?? profile.baseRole.replace("_", " "),
    baseRole: profile.baseRole,
    capabilities: normalizeCapabilities(profile.capabilities),
  };
}

export async function getEffectiveRoleProfileForUser(userId: string) {
  const userTenant = await prisma.user.findUnique({
    where: { id: userId },
    select: { tenantId: true },
  });

  if (!userTenant) return null;

  await ensureTenantRoleProfiles(userTenant.tenantId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      departmentId: true,
      tenantId: true,
      roleProfileId: true,
      roleProfile: {
        select: {
          id: true,
          name: true,
          baseRole: true,
          capabilities: true,
          isSystem: true,
          systemKey: true,
        },
      },
    },
  });

  if (!user) return null;

  if (user.role === "SUPERADMIN") {
    return {
      userId: user.id,
      tenantId: user.tenantId,
      departmentId: user.departmentId,
      baseRole: "SUPERADMIN" as const,
      roleProfileId: null,
      roleProfileName: "Superadmin",
      capabilities: allCaps(true),
      isSystemRole: true,
      isViewerScoped: false,
    };
  }

  if (user.roleProfile) {
    return {
      userId: user.id,
      tenantId: user.tenantId,
      departmentId: user.departmentId,
      baseRole: user.roleProfile.baseRole as BaseRole,
      roleProfileId: user.roleProfile.id,
      roleProfileName: user.roleProfile.name,
      capabilities: normalizeCapabilities(user.roleProfile.capabilities),
      isSystemRole: user.roleProfile.isSystem,
      isViewerScoped: user.roleProfile.baseRole === "VIEWER",
    };
  }

  return {
    userId: user.id,
    tenantId: user.tenantId,
    departmentId: user.departmentId,
    baseRole: user.role as BaseRole,
    roleProfileId: null,
    roleProfileName: user.role.replace("_", " "),
    capabilities: getDefaultCapabilitiesForBaseRole(user.role as BaseRole),
    isSystemRole: true,
    isViewerScoped: user.role === "VIEWER",
  };
}

export async function getRoleProfileByIdForTenant(roleProfileId: string, tenantId: string) {
  return prisma.roleProfile.findFirst({
    where: { id: roleProfileId, tenantId },
  });
}

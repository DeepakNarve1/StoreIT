export const FOLDER_PERMISSION_OPTIONS = [
  { key: "create_folders", label: "Create folders" },
  { key: "see_folders", label: "See folders" },
  { key: "download_folders", label: "Download folders" },
  { key: "edit_folders", label: "Edit folders" },
  { key: "move_folders", label: "Move folders" },
  { key: "delete_folders", label: "Delete folders" },
  { key: "view_metadata", label: "View folder metadata" },
  { key: "edit_metadata", label: "Edit folder metadata" },
  { key: "share_folders", label: "Share folders" },
] as const;

export const FILE_PERMISSION_OPTIONS = [
  { key: "add_files", label: "Add/create files" },
  { key: "see_files", label: "See list of files" },
  { key: "preview_files", label: "Preview files" },
  { key: "download_files", label: "Download files" },
  { key: "edit_file_attrs", label: "Edit file attributes" },
  { key: "view_metadata", label: "View file metadata" },
  { key: "edit_metadata", label: "Edit file metadata" },
  { key: "update_versions", label: "Update file versions" },
  { key: "move_files", label: "Move files" },
  { key: "delete_files", label: "Delete files" },
  { key: "share_files", label: "Share files" },
  { key: "share_public_link_file", label: "Share with public link" },
  { key: "see_audit_trails_file", label: "See audit trails" },
] as const;

export const ALL_ROLE_PERMISSION_KEYS = [
  ...new Set(
    [...FOLDER_PERMISSION_OPTIONS, ...FILE_PERMISSION_OPTIONS].map(
      (option) => option.key,
    ),
  ),
];

export function emptyRoleCapabilities(): Record<string, boolean> {
  return ALL_ROLE_PERMISSION_KEYS.reduce(
    (acc, key) => {
      acc[key] = false;
      return acc;
    },
    {} as Record<string, boolean>,
  );
}

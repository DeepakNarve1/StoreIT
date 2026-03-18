import AppShell from "../components/layout/AppShell";
import {
  FileText,
  FolderOpen,
  Users,
  HardDrive,
  Clock,
  Upload,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";

const STATS = [
  {
    label: "Total Files",
    value: "0",
    icon: FileText,
    iconBg: "#EFF6FF",
    iconColor: "#2563EB",
  },
  {
    label: "Folders",
    value: "0",
    icon: FolderOpen,
    iconBg: "#F0FDF4",
    iconColor: "#16A34A",
  },
  {
    label: "Team Members",
    value: "1",
    icon: Users,
    iconBg: "#F5F3FF",
    iconColor: "#7C3AED",
  },
  {
    label: "Storage Used",
    value: "0 MB",
    icon: HardDrive,
    iconBg: "#FFF7ED",
    iconColor: "#EA580C",
  },
];

const QUICK_ACTIONS = [
  {
    icon: Upload,
    label: "Upload a file",
    sub: "Add documents to your workspace",
    accent: "#2563EB",
    accentBg: "#EFF6FF",
  },
  {
    icon: FolderOpen,
    label: "Create a folder",
    sub: "Organise your documents",
    accent: "#16A34A",
    accentBg: "#F0FDF4",
  },
  {
    icon: Users,
    label: "Invite a teammate",
    sub: "Collaborate on documents",
    accent: "#7C3AED",
    accentBg: "#F5F3FF",
  },
];

export default function DashboardPage() {
  const { user } = useAuthStore();

  return (
    <AppShell>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 500,
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Welcome back, {user?.name?.split(" ")[0]}
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "var(--color-text-tertiary)",
              marginTop: 4,
              marginBottom: 0,
            }}
          >
            Here's what's happening in your workspace
          </p>
        </div>

        {/* ── Stat cards ──────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 24,
          }}
        >
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                style={{
                  background: "var(--color-background-primary)",
                  border: "0.5px solid var(--color-border-tertiary)",
                  borderRadius: 12,
                  padding: "16px 18px",
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: stat.iconBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 12,
                  }}
                >
                  <Icon size={16} color={stat.iconColor} strokeWidth={1.75} />
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                    lineHeight: 1,
                    marginBottom: 4,
                  }}
                >
                  {stat.value}
                </div>
                <div
                  style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}
                >
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Bottom row ──────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 320px",
            gap: 12,
          }}
        >
          {/* Recent Activity */}
          <div
            style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 12,
              padding: "18px 20px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Clock
                  size={13}
                  color="var(--color-text-tertiary)"
                  strokeWidth={1.75}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--color-text-primary)",
                  }}
                >
                  Recent Activity
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: "#2563EB",
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                View all
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "36px 0",
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--color-background-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 10,
                }}
              >
                <FileText
                  size={18}
                  color="var(--color-text-tertiary)"
                  strokeWidth={1.5}
                />
              </div>
              <p
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--color-text-secondary)",
                  margin: 0,
                }}
              >
                No activity yet
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "var(--color-text-tertiary)",
                  marginTop: 4,
                  marginBottom: 0,
                }}
              >
                Upload your first file to get started
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div
            style={{
              background: "var(--color-background-primary)",
              border: "0.5px solid var(--color-border-tertiary)",
              borderRadius: 12,
              padding: "18px 20px",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--color-text-primary)",
                display: "block",
                marginBottom: 16,
              }}
            >
              Quick Actions
            </span>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon;
                return (
                  <div
                    key={action.label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "0.5px solid var(--color-border-tertiary)",
                      cursor: "pointer",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "var(--color-background-secondary)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        background: action.accentBg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon
                        size={14}
                        color={action.accent}
                        strokeWidth={1.75}
                      />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {action.label}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "var(--color-text-tertiary)",
                          marginTop: 2,
                        }}
                      >
                        {action.sub}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

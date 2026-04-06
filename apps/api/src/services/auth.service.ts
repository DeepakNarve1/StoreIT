import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";
import {
  serializeRoleProfile,
  getDefaultCapabilitiesForBaseRole,
  normalizeBaseRoleValue,
} from "./role-profiles.service";

// ─── TOKEN GENERATION ─────────────────────────────────────────────────────────
export const generateTokens = (payload: {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
}) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: "15m",
  });

  const refreshToken = jwt.sign(
    { userId: payload.userId },
    process.env.JWT_SECRET!,
    { expiresIn: "7d" },
  );

  return { accessToken, refreshToken };
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────
export const loginUser = async (email: string, password: string) => {
  // 1. Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      tenant: true,
      roleProfile: {
        select: {
          id: true,
          name: true,
          baseRole: true,
          capabilities: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // 2. Check account is active
  if (!user.isActive) {
    throw new Error("ACCOUNT_DISABLED");
  }

  // 3. Check tenant is active
  if (!user.tenant.isActive) {
    throw new Error("TENANT_DISABLED");
  }

  // 4. Verify password
  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new Error("INVALID_CREDENTIALS");
  }

  // 5. Generate tokens
  const tokens = generateTokens({
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    email: user.email,
  });

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
      roleProfile: serializeRoleProfile(
        user.roleProfile
          ? {
              id: user.roleProfile.id,
              name: user.roleProfile.name,
              baseRole: user.roleProfile.baseRole as any,
              capabilities: user.roleProfile.capabilities,
            }
          : user.role === "SUPERADMIN"
            ? {
                name: "Superadmin",
                baseRole: "SUPERADMIN",
              }
            : null,
      ),
      roleCapabilities: user.roleProfile
        ? serializeRoleProfile({
            id: user.roleProfile.id,
            name: user.roleProfile.name,
            baseRole: user.roleProfile.baseRole as any,
            capabilities: user.roleProfile.capabilities,
          })?.capabilities ?? {}
        : getDefaultCapabilitiesForBaseRole(normalizeBaseRoleValue(user.role)),
    },
    ...tokens,
  };
};

// ─── REFRESH TOKEN ────────────────────────────────────────────────────────────
export const refreshAccessToken = async (refreshToken: string) => {
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET!) as any;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user || !user.isActive) {
      throw new Error("USER_NOT_FOUND");
    }

    const accessToken = jwt.sign(
      {
        userId: user.id,
        tenantId: user.tenantId,
        role: user.role,
        email: user.email,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "15m" },
    );

    return { accessToken };
  } catch {
    throw new Error("INVALID_REFRESH_TOKEN");
  }
};

// ─── HASH PASSWORD (used when creating users) ─────────────────────────────────
export const hashPassword = async (password: string) => {
  return bcrypt.hash(password, 12);
};

// ─── VALIDATE INVITE TOKEN ────────────────────────────────────────────────────
export const validateInviteToken = async (token: string) => {
  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: {
      tenant: true,
      roleProfile: {
        select: {
          id: true,
          name: true,
          baseRole: true,
        },
      },
    },
  });

  if (!invite) throw new Error("INVALID_TOKEN");
  if (invite.isUsed) throw new Error("TOKEN_ALREADY_USED");
  if (invite.expiresAt < new Date()) throw new Error("TOKEN_EXPIRED");

  return invite;
};

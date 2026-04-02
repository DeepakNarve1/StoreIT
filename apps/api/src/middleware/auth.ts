import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    tenantId: string;
    role: string;
    email: string;
    impersonatedBy?: string; // SEC FIX #5: track impersonation in every request
  };
}

export const verifyAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ error: "Invalid token format" });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.user = {
      userId: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      email: decoded.email,
      impersonatedBy: decoded.impersonatedBy, // SEC FIX #5
    };
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      res.status(401).json({ error: "TOKEN_EXPIRED" });
      return;
    }
    res.status(401).json({ error: "INVALID_TOKEN" });
  }
};

/** Align JWT role string with app role constants (casing / legacy aliases). */
function normalizeRoleForGuard(role: string | undefined): string {
  const u = (role ?? "").toUpperCase();
  if (u === "ADMIN" || u === "ORGADMIN") return "ORG_ADMIN";
  return u;
}

// Role guard — use after verifyAuth
export const requireRole = (...roles: string[]) => {
  const allowed = new Set(roles.map((r) => normalizeRoleForGuard(r)));
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!allowed.has(normalizeRoleForGuard(req.user.role))) {
      res.status(403).json({ error: "Forbidden — insufficient role" });
      return;
    }
    next();
  };
};

// SEC FIX #6: CSRF protection for cookie-based refresh token endpoint.
// Checks that the request comes with a custom header that browsers
// cannot set on cross-origin requests (CORS blocks it automatically).
export const verifyCsrf = (req: Request, res: Response, next: NextFunction) => {
  const csrfHeader = req.headers["x-requested-with"];
  if (csrfHeader !== "XMLHttpRequest") {
    res.status(403).json({ error: "CSRF check failed" });
    return;
  }
  next();
};

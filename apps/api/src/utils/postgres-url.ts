/**
 * pg v8+ (pg-connection-string): sslmode=require/prefer are treated like verify-full
 * unless uselibpqcompat=true or sslmode=no-verify — which breaks many cloud URLs that
 * ship sslmode=require. Normalize remote URLs to no-verify unless strict verify-* is set.
 */

function parseUrl(connectionString: string): URL | null {
  try {
    const forParse = connectionString.replace(/^postgresql:/i, "http:");
    return new URL(forParse);
  } catch {
    return null;
  }
}

export function postgresHostname(connectionString: string): string | null {
  const u = parseUrl(connectionString);
  return u ? u.hostname.toLowerCase() : null;
}

export function isLocalPostgresHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * For non-local databases, set sslmode=no-verify when appropriate so TLS is used but
 * server certs are not verified (same net effect as ssl.rejectUnauthorized: false).
 * Leaves verify-full / verify-ca / disable untouched.
 */
export function normalizeDatabaseUrlForRemotePool(connectionString: string): string {
  const u = parseUrl(connectionString);
  if (!u) return connectionString;

  const host = u.hostname.toLowerCase();
  if (!host || isLocalPostgresHost(host)) {
    return connectionString;
  }

  const mode = u.searchParams.get("sslmode")?.toLowerCase();
  if (mode === "disable" || mode === "verify-full" || mode === "verify-ca") {
    return connectionString;
  }

  u.searchParams.set("sslmode", "no-verify");
  return u.toString().replace(/^http:/i, "postgresql:");
}

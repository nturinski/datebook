import { Pool, PoolConfig, QueryResult } from "pg";

class DatabaseUrlMissingError extends Error {
    public readonly name = "DatabaseUrlMissingError";
    constructor() {
        super("DATABASE_URL is not set");
    }
}

class DatabaseUrlInvalidError extends Error {
    public readonly name = "DatabaseUrlInvalidError";
    constructor(message: string) {
        super(message);
    }
}

let pool: Pool | undefined;

function containsInvalidPercentEncoding(value: string): boolean {
    // If '%' appears and is not followed by 2 hex chars, many URL parsers will throw.
    // Example: password containing "%@" should be encoded as "%25@".
    return /%(?![0-9A-Fa-f]{2})/.test(value);
}

function sslFromConnectionString(connectionString: string): PoolConfig["ssl"] | undefined {
    // A lot of hosted Postgres providers use ?sslmode=require in the URL.
    // node-postgres doesn't interpret sslmode, so we map it.
    const lowered = connectionString.toLowerCase();
    if (lowered.includes("sslmode=require") || lowered.includes("sslmode=verify-ca") || lowered.includes("sslmode=verify-full")) {
        // NOTE: rejectUnauthorized=false is a pragmatic default for many managed services.
        // If you have a trusted CA chain configured in your environment, you can tighten this.
        return { rejectUnauthorized: false };
    }

    return undefined;
}

function validateDatabaseUrl(databaseUrl: string): void {
    if (containsInvalidPercentEncoding(databaseUrl)) {
        throw new DatabaseUrlInvalidError(
            "DATABASE_URL appears to contain an unescaped '%' character. If your password includes '%', encode it as '%25' in the URL."
        );
    }

    // Validate only when it looks like a URL.
    // (pg also supports non-URL connection strings.)
    if (/^postgres(ql)?:\/\//i.test(databaseUrl)) {
        try {
            // eslint-disable-next-line no-new
            new URL(databaseUrl);
        } catch {
            throw new DatabaseUrlInvalidError("DATABASE_URL is not a valid postgres URL");
        }
    }
}

function getPool(): Pool {
    if (pool) return pool;

    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new DatabaseUrlMissingError();

    validateDatabaseUrl(databaseUrl);

    pool = new Pool({
        connectionString: databaseUrl,
        ssl: sslFromConnectionString(databaseUrl),
        // A small pool is usually enough for Functions and helps avoid connection storms.
        max: Number(process.env.PGPOOL_MAX ?? "5"),
        idleTimeoutMillis: Number(process.env.PGPOOL_IDLE_TIMEOUT_MS ?? "30000"),
    });

    return pool;
}

export async function pgQuery<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: unknown[]
): Promise<QueryResult<T>> {
    const p = getPool();
    return p.query<T>(text, params);
}

export function isDatabaseConfigError(err: unknown): err is DatabaseUrlMissingError | DatabaseUrlInvalidError {
    return err instanceof DatabaseUrlMissingError || err instanceof DatabaseUrlInvalidError;
}

import type { CrepuseDatabase } from "@crepuse/runtime/database";
import type { SqliteValue } from "@crepuse/runtime/database/sqlite";

export interface ResolveOidcSubjectInput {
    readonly clientId: string;
    readonly accountId: string;
    readonly profileId: string;
}

type Database = CrepuseDatabase<SqliteValue>;

function generateSubject(): string {
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const identityFrom = `
    FROM oidc_clients AS c
    JOIN tenants AS t ON t.id = c.tenant_id
    JOIN profiles AS p ON p.id = ? AND p.account_id = ?
    JOIN tenant_memberships AS m
        ON m.tenant_id = c.tenant_id
        AND m.account_id = p.account_id
`;

const identityWhere = `
    WHERE c.id = ?
`;

const bindingChecks = `
    AND (
        t.allow_multiple_profiles = 1
        OR EXISTS (
            SELECT 1 FROM oidc_tenant_profile_bindings AS tb
            WHERE tb.tenant_id = c.tenant_id
              AND tb.account_id = p.account_id
              AND tb.profile_id = p.id
        )
    )
    AND (
        c.allow_multiple_profiles = 1
        OR EXISTS (
            SELECT 1 FROM oidc_client_profile_bindings AS cb
            WHERE cb.client_id = c.id
              AND cb.account_id = p.account_id
              AND cb.profile_id = p.id
        )
    )
`;

export async function resolveOidcSubject(
    db: Database,
    input: ResolveOidcSubjectInput,
): Promise<string> {
    const { clientId, accountId, profileId } = input;
    const now = Date.now();
    const candidate = generateSubject();

    const identityParams = [profileId, accountId, clientId];

    const results = await db.batch([
        {
            name: "oidc.subject.bindTenantProfile",
            sql: `
                INSERT INTO oidc_tenant_profile_bindings
                    (tenant_id, account_id, profile_id, created_at)
                SELECT c.tenant_id, p.account_id, p.id, ?
                ${identityFrom}
                ${identityWhere}
                  AND t.allow_multiple_profiles = 0
                  AND (
                      c.allow_multiple_profiles = 1
                      OR NOT EXISTS (
                          SELECT 1
                          FROM oidc_client_profile_bindings AS cb
                          WHERE cb.client_id = c.id
                            AND cb.account_id = p.account_id
                            AND cb.profile_id <> p.id
                      )
                  )
                ON CONFLICT(tenant_id, account_id) DO NOTHING
            `,
            params: [now, ...identityParams],
        },
        {
            name: "oidc.subject.bindClientProfile",
            sql: `
                INSERT INTO oidc_client_profile_bindings
                    (client_id, account_id, profile_id, created_at)
                SELECT c.id, p.account_id, p.id, ?
                ${identityFrom}
                ${identityWhere}
                  AND c.allow_multiple_profiles = 0
                  AND (
                      t.allow_multiple_profiles = 1
                      OR NOT EXISTS (
                          SELECT 1
                          FROM oidc_tenant_profile_bindings AS tb
                          WHERE tb.tenant_id = c.tenant_id
                            AND tb.account_id = p.account_id
                            AND tb.profile_id <> p.id
                      )
                  )
                ON CONFLICT(client_id, account_id) DO NOTHING
            `,
            params: [now, ...identityParams],
        },
        {
            name: "oidc.subject.create",
            sql: `
                INSERT INTO oidc_subjects
                    (tenant_id, sector_identifier, profile_id, sub, created_at)
                SELECT c.tenant_id, c.sector_identifier, p.id, ?, ?
                ${identityFrom}
                ${identityWhere}
                ${bindingChecks}
                ON CONFLICT(tenant_id, sector_identifier, profile_id)
                    DO NOTHING
            `,
            params: [candidate, now, ...identityParams],
        },
        {
            name: "oidc.subject.resolve",
            sql: `
                SELECT s.sub
                ${identityFrom}
                JOIN oidc_subjects AS s
                    ON s.tenant_id = c.tenant_id
                    AND s.sector_identifier = c.sector_identifier
                    AND s.profile_id = p.id
                ${identityWhere}
                ${bindingChecks}
            `,
            params: identityParams,
        },
    ]);

    const row = results[3]?.rows[0] as { sub?: unknown } | undefined;

    if (typeof row?.sub !== "string") {
        throw new Error("OIDC subject resolution denied");
    }

    return row.sub;
}

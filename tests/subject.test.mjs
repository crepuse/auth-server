import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import { resolveOidcSubject } from "../dist/identity/subjects.js";

const migrations = ["../migrations/0001_identity.sql", "../migrations/0002_oidc_subjects.sql"].map(
    (path) => readFileSync(new URL(path, import.meta.url), "utf8"),
);

function createDatabase(t) {
    const sqlite = new DatabaseSync(":memory:");
    t.after(() => sqlite.close());

    sqlite.exec("PRAGMA foreign_keys = ON");

    for (const migration of migrations) {
        sqlite.exec(migration);
    }

    sqlite.exec(`
        INSERT INTO accounts VALUES ('account-1', 1000);
        INSERT INTO accounts VALUES ('account-2', 1000);

        INSERT INTO profiles VALUES
            ('profile-1', 'account-1', 'Personal', 1000),
            ('profile-2', 'account-1', 'Developer', 1000),
            ('profile-3', 'account-2', 'Other', 1000);

        INSERT INTO tenants
            (id, issuer, name, created_at)
        VALUES
            ('tenant-1', 'https://auth.example.com/t/1', 'Tenant', 1000);

        INSERT INTO tenant_memberships VALUES
            ('tenant-1', 'account-1', 1000);

        INSERT INTO oidc_clients
            (id, tenant_id, name, sector_identifier,
             allow_multiple_profiles, created_at)
        VALUES
            ('client-1', 'tenant-1', 'App 1', 'example.com', 1, 1000),
            ('client-2', 'tenant-1', 'App 2', 'example.com', 1, 1000),
            ('client-3', 'tenant-1', 'App 3', 'other.example.com', 0, 1000);
    `);

    function execute(statement) {
        const prepared = sqlite.prepare(statement.sql);

        if (/^\s*SELECT\b/i.test(statement.sql)) {
            return {
                rows: prepared.all(...statement.params),
                affected: 0,
            };
        }

        const result = prepared.run(...statement.params);

        return {
            rows: [],
            affected: result.changes,
        };
    }

    const db = {
        async run(statement) {
            return execute(statement);
        },

        async query(statement) {
            return execute(statement).rows;
        },

        async batch(statements) {
            sqlite.exec("BEGIN IMMEDIATE");

            try {
                const results = statements.map(execute);
                sqlite.exec("COMMIT");
                return results;
            } catch (error) {
                sqlite.exec("ROLLBACK");
                throw error;
            }
        },
    };

    return { db, sqlite };
}

function resolve(db, clientId, profileId, accountId = "account-1") {
    return resolveOidcSubject(db, {
        clientId,
        profileId,
        accountId,
    });
}

test("subject remains stable", async (t) => {
    const { db, sqlite } = createDatabase(t);

    const first = await resolve(db, "client-1", "profile-1");

    sqlite
        .prepare("UPDATE profiles SET display_name = ? WHERE id = ?")
        .run("New Name", "profile-1");

    assert.equal(await resolve(db, "client-1", "profile-1"), first);
    assert.match(first, /^[0-9a-f]{64}$/);
});

test("different profiles receive different subjects", async (t) => {
    const { db } = createDatabase(t);

    const first = await resolve(db, "client-1", "profile-1");
    const second = await resolve(db, "client-1", "profile-2");

    assert.notEqual(first, second);
});

test("clients sharing a sector receive the same subject", async (t) => {
    const { db } = createDatabase(t);

    assert.equal(
        await resolve(db, "client-1", "profile-1"),
        await resolve(db, "client-2", "profile-1"),
    );
});

test("different sectors receive different subjects", async (t) => {
    const { db } = createDatabase(t);

    assert.notEqual(
        await resolve(db, "client-1", "profile-1"),
        await resolve(db, "client-3", "profile-1"),
    );
});

test("single-profile clients reject another profile", async (t) => {
    const { db, sqlite } = createDatabase(t);

    const first = await resolve(db, "client-3", "profile-1");

    await assert.rejects(resolve(db, "client-3", "profile-2"), /resolution denied/);

    assert.equal(await resolve(db, "client-3", "profile-1"), first);

    const count = sqlite
        .prepare("SELECT COUNT(*) AS count FROM oidc_client_profile_bindings")
        .get();

    assert.equal(count.count, 1);
});

test("tenant policy applies across clients", async (t) => {
    const { db, sqlite } = createDatabase(t);

    sqlite.prepare("UPDATE tenants SET allow_multiple_profiles = 0 WHERE id = ?").run("tenant-1");

    await resolve(db, "client-1", "profile-1");

    await assert.rejects(resolve(db, "client-2", "profile-2"), /resolution denied/);

    const count = sqlite
        .prepare("SELECT COUNT(*) AS count FROM oidc_tenant_profile_bindings")
        .get();

    assert.equal(count.count, 1);
});

test("requires profile ownership and membership", async (t) => {
    const { db, sqlite } = createDatabase(t);

    await assert.rejects(resolve(db, "client-1", "profile-3"), /resolution denied/);

    await assert.rejects(resolve(db, "client-1", "profile-3", "account-2"), /resolution denied/);

    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM oidc_subjects").get().count, 0);
});

test("unknown clients cannot create subjects", async (t) => {
    const { db } = createDatabase(t);

    await assert.rejects(resolve(db, "missing-client", "profile-1"), /resolution denied/);
});

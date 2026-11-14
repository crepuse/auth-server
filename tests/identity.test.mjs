import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const migration = readFileSync(new URL("../migrations/0001_identity.sql", import.meta.url), "utf8");

function createDatabase(t) {
    const db = new DatabaseSync(":memory:");

    t.after(() => db.close());

    db.exec("PRAGMA foreign_keys = ON");
    db.exec(migration);

    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);

    return db;
}

function insertAccount(db, id = "account-1") {
    db.prepare("INSERT INTO accounts (id, created_at) VALUES (?, ?)").run(id, 1000);
}

function insertTenant(db, id = "tenant-1") {
    db.prepare("INSERT INTO tenants (id, issuer, name, created_at) VALUES (?, ?, ?, ?)").run(
        id,
        `https://auth.example.com/t/${id}`,
        id,
        1000,
    );
}

function insertProfile(db, id = "profile-1", accountId = "account-1") {
    db.prepare(
        "INSERT INTO profiles (id, account_id, display_name, created_at) VALUES (?, ?, ?, ?)",
    ).run(id, accountId, "Test Profile", 1000);
}

function insertMembership(db, tenantId = "tenant-1", accountId = "account-1") {
    db.prepare(
        "INSERT INTO tenant_memberships (tenant_id, account_id, created_at) VALUES (?, ?, ?)",
    ).run(tenantId, accountId, 1000);
}

function insertClient(db, id = "client-1", tenantId = "tenant-1") {
    db.prepare(
        `INSERT INTO oidc_clients
         (id, tenant_id, name, sector_identifier, created_at)
         VALUES (?, ?, ?, ?, ?)`,
    ).run(id, tenantId, "Test Client", "example.com", 1000);
}

test("multiple profiles are enabled by default", (t) => {
    const db = createDatabase(t);

    insertTenant(db);
    insertClient(db);

    const tenant = db
        .prepare("SELECT allow_multiple_profiles FROM tenants WHERE id = ?")
        .get("tenant-1");

    const client = db
        .prepare("SELECT allow_multiple_profiles FROM oidc_clients WHERE id = ?")
        .get("client-1");

    assert.equal(tenant.allow_multiple_profiles, 1);
    assert.equal(client.allow_multiple_profiles, 1);
});

test("profile policy only accepts boolean values", (t) => {
    const db = createDatabase(t);

    insertTenant(db);
    insertClient(db);

    const updateTenant = db.prepare("UPDATE tenants SET allow_multiple_profiles = ? WHERE id = ?");

    const updateClient = db.prepare(
        "UPDATE oidc_clients SET allow_multiple_profiles = ? WHERE id = ?",
    );

    updateTenant.run(0, "tenant-1");
    updateClient.run(0, "client-1");

    assert.throws(() => updateTenant.run(2, "tenant-1"), /CHECK constraint failed/);

    assert.throws(() => updateClient.run(-1, "client-1"), /CHECK constraint failed/);
});

test("one account can belong to multiple tenants", (t) => {
    const db = createDatabase(t);

    insertAccount(db);
    insertTenant(db, "tenant-1");
    insertTenant(db, "tenant-2");

    insertMembership(db, "tenant-1");
    insertMembership(db, "tenant-2");

    const count = db
        .prepare("SELECT COUNT(*) AS count FROM tenant_memberships WHERE account_id = ?")
        .get("account-1");

    assert.equal(count.count, 2);

    assert.throws(() => insertMembership(db, "tenant-1"), /UNIQUE constraint failed/);
});

test("memberships require valid accounts and tenants", (t) => {
    const db = createDatabase(t);

    insertAccount(db);
    insertTenant(db);

    assert.throws(() => insertMembership(db, "missing-tenant"), /FOREIGN KEY constraint failed/);

    assert.throws(
        () => insertMembership(db, "tenant-1", "missing-account"),
        /FOREIGN KEY constraint failed/,
    );
});

test("memberships restrict account and tenant deletion", (t) => {
    const db = createDatabase(t);

    insertAccount(db);
    insertTenant(db);
    insertMembership(db);

    assert.throws(
        () => db.prepare("DELETE FROM accounts WHERE id = ?").run("account-1"),
        /FOREIGN KEY constraint failed/,
    );

    assert.throws(
        () => db.prepare("DELETE FROM tenants WHERE id = ?").run("tenant-1"),
        /FOREIGN KEY constraint failed/,
    );

    const count = db.prepare("SELECT COUNT(*) AS count FROM tenant_memberships").get();

    assert.equal(count.count, 1);

    db.prepare("DELETE FROM tenant_memberships WHERE tenant_id = ? AND account_id = ?").run(
        "tenant-1",
        "account-1",
    );

    db.prepare("DELETE FROM accounts WHERE id = ?").run("account-1");
    db.prepare("DELETE FROM tenants WHERE id = ?").run("tenant-1");
});

test("clients restrict tenant deletion", (t) => {
    const db = createDatabase(t);

    insertTenant(db);
    insertClient(db);

    assert.throws(
        () => db.prepare("DELETE FROM tenants WHERE id = ?").run("tenant-1"),
        /FOREIGN KEY constraint failed/,
    );

    const client = db.prepare("SELECT id FROM oidc_clients WHERE id = ?").get("client-1");

    assert.equal(client.id, "client-1");

    db.prepare("DELETE FROM oidc_clients WHERE id = ?").run("client-1");
    db.prepare("DELETE FROM tenants WHERE id = ?").run("tenant-1");
});

test("profiles are deleted with their account", (t) => {
    const db = createDatabase(t);

    insertAccount(db);
    insertProfile(db, "profile-1");
    insertProfile(db, "profile-2");

    db.prepare("DELETE FROM accounts WHERE id = ?").run("account-1");

    const count = db
        .prepare("SELECT COUNT(*) AS count FROM profiles WHERE account_id = ?")
        .get("account-1");

    assert.equal(count.count, 0);
});

test("profiles are independent of tenants", (t) => {
    const db = createDatabase(t);

    insertAccount(db);
    insertProfile(db);
    insertTenant(db);
    insertMembership(db);

    db.prepare("DELETE FROM tenant_memberships WHERE tenant_id = ?").run("tenant-1");
    db.prepare("DELETE FROM tenants WHERE id = ?").run("tenant-1");

    const profile = db.prepare("SELECT account_id FROM profiles WHERE id = ?").get("profile-1");

    assert.equal(profile.account_id, "account-1");
});

test("tenant issuers must be unique", (t) => {
    const db = createDatabase(t);

    insertTenant(db);

    assert.throws(
        () =>
            db
                .prepare("INSERT INTO tenants (id, issuer, name, created_at) VALUES (?, ?, ?, ?)")
                .run("tenant-2", "https://auth.example.com/t/tenant-1", "Duplicate", 1000),
        /UNIQUE constraint failed/,
    );
});

test("client policy and sector can be manually migrated", (t) => {
    const db = createDatabase(t);

    insertTenant(db);
    insertClient(db);

    db.prepare(
        `UPDATE oidc_clients
         SET allow_multiple_profiles = 0, sector_identifier = ?
         WHERE id = ?`,
    ).run("new.example.com", "client-1");

    const client = db
        .prepare("SELECT allow_multiple_profiles, sector_identifier FROM oidc_clients WHERE id = ?")
        .get("client-1");

    assert.equal(client.allow_multiple_profiles, 0);
    assert.equal(client.sector_identifier, "new.example.com");
});

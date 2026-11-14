CREATE TABLE accounts (
    id TEXT NOT NULL PRIMARY KEY,
    created_at INTEGER NOT NULL
);

CREATE TABLE profiles (
    id TEXT NOT NULL PRIMARY KEY,
    account_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (account_id)
        REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX idx_profiles_account
    ON profiles(account_id);

CREATE TABLE tenants (
    id TEXT NOT NULL PRIMARY KEY,
    issuer TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    allow_multiple_profiles INTEGER NOT NULL DEFAULT 1
        CHECK (allow_multiple_profiles IN (0, 1)),
    created_at INTEGER NOT NULL
);

CREATE TABLE tenant_memberships (
    tenant_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    PRIMARY KEY (tenant_id, account_id),

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id) ON DELETE RESTRICT,

    FOREIGN KEY (account_id)
        REFERENCES accounts(id) ON DELETE RESTRICT
);

CREATE INDEX idx_memberships_account
    ON tenant_memberships(account_id);

CREATE TABLE oidc_clients (
    id TEXT NOT NULL PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sector_identifier TEXT NOT NULL,
    allow_multiple_profiles INTEGER NOT NULL DEFAULT 1
        CHECK (allow_multiple_profiles IN (0, 1)),
    created_at INTEGER NOT NULL,

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id) ON DELETE RESTRICT
);

CREATE INDEX idx_clients_tenant
    ON oidc_clients(tenant_id);

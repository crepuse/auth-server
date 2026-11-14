CREATE TABLE oidc_subjects (
    tenant_id TEXT NOT NULL,
    sector_identifier TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    sub TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    PRIMARY KEY (tenant_id, sector_identifier, profile_id),
    UNIQUE (tenant_id, sub),

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id) ON DELETE CASCADE,

    FOREIGN KEY (profile_id)
        REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_oidc_subjects_profile
    ON oidc_subjects(profile_id);

CREATE TABLE oidc_tenant_profile_bindings (
    tenant_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    PRIMARY KEY (tenant_id, account_id),

    FOREIGN KEY (tenant_id)
        REFERENCES tenants(id) ON DELETE CASCADE,

    FOREIGN KEY (account_id)
        REFERENCES accounts(id) ON DELETE CASCADE,

    FOREIGN KEY (profile_id)
        REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_tenant_bindings_profile
    ON oidc_tenant_profile_bindings(profile_id);

CREATE TABLE oidc_client_profile_bindings (
    client_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    PRIMARY KEY (client_id, account_id),

    FOREIGN KEY (client_id)
        REFERENCES oidc_clients(id) ON DELETE CASCADE,

    FOREIGN KEY (account_id)
        REFERENCES accounts(id) ON DELETE CASCADE,

    FOREIGN KEY (profile_id)
        REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_client_bindings_profile
    ON oidc_client_profile_bindings(profile_id);

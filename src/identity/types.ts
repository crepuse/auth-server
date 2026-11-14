export interface Account {
    readonly id: string;
    readonly createdAt: number;
}

export interface Profile {
    readonly id: string;
    readonly accountId: string;
    readonly displayName: string;
    readonly createdAt: number;
}

export interface Tenant {
    readonly id: string;
    readonly issuer: string;
    readonly name: string;
    readonly allowMultipleProfiles: boolean;
    readonly createdAt: number;
}

export interface TenantMembership {
    readonly tenantId: string;
    readonly accountId: string;
    readonly createdAt: number;
}

export interface OidcClient {
    readonly id: string;
    readonly tenantId: string;
    readonly name: string;
    readonly sectorIdentifier: string;
    readonly allowMultipleProfiles: boolean;
    readonly createdAt: number;
}

export interface CreateOidcClientInput {
    readonly tenantId: string;
    readonly name: string;
    readonly allowMultipleProfiles?: boolean;
}

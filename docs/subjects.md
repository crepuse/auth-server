# Subject Resolver

`@crepuse/auth-server/identity` provides pairwise subject resolution for OpenID Connect (OIDC). It resolves stable, privacy-preserving subject identifiers (`sub`) scoped to sector identifiers and enforces tenant- and client-level profile policies.

---

## Table of Contents

- [Core Concepts](#core-concepts)
    - [Pairwise Subjects & Sector Identifiers](#pairwise-subjects--sector-identifiers)
    - [Profile Policy & Bindings](#profile-policy--bindings)
- [Core API](#core-api)
    - [resolveOidcSubject](#resolveoidcsubject)
    - [Type Definitions](#type-definitions)
- [Resolution Lifecycle & Guarantees](#resolution-lifecycle--guarantees)
- [Usage Example](#usage-example)
- [Error Handling](#error-handling)

---

## Core Concepts

### Pairwise Subjects & Sector Identifiers

In accordance with OpenID Connect specifications, pairwise subject identifiers prevent third-party clients from correlating or tracking users across distinct services:

1. **Sector Scoping**: Subjects are uniquely keyed by `(tenant_id, sector_identifier, profile_id)`.
2. **Stable Pseudonyms**: The subject is generated as a cryptographically secure 64-character hexadecimal string (derived from 32 random bytes) on initial resolution and remains stable across profile updates.
3. **Cross-Client Correlation**: Clients within the same tenant sharing the same `sector_identifier` receive identical `sub` values for a profile, whereas clients in different sectors receive distinct identifiers.

### Profile Policy & Bindings

Users can maintain multiple profiles under a single global account. Tenants and clients control whether an account may use multiple profiles or must be locked to a single profile:

- **Tenant Policy (`allow_multiple_profiles`)**: When set to `0` (disabled), an account may only ever bind one profile within the tenant. Recorded in `oidc_tenant_profile_bindings`.
- **Client Policy (`allow_multiple_profiles`)**: When set to `0` (disabled), an account may only ever bind one profile for that specific client. Recorded in `oidc_client_profile_bindings`.
- **Policy Enforcement**: If a single-profile policy is in effect and a user attempts to resolve a subject using a different profile for that account, the operation is denied.

---

## Core API

### resolveOidcSubject

```typescript
function resolveOidcSubject(
    db: CrepuseDatabase<SqliteValue>,
    input: ResolveOidcSubjectInput,
): Promise<string>;
```

#### Parameters

- `db`: A `CrepuseDatabase` instance compatible with `SqliteValue`.
- `input`: A `ResolveOidcSubjectInput` object containing client, account, and profile identifiers.

#### Returns

- `Promise<string>`: Resolves to the 64-character hex pairwise `sub` identifier.

### Type Definitions

```typescript
export interface ResolveOidcSubjectInput {
    readonly clientId: string;
    readonly accountId: string;
    readonly profileId: string;
}
```

---

## Resolution Lifecycle & Guarantees

Subject resolution runs atomically within a single database batch (`db.batch`):

1. **Identity & Membership Verification**:
    - Asserts that the profile exists and belongs to the specified account (`profiles.account_id = ?`).
    - Asserts that the account has an active membership in the client's tenant (`tenant_memberships`).
    - Asserts that the client belongs to the tenant.
2. **Tenant Profile Binding**:
    - If tenant-level `allow_multiple_profiles = 0`, attempts to record `(tenant_id, account_id, profile_id)` in `oidc_tenant_profile_bindings`.
    - Confirms no conflicting client binding exists for a different profile.
3. **Client Profile Binding**:
    - If client-level `allow_multiple_profiles = 0`, attempts to record `(client_id, account_id, profile_id)` in `oidc_client_profile_bindings`.
    - Confirms no conflicting tenant binding exists for a different profile.
4. **Subject Creation**:
    - Inserts a candidate 64-hex subject into `oidc_subjects` if no subject has been allocated for `(tenant_id, sector_identifier, profile_id)`. Existing subjects are preserved (`ON CONFLICT ... DO NOTHING`).
5. **Atomic Resolution**:
    - Queries `oidc_subjects` matching the valid bindings and conditions.
    - If any verification or binding rule fails, the final query returns 0 rows, triggering resolution denial.

---

## Usage Example

```typescript
import { resolveOidcSubject } from "@crepuse/auth-server/identity";

const subject = await resolveOidcSubject(db, {
    clientId: "client-1",
    accountId: "account-1",
    profileId: "profile-1",
});

console.log("Resolved OIDC sub:", subject);
// Example: "e4d909c290d0fb1ca068ffaddf22cbd0add829ac2a... (64 hex characters)"
```

---

## Error Handling

When authorization or binding policies are violated, `resolveOidcSubject` throws an error:

| Condition                 | Failure Cause                                                                | Thrown Error                            |
| :------------------------ | :--------------------------------------------------------------------------- | :-------------------------------------- |
| Invalid Client            | Client does not exist or tenant mismatch                                     | `Error: OIDC subject resolution denied` |
| Invalid Account / Profile | Profile not owned by account, or account not member of tenant                | `Error: OIDC subject resolution denied` |
| Tenant Policy Conflict    | Tenant enforces single profile, but account already bound to another profile | `Error: OIDC subject resolution denied` |
| Client Policy Conflict    | Client enforces single profile, but account already bound to another profile | `Error: OIDC subject resolution denied` |

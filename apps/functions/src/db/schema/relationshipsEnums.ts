// Central place for role/status string literals.
// We intentionally store these as TEXT in Postgres for MVP flexibility.

export const relationshipsRoleEnum = ["owner", "member"] as const;
export type RelationshipRole = (typeof relationshipsRoleEnum)[number];

export const relationshipsStatusEnum = ["active", "pending"] as const;
export type RelationshipMemberStatus = (typeof relationshipsStatusEnum)[number];

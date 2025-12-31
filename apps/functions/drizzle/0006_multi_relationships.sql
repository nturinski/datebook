-- 0006_multi_relationships.sql
-- Allow users to be in multiple relationships and relationships to have many members.

-- Remove the "one relationship per user" constraint.
DROP INDEX IF EXISTS "relationship_members_user_uq";

-- Roles and permissions, P3 (spec docs/specs/2026-11-17-roles-permissions.md).
--
-- 1. The deprecated `users.role` enum column goes: since P2 access comes only from roles as data
--    (`user_roles`), and the web app no longer reads it (the user chip shows role names; every
--    user's home is the dashboard). The P2 migration already gave every HR admin their roles.
-- 2. Two facts the Users and My account screens show: the last successful sign-in and when the
--    password was last set. Existing users start with NULL ("never" / not known).
ALTER TABLE "users" DROP COLUMN "role";
DROP TYPE "UserRole";

ALTER TABLE "users" ADD COLUMN "last_sign_in_at" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "password_changed_at" TIMESTAMP(3);

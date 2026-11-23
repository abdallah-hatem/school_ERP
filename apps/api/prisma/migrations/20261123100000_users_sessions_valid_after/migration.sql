-- Security review (2026-11-23): access tokens issued before this moment are accepted only while their
-- sign-in (refresh-token family) is alive. Set on deactivate and reactivate (a password change uses
-- password_changed_at), so a reactivated user's old tokens stay dead.
ALTER TABLE "users" ADD COLUMN "sessions_valid_after" TIMESTAMP(3);

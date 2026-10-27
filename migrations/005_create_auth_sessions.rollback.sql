-- Rolling this migration back invalidates every durable session.
DROP TABLE IF EXISTS auth_refresh_history;
DROP TABLE IF EXISTS auth_sessions;

"""Durable discovery store. Migrate explicitly before starting the Cloud Run service."""
from contextlib import contextmanager
import hashlib
import os
import re

from service import Store

SCHEMA = "discovery"
DDL = (
    "CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, scope TEXT NOT NULL, "
    "platform TEXT NOT NULL, idem TEXT NOT NULL, fingerprint TEXT NOT NULL, "
    "created DOUBLE PRECISION NOT NULL, expires DOUBLE PRECISION NOT NULL, "
    "state TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(scope,idem))",
    "CREATE INDEX IF NOT EXISTS scope_time ON requests(scope,created)",
    "CREATE INDEX IF NOT EXISTS platform_time ON requests(platform,created)",
    "CREATE TABLE IF NOT EXISTS active(scope TEXT PRIMARY KEY, request_id TEXT NOT NULL)",
    "CREATE TABLE IF NOT EXISTS action_results(scope TEXT NOT NULL, request_id TEXT NOT NULL, "
    "action_id TEXT NOT NULL, fingerprint TEXT NOT NULL, result TEXT, "
    "PRIMARY KEY(scope,request_id,action_id))",
)


class Row(dict):
    """The shared Store queries use SQLite's named and positional row access."""
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


def rows(cursor):
    names = [c.name for c in cursor.description] if cursor.description else []
    return lambda values: Row(zip(names, values))


class Queries:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, statement, params=()):
        # Only static Store statements use this adapter. Values remain driver parameters.
        return self.conn.execute(statement.replace("?", "%s"), params)


def lock_id(kind, value):
    return int.from_bytes(hashlib.sha256((kind + ":" + value).encode()).digest()[:8], "big", signed=True)


class PostgresStore(Store):
    def __init__(self, url, schema=SCHEMA):
        if not re.fullmatch(r"[a-z][a-z0-9_]{0,62}", schema):
            raise ValueError("Invalid discovery schema")
        self.url, self.schema = url, schema
        # No DDL or local state at startup. An explicit migration prepares the schema.

    @contextmanager
    def connection(self):
        import psycopg
        from psycopg import sql
        with psycopg.connect(self.url, connect_timeout=15, row_factory=rows) as conn:
            conn.execute("SET LOCAL statement_timeout = '15s'")
            conn.execute("SET LOCAL lock_timeout = '5s'")
            conn.execute(sql.SQL("SET LOCAL search_path TO {} ").format(sql.Identifier(self.schema)))
            yield conn

    @contextmanager
    def db(self):
        with self.connection() as conn:
            yield Queries(conn)

    @contextmanager
    def transaction(self, scope, platform=None):
        with self.connection() as conn:
            # begin() serializes the platform budget before the subject lock. No path
            # acquires these locks in reverse order. Later transitions need only scope.
            if platform is not None:
                conn.execute("SELECT pg_advisory_xact_lock(%s)", (lock_id("platform", platform),))
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (lock_id("scope", scope),))
            yield Queries(conn)

    def migrate(self):
        from psycopg import sql
        with self.connection() as conn:
            conn.execute("SELECT pg_advisory_xact_lock(%s)", (lock_id("schema", self.schema),))
            conn.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(self.schema)))
            for statement in DDL:
                conn.execute(statement)


if __name__ == "__main__":
    import sys
    if sys.argv[1:] != ["migrate"]:
        raise SystemExit("Usage: pgstore.py migrate (DISCOVERY_DATABASE_URL required)")
    try:
        PostgresStore(os.environ["DISCOVERY_DATABASE_URL"]).migrate()
    except Exception:
        # A driver error may contain the DSN. Never print it in a Job log.
        raise SystemExit("Discovery schema migration failed") from None
    print("Discovery schema migration complete")

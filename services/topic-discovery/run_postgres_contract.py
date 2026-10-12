"""Run the existing full discovery contract suite against isolated PostgreSQL schemas.

Only accepts a local database named discovery_contract; never use a staging/production DSN.
"""
import hashlib
import os
from pathlib import Path
import sys
import unittest
from urllib.parse import urlsplit

from pgstore import PostgresStore


def main():
    url = os.environ["DISCOVERY_TEST_DATABASE_URL"]
    parsed = urlsplit(url)
    if parsed.hostname not in ("127.0.0.1", "localhost") or parsed.path != "/discovery_contract":
        raise SystemExit("Requires a disposable local discovery_contract database")
    schemas = set()
    def factory(path):
        schema = "contract_" + hashlib.sha256(str(path).encode()).hexdigest()[:32]
        store = PostgresStore(url, schema)
        store.path = path  # Existing restart tests reopen the same logical store.
        store.migrate()
        schemas.add(schema)
        return store
    loader = unittest.TestLoader()
    suite = loader.discover(str(Path(__file__).parent), pattern="test_*.py")
    for name in ("test_service", "test_native_review", "test_research_search"):
        module = sys.modules[name]
        if hasattr(module, "Store"):
            module.Store = factory
    try:
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        return 0 if result.wasSuccessful() else 1
    finally:
        from psycopg import sql
        with PostgresStore(url).connection() as conn:
            for schema in schemas:
                conn.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(schema)))


if __name__ == "__main__":
    raise SystemExit(main())

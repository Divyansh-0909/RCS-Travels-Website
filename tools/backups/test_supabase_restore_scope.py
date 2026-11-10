"""Offline scope tests; no hosted access or credentials."""
import unittest
from supabase_restore_scope import acl_rows, plan


class RestoreScopeTests(unittest.TestCase):
    def test_exact_custom_owner(self):
        self.assertEqual(plan(["custody"], ["custody_owner"], {"custody_owner"})["ownerMapping"], {"custody_owner": "custody_owner"})

    def test_explicit_application_mapping(self):
        p = plan(["public"], ["supabase_admin"], {"postgres"}, {"supabase_admin": "postgres"})
        self.assertFalse(p["fullManagedProjectClone"])
        self.assertEqual(p["ownerMapping"], {"supabase_admin": "postgres"})

    def test_reserved_owner_not_silently_reassigned(self):
        for role in ["supabase_admin", "pg_database_owner"]:
            with self.subTest(role=role), self.assertRaises(ValueError):
                plan(["public"], [role], {role})

    def test_provider_schemas_refused(self):
        for schema in ["auth", "storage", "realtime", "extensions", "pg_catalog", "x;drop"]:
            with self.subTest(schema=schema), self.assertRaises(ValueError):
                plan([schema], ["postgres"], {"postgres"})

    def test_missing_roles_refused(self):
        with self.assertRaisesRegex(ValueError, "TARGET_OWNER_ROLE_MISSING"):
            plan(["custody"], ["custody_owner"], {"postgres"})

    def test_duplicate_and_empty_scope_refused(self):
        for schemas in [[], ["public", "public"]]:
            with self.assertRaises(ValueError):
                plan(schemas, ["postgres"], {"postgres"})

    def test_acl_roles_and_options_preserved(self):
        self.assertEqual(acl_rows([("custody_inspector", "SELECT", False)], {"custody_inspector"}), [["custody_inspector", "SELECT", False]])

    def test_missing_grantee_or_unknown_privilege_refused(self):
        for row in [("missing", "SELECT", False), ("PUBLIC", "SUPERUSER", False), ("PUBLIC", "SELECT", 1)]:
            with self.assertRaises(ValueError):
                acl_rows([row], {"postgres"})


if __name__ == "__main__":
    unittest.main()

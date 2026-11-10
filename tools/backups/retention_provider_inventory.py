"""Read-only GCS/R2 copy inventories. Remote access is disabled by default.

Use an authenticated SDK/transport supplied by the caller. No dotenv, credential
discovery, upload, object deletion, hold removal or lifecycle configuration.
"""
import hashlib
import json
import re
from urllib.parse import quote, urlencode

HEX = re.compile(r"[a-f0-9]{64}\Z")


def binding(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), default=str).encode()).hexdigest()


def _scope(bucket, prefix, enabled):
    if enabled is not True:
        raise ValueError("REMOTE_INVENTORY_DISABLED")
    if not isinstance(bucket, str) or not re.fullmatch(r"[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]", bucket):
        raise ValueError("BUCKET_REQUIRED")
    if not isinstance(prefix, str) or not prefix.endswith("/") or prefix.startswith("/") or any(p in ("", ".", "..") for p in prefix[:-1].split("/")) or ":" in prefix:
        raise ValueError("EXPLICIT_SAFE_PREFIX_REQUIRED")


def gcs_inventory(get_json, bucket, prefix, *, enabled=False, max_pages=16, limit=2048):
    """get_json accepts only a fixed Google HTTPS JSON API URL, returning JSON.

    Enumerate live/noncurrent generations and soft-deleted generations as
    separate list operations. Metadata is not a recoverability/erasure proof.
    """
    _scope(bucket, prefix, enabled)
    if type(max_pages) is not int or not 1 <= max_pages <= 64 or type(limit) is not int or not 1 <= limit <= 4096:
        raise ValueError("INVENTORY_BOUNDS_REQUIRED")
    base = "https://storage.googleapis.com/storage/v1/b/" + quote(bucket, safe="")
    config = get_json(base + "?fields=softDeletePolicy,versioning,hierarchicalNamespace")
    soft_policy = config.get("softDeletePolicy")
    if not isinstance(soft_policy, dict) or not str(soft_policy.get("retentionDurationSeconds", "")).isdigit():
        raise ValueError("SOFT_DELETE_CONFIGURATION_UNVERIFIED")
    variants = [("versions", {"versions": "true"})]
    if int(soft_policy["retentionDurationSeconds"]) > 0:
        variants.append(("soft-deleted", {"softDeleted": "true"}))
    found, identities = [], set()
    for mode, extra in variants:
        token, seen_tokens = None, set()
        for _ in range(max_pages):
            params = {"prefix": prefix, "maxResults": min(1000, limit), "projection": "noAcl", **extra}
            if token is not None:
                params["pageToken"] = token
            page = get_json(base + "/o?" + urlencode(params))
            if not isinstance(page, dict) or not isinstance(page.get("items", []), list):
                raise ValueError("PROVIDER_PAGE_INVALID")
            for item in page.get("items", []):
                if not isinstance(item, dict) or not isinstance(item.get("name"), str) or not item["name"].startswith(prefix) or not str(item.get("generation", "")).isdigit() or not str(item.get("metageneration", "")).isdigit() or not str(item.get("size", "")).isdigit():
                    raise ValueError("GENERATION_BINDING_REQUIRED")
                identity = (item["name"], str(item["generation"]))
                if identity in identities:
                    raise ValueError("DUPLICATE_GENERATION")
                identities.add(identity)
                row = {k: item.get(k) for k in ["name", "generation", "metageneration", "size", "md5Hash", "crc32c", "temporaryHold", "eventBasedHold", "retentionExpirationTime", "softDeleteTime", "hardDeleteTime"]}
                row.update({"bucket": bucket, "mode": mode, "kind": "GCS_GENERATION", "providerHoldObserved": item.get("temporaryHold") is True or item.get("eventBasedHold") is True})
                row["observationBinding"] = binding(row)
                # A metadata hold changes metageneration, not the retained
                # object generation. Keep physical-copy identity stable.
                row["binding"] = binding({k: row[k] for k in ["bucket", "name", "generation", "size", "md5Hash", "crc32c"]})
                found.append(row)
                if len(found) > limit:
                    raise ValueError("INVENTORY_OBJECT_LIMIT")
            token = page.get("nextPageToken")
            if not token:
                break
            if not isinstance(token, str) or token in seen_tokens:
                raise ValueError("PROVIDER_PAGINATION_LOOP")
            seen_tokens.add(token)
        else:
            raise ValueError("INVENTORY_PAGE_LIMIT")
    return {"kind": "GCS_GENERATION_INVENTORY", "bucket": bucket, "prefix": prefix, "copies": found,
            "snapshotAtomic": False, "configuration": config, "holdCapability": "JSON_API_OBJECT_HOLDS_REQUIRE_BUCKET_COMPATIBILITY_AND_SEPARATE_OWNER_AUTHORIZATION",
            "restorableBytesVerified": False, "providerDeletionEnabled": False, "commitment": binding(found)}


def r2_inventory(client, bucket, prefix, *, enabled=False, max_pages=16, limit=2048):
    """Use the existing boto3 S3 client for LIST/HEAD only; no assumed versioning.

    Bucket-lock verification uses a separate Cloudflare management capability,
    not Amazon S3 Object Lock/GetBucketVersioning, which R2 does not implement.
    """
    _scope(bucket, prefix, enabled)
    if type(max_pages) is not int or not 1 <= max_pages <= 64 or type(limit) is not int or not 1 <= limit <= 4096:
        raise ValueError("INVENTORY_BOUNDS_REQUIRED")
    copies, seen, tokens, token = [], set(), set(), None
    for _ in range(max_pages):
        args = {"Bucket": bucket, "Prefix": prefix, "MaxKeys": min(1000, limit)}
        if token:
            args["ContinuationToken"] = token
        page = client.list_objects_v2(**args)
        for item in page.get("Contents", []):
            key = item.get("Key")
            if not isinstance(key, str) or not key.startswith(prefix) or key in seen:
                raise ValueError("BACKUP_KEY_BINDING_REQUIRED")
            seen.add(key)
            if not key.endswith(".tar.age"):
                continue  # latest.json is a pointer, not another backup copy.
            head = client.head_object(Bucket=bucket, Key=key)
            digest = head.get("Metadata", {}).get("sha256", "")
            if not HEX.fullmatch(digest) or type(head.get("ContentLength")) is not int or head["ContentLength"] <= 0:
                raise ValueError("ENCRYPTED_BACKUP_METADATA_REQUIRED")
            row = {"kind": "ENCRYPTED_BACKUP", "bucket": bucket, "key": key, "bytes": head["ContentLength"],
                   "declaredSha256": digest, "etag": head.get("ETag"), "lastModified": str(head.get("LastModified")),
                   "integrity": "METADATA_ONLY_REQUIRES_EXISTING_CIPHERTEXT_READBACK_CHECK", "bucketLock": "NOT_VERIFIED_BY_S3_METADATA"}
            row["observationBinding"] = binding(row)
            row["binding"] = binding({k: row[k] for k in ["bucket", "key", "bytes", "declaredSha256"]})
            copies.append(row)
            if len(copies) > limit:
                raise ValueError("INVENTORY_OBJECT_LIMIT")
        if not page.get("IsTruncated"):
            break
        token = page.get("NextContinuationToken")
        if not isinstance(token, str) or not token or token in tokens:
            raise ValueError("PROVIDER_PAGINATION_LOOP")
        tokens.add(token)
    else:
        raise ValueError("INVENTORY_PAGE_LIMIT")
    return {"kind": "R2_ENCRYPTED_BACKUP_INVENTORY", "copies": copies, "s3Versioning": "UNSUPPORTED",
            "providerDeletionEnabled": False, "snapshotAtomic": False, "commitment": binding(copies)}


def screen_restore(c, scope_epochs):
    """Current authoritative ledger must be reachable; never grant traffic."""
    if not scope_epochs or len(scope_epochs) > 2048:
        raise ValueError("EXPLICIT_BACKUP_SCOPE_INDEX_REQUIRED")
    results = []
    for scope, epoch in sorted(scope_epochs.items()):
        result = c.execute("SELECT retention_registry.restore_decision(%s,%s)", (scope, epoch)).fetchone()[0]
        results.append(result)
    return {"status": "QUARANTINE", "scopes": results, "trafficReleaseAuthorized": False,
            "backupDeletionEnabled": False, "scopeCompleteness": "CALLER_MUST_BIND_FULL_BACKUP_SCOPE_INDEX_NOT_PROVED_BY_THIS_QUERY"}

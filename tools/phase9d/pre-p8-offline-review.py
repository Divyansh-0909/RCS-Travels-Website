"""Read-only SQL/test navigation inventory. No imports execute project code.

This lexical index is not a PostgreSQL parser, test runner or coverage engine.
Output must be a new directory, so earlier evidence cannot be overwritten.
"""

import argparse
import hashlib
import json
import re
from pathlib import Path


FUNCTION = re.compile(
    r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+"
    r"(?P<name>[a-z_][\w]*\.[a-z_][\w]*)\s*\("
    r"(?P<arguments>.*?)\)\s*RETURNS\b(?P<header>.*?)"
    r"\bAS\s*(?P<tag>\$(?:[a-zA-Z_]\w*)?\$)(?P<body>.*?)(?P=tag)",
    re.IGNORECASE | re.DOTALL,
)
TABLE = re.compile(r"\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w]+\.[\w]+)", re.I)
CALL = re.compile(r"\b([a-z_]\w*\.[a-z_]\w*)\s*\(", re.I)
CASE_NAME = re.compile(r"\b(?:check|test|scenario|group)\s*\(\s*(['\"])(.*?)\1", re.S)
MARKER = re.compile(r"\b(IF|ELSIF|CASE|WHEN|WHERE|HAVING|CHECK|JOIN|ON|EXISTS|COALESCE|AND|OR|NULL)\b", re.I)
RENAME = re.compile(r"ALTER\s+FUNCTION\s+(\w+\.\w+)\s*\((.*?)\)\s+RENAME\s+TO\s+(\w+)", re.I | re.S)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def line_at(text, offset):
    return text.count("\n", 0, offset) + 1


def mask_literals(text):
    """Keep offsets/newlines while suppressing comments and quoted tokens."""
    pattern = re.compile(r"--[^\n]*|/\*.*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"", re.S)
    return pattern.sub(lambda m: "".join("\n" if c == "\n" else " " for c in m.group()), text)


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="New repository-relative evidence directory")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    output = (root / args.output).resolve()
    if not output.is_relative_to(root / "output") or output.exists():
        raise SystemExit("Output must be a NEW directory below repository output/")
    sql_files = sorted((root / "tools/phase9d").glob("*.sql"))
    tests = sorted((root / "backend/tests").rglob("*phase9d*"))
    # Case-sensitive filesystem compatibility: actual filenames begin phase9d.
    tests = [p for p in tests if p.is_file() and p.suffix in {".js", ".mjs", ".sql"}]
    fixtures = sorted((root / "backend/tests/helpers").glob("phase9d*.js"))
    support = sorted((root / "tools/phase9d").glob("*.mjs"))
    inputs = sorted(set(sql_files + tests + fixtures + support))
    hashes = {p.relative_to(root).as_posix(): digest(p) for p in inputs}
    texts = {p.relative_to(root).as_posix(): p.read_text(encoding="utf-8-sig") for p in inputs}
    test_paths = {p.relative_to(root).as_posix() for p in tests if "/integration/" in p.as_posix()}
    routines, tables, renames, cases = [], [], [], []
    for path, text in texts.items():
        if path in test_paths:
            for match in CASE_NAME.finditer(text):
                cases.append({"file": path, "line": line_at(text, match.start()), "title": match[2]})
        if not path.endswith(".sql") or not path.startswith("tools/phase9d/"):
            continue
        for match in TABLE.finditer(mask_literals(text)):
            tables.append({"name": match[1], "file": path, "line": line_at(text, match.start())})
        for match in RENAME.finditer(mask_literals(text)):
            renames.append({"from": match[1], "arguments": match[2], "to": match[1].split(".")[0] + "." + match[3], "file": path, "line": line_at(text, match.start())})
        matches = list(FUNCTION.finditer(text))
        declared = len(re.findall(r"\bCREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\b", mask_literals(text), re.I))
        if declared != len(matches):
            raise SystemExit(f"Unrecognized SQL function declaration in {path}: {declared} vs {len(matches)}")
        for match in matches:
            header, body = match["header"], match["body"]
            language = re.search(r"\bLANGUAGE\s+(\w+)", header, re.I)
            body_line = line_at(text, match.start("body"))
            nodes = []
            for offset, (raw, masked) in enumerate(zip(body.splitlines(), mask_literals(body).splitlines())):
                tokens = [m[1].upper() for m in MARKER.finditer(masked)]
                if tokens:
                    nodes.append({"line": body_line + offset, "body_line": offset + 1, "tokens": tokens, "source": raw.strip(), "assertion_status": "UNRECONCILED_LEXICAL_CANDIDATE"})
            references = []
            for caller, caller_text in texts.items():
                if caller == path:
                    continue
                for ref in re.finditer(r"\b" + re.escape(match["name"]) + r"\s*\(", caller_text, re.I):
                    references.append({"file": caller, "line": line_at(caller_text, ref.start()), "kind": "integration_text" if caller in test_paths else "fixture_or_runtime_text"})
            routines.append({
                "name": match["name"], "arguments_source": " ".join(match["arguments"].split()),
                "file": path, "line": line_at(text, match.start()), "end_line": line_at(text, match.end()),
                "language": language[1].lower() if language else "UNKNOWN",
                "security_definer": bool(re.search(r"SECURITY\s+DEFINER", header, re.I)),
                "definition_source_sha256": hashlib.sha256(match.group().encode()).hexdigest(),
                "definition_hash_boundary": "source declaration, not pg_get_functiondef/catalog hash",
                "lexical_predicate_lines": nodes,
                "qualified_calls": sorted(set(CALL.findall(mask_literals(body)))),
                "textual_references": references,
                "evidence_boundary": "Textual references are navigation, not execution or assertion proof. Dynamic SQL/schema dispatch and overloaded signatures need manual composition review.",
            })
    assert sql_files and routines
    differences = [name for name, expected in hashes.items() if digest(root / name) != expected]
    if differences:
        raise SystemExit("Inputs changed during review: " + ", ".join(differences))
    output.mkdir(parents=True)
    write_json(output / "routine-condition-index.json", {"kind": "LEXICAL_NOT_SEMANTIC_COVERAGE", "routine_declarations": len(routines), "routines": routines, "renames": renames})
    write_json(output / "tables-and-test-navigation.json", {"tables": tables, "literal_case_titles": cases, "boundary": "No test executed; generic check wrappers, generated titles and dynamic calls may not be indexed."})
    lines = ["# Offline SQL source navigation", "", "Generated lexical index; **not test coverage or a PostgreSQL parser**.", "", "| Source declaration | Language | Predicate-source lines | Text references |", "| --- | --- | ---: | ---: |"]
    for row in routines:
        target = "../../../" + row["file"] + "#L" + str(row["line"])
        lines.append(f"| [{row['name']}({row['arguments_source']})]({target}) | {row['language']} | {len(row['lexical_predicate_lines'])} | {len(row['textual_references'])} |")
    (output / "routine-navigation.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    write_json(output / "manifest.json", {"kind": "OFFLINE_SOURCE_INSPECTION_ONLY", "sql_files": len(sql_files), "routine_declarations": len(routines), "table_declarations": len(tables), "literal_case_titles": len(cases), "source_hashes": hashes, "sources_unchanged": True, "outputs": {p.name: digest(p) for p in output.iterdir() if p.is_file()}, "tool_sha256": digest(Path(__file__)), "limitations": ["No SQL evaluation, type inference, Boolean independence or path reachability proof.", "Function extraction supports the existing dollar-quoted declarations and fails on an unmatched declaration count.", "Line markers are SQL-source locations, not native statement/branch IDs.", "No Docker, network, database or test process is launched."]})
    print(json.dumps({"output": args.output, "sql_files": len(sql_files), "routine_declarations": len(routines), "literal_case_titles": len(cases), "status": "INDEX_WRITTEN_NOT_COVERAGE"}))


if __name__ == "__main__":
    main()

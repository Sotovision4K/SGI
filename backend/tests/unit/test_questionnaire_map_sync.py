"""Sync validation — questionnaire_map.json must stay consistent with the
source questionnaire files (iso9001.json, iso14001.json, iso45001.json).

If a question is added/removed/renamed in a questionnaire and the map is NOT
updated, these tests fail and the developer is forced to keep them in sync.

TDD: the map and questionnaires exist, so these tests start PASSING.
They act as a regression guard for future changes.
"""

import json
from pathlib import Path

import pytest

# Q: Should the test read questionnaire files directly or via a loader module?
# A: Read directly so the test doesn't depend on application code (tests are
#    the final authority on correctness — no circular dependency).
# Decision: Resolve file paths relative to the test file's location.
_QUESTIONNAIRES_DIR = (
    Path(__file__).resolve().parent.parent.parent / "questionnaires"
)

_STANDARDS = ["iso9001", "iso14001", "iso45001"]

# ── helpers ──────────────────────────────────────────────────────────────


def _load_questionnaire(standard: str) -> dict:
    """Load one questionnaire JSON, e.g. iso9001.json."""
    path = _QUESTIONNAIRES_DIR / f"{standard}.json"
    if not path.is_file():
        pytest.skip(f"Questionnaire file not found: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _load_map() -> dict:
    """Load questionnaire_map.json."""
    path = _QUESTIONNAIRES_DIR / "questionnaire_map.json"
    if not path.is_file():
        pytest.skip(f"Map file not found: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _extract_question_ids(questionnaire: dict) -> set[str]:
    """Extract all question IDs from a questionnaire's groups."""
    ids: set[str] = set()
    for group in questionnaire.get("groups", []):
        for q in group.get("questions", []):
            qid = q.get("id")
            if qid:
                ids.add(qid)
    return ids


def _build_question_to_group(questionnaire: dict) -> dict[str, str]:
    """Return ``{question_id: group_id}`` for every question in the questionnaire."""
    mapping: dict[str, str] = {}
    for group in questionnaire.get("groups", []):
        gid = group.get("id")
        if not gid:
            continue
        for q in group.get("questions", []):
            qid = q.get("id")
            if qid:
                mapping[qid] = gid
    return mapping


# ── tests ─────────────────────────────────────────────────────────────────


# Q: Does the map cover every question in the source questionnaires?
# A: It must — missing questions cause the prompt builder to skip them,
#    producing incomplete LLM context.
# Decision: Direction A — questionnaire → map. Every question_id found in
#    the questionnaire must appear in the map for the same standard.
class TestMapCoversAllQuestions:
    @pytest.mark.parametrize("standard", _STANDARDS)
    def test_every_questionnaire_question_in_map(self, standard: str):
        """Every question ID in the questionnaire exists in the map."""
        questionnaire = _load_questionnaire(standard)
        q_ids = _extract_question_ids(questionnaire)

        m = _load_map()
        map_ids = {e["question_id"] for e in m[standard]}

        missing = q_ids - map_ids
        assert not missing, (
            f"{standard}: {len(missing)} questions in questionnaire "
            f"but missing from map: {sorted(missing)}"
        )


# Q: Does the map contain entries that no longer match any questionnaire?
# A: It must not — zombie entries waste memory and could produce confusing
#    behavior (the prompt builder iterates map entries, not questionnaire).
# Decision: Direction B — map → questionnaire. Every question_id in the map
#    must exist in the corresponding questionnaire.
class TestNoZombieEntries:
    @pytest.mark.parametrize("standard", _STANDARDS)
    def test_every_map_question_in_questionnaire(self, standard: str):
        """Every question ID in the map exists in the questionnaire."""
        questionnaire = _load_questionnaire(standard)
        q_ids = _extract_question_ids(questionnaire)

        m = _load_map()
        map_ids = {e["question_id"] for e in m[standard]}

        extra = map_ids - q_ids
        assert not extra, (
            f"{standard}: {len(extra)} questions in map "
            f"but missing from questionnaire: {sorted(extra)}"
        )


# Q: Does the `group` field in the map match the group the question actually
#    belongs to in the questionnaire?
# A: It must — mismatched groups mean the wrong bucket assignment, sending
#    a leadership question to the "Operación" LLM call with wrong clauses.
# Decision: For every question, verify map.group == questionnaire.group.
class TestGroupConsistency:
    @pytest.mark.parametrize("standard", _STANDARDS)
    def test_map_group_matches_questionnaire_group(self, standard: str):
        """Every entry's group field matches the questionnaire's group."""
        questionnaire = _load_questionnaire(standard)
        q_to_group = _build_question_to_group(questionnaire)

        m = _load_map()
        mismatches: list[str] = []
        for entry in m[standard]:
            qid = entry["question_id"]
            expected_group = q_to_group.get(qid)
            actual_group = entry.get("group")
            if expected_group is not None and expected_group != actual_group:
                mismatches.append(
                    f"  {qid}: map group={actual_group!r}, "
                    f"questionnaire group={expected_group!r}"
                )

        assert not mismatches, (
            f"{standard}: {len(mismatches)} group mismatches:\n"
            + "\n".join(mismatches)
        )


# Q: Do bucket assignments follow the spec's group→bucket mapping?
# A: Yes — every question in group X must be in the bucket that claims group X.
# Decision: Cross-reference every entry's bucket against the buckets legend.
class TestBucketConsistency:
    def test_bucket_follows_legend(self):
        """Every entry's bucket matches the legend's group→bucket mapping."""
        m = _load_map()
        # Build reverse index: group → bucket from the legend
        group_to_bucket: dict[str, str] = {}
        for bucket_key, bucket_info in m["buckets"].items():
            for group in bucket_info["groups"]:
                group_to_bucket[group] = bucket_key

        errors: list[str] = []
        for standard in _STANDARDS:
            for entry in m[standard]:
                expected_bucket = group_to_bucket.get(entry["group"])
                actual_bucket = entry["bucket"]
                if expected_bucket and expected_bucket != actual_bucket:
                    errors.append(
                        f"  {standard}/{entry['question_id']}: "
                        f"group={entry['group']!r} → expected "
                        f"bucket={expected_bucket!r}, got {actual_bucket!r}"
                    )

        assert not errors, (
            f"{len(errors)} bucket assignment errors:\n" + "\n".join(errors)
        )


# Q: Are all 7 groups represented in the map's legend?
# A: They must be — orphan groups mean questions with no bucket, skipped
#    silently during prompt construction.
# Decision: Verify the union of all groups in the legend covers all
#    groups used in map entries.
class TestLegendCoverage:
    def test_legend_covers_all_used_groups(self):
        """Every group referenced in map entries must be in the buckets legend."""
        m = _load_map()

        legend_groups: set[str] = set()
        for bucket_info in m["buckets"].values():
            legend_groups.update(bucket_info["groups"])

        used_groups: set[str] = set()
        for standard in _STANDARDS:
            for entry in m[standard]:
                used_groups.add(entry["group"])

        missing = used_groups - legend_groups
        assert not missing, (
            f"Groups used in entries but missing from buckets legend: {sorted(missing)}"
        )


# Q: Are all 5 required fields present on every entry?
# A: Yes — the prompt builder depends on question_id, es_label, clause, group,
#    and bucket for every entry. Missing fields would cause KeyError at runtime.
# Decision: Schema-validate every entry in the map.
class TestEntrySchema:
    REQUIRED_FIELDS = {"question_id", "es_label", "clause", "group", "bucket"}

    @pytest.mark.parametrize("standard", _STANDARDS)
    def test_all_entries_have_required_fields(self, standard: str):
        """Every entry in every standard has all 5 required fields."""
        m = _load_map()
        errors: list[str] = []
        for i, entry in enumerate(m[standard]):
            missing = self.REQUIRED_FIELDS - set(entry.keys())
            if missing:
                errors.append(
                    f"  [{i}] {entry.get('question_id', '?')}: "
                    f"missing {sorted(missing)}"
                )
        assert not errors, (
            f"{standard}: {len(errors)} entries with missing fields:\n"
            + "\n".join(errors)
        )

    @pytest.mark.parametrize("standard", _STANDARDS)
    def test_no_duplicate_question_ids(self, standard: str):
        """No question_id appears twice within a standard."""
        m = _load_map()
        seen: dict[str, list[int]] = {}
        for i, entry in enumerate(m[standard]):
            qid = entry["question_id"]
            seen.setdefault(qid, []).append(i)

        dupes = {qid: idxs for qid, idxs in seen.items() if len(idxs) > 1}
        assert not dupes, (
            f"{standard}: {len(dupes)} duplicate question_ids: "
            f"{dict(dupes)}"
        )

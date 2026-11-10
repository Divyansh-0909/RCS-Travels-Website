"""Synthetic protocol acceptance and refusal checks; no real human labels."""
import copy
import unittest

from review_readiness import inspect_human_review


class HumanReviewTests(unittest.TestCase):
    def setUp(self):
        self.protocol = {"reviewers": ["reviewer-a", "reviewer-b"], "adjudicator": "reviewer-c", "projectionVersion": "synthetic-v1",
                         "projectionApproved": True, "collectionApproved": True, "acceptanceCriteriaApproved": True}
        self.case = {"casePseudonym": "a" * 64, "evidenceSha256": "b" * 64, "sourceEpochSha256": "c" * 64, "instructionSha256": "d" * 64,
                     "synthetic": True, "projectionVersion": "synthetic-v1", "modelRevealedAt": "2026-10-31T10:03:00Z",
                     "labels": [{"reviewer": r, "evidenceSha256": "b" * 64, "factsSupported": False, "reviewRequired": True,
                                 "disposition": "REVIEW_REQUIRED", "modelVisible": False, "lockedAt": "2026-10-31T10:01:00Z"} for r in self.protocol["reviewers"]]}

    def inspect(self):
        return inspect_human_review(self.protocol, [self.case])

    def test_positive_synthetic_has_no_real_or_production_authority(self):
        result = self.inspect()
        self.assertEqual(result["status"], "PROCESS_EVIDENCE_COMPLETE_ONLY")
        self.assertEqual(result["realCaseCount"], 0)
        self.assertFalse(result["realAccuracyCertified"] or result["productionAuthorized"] or result["independenceAttested"])

    def test_empty_packet_incomplete(self):
        self.assertEqual(inspect_human_review(self.protocol, [])["status"], "INCOMPLETE")

    def test_missing_approvals(self):
        for key in ["projectionApproved", "collectionApproved", "acceptanceCriteriaApproved"]:
            with self.subTest(key=key):
                protocol = dict(self.protocol, **{key: False})
                self.assertEqual(inspect_human_review(protocol, [self.case])["status"], "INCOMPLETE")

    def test_same_or_unassigned_reviewers(self):
        for reviewers in [[None, None], ["reviewer-a", "reviewer-a"]]:
            self.protocol["reviewers"] = reviewers
            self.assertEqual(self.inspect()["status"], "INCOMPLETE")

    def test_unblinded_label_refused(self):
        self.case["labels"][0]["modelVisible"] = True
        self.assertIn("BLIND_LABEL_REQUIRED", self.inspect()["cases"][0]["errors"])

    def test_late_or_timezone_free_label_refused(self):
        for value in ["2026-10-31T10:03:00Z", "2026-10-31T10:01:00"]:
            self.case["labels"][0]["lockedAt"] = value
            self.assertEqual(self.inspect()["status"], "INCOMPLETE")

    def test_wrong_evidence_refused(self):
        self.case["labels"][1]["evidenceSha256"] = "e" * 64
        self.assertIn("LABEL_EVIDENCE_BINDING_MISMATCH", self.inspect()["cases"][0]["errors"])

    def test_disagreement_requires_third_person_before_reveal(self):
        self.case["labels"][1]["disposition"] = "UNDETERMINED"
        self.assertIn("INDEPENDENT_ADJUDICATION_REQUIRED", self.inspect()["cases"][0]["errors"])
        self.case["adjudication"] = {"reviewer": "reviewer-c", "reasonReference": "synthetic-categorical-reason", "lockedAt": "2026-10-31T10:02:00Z"}
        self.assertEqual(self.inspect()["status"], "PROCESS_EVIDENCE_COMPLETE_ONLY")
        self.case["adjudication"]["lockedAt"] = "2026-10-31T10:04:00Z"
        self.assertEqual(self.inspect()["status"], "INCOMPLETE")

    def test_duplicate_cases_not_counted_as_complete(self):
        result = inspect_human_review(self.protocol, [self.case, copy.deepcopy(self.case)])
        self.assertIn("DUPLICATE_CASE", result["cases"][1]["errors"])
        self.assertEqual(result["suppliedCaseCount"], 2)

    def test_invalid_real_case_stays_in_denominator(self):
        self.case["synthetic"] = False
        self.case["labels"] = []
        result = self.inspect()
        self.assertEqual(result["realCaseCount"], 1)
        self.assertEqual(result["realCasesWithCompleteProcessEvidence"], 0)

    def test_unclassified_provenance_fails_closed(self):
        del self.case["synthetic"]
        self.assertIn("PROVENANCE_CLASSIFICATION_REQUIRED", self.inspect()["cases"][0]["errors"])

    def test_bounded_input(self):
        with self.assertRaisesRegex(ValueError, "BOUNDED"):
            inspect_human_review(self.protocol, [self.case] * 2049)

    def test_two_reviewers_can_complete_agreement_without_third(self):
        self.protocol["adjudicator"] = None
        self.assertEqual(self.inspect()["status"], "PROCESS_EVIDENCE_COMPLETE_ONLY")
        self.case["labels"][1]["reviewRequired"] = False
        self.assertIn("INDEPENDENT_ADJUDICATION_REQUIRED", self.inspect()["cases"][0]["errors"])

    def test_reviewer_cannot_adjudicate_their_own_disagreement(self):
        self.protocol["adjudicator"] = "reviewer-a"
        self.assertEqual(self.inspect()["status"], "INCOMPLETE")


if __name__ == "__main__":
    unittest.main()

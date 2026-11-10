import { useEffect, useId, useRef, useState } from "react";
import { Info, LoaderCircle, LockKeyhole } from "lucide-react";
import {
  reviewAction,
  reviewPayload,
  reviewClassificationLabels,
} from "../lib/responsibilityReviewAction";
import { Alert, AlertDescription } from "./responsibility/ui/alert";
import { Button } from "./responsibility/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./responsibility/ui/card";
import { Label } from "./responsibility/ui/label";
import ReviewChoice from "./responsibility/ReviewChoice";
import { Textarea } from "./responsibility/ui/textarea";

export default function ResponsibilityReviewForm({ context, api, onReviewed }) {
  const [decision, setDecision] = useState(""),
    [classification, setClassification] = useState(""),
    [level, setLevel] = useState(""),
    [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [attempted, setAttempted] = useState(false);
  const inFlight = useRef(false),
    active = useRef(true),
    id = useId();
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const action = reviewAction(context);
  if (!action)
    return (
      <section aria-labelledby="human-review-heading">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2
                id="human-review-heading"
                tabIndex={-1}
                className="flex items-start gap-2 text-lg font-medium leading-6"
              >
                <LockKeyhole
                  className="mt-1 size-4 shrink-0 text-ink-muted"
                  aria-hidden="true"
                />
                {context.finalDecision
                  ? "Final decision saved"
                  : "Not ready for a decision"}
              </h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p role="status" className="text-sm leading-6 text-ink-muted">
              {context.finalDecision
                ? "This case is complete. Open Past decisions to see the final outcome."
                : "Required notifications or appeal steps must finish before this case can be reviewed."}
            </p>
          </CardContent>
        </Card>
      </section>
    );
  const decisions = Object.entries(reviewClassificationLabels).filter(
    ([value]) =>
      decision === "UPHOLD"
        ? value === "DRIVER_CAUSED"
        : value !== "DRIVER_CAUSED",
  );
  const invalid = {
    decision: !["UPHOLD", "WAIVE"].includes(decision),
    classification: !decisions.some(([value]) => value === classification),
    level: decision === "UPHOLD" && !["LEVEL_1", "LEVEL_2"].includes(level),
    reason: reason.trim().length < 3 || reason.trim().length > 2000,
  };
  const ids = {
    decision: `decision-${id}`,
    classification: `classification-${id}`,
    level: `level-${id}`,
    reason: `reason-${id}`,
    error: `review-error-${id}`,
    hint: `reason-hint-${id}`,
    levelHint: `level-hint-${id}`,
  };
  const change = (setter) => (value) => {
    setter(value);
    setError("");
    setAttempted(false);
  };
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current) return;
    let body;
    try {
      body = reviewPayload(context, {
        decision,
        classification,
        consequenceLevel: level,
        reason,
      });
    } catch (failure) {
      setAttempted(true);
      setError(failure.message);
      const first = ["decision", "classification", "level", "reason"].find(
        (key) => invalid[key],
      );
      if (first) document.getElementById(ids[first])?.focus();
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.reviewResponsibility(
        context.case.id,
        action,
        body,
      );
      if (result.error) throw new Error(result.error);
      if (active.current) onReviewed();
    } catch (failure) {
      if (active.current) setError(failure.message);
    } finally {
      inFlight.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <section aria-labelledby="human-review-heading">
      <Card className="gap-4 overflow-visible">
        <CardHeader>
          <CardTitle>
            <h2
              id="human-review-heading"
              tabIndex={-1}
              className="text-lg font-medium leading-6"
            >
              {action === "review" ? "Your decision" : "Appeal decision"}
            </h2>
          </CardTitle>
          <CardDescription className="leading-5">
            Choose what should happen and explain why
          </CardDescription>
        </CardHeader>
        <form
          onSubmit={submit}
          noValidate
          aria-busy={busy}
          aria-label={action === "review" ? "Your decision" : "Appeal decision"}
        >
          <CardContent
            className={`grid min-w-0 gap-6 md:grid-cols-2 ${decision === "UPHOLD" ? "xl:grid-cols-3" : ""}`}
          >
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor={ids.decision}>
                Decision{" "}
                <span className="text-ink-muted" aria-hidden="true">
                  *
                </span>
              </Label>
              <ReviewChoice
                id={ids.decision}
                label="Decision"
                name="decision"
                value={decision}
                disabled={busy}
                placeholder="Select a decision"
                options={[["WAIVE", "Take no action"], ["UPHOLD", "Hold driver responsible"]]}
                aria-invalid={attempted && invalid.decision}
                aria-describedby={error ? ids.error : undefined}
                onValueChange={(value) => {
                  setDecision(value);
                  setClassification("");
                  setLevel("");
                  setError("");
                  setAttempted(false);
                }}
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <Label htmlFor={ids.classification}>
                Cause of the issue{" "}
                <span className="text-ink-muted" aria-hidden="true">
                  *
                </span>
              </Label>
              <ReviewChoice
                id={ids.classification}
                label="Cause of the issue"
                name="classification"
                value={classification}
                disabled={busy || !decision}
                onValueChange={change(setClassification)}
                options={decisions}
                placeholder={decision ? "Select the cause" : "Choose a decision first"}
                aria-invalid={attempted && invalid.classification}
                aria-describedby={error ? ids.error : undefined}
              />
            </div>
            {decision === "UPHOLD" && (
              <div className="flex min-w-0 flex-col gap-2">
                <Label htmlFor={ids.level}>
                  Action level{" "}
                  <span className="text-ink-muted" aria-hidden="true">
                    *
                  </span>
                </Label>
                <ReviewChoice
                  id={ids.level}
                  label="Action level"
                  name="consequenceLevel"
                  value={level}
                  disabled={busy}
                  onValueChange={change(setLevel)}
                  options={[["LEVEL_1", "Level 1"], ["LEVEL_2", "Level 2"]]}
                  placeholder="Select an action level"
                  aria-invalid={attempted && invalid.level}
                  aria-describedby={`${ids.levelHint}${error ? " " + ids.error : ""}`}
                />
                <p id={ids.levelHint} className="text-xs leading-5 text-ink-muted">
                  Use the level set by your service policy.
                </p>
              </div>
            )}
            <div className="min-w-0 space-y-2 md:col-span-full">
              <Label htmlFor={ids.reason}>
                Reason for your decision{" "}
                <span className="text-ink-muted" aria-hidden="true">
                  *
                </span>
              </Label>
              <Textarea
                id={ids.reason}
                aria-label="Reason for your decision"
                required
                minLength={3}
                maxLength={2000}
                rows={3}
                disabled={busy}
                value={reason}
                onChange={(event) => change(setReason)(event.target.value)}
                placeholder="Explain what happened and why you chose this decision…"
                aria-invalid={attempted && invalid.reason}
                aria-describedby={`${ids.hint}${error ? " " + ids.error : ""}`}
              />
              <div
                id={ids.hint}
                className="flex flex-wrap justify-between gap-2 text-xs leading-5 text-ink-muted"
              >
                <span>3–2,000 characters</span>
                <span className="tabular-nums">
                  {reason.length.toLocaleString("en-IN")} / 2,000
                </span>
              </div>
            </div>
            {error && (
              <Alert
                id={ids.error}
                className="border-negative/25 bg-negative/5 md:col-span-full"
              >
                <Info
                  className="text-negative dark:text-negative-light"
                  aria-hidden="true"
                />
                <AlertDescription className="text-ink">
                  {error}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="mt-6 flex-col items-stretch gap-3 pt-0 sm:flex-row-reverse sm:items-center sm:justify-between">
            <Button
              type="submit"
              disabled={busy || Object.values(invalid).some(Boolean)}
              className="relative min-h-9 w-fit max-w-full self-end gap-1.5 px-3 py-2 text-sm leading-5 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] sm:shrink-0 sm:self-center"
            >
              {busy ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className="animate-spin motion-reduce:animate-none"
                  />
                  Saving…
                </>
              ) : (
                <>
                  {action === "review" ? "Save decision" : "Save appeal decision"}
                </>
              )}
            </Button>
            <p className="text-xs leading-5 text-ink-muted">
              This saves your review of the records shown here. Required
              notifications and appeal steps still apply.
            </p>
          </CardFooter>
        </form>
      </Card>
    </section>
  );
}

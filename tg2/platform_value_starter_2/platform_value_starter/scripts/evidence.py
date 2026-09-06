"""Small evidence vocabulary shared by reports, datasets and evaluation."""


def label_source(row):
    actor = str(row.get("reviewer_id", "")).lower()
    source = str(row.get("label_source", row.get("review_kind", ""))).lower()
    if source == "programmatic_gold":
        return source  # Still needs validator_ref and approval to be trusted.
    if actor.startswith("auto:") or source.startswith("auto:"):
        return "model" if "model" in source or "model" in actor else "heuristic"
    if source in {"human", "heuristic", "model", "unknown"}:
        return source
    # Backward compatibility only; new records should set label_source explicitly.
    return "human" if actor and not source else "unknown"


def trusted_target(row):
    if row.get("review_status") != "approved":
        return False
    kind = label_source(row)
    return (kind == "human" and bool(row.get("reviewer_id"))) or (kind == "programmatic_gold" and bool(row.get("validator_ref")))

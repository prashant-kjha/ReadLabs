"""Billing kill-switch Cloud Function (2nd gen, Pub/Sub-triggered).

A Cloud Billing budget publishes spend updates to the `billing-killswitch`
Pub/Sub topic. When reported cost reaches the budget amount, this function
DISABLES billing on the project by detaching its billing account — which stops
all billable GCP services (Cloud Run included). This is a hard cost cap, not a
throttle: tripping it takes the backend offline until billing is re-attached
manually.
"""
import base64
import json
import logging
import os

import functions_framework
from googleapiclient import discovery

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("billing-killswitch")

PROJECT_ID = os.environ["KILLSWITCH_PROJECT_ID"]
PROJECT_NAME = f"projects/{PROJECT_ID}"


@functions_framework.cloud_event
def killswitch(cloud_event):
    message = cloud_event.data.get("message", {})
    raw = base64.b64decode(message["data"]).decode("utf-8") if message.get("data") else "{}"
    budget = json.loads(raw)

    cost = float(budget.get("costAmount", 0) or 0)
    amount = float(budget.get("budgetAmount", 0) or 0)
    # GCP's guaranteed contract for threshold-rule notifications: this field is
    # set to the fraction of the budget that has been exceeded (1.0 == 100%).
    threshold = float(budget.get("alertThresholdExceeded", 0) or 0)
    log.info(
        "Budget notification: cost=%.4f budget=%.4f threshold=%.4f",
        cost, amount, threshold,
    )

    # Trip primarily on the guaranteed threshold field; fall back to comparing
    # reported cost against the budget amount when it isn't present.
    tripped = threshold >= 1.0 or (amount > 0 and cost >= amount)
    if not tripped:
        log.info("Under budget — no action.")
        return

    billing = discovery.build("cloudbilling", "v1", cache_discovery=False)
    info = billing.projects().getBillingInfo(name=PROJECT_NAME).execute()
    if not info.get("billingEnabled"):
        log.info("Billing already disabled — nothing to do.")
        return

    log.warning(
        "COST %.2f >= BUDGET %.2f — disabling billing on %s", cost, amount, PROJECT_NAME
    )
    try:
        billing.projects().updateBillingInfo(
            name=PROJECT_NAME, body={"billingAccountName": ""}
        ).execute()
    except Exception:
        # Log at ERROR so the 'severity>=ERROR' alert fires, then re-raise so
        # Pub/Sub redelivers and we retry disabling billing.
        log.exception("Failed to disable billing on %s — will retry.", PROJECT_NAME)
        raise
    log.warning("Billing DISABLED for %s. Re-attach manually to restore service.", PROJECT_NAME)

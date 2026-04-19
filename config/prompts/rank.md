# Ranking task

You are screening a batch of recent stories for possible inclusion in the next
issue of Tech Spark.

For **each** story in the batch, return one entry via the `submit_rankings`
tool with:

- `id` — the story id as given in the input (do not invent ids).
- `score_0_10` — integer. Use the scale defined in the org context:
  8-10 highly relevant, 5-7 moderate, 0-4 noise.
- `category` — one of: `energy_utilities`, `ai_ml`, `cloud_infra`, `cyber`,
  `data_platform`, `regulation_policy`, `customer_retail`, `ot_industrial`,
  `broader_tech`. Pick the single best fit.
- `rationale` — one short sentence, no more than ~20 words, explaining the
  score. Be specific ("Ofgem RIIO consultation on network resilience") not
  generic ("interesting for utilities").

Rules:

- Return an entry for **every** story in the batch, in any order.
- Do not invent stories or ids that were not supplied.
- Press releases and vendor puff without a product or policy hook score ≤ 4.
- Funding rounds with no product detail score ≤ 4.
- Stories that duplicate something already ranked this batch — score the
  stronger source, demote the weaker with a note in `rationale`.

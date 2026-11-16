// An unknown database/transport outcome must preserve the original order retry.
export function commerceFailureStatus(code?: string): 409 | 503 {
  return [
    "P0001",
    "42501",
    "23503",
    "23505",
    "23514",
    "22023",
    "22P02",
    "22003",
    "40001",
  ].includes(code ?? "")
    ? 409
    : 503;
}

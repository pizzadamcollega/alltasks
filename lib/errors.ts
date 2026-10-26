/**
 * Postgres raises Turkish exception messages already (CLAUDE.md golden rule 9).
 * Surface those directly for the error codes a user action can realistically
 * trigger; anything else gets a generic toast and the raw error goes to the
 * console for debugging (never log wage/payment/password values here).
 */
const SURFACEABLE_CODES = new Set(["42501", "23514", "23505", "P0002"]);

const GENERIC_MESSAGE = "Bir hata oluştu, tekrar dene.";

function hasCode(error: unknown): error is { code: string; message: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  );
}

export function toErrorMessage(error: unknown): string {
  if (hasCode(error) && SURFACEABLE_CODES.has(error.code)) {
    return error.message;
  }
  console.error(error);
  return GENERIC_MESSAGE;
}

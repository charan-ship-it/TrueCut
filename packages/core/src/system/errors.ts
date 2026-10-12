// Errors people can act on. Anything thrown from a pipeline ends up in the chat or a job's error, so
// these messages are written for the person using TrueCut, not for a developer.
export class UserFacingError extends Error {
  constructor(message: string, public code: string, public retryable = false) { super(message); }
}
export class BudgetExceeded extends UserFacingError {
  constructor(spent: number, budget: number) {
    super(`This workspace has used $${spent.toFixed(2)} of its $${budget.toFixed(2)} monthly AI budget. An owner can raise it in Settings → Models & budget.`, 'budget_exceeded');
  }
}
export class MissingKey extends UserFacingError {
  constructor(provider: 'anthropic' | 'elevenlabs', what: string) {
    super(`${what} needs ${provider === 'anthropic' ? 'an Anthropic (Claude)' : 'an ElevenLabs'} API key. Add one in Settings → API keys.`, `missing_${provider}_key`);
  }
}

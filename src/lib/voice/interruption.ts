// ============================================================
// Turn & Interruption Coordinator (Barge-In Protection)
// Prevents race conditions, manages turnId/requestId lifecycles,
// and enforces immediate cancellation of stale audio & LLM streams.
// ============================================================

export class TurnCoordinator {
  private currentSessionId: string;
  private currentTurnId: string = '';
  private currentAbortController: AbortController | null = null;
  private isInterrupted = false;

  constructor(sessionId: string = `session-${Date.now()}`) {
    this.currentSessionId = sessionId;
  }

  getSessionId(): string {
    return this.currentSessionId;
  }

  getActiveTurnId(): string {
    return this.currentTurnId;
  }

  /**
   * Start a new turn. Automatically cancels any active turn in flight.
   */
  startNewTurn(): { turnId: string; signal: AbortSignal } {
    this.cancelActiveTurn('new_turn_started');

    this.currentTurnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.currentAbortController = new AbortController();
    this.isInterrupted = false;

    return {
      turnId: this.currentTurnId,
      signal: this.currentAbortController.signal,
    };
  }

  /**
   * Check if a turnId is still the active turn.
   */
  isTurnActive(turnId: string): boolean {
    return this.currentTurnId === turnId && !this.isInterrupted;
  }

  /**
   * Handle user barge-in / interruption.
   */
  handleBargeIn(): void {
    this.isInterrupted = true;
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * Cancel the active turn with a specific reason.
   */
  cancelActiveTurn(_reason?: string): void {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  reset(): void {
    this.cancelActiveTurn('reset');
    this.currentTurnId = '';
    this.isInterrupted = false;
  }
}

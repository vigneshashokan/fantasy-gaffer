// The typed analytics event catalog. `track` is generic over this map, so a
// typo or a wrong payload fails `tsc` (jest does not type-check). Deferred
// events are declared but commented — they need surfaces that don't exist yet.

export type DecisionType = 'captain' | 'transfer' | 'chip' | 'bench';

export interface EventMap {
  // --- Acquisition / activation funnel ---
  sign_in: { provider: string };
  sign_up: { provider: string };
  squad_imported: { via: 'team_id' };
  screen_viewed: { screen: string };

  // --- Decision-layer engagement (the "aha" signal) ---
  decision_viewed: { type: DecisionType };
  suggestion_expanded: { type: DecisionType; rank: number };
  pick_row_opened: { player_id: string };
  transfer_target_opened: { player_id: string };

  // --- Deferred: NOT wired in this slice ---
  // Needs the paywall surface (#40, Phase 5):
  //   paywall_impression: { surface: string };
  //   go_premium_tapped: { surface: string };
  //   subscription_purchased: { tier: string };
  // Fast-follow once the funnel pipeline is proven:
  //   decision_card_dwell: { type: DecisionType; ms: number };
}

export type EventName = keyof EventMap;

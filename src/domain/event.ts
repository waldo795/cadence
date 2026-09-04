/** A JSON-shaped value — used for event payloads without falling back to `any`. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface CustomerEvent {
  id: string;
  name: string;
  profileId: string;
  occurredAt: string;
  payload: Record<string, JsonValue>;
}

/** A reusable event shape offered in the simulator's event picker. */
export interface EventTemplate {
  name: string;
  label: string;
  description: string;
  samplePayload: Record<string, JsonValue>;
}

export function eventContext(event: CustomerEvent): Record<string, JsonValue> {
  return {
    name: event.name,
    occurredAt: event.occurredAt,
    ...event.payload,
  };
}

import {
  resolveCap,
  type CapEvaluation,
  type ContactPolicy,
} from "@/domain/governance";
import type { Channel } from "@/domain/journey";
import type { Profile } from "@/domain/profile";
import type { ContactPolicyRepository, FrequencyGovernor } from "./ports";
import { DOCUMENT_KEYS, readDoc, writeDoc } from "./storage";

/**
 * Air traffic control lives here rather than inside any journey, so a single
 * policy change protects every journey at once. Journeys ask the governor what
 * a profile's cap is; they never define it themselves.
 */

let cached: ContactPolicy | null = null;

function load(): ContactPolicy {
  if (cached) return cached;
  cached = readDoc<ContactPolicy>(DOCUMENT_KEYS.contactPolicy) ?? {
    ceilingMaxMessages: 7,
    ceilingWindowDays: 7,
    rules: [],
  };
  return cached;
}

export function getContactPolicy(): ContactPolicy {
  return load();
}

export function saveContactPolicy(policy: ContactPolicy): void {
  cached = policy;
  writeDoc(DOCUMENT_KEYS.contactPolicy, policy);
}

export function resetContactPolicy(): void {
  cached = null;
  load();
}

class LocalContactPolicyRepository implements ContactPolicyRepository {
  async get(): Promise<ContactPolicy> {
    return load();
  }

  async save(policy: ContactPolicy): Promise<void> {
    saveContactPolicy(policy);
  }
}

class WorkspaceFrequencyGovernor implements FrequencyGovernor {
  resolveCap(profile: Profile, channel: Channel): CapEvaluation {
    return resolveCap(load(), profile, channel);
  }
}

/** Evaluates against an in-memory policy — used by the rule editor's preview. */
export class DraftFrequencyGovernor implements FrequencyGovernor {
  constructor(private readonly policy: ContactPolicy) {}

  resolveCap(profile: Profile, channel: Channel): CapEvaluation {
    return resolveCap(this.policy, profile, channel);
  }
}

export const contactPolicyRepository: ContactPolicyRepository =
  new LocalContactPolicyRepository();
export const frequencyGovernor: FrequencyGovernor = new WorkspaceFrequencyGovernor();

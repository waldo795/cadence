import type { Channel } from "@/domain/journey";
import type { ChannelProvider, DeliveryResult, OutboundMessage } from "./ports";

/**
 * Records what would have been sent and returns `simulated`. Swapping in a real
 * adapter means implementing `ChannelProvider` and registering it below — no
 * caller changes.
 */
class SimulatingProvider implements ChannelProvider {
  constructor(
    readonly channel: Channel,
    readonly providerName: string,
  ) {}

  async send(message: OutboundMessage): Promise<DeliveryResult> {
    return {
      status: "simulated",
      providerId: `sim_${Math.random().toString(36).slice(2, 10)}`,
      detail: `${this.providerName} would deliver "${message.template}" to ${message.profileId}.`,
    };
  }
}

export const channelProviders: Record<Channel, ChannelProvider> = {
  email: new SimulatingProvider("email", "Email provider (simulated)"),
  push: new SimulatingProvider("push", "Push provider (simulated)"),
  sms: new SimulatingProvider("sms", "SMS provider (simulated)"),
};

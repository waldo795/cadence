import { eventContext } from "@/domain/event";
import { evaluateExclusion } from "@/domain/exclusion";
import {
  assignProfile,
  bucketFor,
  TOTAL_BUCKETS,
  type ExperimentAssignment,
} from "@/domain/experiment";
import {
  describeCap,
  messagesInWindow,
  type CapEvaluation,
} from "@/domain/governance";
import type { MessageRecord } from "@/domain/message";
import {
  blockTemplateStrings,
  blocksFor,
  blocksToText,
  mapBlockText,
} from "@/domain/email-content";
import { frequencyGovernor } from "@/services/governance";
import {
  describeCondition,
  evaluateCondition,
  interpolate,
  unresolvedPlaceholders,
  type EvaluationContext,
} from "@/domain/expression";
import {
  findEntryNode,
  getNodeOutputs,
  type FrequencyCheckConfig,
  type JourneyDefinition,
  type JourneyEdge,
  type JourneyNode,
} from "@/domain/journey";
import type { CustomerEvent } from "@/domain/event";
import { profileContext, type Profile } from "@/domain/profile";
import { addDuration, describeDuration, resolveWaitUntil } from "@/domain/time";
import { policyEvaluator } from "@/services/policy";
import type {
  ExecutionRequest,
  FrequencyGovernor,
  JourneyExecutor,
} from "@/services/ports";
import type {
  RenderedMessage,
  RunStatus,
  SimulationRun,
  SimulationStep,
  StepOutcome,
} from "./types";

/** Guards against cycles authored on the canvas. */
const MAX_STEPS = 200;

/** Guards against experiment forks that route into one another. */
const MAX_DELEGATION_DEPTH = 3;

/**
 * Splices a fork's trace onto the entry journey's.
 *
 * The result reads as one continuous run — entry journey, handoff, then the
 * fork — while every step keeps its own `journeyId` so the canvas can highlight
 * only the journey it is displaying.
 */
function mergeDelegatedRun(args: {
  journey: JourneyDefinition;
  profile: Profile;
  event: CustomerEvent;
  steps: SimulationStep[];
  assignment: ExperimentAssignment | undefined;
  fork: JourneyDefinition;
  forked: SimulationRun;
}): SimulationRun {
  const { journey, profile, event, steps, assignment, fork, forked } = args;

  const combined = [...steps, ...forked.steps].map((step, index) => ({
    ...step,
    id: `step_${index}`,
    index,
  }));

  return {
    journeyId: journey.id,
    journeyName: journey.name,
    profileId: profile.id,
    profileName: `${profile.firstName} ${profile.lastName}`,
    eventName: event.name,
    assignment,
    delegatedTo: {
      journeyId: fork.id,
      journeyKey: fork.key,
      journeyName: fork.name,
      version: fork.version,
    },
    startedAt: event.occurredAt,
    endedAt: forked.endedAt,
    status: forked.status,
    steps: combined,
    // Node and edge ids are only unique within a journey, so the overlay sets
    // belong to the fork — the canvas filters them by journey anyway.
    visitedNodeIds: forked.visitedNodeIds,
    traversedEdgeIds: forked.traversedEdgeIds,
    skippedEdgeIds: forked.skippedEdgeIds,
    messages: forked.messages,
    withheldMessages: forked.withheldMessages,
    summary: `Routed to "${assignment?.variantName}" — ${forked.summary}`,
  };
}

interface StepDraft {
  node: JourneyNode;
  title: string;
  detail?: string;
  outcome: StepOutcome;
  explanation?: string;
  takenHandle?: string;
  message?: RenderedMessage;
  policy?: SimulationStep["policy"];
  cap?: CapEvaluation;
}

/**
 * Walks the journey graph against a profile and event using a virtual clock.
 *
 * The whole trace is produced eagerly. That is what lets the UI offer Step,
 * Continue and Restart for free, and lets a 30-day journey resolve instantly —
 * waits advance `virtualTime` rather than any real timer.
 */
export class SimulationEngine implements JourneyExecutor {
  run(request: ExecutionRequest): SimulationRun {
    const { journey, profile, event, directory } = request;
    const governor = request.governor ?? frequencyGovernor;

    const startTime = new Date(event.occurredAt);
    const context: EvaluationContext = {
      profile: profileContext(profile, startTime),
      event: eventContext(event),
      journey: { id: journey.id, key: journey.key, name: journey.name, version: journey.version },
    };

    /*
     * The runtime experiment lookup. Journeys are not edited to be put under
     * test: on entry we ask whether a live experiment targets this journey, and
     * route accordingly. Assignment is a pure function of (experiment id,
     * profile id), so a profile re-entering resolves to the same variant every
     * time — including after the journey has been rebuilt.
     */
    const resuming = Boolean(request.startNodeId);
    const waitMode = request.waitMode ?? "fast_forward";

    // On resume the assignment is replayed from the instance rather than
    // recomputed. It would in fact hash to the same variant, but reading it
    // back means a reallocation edited after entry cannot move someone who is
    // already mid-journey.
    const experiment = resuming
      ? null
      : (request.experiments?.findLiveForJourney(journey.key) ?? null);
    const assignment =
      request.assignment ?? (experiment ? assignProfile(experiment, profile.id) : undefined);
    const heldOut = assignment?.treatment.kind === "holdout";

    let suspended: { resumeNodeId: string; wakeAt: string } | undefined;

    const steps: SimulationStep[] = [];
    const visitedNodeIds: string[] = [];
    const traversedEdgeIds: string[] = [];
    const messages: RenderedMessage[] = [];
    const withheldMessages: RenderedMessage[] = [];

    // Prior sends plus anything this run simulates, so a later exclusion node
    // in the same journey sees messages sent earlier in the same journey.
    const history: MessageRecord[] = [...(request.messageHistory ?? [])];

    let virtualTime = new Date(event.occurredAt);
    let sentDuringRun = 0;
    let status: RunStatus = "completed";
    let summary = "";

    const push = (draft: StepDraft, edge?: JourneyEdge) => {
      const step: SimulationStep = {
        id: `step_${steps.length}`,
        index: steps.length,
        journeyId: journey.id,
        journeyName: journey.name,
        nodeId: draft.node.id,
        nodeKind: draft.node.kind,
        nodeLabel: draft.node.label,
        virtualTime: virtualTime.toISOString(),
        title: draft.title,
        detail: draft.detail,
        outcome: draft.outcome,
        explanation: draft.explanation,
        takenHandle: draft.takenHandle,
        traversedEdgeId: edge?.id,
        message: draft.message,
        policy: draft.policy,
        cap: draft.cap,
      };
      steps.push(step);
      return step;
    };

    const nodesById = new Map(journey.nodes.map((node) => [node.id, node]));

    // Resuming starts at the stored node; a fresh run starts at the entry.
    const entry = request.startNodeId
      ? nodesById.get(request.startNodeId)
      : findEntryNode(journey);

    /*
     * Records the wait and stops the walk.
     *
     * Resumption points at the node *after* the wait, not the wait itself:
     * once the clock reaches `wakeAt` the wait is finished, and resuming onto
     * it would re-arm the same delay every time.
     */
    const suspendHere = (
      node: JourneyNode,
      wakeAt: Date,
      detail: string,
    ): { resumeNodeId: string; wakeAt: string } | undefined => {
      const onward = journey.edges.find(
        (edge) => edge.source === node.id && edge.sourceHandle === "out",
      );

      push({
        node,
        title: "Waiting",
        detail,
        outcome: "WAITING",
        explanation: onward
          ? `Paused here until ${wakeAt.toISOString()}.`
          : `Reached ${wakeAt.toISOString()} with nothing connected after this wait, so the journey ends here.`,
      });

      // A wait with no outgoing edge is the end of the path. Suspending would
      // park the instance forever waiting to resume into nothing.
      if (!onward) return undefined;

      visitedNodeIds.push(node.id);
      return { resumeNodeId: onward.target, wakeAt: wakeAt.toISOString() };
    };

    if (!entry) {
      return {
        journeyId: journey.id,
        journeyName: journey.name,
        profileId: profile.id,
        profileName: `${profile.firstName} ${profile.lastName}`,
        eventName: event.name,
        startedAt: virtualTime.toISOString(),
        endedAt: virtualTime.toISOString(),
        status: "error",
        assignment,
        steps: [],
        visitedNodeIds: [],
        traversedEdgeIds: [],
        skippedEdgeIds: [],
        messages: [],
        withheldMessages: [],
        summary: request.startNodeId
          ? `Cannot resume: node "${request.startNodeId}" no longer exists in this version of the journey.`
          : "This journey has no entry node, so there is nothing to simulate.",
      };
    }
    const edgeFor = (nodeId: string, handle: string): JourneyEdge | undefined =>
      journey.edges.find(
        (edge) => edge.source === nodeId && edge.sourceHandle === handle,
      );

    let current: JourneyNode | undefined = entry;
    let guard = 0;

    while (current && guard < MAX_STEPS && !suspended) {
      guard += 1;
      const node: JourneyNode = current;
      visitedNodeIds.push(node.id);

      /** Resolves the next node, records the traversed edge, and pushes the step. */
      const advance = (
        draft: StepDraft,
        handle: string,
      ): JourneyNode | undefined => {
        const edge = edgeFor(node.id, handle);
        push({ ...draft, takenHandle: handle }, edge);
        if (!edge) return undefined;
        traversedEdgeIds.push(edge.id);
        return nodesById.get(edge.target);
      };

      switch (node.kind) {
        case "event_trigger": {
          push({
            node,
            title: "Event received",
            detail: node.config.eventName,
            outcome: "ENTERED",
            explanation: `${profile.firstName} entered "${journey.name}" (v${journey.version}) as ${profile.customerId}.`,
          });

          if (assignment) {
            // Recorded before anything else happens, so the variant is visible
            // ahead of any action the journey might take.
            push({
              node,
              title: "Experiment lookup",
              detail: `${assignment.experimentName} · bucket ${assignment.bucket}/${TOTAL_BUCKETS}`,
              outcome: "MATCHED",
              explanation: `Assigned to "${assignment.variantName}". ${assignment.reason} Derived from the profile id, so re-entry always resolves the same way.`,
            });
          }

          const treatment = assignment?.treatment;

          if (treatment?.kind === "holdout") {
            push({
              node,
              title: "Journey exited",
              detail: `Executed under ${assignment!.experimentName}`,
              outcome: "WITHHELD",
              explanation: `${profile.firstName} is in the "${assignment!.variantName}" holdout, so no experience runs. The entry and exit are still recorded against this journey.`,
            });
            status = "exited";
            summary = `Held out of "${journey.name}" by ${assignment!.experimentName} — entry and exit logged, nothing sent.`;
            current = undefined;
            break;
          }

          if (treatment?.kind === "journey") {
            const fork = request.resolveJourney?.(treatment.journeyKey) ?? null;
            const depth = request.delegationDepth ?? 0;

            if (!fork) {
              push({
                node,
                title: "Experiment routing failed",
                detail: treatment.journeyKey,
                outcome: "ERROR",
                explanation: `The variant points at journey "${treatment.journeyKey}", which could not be resolved. Falling back to the original journey would silently invalidate the test, so the run stops here.`,
              });
              status = "error";
              summary = `Variant "${assignment!.variantName}" references a missing journey.`;
              current = undefined;
              break;
            }

            if (depth >= MAX_DELEGATION_DEPTH) {
              push({
                node,
                title: "Experiment routing stopped",
                detail: treatment.journeyKey,
                outcome: "ERROR",
                explanation: `Stopped after ${MAX_DELEGATION_DEPTH} redirections — the experiment forks appear to loop.`,
              });
              status = "error";
              summary = "Experiment forks loop.";
              current = undefined;
              break;
            }

            // The original journey logs an exit stamped with the experiment,
            // then the fork's trace is appended so the whole experience reads
            // as one run.
            push({
              node,
              title: "Routed to variant",
              detail: `${fork.name} v${fork.version}`,
              outcome: "ROUTED",
              explanation: `Executed under ${assignment!.experimentName} / "${assignment!.variantName}". ${profile.firstName} runs the fork instead of this journey.`,
            });
            push({
              node,
              title: "Journey exited",
              detail: `Executed under ${assignment!.experimentName}`,
              outcome: "EXITED",
              explanation: `Entry and exit are recorded against "${journey.name}" so its participation history stays complete, but the experience ran in the fork.`,
            });

            const forked = this.run({
              ...request,
              journey: fork,
              delegationDepth: depth + 1,
            });

            return mergeDelegatedRun({
              journey,
              profile,
              event,
              steps,
              assignment,
              fork,
              forked,
            });
          }

          const edge = edgeFor(node.id, "out");
          if (edge) {
            traversedEdgeIds.push(edge.id);
            steps[steps.length - 1].traversedEdgeId = edge.id;
            steps[steps.length - 1].takenHandle = "out";
            current = nodesById.get(edge.target);
          } else {
            current = undefined;
          }
          break;
        }

        case "audience_entry": {
          current = advance(
            {
              node,
              title: "Audience entry",
              detail: node.config.audienceName,
              outcome: "ENTERED",
              explanation: `${profile.firstName} qualified for the "${node.config.audienceName}" audience.`,
            },
            "out",
          );
          break;
        }

        case "condition": {
          const { field, operator, value } = node.config;
          const result = evaluateCondition(context, field, operator, value);
          const handle = result.passed ? "true" : "false";
          current = advance(
            {
              node,
              title: "Condition evaluated",
              detail: describeCondition(field, operator, value),
              outcome: result.passed ? "TRUE" : "FALSE",
              explanation: result.explanation,
            },
            handle,
          );
          break;
        }

        case "branch": {
          const matched = node.config.options.find(
            (option) =>
              evaluateCondition(
                context,
                option.field,
                option.operator,
                option.value,
              ).passed,
          );
          const handle = matched?.id ?? "default";
          current = advance(
            {
              node,
              title: "Branch evaluated",
              detail: matched
                ? describeCondition(
                    matched.field,
                    matched.operator,
                    matched.value,
                  )
                : "No branch matched",
              outcome: matched ? "MATCHED" : "FALSE",
              explanation: matched
                ? `Matched branch "${matched.label}".`
                : "No branch condition matched — routed to the default path.",
            },
            handle,
          );
          break;
        }

        case "percentage_split": {
          // Bucketed on the profile, not on a run-level RNG: a profile must land
          // in the same split every time they pass through this node.
          const roll = (bucketFor(`${journey.key}:${node.id}:${profile.id}`) / TOTAL_BUCKETS) * 100;
          let cumulative = 0;
          let chosen = node.config.options[0];
          for (const option of node.config.options) {
            cumulative += option.percentage;
            if (roll < cumulative) {
              chosen = option;
              break;
            }
          }
          current = advance(
            {
              node,
              title: "Split allocated",
              detail: `${chosen?.label ?? "—"} (${chosen?.percentage ?? 0}%)`,
              outcome: "MATCHED",
              explanation: `Stable allocation for this profile put them at ${roll.toFixed(1)}%, landing in "${chosen?.label}". Repeat entries resolve identically.`,
            },
            chosen?.id ?? "out",
          );
          break;
        }

        case "wait": {
          const before = virtualTime;
          const wakeAt = addDuration(before, node.config.duration, node.config.unit);
          const described = describeDuration(node.config.duration, node.config.unit);

          if (waitMode === "suspend") {
            suspended = suspendHere(node, wakeAt, described);
            break;
          }

          virtualTime = wakeAt;
          current = advance(
            {
              node,
              title: "Wait elapsed",
              detail: described,
              outcome: "WAITING",
              explanation: `Virtual clock advanced from ${before.toISOString()} to ${virtualTime.toISOString()}.`,
            },
            "out",
          );
          break;
        }

        case "wait_until": {
          const resolution = resolveWaitUntil(
            node.config.expression,
            context,
            virtualTime,
          );
          if (!resolution.wakeAt) {
            push({
              node,
              title: "Wait scheduled",
              detail: node.config.expression,
              outcome: "ERROR",
              explanation: resolution.explanation,
            });
            status = "error";
            summary = `The journey stopped because ${resolution.explanation.toLowerCase()}`;
            current = undefined;
            break;
          }
          const before = virtualTime;

          if (waitMode === "suspend") {
            // A wake time already in the past needs no suspension — fall
            // straight through, or a backdated "48 hours before" would park
            // the instance forever instead of catching up.
            if (resolution.wakeAt.getTime() > before.getTime()) {
              suspended = suspendHere(node, resolution.wakeAt, node.config.expression);
              break;
            }
            current = advance(
              {
                node,
                title: "Wait already passed",
                detail: node.config.expression,
                outcome: "WAITING",
                explanation: `${resolution.explanation}. That moment has already passed, so the journey continues immediately.`,
              },
              "out",
            );
            break;
          }

          if (resolution.wakeAt.getTime() > virtualTime.getTime()) {
            virtualTime = resolution.wakeAt;
          }
          current = advance(
            {
              node,
              title: "Wait scheduled",
              detail: node.config.expression,
              outcome: "WAITING",
              explanation: `${resolution.explanation}. Woke at ${virtualTime.toISOString()} (was ${before.toISOString()}).`,
            },
            "out",
          );
          break;
        }

        case "consent_check": {
          // Holdback is deliberately *not* applied here. A control profile is
          // still contactable and must walk the same path, so the counterfactual
          // is comparable; only the send itself is withheld.
          const decision = policyEvaluator.evaluate({
            profile,
            channel: node.config.channel,
            purpose: node.config.purpose,
            messagesSentInWindow: 0,
          });
          const handle = decision.allowed ? "pass" : "fail";
          const next = advance(
            {
              node,
              title: "Consent evaluated",
              detail: `${node.config.purpose} · ${node.config.channel}`,
              outcome: decision.allowed ? "PASS" : "BLOCKED",
              explanation: decision.reason,
              policy: {
                code: decision.code,
                allowed: decision.allowed,
                reason: decision.reason,
              },
            },
            handle,
          );
          if (!decision.allowed && !next) {
            status = "blocked";
            summary = decision.reason;
          }
          current = next;
          break;
        }

        case "frequency_check": {
          const cap = resolveNodeCap(node.config, governor, profile);
          const used = messagesInWindow(profile, cap.windowDays) + sentDuringRun;
          const withinCap = used < cap.maxMessages;
          const handle = withinCap ? "pass" : "blocked";
          const reason = withinCap
            ? `${used}/${describeCap(cap.maxMessages, cap.windowDays)} used. ${cap.summary}`
            : `Contact cap reached — ${used}/${describeCap(cap.maxMessages, cap.windowDays)}. ${cap.summary}`;

          const next = advance(
            {
              node,
              title: "Contact cap evaluated",
              detail:
                node.config.mode === "governed"
                  ? `${cap.sourceName} · ${describeCap(cap.maxMessages, cap.windowDays)}`
                  : `Local ${describeCap(cap.maxMessages, cap.windowDays)}`,
              outcome: withinCap ? "PASS" : "BLOCKED",
              explanation: reason,
              policy: {
                code: withinCap ? "ALLOWED" : "FREQUENCY_CAP",
                allowed: withinCap,
                reason,
              },
              cap,
            },
            handle,
          );
          if (!withinCap && !next) {
            status = "blocked";
            summary = reason;
          }
          current = next;
          break;
        }

        case "exclusion_check": {
          const reference = directory?.resolve(node.config.journeyKey) ?? null;
          const result = evaluateExclusion(node.config, history, virtualTime, reference);
          const handle = result.excluded ? "excluded" : "clear";

          const next = advance(
            {
              node,
              title: "Exclusion evaluated",
              detail:
                node.config.scope === "message"
                  ? `${node.config.messageKey} · ${node.config.withinDays}d`
                  : `${node.config.journeyKey} · ${node.config.withinDays}d`,
              outcome: result.excluded ? "EXCLUDED" : "CLEAR",
              // Naming the resolved version proves the reference followed the
              // lineage key rather than pointing at a stale build.
              explanation: reference
                ? `${result.explanation} Reference "${node.config.journeyKey}" resolved to ${reference.name} v${reference.version} (${reference.status}).`
                : result.explanation,
              policy: result.excluded
                ? { code: "EXCLUDED", allowed: false, reason: result.explanation }
                : undefined,
            },
            handle,
          );
          if (result.excluded && !next) {
            status = "blocked";
            summary = result.explanation;
          }
          current = next;
          break;
        }

        case "send_email":
        case "send_push": {
          const channel = node.kind === "send_email" ? "email" : "push";
          const subjectTemplate =
            node.kind === "send_email"
              ? node.config.subject
              : node.config.title;
          /*
           * Email bodies are blocks; push bodies are still a string. Going
           * through `blocksFor` means a send node authored before the editor
           * existed renders exactly as it always did, with its paragraphs
           * recovered from the blank lines they were already written with.
           */
          const emailBlocks =
            node.kind === "send_email" ? blocksFor(node.config) : null;
          const bodyTemplate = emailBlocks
            ? blocksToText(emailBlocks)
            : node.config.body;

          const cap = governor.resolveCap(profile, channel);
          const decision = policyEvaluator.evaluate({
            profile,
            channel,
            purpose: "Marketing",
            messagesSentInWindow: messagesInWindow(profile, cap.windowDays) + sentDuringRun,
            cap,
            heldOut,
          });

          const message: RenderedMessage = {
            channel,
            template: node.config.template,
            subjectTemplate,
            subjectRendered: interpolate(subjectTemplate, context),
            bodyTemplate,
            bodyRendered: interpolate(bodyTemplate, context),
            unresolved: [
              ...new Set([
                ...unresolvedPlaceholders(subjectTemplate, context),
                // Every authored string, not just the body text: a merge
                // field in a button's link fails just as loudly.
                ...(emailBlocks
                  ? blockTemplateStrings(emailBlocks).flatMap((value) =>
                      unresolvedPlaceholders(value, context),
                    )
                  : unresolvedPlaceholders(bodyTemplate, context)),
              ]),
            ],
            ...(emailBlocks
              ? {
                  blocks: mapBlockText(emailBlocks, (value) =>
                    interpolate(value, context),
                  ),
                  preheader: node.kind === "send_email" && node.config.preheader
                    ? interpolate(node.config.preheader, context)
                    : undefined,
                }
              : {}),
          };

          if (!decision.allowed) {
            const withheldByHoldout = decision.code === "CONTROL_HOLDBACK";
            if (withheldByHoldout) withheldMessages.push(message);

            // The action is skipped but the journey continues — an unreachable
            // or held-out profile should still fall through to later steps so
            // the two groups traverse comparable paths.
            current = advance(
              {
                node,
                title: node.kind === "send_email" ? "Email action" : "Push action",
                detail: node.config.messageKey,
                outcome: withheldByHoldout ? "WITHHELD" : "BLOCKED",
                explanation: decision.reason,
                message,
                policy: { code: decision.code, allowed: false, reason: decision.reason },
                cap,
              },
              "out",
            );
            break;
          }

          sentDuringRun += 1;
          messages.push(message);
          // Appended so a later exclusion node in this same journey sees it.
          history.push({
            id: `sim_msg_${steps.length}`,
            profileId: profile.id,
            channel,
            template: node.config.template,
            messageKey: node.config.messageKey,
            subject: message.subjectRendered,
            body: message.bodyRendered,
            status: "simulated",
            sentAt: virtualTime.toISOString(),
            journeyId: journey.id,
            journeyKey: journey.key,
            journeyName: journey.name,
          });

          current = advance(
            {
              node,
              title: node.kind === "send_email" ? "Email action" : "Push action",
              detail: node.config.messageKey,
              outcome: "SIMULATED",
              explanation: `No message was actually sent. Rendered for ${profile.email}.`,
              message,
              policy: { code: decision.code, allowed: true, reason: decision.reason },
              cap,
            },
            "out",
          );
          break;
        }

        case "webhook": {
          current = advance(
            {
              node,
              title: "Webhook called",
              detail: `${node.config.method} ${node.config.url}`,
              outcome: "CALLED",
              explanation: "No HTTP request was made — the call is simulated.",
            },
            "out",
          );
          break;
        }

        case "update_profile": {
          const rendered = interpolate(node.config.value, context);
          current = advance(
            {
              node,
              title: "Profile updated",
              detail: `${node.config.attribute} = ${rendered}`,
              outcome: "UPDATED",
              explanation:
                "The write is simulated and does not persist to the profile store.",
            },
            "out",
          );
          break;
        }

        case "exit": {
          push({
            node,
            title: "Journey exited",
            detail: node.config.reason || "Exit",
            outcome: "EXITED",
            explanation: `${profile.firstName} left the journey after ${steps.length + 1} steps.`,
          });
          status = "exited";
          summary = node.config.reason
            ? `Exited: ${node.config.reason}`
            : `${profile.firstName} reached an Exit node.`;
          current = undefined;
          break;
        }
      }

      // A node with no outgoing edge ends the run implicitly.
      if (
        current === undefined &&
        status === "completed" &&
        node.kind !== "exit"
      ) {
        summary = `The path ended at "${node.label}" — no outgoing connection from that outlet.`;
      }
    }

    if (guard >= MAX_STEPS) {
      status = "error";
      summary = `Stopped after ${MAX_STEPS} steps — the journey appears to contain a loop.`;
    }

    if (suspended) {
      status = "waiting";
      summary = `${profile.firstName} is paused until ${suspended.wakeAt}.`;
    }

    if (!summary) {
      summary = `${profile.firstName} completed the journey with ${messages.length} simulated message${messages.length === 1 ? "" : "s"}.`;
    }

    if (withheldMessages.length > 0) {
      summary += ` ${withheldMessages.length} message${withheldMessages.length === 1 ? "" : "s"} withheld by the control holdout.`;
    }

    const visited = new Set(visitedNodeIds);
    const traversed = new Set(traversedEdgeIds);
    const skippedEdgeIds = journey.edges
      .filter((edge) => visited.has(edge.source) && !traversed.has(edge.id))
      .map((edge) => edge.id);

    return {
      journeyId: journey.id,
      journeyName: journey.name,
      profileId: profile.id,
      profileName: `${profile.firstName} ${profile.lastName}`,
      eventName: event.name,
      assignment,
      suspended,
      startedAt: event.occurredAt,
      endedAt: virtualTime.toISOString(),
      status,
      steps,
      visitedNodeIds,
      traversedEdgeIds,
      skippedEdgeIds,
      messages,
      withheldMessages,
      summary,
    };
  }
}

/**
 * A local cap may only be *stricter* than the governed one. Journeys can opt
 * into extra caution; they cannot opt out of workspace governance.
 */
function resolveNodeCap(
  config: FrequencyCheckConfig,
  governor: FrequencyGovernor,
  profile: Profile,
): CapEvaluation {
  const governed = governor.resolveCap(profile, config.channel);
  if (config.mode === "governed") return governed;

  const localRate = config.windowDays > 0 ? config.maxMessages / config.windowDays : Infinity;
  if (localRate >= governed.perDay) {
    return {
      ...governed,
      summary: `${governed.summary} The journey's local cap of ${describeCap(config.maxMessages, config.windowDays)} is more permissive, so it was ignored.`,
    };
  }

  return {
    maxMessages: config.maxMessages,
    windowDays: config.windowDays,
    perDay: localRate,
    sourceId: "__local__",
    sourceName: "Journey-local cap",
    considered: governed.considered,
    summary: `This journey sets a stricter local cap of ${describeCap(config.maxMessages, config.windowDays)}, below the governed ${describeCap(governed.maxMessages, governed.windowDays)}.`,
  };
}

export const simulationEngine = new SimulationEngine();

/** Outlets that exist on a node but were not taken — used to dim skipped paths. */
export function untakenHandles(
  node: JourneyNode,
  takenHandle: string | undefined,
): string[] {
  return getNodeOutputs(node)
    .map((output) => output.id)
    .filter((id) => id !== takenHandle);
}

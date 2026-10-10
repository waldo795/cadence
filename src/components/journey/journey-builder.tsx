"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ChartNoAxesColumn,
  CheckCircle2,
  FileJson,
  FlaskConical,
  GitCommitVertical,
  Loader2,
  MoreHorizontal,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { Connection } from "@xyflow/react";
import { journeysReferencing } from "@/domain/exclusion";
import {
  createEdgeId,
  createNode,
  createNodeId,
  getNodeOutputs,
  NODE_KIND_META,
  type JourneyDefinition,
  type JourneyNode,
  type JourneyNodeKind,
} from "@/domain/journey";
import { formatRelative } from "@/domain/time";
import { validateJourney } from "@/domain/validation";
import { allJourneysSync, journeyDirectory, journeyRepository } from "@/services/local-store";
import { allExperimentsSync, experimentDirectory } from "@/services/experiments";
import { useAllProfiles } from "@/hooks/use-data";
import { useSimulation } from "@/hooks/use-simulation";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/misc";
import { CohortDialog } from "./cohort-dialog";
import { DefinitionDialog } from "./definition-dialog";
import { JourneyCanvas } from "./journey-canvas";
import { NodeLibrary } from "./node-library";
import { PropertiesPanel } from "./properties-panel";
import { SimulationPanel } from "./simulation-panel";

export function JourneyBuilder({ initialJourney }: { initialJourney: JourneyDefinition }) {
  const [journey, setJourney] = React.useState<JourneyDefinition>(initialJourney);
  const [savedSnapshot, setSavedSnapshot] = React.useState(() => JSON.stringify(initialJourney));
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [definitionOpen, setDefinitionOpen] = React.useState(false);
  const [simulationOpen, setSimulationOpen] = React.useState(false);
  // Experiments live outside the journey, so the builder only *reports* them.
  const experiments = React.useMemo(
    () => experimentDirectory.listForJourney(initialJourney.key),
    [initialJourney.key],
  );
  const liveExperiment = experiments.find((item) => item.status === "running") ?? null;
  const forkedInto = React.useMemo(
    () =>
      allExperimentsSync().filter((item) =>
        item.variants.some(
          (variant) =>
            variant.treatment.kind === "journey" &&
            variant.treatment.journeyKey === initialJourney.key,
        ),
      ),
    [initialJourney.key],
  );
  const [cohortOpen, setCohortOpen] = React.useState(false);
  const [versionOpen, setVersionOpen] = React.useState(false);

  const router = useRouter();
  const { profiles } = useAllProfiles();
  const simulation = useSimulation(journey, profiles);

  const knownKeys = React.useMemo(() => journeyDirectory.list().map((item) => item.key), []);
  const inboundReferences = React.useMemo(
    () => journeysReferencing(journey.key, allJourneysSync()).filter((item) => item.id !== journey.id),
    [journey.key, journey.id],
  );

  const dirty = JSON.stringify(journey) !== savedSnapshot;
  const validation = React.useMemo(
    () => validateJourney(journey, knownKeys),
    [journey, knownKeys],
  );
  const selectedNode = journey.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const simulationActive = simulationOpen && simulation.run !== null;

  /* ------------------------------------------------------------------ */
  /* Mutations                                                          */
  /* ------------------------------------------------------------------ */

  const updateNode = React.useCallback(
    (nodeId: string, updater: (node: JourneyNode) => JourneyNode) => {
      setJourney((current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
      }));
    },
    [],
  );

  const addNode = React.useCallback(
    (kind: JourneyNodeKind, position?: { x: number; y: number }) => {
      const node = createNode(kind, position ?? { x: 380, y: 260 });
      setJourney((current) => ({ ...current, nodes: [...current.nodes, node] }));
      setSelectedNodeId(node.id);
      toast.success(`${NODE_KIND_META[kind].label} added`);
    },
    [],
  );

  const duplicateNode = React.useCallback(
    (nodeId: string) => {
      const source = journey.nodes.find((node) => node.id === nodeId);
      if (!source) return;

      const copy: JourneyNode = {
        ...structuredClone(source),
        id: createNodeId(source.kind),
        label: `${source.label} (copy)`,
        position: { x: source.position.x + 300, y: source.position.y + 40 },
      };
      setJourney((current) => ({ ...current, nodes: [...current.nodes, copy] }));
      setSelectedNodeId(copy.id);
      toast.success("Node duplicated");
    },
    [journey.nodes],
  );

  const deleteNodes = React.useCallback((nodeIds: string[]) => {
    if (nodeIds.length === 0) return;
    const ids = new Set(nodeIds);
    setJourney((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => !ids.has(node.id)),
      // Dangling edges are removed with the node so the model stays consistent.
      edges: current.edges.filter((edge) => !ids.has(edge.source) && !ids.has(edge.target)),
    }));
    setSelectedNodeId((current) => (current && ids.has(current) ? null : current));
    toast.success(`${nodeIds.length} node${nodeIds.length === 1 ? "" : "s"} deleted`);
  }, []);

  const deleteEdges = React.useCallback((edgeIds: string[]) => {
    const ids = new Set(edgeIds);
    setJourney((current) => ({
      ...current,
      edges: current.edges.filter((edge) => !ids.has(edge.id)),
    }));
  }, []);

  const connectNodes = React.useCallback((connection: Connection) => {
    const { source, target, sourceHandle } = connection;
    if (!source || !target || source === target) return;

    setJourney((current) => {
      const handle = sourceHandle ?? "out";
      const sourceNode = current.nodes.find((node) => node.id === source);
      const outlet = sourceNode
        ? getNodeOutputs(sourceNode).find((output) => output.id === handle)
        : undefined;

      // One connection per outlet: reconnecting an outlet replaces the old edge
      // rather than silently creating an ambiguous fork.
      const withoutOutlet = current.edges.filter(
        (edge) => !(edge.source === source && edge.sourceHandle === handle),
      );

      return {
        ...current,
        edges: [
          ...withoutOutlet,
          {
            id: createEdgeId(),
            source,
            target,
            sourceHandle: handle,
            label: outlet?.label && outlet.label !== "Next" ? outlet.label : undefined,
          },
        ],
      };
    });
  }, []);

  /* ------------------------------------------------------------------ */
  /* Persistence                                                        */
  /* ------------------------------------------------------------------ */

  const save = React.useCallback(async () => {
    setSaving(true);
    const saved = await journeyRepository.save(journey);
    setJourney(saved);
    setSavedSnapshot(JSON.stringify(saved));
    setSaving(false);
    toast.success("Journey saved", { description: "Stored locally — survives a refresh." });
  }, [journey]);

  const togglePublish = React.useCallback(async () => {
    if (journey.status === "draft" && !validation.valid) {
      toast.error("Cannot publish", {
        description: "Resolve the errors listed in the toolbar first.",
      });
      return;
    }

    const next: JourneyDefinition = {
      ...journey,
      status: journey.status === "published" ? "draft" : "published",
      version: journey.status === "published" ? journey.version : journey.version + 1,
    };
    const saved = await journeyRepository.save(next);
    setJourney(saved);
    setSavedSnapshot(JSON.stringify(saved));
    toast.success(saved.status === "published" ? "Journey published" : "Moved back to draft", {
      description: `Now at version ${saved.version}.`,
    });
  }, [journey, validation.valid]);

  /**
   * Stops this version and opens a fresh draft in the same lineage. The key
   * carries over, so journeys that exclude against this one keep working and
   * start evaluating the new version without any edit on their side.
   */
  const createNewVersion = React.useCallback(async () => {
    if (dirty) await journeyRepository.save(journey);
    const next = await journeyRepository.createNewVersion(journey.id);
    setVersionOpen(false);
    if (!next) return;
    toast.success(`Version ${next.version} created`, {
      description: `v${journey.version} archived. ${inboundReferences.length} referencing journey${
        inboundReferences.length === 1 ? "" : "s"
      } now resolve here.`,
    });
    router.push(`/journeys/${next.id}`);
  }, [dirty, journey, inboundReferences.length, router, setVersionOpen]);

  // Cmd/Ctrl+S saves, matching the muscle memory of every editor.
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  // Warn on navigating away with unsaved work.
  React.useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const errorCount = validation.issues.filter((issue) => issue.level === "error").length;
  const warningCount = validation.issues.filter((issue) => issue.level === "warning").length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
        <Tooltip content="Back to journeys" side="bottom">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href="/journeys" aria-label="Back to journeys">
              <ArrowLeft />
            </Link>
          </Button>
        </Tooltip>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[14px] font-semibold tracking-tight">{journey.name}</h1>
            <Badge
              tone={
                journey.status === "published"
                  ? "positive"
                  : journey.status === "archived"
                    ? "negative"
                    : "neutral"
              }
            >
              {journey.status === "published"
                ? "Published"
                : journey.status === "archived"
                  ? "Archived"
                  : "Draft"}
            </Badge>
            <Badge tone="outline">v{journey.version}</Badge>
            {liveExperiment ? (
              <Badge tone="warning">Under test</Badge>
            ) : null}
            {journey.forkOfJourneyKey ? (
              <Badge tone="accent">Experiment fork</Badge>
            ) : null}
          </div>
          <p className="truncate text-[11px] text-subtle-foreground">
            {dirty ? (
              <span className="text-warning">Unsaved changes</span>
            ) : (
              <>Saved {formatRelative(journey.updatedAt)}</>
            )}
            {" · "}
            <span className="font-mono">{journey.trigger.name}</span>
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ValidationIndicator errorCount={errorCount} warningCount={warningCount} issues={validation.issues} />

          <Separator orientation="vertical" className="h-6" />

          <Tooltip content="Experiments targeting this journey" side="bottom">
            <Button variant={liveExperiment ? "outline" : "secondary"} size="sm" asChild>
              <Link href="/experiments">
                <FlaskConical /> Experiments
                {experiments.length > 0 ? (
                  <span className="tnum text-subtle-foreground">{experiments.length}</span>
                ) : null}
              </Link>
            </Button>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDefinitionOpen(true)}>
                <FileJson /> View definition
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCohortOpen(true)}>
                <ChartNoAxesColumn /> Run whole cohort
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void togglePublish()}>
                <Upload />
                {journey.status === "published" ? "Move back to draft" : "Publish journey"}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setVersionOpen(true)}>
                <GitCommitVertical /> Stop and rebuild as v{journey.version + 1}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="secondary" size="sm" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {dirty ? "Save" : "Saved"}
          </Button>

          <Button
            size="sm"
            onClick={() => setSimulationOpen((open) => !open)}
            variant={simulationOpen ? "outline" : "default"}
          >
            <Sparkles /> Simulate
          </Button>
        </div>
      </header>

      {liveExperiment || forkedInto.length > 0 ? (
        <div className="flex items-center gap-2.5 border-b border-border bg-accent-soft px-4 py-2">
          <FlaskConical className="size-3.5 shrink-0 text-accent" />
          <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-foreground">
            {liveExperiment ? (
              <>
                <strong>{liveExperiment.name}</strong> is live on this journey. Entrants are
                allocated at runtime —{" "}
                {liveExperiment.variants
                  .map((variant) => `${variant.allocation}% ${variant.name}`)
                  .join(", ")}
                . This definition is unchanged by the test.
              </>
            ) : (
              <>
                This journey is a variant in{" "}
                <strong>{forkedInto.map((item) => item.name).join(", ")}</strong>. Profiles arrive
                here by experiment assignment, not by its own trigger.
              </>
            )}
          </p>
          <Button variant="ghost" size="xs" asChild>
            <Link href="/experiments">Open</Link>
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <NodeLibrary onAddNode={(kind) => addNode(kind)} />

        <div className="relative flex min-w-0 flex-1 flex-col">
          {simulationActive ? (
            <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2">
              <span className="flex items-center gap-2 rounded-full border border-accent/30 bg-surface px-3 py-1.5 text-[11.5px] font-medium text-accent shadow-sm">
                <Sparkles className="size-3.5" />
                Simulating {simulation.run?.profileName} — canvas is read-only
              </span>
            </div>
          ) : null}

          <JourneyCanvas
            journey={journey}
            selectedNodeId={selectedNodeId}
            overlay={simulation.overlay}
            readOnly={simulationActive}
            onSelectNode={setSelectedNodeId}
            onNodesMoved={setJourney}
            onConnect={connectNodes}
            onDropNode={(kind, position) => addNode(kind, position)}
            onDeleteNodes={deleteNodes}
            onDeleteEdges={deleteEdges}
          />
        </div>

        {simulationOpen ? (
          <SimulationPanel
            controller={simulation}
            profiles={profiles}
            onClose={() => {
              setSimulationOpen(false);
              simulation.reset();
            }}
          />
        ) : (
          <PropertiesPanel
            journey={journey}
            node={selectedNode}
            onChange={updateNode}
            onDuplicate={duplicateNode}
            onDelete={(nodeId) => deleteNodes([nodeId])}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      <DefinitionDialog
        journey={journey}
        open={definitionOpen}
        onOpenChange={setDefinitionOpen}
        onImport={(imported) => setJourney(imported)}
      />

      <CohortDialog
        journey={journey}
        profiles={profiles}
        open={cohortOpen}
        onOpenChange={setCohortOpen}
      />

      <AlertDialog open={versionOpen} onOpenChange={setVersionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop v{journey.version} and rebuild?</AlertDialogTitle>
            <AlertDialogDescription>
              v{journey.version} is archived and a new draft v{journey.version + 1} opens with the
              same content. Both share the lineage key <strong>{journey.key}</strong>, so the{" "}
              {inboundReferences.length === 0
                ? "exclusion rules in other journeys"
                : `${inboundReferences.length} journey${inboundReferences.length === 1 ? "" : "s"} that exclude against this one (${inboundReferences.map((item) => item.name).join(", ")})`}{" "}
              will resolve to the new version automatically. The experiment&apos;s control group is
              also preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void createNewVersion()}>
              Create v{journey.version + 1}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ValidationIndicator({
  errorCount,
  warningCount,
  issues,
}: {
  errorCount: number;
  warningCount: number;
  issues: ReturnType<typeof validateJourney>["issues"];
}) {
  if (errorCount === 0 && warningCount === 0) {
    return (
      <Tooltip content="No structural problems found" side="bottom">
        <span className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] text-success">
          <CheckCircle2 className="size-3.5" />
          Valid
        </span>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      side="bottom"
      content={
        <ul className="space-y-1">
          {issues.slice(0, 6).map((issue, index) => (
            <li key={index} className="flex gap-1.5">
              <span className={issue.level === "error" ? "text-danger" : "text-warning"}>•</span>
              <span>{issue.message}</span>
            </li>
          ))}
          {issues.length > 6 ? <li>…and {issues.length - 6} more</li> : null}
        </ul>
      }
    >
      <span
        className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] ${
          errorCount > 0 ? "text-danger" : "text-warning"
        }`}
      >
        <AlertTriangle className="size-3.5" />
        {errorCount > 0 ? `${errorCount} error${errorCount === 1 ? "" : "s"}` : null}
        {errorCount > 0 && warningCount > 0 ? ", " : null}
        {warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : null}
      </span>
    </Tooltip>
  );
}

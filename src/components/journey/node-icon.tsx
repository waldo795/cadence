import {
  Ban,
  CalendarClock,
  CircleStop,
  Clock,
  Gauge,
  GitBranch,
  Mail,
  Percent,
  ShieldCheck,
  Smartphone,
  Split,
  UserPen,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { NODE_KIND_META, type JourneyNodeKind } from "@/domain/journey";

/**
 * Icon lookup lives here so the domain layer can name an icon as a string
 * without importing React.
 */
const ICONS: Record<string, LucideIcon> = {
  Ban,
  Zap,
  Users,
  GitBranch,
  Split,
  Clock,
  CalendarClock,
  Percent,
  Mail,
  Smartphone,
  Webhook,
  UserPen,
  Gauge,
  ShieldCheck,
  CircleStop,
};

/**
 * Pre-resolved at module scope: looking the component up during render would
 * hand React a "new" component type on every pass.
 */
const ICON_BY_KIND = Object.fromEntries(
  Object.values(NODE_KIND_META).map((meta) => [meta.kind, ICONS[meta.icon] ?? Zap]),
) as Record<JourneyNodeKind, LucideIcon>;

export function NodeIcon({ kind, className }: { kind: JourneyNodeKind; className?: string }) {
  const Icon = ICON_BY_KIND[kind];
  return <Icon className={className} />;
}

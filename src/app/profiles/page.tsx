"use client";

import * as React from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Users } from "lucide-react";
import { fullName, initials, type Profile } from "@/domain/profile";
import { useProfiles } from "@/hooks/use-data";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ProfileFilter } from "@/services/ports";

const ANY = "__any__";

const TIERS = ["Bronze", "Silver", "Gold", "Platinum"];
const COUNTRIES = [
  "United Kingdom",
  "Ireland",
  "Spain",
  "Sweden",
  "Japan",
  "United Arab Emirates",
];

export default function ProfilesPage() {
  const [query, setQuery] = React.useState("");
  const [tier, setTier] = React.useState(ANY);
  const [country, setCountry] = React.useState(ANY);
  const [appInstalled, setAppInstalled] = React.useState(ANY);

  const filter: ProfileFilter = React.useMemo(
    () => ({
      query: query.trim() || undefined,
      loyaltyTier: tier === ANY ? undefined : tier,
      country: country === ANY ? undefined : country,
      appInstalled: appInstalled === ANY ? undefined : appInstalled === "yes",
    }),
    [query, tier, country, appInstalled],
  );

  const { profiles, loading } = useProfiles(filter);
  const filtersActive = tier !== ANY || country !== ANY || appInstalled !== ANY || query !== "";

  const clearFilters = () => {
    setQuery("");
    setTier(ANY);
    setCountry(ANY);
    setAppInstalled(ANY);
  };

  return (
    <>
      <PageHeader
        title="Profiles"
        description="Search the customer base and inspect the attributes, consent and history that journeys make decisions on."
      />

      <PageBody className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, customer ID or email"
              className="pl-9"
            />
          </div>

          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Loyalty tier" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All tiers</SelectItem>
              {TIERS.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={appInstalled} onValueChange={setAppInstalled}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="App" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>Any app state</SelectItem>
              <SelectItem value="yes">App installed</SelectItem>
              <SelectItem value="no">No app</SelectItem>
            </SelectContent>
          </Select>

          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All countries</SelectItem>
              {COUNTRIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filtersActive ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <SlidersHorizontal /> Clear
            </Button>
          ) : null}
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-[132px] rounded-xl" />
            ))}
          </div>
        ) : profiles.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No profiles match these filters"
            description="Try widening the search, or clear the filters to see the full seeded customer base."
            action={
              <Button size="sm" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <p className="text-[12px] text-muted-foreground">
              <span className="tnum">{profiles.length}</span> profile
              {profiles.length === 1 ? "" : "s"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {profiles.map((profile) => (
                <ProfileCard key={profile.id} profile={profile} />
              ))}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}

function ProfileCard({ profile }: { profile: Profile }) {
  return (
    <Link
      href={`/profiles/${profile.id}`}
      className="group rounded-xl border border-border bg-surface px-4 py-4 transition-colors hover:border-border-strong"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[12px] font-semibold text-accent">
          {initials(profile)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[13.5px] font-semibold tracking-tight">
              {fullName(profile)}
            </p>
            <Badge tone={profile.loyaltyTier === "Platinum" ? "accent" : "neutral"}>
              {profile.loyaltyTier}
            </Badge>
          </div>
          <p className="truncate font-mono text-[11px] text-subtle-foreground">
            {profile.customerId}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{profile.email}</p>
        </div>
        <span className="tnum shrink-0 text-[13px] font-semibold tabular-nums">
          £{profile.lifetimeValue.toLocaleString()}
        </span>
      </div>

      <p className="mt-3 line-clamp-2 text-[11.5px] leading-relaxed text-muted-foreground">
        {profile.segmentNote}
      </p>

      <div className="mt-3 flex flex-wrap gap-1">
        <Badge tone={profile.appInstalled ? "positive" : "neutral"}>
          {profile.appInstalled ? "App installed" : "No app"}
        </Badge>
        {profile.contactability.globallySuppressed ? (
          <Badge tone="negative">Suppressed</Badge>
        ) : null}
        {profile.contactability.email !== "subscribed" ? (
          <Badge tone="warning">No email consent</Badge>
        ) : null}
        {profile.appInstalled && !profile.contactability.hasPushToken ? (
          <Badge tone="warning">No push token</Badge>
        ) : null}
        <Badge tone="outline">{profile.country}</Badge>
      </div>
    </Link>
  );
}

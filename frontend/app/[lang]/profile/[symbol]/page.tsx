import { PublicProfileClient } from "../../../profile/[symbol]/profile-client";

type ProfilePageProps = {
  params?: Promise<{ symbol?: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function ProfilePage({ params, searchParams }: ProfilePageProps) {
  const resolvedParams = await params;
  const resolvedSearch = await searchParams;
  return (
    <PublicProfileClient
      fallback={{
        symbol: resolvedParams?.symbol ?? "",
        displayName: single(resolvedSearch?.name),
        tagline: single(resolvedSearch?.tagline),
        bio: single(resolvedSearch?.bio),
        portraitUrl: single(resolvedSearch?.portrait),
        basePriceCents: Number(single(resolvedSearch?.base) || 0),
        currentPriceCents: Number(single(resolvedSearch?.current) || 0),
        priceChangePercent: Number(single(resolvedSearch?.gain) || 0),
        heatScore: Number(single(resolvedSearch?.heat) || 0),
        nextAvailableAt: single(resolvedSearch?.next)
      }}
    />
  );
}

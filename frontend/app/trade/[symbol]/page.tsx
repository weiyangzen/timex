import { Suspense } from "react";
import TradeTerminal from "../trade-terminal";

type TradeSymbolPageProps = {
  params?: Promise<{ symbol?: string }> | { symbol?: string };
};

export default async function TradeSymbolPage({ params }: TradeSymbolPageProps = {}) {
  const resolvedParams = params ? await Promise.resolve(params) : undefined;
  return (
    <Suspense fallback={null}>
      <TradeTerminal initialSymbol={resolvedParams?.symbol ?? "AYUAN"} />
    </Suspense>
  );
}

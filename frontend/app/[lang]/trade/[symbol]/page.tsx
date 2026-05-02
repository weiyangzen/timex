import { Suspense } from "react";
import TradeTerminal from "../../../trade/trade-terminal";

export default async function TradeSymbolPage({
  params
}: {
  params?: Promise<{ symbol?: string }> | { symbol?: string };
}) {
  const resolvedParams = params ? await params : undefined;
  return (
    <Suspense fallback={null}>
      <TradeTerminal initialSymbol={resolvedParams?.symbol ?? "AYUAN"} />
    </Suspense>
  );
}

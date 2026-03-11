"use client";

import * as React from "react";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Network } from "@aptos-labs/ts-sdk";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());
  const dappConfig = React.useMemo(() => ({ network: Network.TESTNET }), []);

  return (
    <QueryClientProvider client={queryClient}>
      <AptosWalletAdapterProvider
        optInWallets={["Petra"]}
        autoConnect={true}
        dappConfig={dappConfig}
      >
        {children}
      </AptosWalletAdapterProvider>
    </QueryClientProvider>
  );
}

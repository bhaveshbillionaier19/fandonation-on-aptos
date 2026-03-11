"use client";

import * as React from "react";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Network } from "@aptos-labs/ts-sdk";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());
  const dappConfig = React.useMemo(() => {
    const aptosApiKey = process.env.NEXT_PUBLIC_APTOS_API_KEY;

    return {
      network: Network.TESTNET,
      aptosApiKeys: aptosApiKey
        ? {
            [Network.TESTNET]: aptosApiKey,
          }
        : undefined,
    };
  }, []);

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

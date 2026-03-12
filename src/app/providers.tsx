"use client";

import * as React from "react";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Network } from "@aptos-labs/ts-sdk";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(() => new QueryClient());

  React.useEffect(() => {
    // Prevent stale auto-selected wallets (e.g. Petra Web/Aptos Connect) from reconnecting.
    const walletKey = "AptosWalletName";
    const selected = window.localStorage.getItem(walletKey);
    if (selected && selected !== "Petra") {
      window.localStorage.removeItem(walletKey);
    }
  }, []);

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
        hideWallets={["Petra Web", "Continue with Google", "Continue with Apple"]}
        autoConnect={false}
        dappConfig={dappConfig}
      >
        {children}
      </AptosWalletAdapterProvider>
    </QueryClientProvider>
  );
}

"use client";

import * as React from "react";
import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function Providers({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = React.useState<any[]>([]);
  const [queryClient] = React.useState(() => new QueryClient());

  React.useEffect(() => {
    // Dynamically import PetraWallet on the client side only
    import("petra-plugin-wallet-adapter").then((mod) => {
      setWallets([new mod.PetraWallet()]);
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AptosWalletAdapterProvider optInWallets={wallets} autoConnect={true}>
        {children}
      </AptosWalletAdapterProvider>
    </QueryClientProvider>
  );
}

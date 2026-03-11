import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

export const getAptosClient = () => {
  if (typeof window === 'undefined') {
    // Return a dummy object during SSR to prevent traceSync crashes
    return {
      view: async () => [],
      queryIndexer: async () => ({ events: [] }),
      waitForTransaction: async () => {}
    } as any;
  }
  const aptosApiKey = process.env.NEXT_PUBLIC_APTOS_API_KEY;
  const aptosConfig = new AptosConfig({
    network: Network.TESTNET,
    clientConfig: {
      API_KEY: aptosApiKey || undefined,
    },
  });
  return new Aptos(aptosConfig);
};

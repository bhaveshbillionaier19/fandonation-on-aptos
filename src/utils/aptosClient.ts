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
  const aptosConfig = new AptosConfig({ network: Network.TESTNET });
  return new Aptos(aptosConfig);
};

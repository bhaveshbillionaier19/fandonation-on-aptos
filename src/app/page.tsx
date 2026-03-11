"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from 'next/image';
import SkeletonCard from "@/components/SkeletonCard";
import Hero from "@/components/Hero";
import StatsCard from "@/components/StatsCard";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Layers, TrendingUp, Award, Heart, ArrowRight } from "lucide-react";
import { moduleAddress } from "@/constants";
// No static aptos imports here
import { ClientOnly } from "@/components/ClientOnly";
import { normalizeIpfsUrl } from "@/lib/ipfs";

const NFTCard = dynamic(() => import("@/components/NFTCard"), {
  ssr: false,
  loading: () => <SkeletonCard />,
});

// Format APT amounts (1 APT = 10^8 octas)
const formatAPT = (value: bigint) => (Number(value) / 100000000).toFixed(4);

export interface NftData {
  tokenId: number;
  metadata: any;
  owner: string;
  totalDonations: bigint;
  tokenAddress: string;
}

interface DonorStat {
  total: bigint;
  donations: { tokenId: number; amount: bigint; name?: string }[];
}

export default function Home() {
  const [nfts, setNfts] = useState<NftData[]>([]);
  const [hiddenTokenIds, setHiddenTokenIds] = useState<number[]>([]);
  const [donorStats, setDonorStats] = useState<Record<string, DonorStat>>({});
  const [totalSupply, setTotalSupply] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const fetchTotalSupply = useCallback(async () => {
    try {
      const { getAptosClient } = await import("@/utils/aptosClient");
      const aptos = getAptosClient();
      const res = await aptos.view({
        payload: {
          function: `${moduleAddress}::Donation::total_supply`,
          functionArguments: [],
        }
      });
      const ts = Number(res[0]);
      setTotalSupply(ts);
      return ts;
    } catch (e) {
      console.error(e);
      return 0;
    }
  }, []);

  const fetchNftData = useCallback(async (ts: number) => {
    if (ts === 0) {
      setNfts([]);
      setIsLoading(false);
      return;
    }
    
    try {
      const { getAptosClient } = await import("@/utils/aptosClient");
      const aptos = getAptosClient();
      const nftPromises = Array.from({ length: ts }, (_, i) => i + 1).map(async (id) => {
        const [tokenURI, owner, totalDonations, tokenAddr] = await Promise.all([
          aptos.view({
            payload: { function: `${moduleAddress}::Donation::token_uri`, functionArguments: [id] }
          }),
          aptos.view({
            payload: { function: `${moduleAddress}::Donation::owner_of`, functionArguments: [id] }
          }),
          aptos.view({
            payload: { function: `${moduleAddress}::Donation::total_donations`, functionArguments: [id] }
          }),
          aptos.view({
            payload: { function: `${moduleAddress}::Donation::get_token_address`, functionArguments: [id] }
          })
        ]);

        let metadata = {};
        try {
          const response = await fetch(tokenURI[0] as string);
          metadata = await response.json();
        } catch (error) {
          console.error(`Failed to fetch metadata for token ${id}:`, error);
        }

        return {
          tokenId: id,
          metadata,
          owner: owner[0] as string,
          totalDonations: BigInt(totalDonations[0] as string),
          tokenAddress: tokenAddr[0] as string,
        };
      });

      const formattedNfts = await Promise.all(nftPromises);
      setNfts(formattedNfts);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const { getAptosClient } = await import("@/utils/aptosClient");
      const aptos = getAptosClient();
      const response = (await aptos.queryIndexer({
        query: {
          query: `
            query getEvents($type: String) {
              events(where: { type: { _eq: $type } }) {
                data
              }
            }
          `,
          variables: {
            type: `${moduleAddress}::Donation::DonationReceived`
          }
        }
      })) as { events: any[] };
      const events = response.events || [];
      // The events are automatically filtered by event type
      
      const newStats: Record<string, DonorStat> = {};
      events.forEach((ev: any) => {
        const donor = ev.data.donor;
        const amount = BigInt(ev.data.amount);
        const tokenId = Number(ev.data.token_id);
        
        if (!newStats[donor]) {
          newStats[donor] = { total: 0n, donations: [] };
        }
        newStats[donor].total += amount;
        newStats[donor].donations.push({ tokenId, amount });
      });
      
      // Populate names
      Object.values(newStats).forEach(stat => {
        stat.donations.forEach(d => {
          const nft = nfts.find(n => n.tokenId === d.tokenId);
          if (nft) d.name = nft.metadata?.name;
        });
      });
      
      setDonorStats(newStats);
    } catch (e) {
      console.error("Failed to fetch events", e);
    }
  }, [nfts]);

  const loadAll = useCallback(async () => {
    const ts = await fetchTotalSupply();
    await fetchNftData(ts);
    await fetchEvents();
  }, [fetchTotalSupply, fetchNftData, fetchEvents]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 15000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const visibleNfts = useMemo(

    () => nfts.filter((nft) => !hiddenTokenIds.includes(nft.tokenId)),
    [nfts, hiddenTokenIds]
  );

  const topDonatedNfts = [...visibleNfts]
    .sort((a, b) => Number(b.totalDonations) - Number(a.totalDonations))
    .slice(0, 10);

  const totalDonationsAll = useMemo(
    () => visibleNfts.reduce((sum, nft) => sum + (nft.totalDonations ?? 0n), 0n),
    [visibleNfts]
  );

  const topSupportedNames = useMemo(() => {
    if (topDonatedNfts.length === 0) return "No support yet";
    return topDonatedNfts
      .slice(0, 3)
      .map((nft) => nft.metadata?.name || `NFT #${nft.tokenId}`)
      .join(", ");
  }, [topDonatedNfts]);

  const handleDeleteNft = useCallback((tokenId: number) => {
    setHiddenTokenIds((prev) => (prev.includes(tokenId) ? prev : [...prev, tokenId]));
  }, []);

  const handleTotalsChange = useCallback(() => {
    loadAll();
  }, [loadAll]);

  const handleDonation = useCallback(
    ({ donor, amount, tokenId }: { donor: string; amount: bigint; tokenId: number }) => {
      // Optimistic update
      setDonorStats((prev) => {
        const current = prev[donor] ?? { total: 0n, donations: [] };
        const nft = nfts.find((n) => n.tokenId === tokenId);

        return {
          ...prev,
          [donor]: {
            total: current.total + amount,
            donations: [
              ...current.donations,
              { tokenId, amount, name: nft?.metadata?.name },
            ],
          },
        };
      });
    },
    [nfts]
  );

  const topDonors = useMemo(() => {
    const entries = Object.entries(donorStats);
    return entries
      .map(([address, stat]) => ({
        address,
        total: stat.total,
        lastDonation: stat.donations[stat.donations.length - 1],
      }))
      .filter((entry) => entry.total > 0n)
      .sort((a, b) => (a.total < b.total ? 1 : -1))
      .slice(0, 10);
  }, [donorStats]);

  const totalDonationsNum = parseFloat(formatAPT(totalDonationsAll));

  return (
    <ClientOnly>
    <main className="relative z-10">
      {/* Hero */}
      <Hero />

      {/* Stats */}
      <section className="container mx-auto px-4 -mt-8 mb-12">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatsCard
            icon={Layers}
            label="Total NFTs"
            value={String(visibleNfts.length)}
            numericValue={visibleNfts.length}
          />
          <StatsCard
            icon={TrendingUp}
            label="Total Donations"
            value={totalDonationsNum.toFixed(4)}
            suffix="APT"
            numericValue={totalDonationsNum}
          />
          <StatsCard
            icon={Award}
            label="Top Supported"
            value={topSupportedNames}
          />
        </div>
      </section>

      {/* Top NFTs + Top Donors */}
      {visibleNfts.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.6 }}
          className="container mx-auto px-4 mb-12"
        >
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Top Supported NFTs */}
            <div className="glass-card glow-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <TrendingUp className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Top Supported NFTs</h2>
                  <p className="text-xs text-muted-foreground">
                    Highest total fan donations
                  </p>
                </div>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {topDonatedNfts.map((nft, index) => {
                  const imageSrc = normalizeIpfsUrl(nft.metadata?.image);
                  return (
                    <motion.div
                      key={nft.tokenId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center justify-between rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors p-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-bold text-muted-foreground w-6 text-right">
                          #{index + 1}
                        </span>
                        <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl border border-white/[0.08]">
                          {imageSrc ? (
                            <Image
                              src={imageSrc}
                              alt={nft.metadata?.name || `NFT #${nft.tokenId}`}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="h-full w-full shimmer" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{nft.metadata.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatAPT(nft.totalDonations)} APT
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Top Donors */}
            <div className="glass-card glow-border rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Heart className="w-4 h-4 text-cyan-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Top Fan Donors</h2>
                  <p className="text-xs text-muted-foreground">
                    Most generous supporters
                  </p>
                </div>
              </div>
              {topDonors.length === 0 ? (
                <p className="text-sm text-muted-foreground/60 py-4 text-center">
                  No fan donations yet. Be the first to support a creator.
                </p>
              ) : (
                <ul className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {topDonors.map((entry, index) => (
                    <motion.li
                      key={entry.address}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="flex items-center justify-between rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors px-3 py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-bold text-muted-foreground w-6 text-right">
                          #{index + 1}
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-semibold font-mono truncate">
                            {entry.address.slice(0, 6)}...{entry.address.slice(-4)}
                          </span>
                          {entry.lastDonation?.name && (
                            <span className="text-xs text-muted-foreground truncate">
                              To {entry.lastDonation.name}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-sm font-bold gradient-text">
                        {formatAPT(entry.total)} APT
                      </span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </motion.section>
      )}

      {/* All NFTs Grid */}
      <section id="nfts" className="container mx-auto px-4 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center justify-between mb-6"
        >
          <div>
            <h2 className="text-2xl font-bold">All NFTs</h2>
            <p className="text-sm text-muted-foreground">Browse and support creators</p>
          </div>
          {visibleNfts.length > 0 && (
            <Link 
              href="/mint"
              className="gradient-btn-outline text-foreground text-sm font-medium px-4 py-2 rounded-full inline-flex items-center gap-2 hover:bg-white/5 transition-colors"
            >
                Create NFT
                <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
            : visibleNfts.length > 0
            ? visibleNfts.map((nft, index) => (
                <NFTCard
                  key={nft.tokenId}
                  nft={nft}
                  index={index}
                  onDonation={handleDonation}
                  onTotalsChange={handleTotalsChange}
                />
              ))
            : !isLoading && (
                <div className="col-span-full text-center py-16">
                  <div className="glass-card glow-border rounded-2xl p-10 max-w-md mx-auto">
                    <Layers className="w-12 h-12 text-purple-400/60 mx-auto mb-4" />
                    <p className="mb-2 text-lg font-semibold">No NFTs found yet</p>
                    <p className="mb-6 text-sm text-muted-foreground">
                      Be the first to mint and support a cause.
                    </p>
                    <Link 
                      href="/mint"
                      className="gradient-btn text-white font-semibold px-6 py-2.5 rounded-full text-sm inline-flex items-center gap-2"
                    >
                        Mint an NFT
                        <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )}
        </div>
      </section>
      </main>
    </ClientOnly>
  );
}

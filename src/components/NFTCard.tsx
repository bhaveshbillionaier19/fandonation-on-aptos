"use client";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import Confetti from 'react-confetti';
import { Loader2, Heart, Copy, Check } from "lucide-react";
import { motion } from "framer-motion";
import { normalizeIpfsUrl } from "@/lib/ipfs";

import { type NftData } from "../app/page";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { moduleAddress } from "@/constants";

// Format APT (1 APT = 10^8 octas)
const formatAPT = (value: bigint) => (Number(value) / 100000000).toFixed(4);

interface NFTCardProps {
  nft: NftData;
  index?: number;
  onDonation?: (payload: { donor: string; amount: bigint; tokenId: number }) => void;
  onTotalsChange?: () => void;
}

// No static aptos imports here
export default function NFTCard({ nft, index = 0, onDonation, onTotalsChange }: NFTCardProps) {
  const { tokenId, metadata, owner, totalDonations } = nft;
  const [donationAmount, setDonationAmount] = useState("");
  const [showConfetti, setShowConfetti] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [localDonationSum, setLocalDonationSum] = useState(0n);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const { signTransaction, submitTransaction, account } = useWallet();

  const handleDonate = async () => {
    if (!donationAmount || parseFloat(donationAmount) <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid fan donation amount.", variant: "destructive" });
      return;
    }
    if (!account) {
      toast({ title: "Wallet not connected", description: "Please connect your wallet first.", variant: "destructive" });
      return;
    }
    
    setIsProcessing(true);
    try {
      // Amount in octas
      const amountOctas = BigInt(Math.floor(parseFloat(donationAmount) * 100000000));
      
      const { getAptosClient } = await import("@/utils/aptosClient");
      const aptos = getAptosClient();

      const transaction = await aptos.transaction.build.simple({
        sender: account.address,
        data: {
          function: `${moduleAddress}::Donation::donate`,
          functionArguments: [nft.tokenAddress, amountOctas],
        },
      });

      const { authenticator } = await signTransaction({
        transactionOrPayload: transaction,
      });

      const response = await submitTransaction({
        transaction,
        senderAuthenticator: authenticator,
      });

      await aptos.waitForTransaction({ transactionHash: response.hash });
      
      toast({
        title: "🎉 Fan Donation Successful!",
        description: "Thank you for your support!",
      });
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      setDonationAmount("");
      
      setLocalDonationSum(prev => prev + amountOctas);
      
      if (onTotalsChange) onTotalsChange();
      if (onDonation) {
        onDonation({ donor: account.address.toString(), amount: amountOctas, tokenId });
      }
      
    } catch (error) {
      console.error(error);
      toast({
        title: "Donation Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const shortenedAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  const handleCopyAddress = () => {
    if (owner) {
      navigator.clipboard.writeText(owner);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const computedTotalDonations = (totalDonations ?? 0n) + localDonationSum;
  const nftImage = normalizeIpfsUrl(metadata?.image);

  // Poll for events specific to this token periodically
  useEffect(() => {
    const fetchEvents = async () => {
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
              type: `${moduleAddress}::Donation::DonationReceived`,
            },
          },
        })) as { events: any[] };
        const moduleEvents = response.events || [];
        
        const filtered = moduleEvents.filter(
          (log: any) => Number(log.data.token_id) === tokenId
        );
        
        setEvents(filtered.reverse());
      } catch (e) {
        console.error(e);
      }
    };
    
    fetchEvents();
    const interval = setInterval(fetchEvents, 15000);
    return () => clearInterval(interval);
  }, [tokenId]);

  return (
    <>
      {showConfetti && <Confetti />}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: index * 0.08, ease: "easeOut" }}
      >
        <Card className="overflow-hidden glass-card glow-border-hover border-white/[0.06] transition-all duration-500 hover:scale-[1.02] group">
          <CardHeader className="p-0">
            <div className="relative w-full h-64 overflow-hidden">
              {nftImage ? (
                <Image
                  src={nftImage}
                  alt={metadata.name || ''}
                  fill
                  className="object-cover transition-all duration-700 group-hover:scale-110 group-hover:brightness-110"
                />
              ) : (
                <div className="w-full h-full shimmer rounded-t-lg" />
              )}
              {/* Donation Badge */}
              <div className="absolute top-3 right-3 glow-badge rounded-full bg-purple-600/90 backdrop-blur-sm px-3 py-1 text-xs font-bold text-white">
                {formatAPT(computedTotalDonations)} APT
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 space-y-2.5">
            <CardTitle className="text-base font-bold">{metadata?.name || `NFT #${tokenId}`}</CardTitle>
            <p className="text-sm text-muted-foreground truncate leading-relaxed">{metadata?.description}</p>
            {typeof owner === 'string' && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground font-mono">
                  {shortenedAddress(owner)}
                </p>
                <button
                  onClick={handleCopyAddress}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy address"
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-between items-center p-4 border-t border-white/[0.06]">
            <div>
              <p className="text-sm font-bold gradient-text">{`${formatAPT(computedTotalDonations)} APT`}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Donations</p>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <button
                  disabled={isProcessing}
                  className="gradient-btn text-white text-sm font-semibold px-5 py-2 rounded-full inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Heart className="w-3.5 h-3.5" />
                  Donate
                </button>
              </DialogTrigger>
              <DialogContent className="glass-card border-white/10 sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-lg font-bold">
                    Donate to {metadata?.name || `NFT #${tokenId}`}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    Your support helps the creator. Enter the amount of APT you&apos;d like to donate.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="relative">
                    <Input 
                      type="number" 
                      placeholder="0.05" 
                      value={donationAmount} 
                      onChange={(e) => setDonationAmount(e.target.value)} 
                      disabled={isProcessing}
                      className="pr-12 bg-white/5 border-white/10 focus:border-purple-500/50 focus:ring-purple-500/20"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-semibold">
                      APT
                    </span>
                  </div>
                  <button
                    onClick={handleDonate}
                    disabled={isProcessing}
                    className="w-full gradient-btn text-white font-semibold py-2.5 rounded-xl inline-flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Heart className="w-4 h-4" />
                        Confirm Fan Donation
                      </>
                    )}
                  </button>
                  <div className="space-y-2 pt-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent Donations
                    </h4>
                    <div className="max-h-32 overflow-y-auto space-y-1.5 pr-2">
                      {events.length > 0 ? (
                        events.map((event, idx) => (
                          <div key={idx} className="text-xs text-muted-foreground flex justify-between items-center py-1 px-2 rounded-lg bg-white/[0.03]">
                            <span className="font-mono">{shortenedAddress(event.data.donor)}</span>
                            <span className="font-semibold text-foreground">{formatAPT(BigInt(event.data.amount))} APT</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground/60">No donations yet. Be the first!</p>
                      )}
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardFooter>
        </Card>
      </motion.div>
    </>
  );
}

import type { ResearchSource } from "@how-money/shared";
import type { ResearchEnv } from "../types.js";
import { fetchJsonWithTimeout } from "./fetch.js";

type EtherscanTransferResponse = {
  status?: string;
  result?: Array<{ timeStamp?: string }>;
};

export async function getTokenActivity(
  contractAddress: string,
  env: ResearchEnv
): Promise<{ insight: string; source: ResearchSource } | null> {
  if (!env.ETHERSCAN_API_KEY) {
    return null;
  }

  const url = `https://api.etherscan.io/api?module=account&action=tokentx&contractaddress=${encodeURIComponent(contractAddress)}&startblock=0&endblock=99999999&sort=desc&page=1&offset=20&apikey=${env.ETHERSCAN_API_KEY}`;
  const data = await fetchJsonWithTimeout<EtherscanTransferResponse>(url);
  const transfers = Array.isArray(data.result) ? data.result.length : 0;
  const level = transfers >= 15 ? "high" : transfers >= 5 ? "medium" : "low";

  return {
    insight: `Etherscan returned ${transfers} recent token transfers, suggesting ${level} wallet activity.`,
    source: {
      title: "Etherscan token transfer activity",
      url: `https://etherscan.io/token/${contractAddress}`,
      provider: "etherscan",
      excerpt: `${transfers} recent transfers sampled from Etherscan.`
    }
  };
}

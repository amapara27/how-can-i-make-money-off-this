import type { ResolvedEntities } from "../schemas.js";
import type { OnchainAgentOutput, ResearchEnv } from "../types.js";
import { getTokenActivity } from "../providers/etherscan.js";

export async function runOnchainAgent(
  resolved: ResolvedEntities,
  env: ResearchEnv
): Promise<OnchainAgentOutput> {
  const contracts = resolved.cryptoTokens
    .map((token) => token.contractAddress)
    .filter((contractAddress): contractAddress is string => Boolean(contractAddress));

  if (contracts.length === 0) {
    return {
      insights: [],
      sources: []
    };
  }

  const results = await Promise.allSettled(contracts.map((contractAddress) => getTokenActivity(contractAddress, env)));
  const activity = results
    .filter((result): result is PromiseFulfilledResult<NonNullable<Awaited<ReturnType<typeof getTokenActivity>>>> => {
      return result.status === "fulfilled" && result.value !== null;
    })
    .map((result) => result.value);

  return {
    insights: activity.map((result) => result.insight),
    sources: activity.map((result) => result.source)
  };
}

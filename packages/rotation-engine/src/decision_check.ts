import type { CandidateRotation, DecisionCheck } from '@project-eden/contracts';

/** Keep preferences and the displayed set fixed; remove a source of score differences at a time.
 * This does not regenerate candidates, rerun the daily replay, or estimate real-world success. */
export function decisionCheck(options: CandidateRotation[], priorities: Record<string, number | undefined>): DecisionCheck {
  const dimensions = [...new Set(options.flatMap(o => Object.keys(o.scores)))];
  const weights = Object.fromEntries(dimensions.map(d => [d, priorities[d] ?? 0.05]));
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0);
  const rank = (neutralized: string[]) => {
    const scores = options.map(o => ({ optionId: o.id, score: weightSum > 0
      ? dimensions.reduce((sum, d) => sum + weights[d] * (neutralized.includes(d) ? 0.5 : o.scores[d] ?? 0), 0) / weightSum
      : 0.5 }));
    const highest = Math.max(...scores.map(s => s.score));
    // Scores within the engine's 0.001 display precision are tied, never a decisive winner.
    const leaderIds = scores.filter(s => highest - s.score < 0.001).map(s => s.optionId);
    return { leaderIds, scores: scores.map(s => ({ ...s, score: Number(s.score.toFixed(4)) })) };
  };
  const nominal = rank([]);
  const definitions = [
    { id: 'without_income', dims: ['income'], label: { bn: 'নমুনা আয়ের পার্থক্য বাদ দিলে', en: 'Without illustrative income differences' } },
    { id: 'without_soil', dims: ['soil'], label: { bn: 'মাটির অনুমানভিত্তিক স্কোর বাদ দিলে', en: 'Without the soil practice score' } },
    { id: 'without_heuristics', dims: ['income', 'soil', 'pest', 'fodder'], label: { bn: 'আয় ও নিয়মভিত্তিক স্কোর বাদ দিলে', en: 'Without income and rule-based scores' } },
    { id: 'without_water_heat', dims: ['water', 'heat'], label: { bn: 'পানি ও তাপের স্কোর বাদ দিলে', en: 'Without water and heat scores' } },
  ];
  const scenarios = definitions.flatMap(def => {
    const neutralizedDimensions = def.dims.filter(d => dimensions.includes(d) && weights[d] > 0);
    if (!neutralizedDimensions.length) return [];
    const result = rank(neutralizedDimensions);
    return [{ id: def.id, label: def.label, neutralizedDimensions, ...result,
      nominalLeaderRetained: nominal.leaderIds.some(id => result.leaderIds.includes(id)) }];
  });
  return { method: 'displayed-score-ablation-v1', scope: 'displayed_options_only', weights,
    nominalLeaderIds: nominal.leaderIds, recommendedOptionId: options[0]?.id ?? null, scenarios };
}

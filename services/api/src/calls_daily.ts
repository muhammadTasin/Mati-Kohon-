/**
 * The daily farmer-call job from a terminal or a scheduler (cron, Windows Task Scheduler), after the daily NASA
 * update. It works on the same stores as the server (services/api/.data), so the SAAO approves on the dashboard.
 *
 *   npm run calls:daily                          build today's call list (proposals for the SAAO) and print it
 *   npm run calls:daily -- --date 2026-11-06     the list for another day (what goes out next week)
 *   npm run calls:daily -- --send --due          send the approved calls whose slot has started (morning 9:00,
 *                                                afternoon 15:00, evening 19:00 Bangladesh time) and today's retries
 *   npm run calls:daily -- --follow-up           read the providers' reports; retry and SMS the unanswered
 *   add --live to let --send and --follow-up place real calls and SMS; they are real only when VOICEBLAST_LIVE=1
 *   (or BROADCAST_LIVE=1 with CALL_PROVIDER=broadcast) and SMS_LIVE=1 are set as well. Otherwise every call is a dry
 *   run that is recorded but dials nobody. Sample farmers are never dialled.
 *
 * A schedule: 07:00 build (after the daily update), then --send --due at 09:00, 15:00 and 19:00, and --follow-up an
 * hour after each send. Approval stays with the SAAO: nothing is sent that the officer did not approve.
 */
import { buildPlan, callsOn, dhakaToday, followUp, sendApproved } from './farmer_calls.ts';
import { farmerById } from './officer_desk.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const has = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const date = arg('date') ?? dhakaToday();
  const live = has('live');
  const send = has('send'), follow = has('follow-up');
  if (!send && !follow) {
    const plan = buildPlan(date);
    console.log(`Call list for ${date}: ${plan.calls.length} call(s)`);
    for (const c of plan.calls) {
      const f = farmerById(c.farmerId);
      console.log(`  [${c.status}] ${c.farmerId} ${f?.nameEnglish ?? ''} · ${c.kind}${c.emergency ? ' (emergency)' : ''} · ${c.slot} · ~${c.durationSeconds} s`);
      console.log(`      ${c.titleEnglish}: ${c.whyEnglish}`);
    }
    for (const s of plan.skipped) console.log(`  - ${s.farmerId}: ${s.reason}`);
    console.log('The SAAO approves the list on the dashboard (Calls and SMS); then run with --send.');
    return;
  }
  if (send) {
    const out = await sendApproved({ date, allowLive: live, dueOnly: has('due') });
    console.log(`Sent ${out.sent.length} call(s) via ${out.route}${out.live ? ' (LIVE)' : ' (dry run)'}`);
    for (const r of out.sent) console.log(`  ${r.farmerId} ${r.outcome}${r.note ? ` · ${r.note}` : ''}`);
  }
  if (follow) {
    const out = await followUp({ allowLive: live });
    console.log(`Follow-up: ${out.checked.length} report(s) read; retry: ${out.retries.length}; unreached: ${out.unreached.length}`);
  }
  const counts = callsOn(date).reduce<Record<string, number>>((n, c) => ({ ...n, [c.status]: (n[c.status] ?? 0) + 1 }), {});
  console.log(`${date}:`, JSON.stringify(counts));
}

main().catch(err => {
  console.error(err?.message ?? err);
  process.exit(1);
});

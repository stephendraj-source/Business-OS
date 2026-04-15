import { db, processesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const benchmarks: Record<number, string> = {
  1: "≥15% program ROI; ≥80% portfolio aligned to strategy; strategy refresh ≤18 months",
  2: "≤5% budget variance; impact per $1 ≥$5; funding coverage ratio ≥90%",
  3: "Board pack distributed ≥5 business days before meeting; 100% on-time distribution rate",
  4: "≥90% programs with approved logic model; outcome measurability score ≥85%",
  5: "0 overdue mitigations; ≤10 open high-risk items; risk register reviewed quarterly",
  6: "Stakeholder NPS ≥45; ≥70% positive perception; annual survey response rate ≥60%",
  7: "≥80% KPI attainment rate; quarterly review cycle; corrective action closure ≤30 days",
  8: "Performance at ≥60th percentile vs sector peers; benchmark review annually",
  9: "Theory of change refreshed annually; stakeholder clarity score ≥80%",
  10: "2–3 new cause areas evaluated per year; ≥75% expansion decisions documented",
  11: "Prospect-to-donor conversion rate ≥12%; major gift pipeline ≥3× annual target; research cost ≤5% of pipeline value",
  12: "Proposal acceptance rate ≥30%; draft-to-send time ≤3 business days; donor engagement score uplift ≥15%",
  13: "Campaign response rate ≥2.5%; average gift ≥$150; cost per dollar raised ≤$0.20",
  14: "Acknowledgement within 48 hours; stewardship touches ≥4 per donor per year; donor retention rate ≥65%",
  15: "Donor reactivation rate ≥20%; annual churn rate ≤20%; win-back campaign ROI ≥150%",
  16: "Forecast accuracy ≥90%; revenue variance to plan ≤±10%; 3-scenario forecast standard",
  17: "Event net revenue ≥60% of gross; attendance rate ≥85% of invited; post-event upgrade rate ≥10%",
  18: "P2P campaign activation rate ≥70%; average fundraiser raised ≥$500; coaching nudge open rate ≥40%",
  19: "CRM data match rate ≥98%; duplicate rate ≤0.5%; sync lag ≤15 minutes",
  20: "Gift policy compliance rate 100%; gift rejection rate ≤2%; recognition published within 30 days of gift",
  21: "≥5 relevant opportunities identified per week; alignment score accuracy ≥85%; application rate ≥40% of eligible",
  22: "Grant success rate ≥35%; draft to submission ≤10 business days; compliance score ≥95%",
  23: "100% on-time reporting rate; 0 missed deadlines; alert lead time ≥30 days",
  24: "Report acceptance rate ≥95% first submission; ≤1 revision cycle; preparation time ≤5 days",
  25: "Budget variance ≤±5%; underspend rate ≤10%; grant close-out within 60 days of end date",
  26: "Funder satisfaction score ≥4.5/5; follow-on grant renewal rate ≥60%; meeting prep time ≤1 day",
  27: "Consortium report accuracy ≥98%; partner data submission on time ≥90%; submission by deadline 100%",
  28: "Scoring inter-rater reliability ≥85%; award decision cycle ≤30 days; sub-grantee impact reporting rate ≥90%",
  29: "Data accuracy rate ≥97%; system update lag ≤2 business days; 100% audit-ready records",
  30: "≥80% of funders with updated profiles within 12 months; funder database covers ≥95% of active targets",
  31: "Content calendar adherence ≥90%; ≥3 channels covered per campaign; engagement rate ≥4%",
  32: "Engagement rate ≥5% (likes/shares/comments); reach ≥10,000/month; content approval ≤2 business days",
  33: "Open rate ≥25%; click-through rate ≥3.5%; unsubscribe rate ≤0.2%; conversion rate ≥1.5%",
  34: "Response to media queries ≤4 hours; positive sentiment ≥70%; coverage volume growth ≥10% YoY",
  35: "Annual report published within 3 months of year-end; donor readership ≥40%; report-driven gift uplift ≥8%",
  36: "Organic traffic growth ≥20% YoY; cost per acquisition ≤$25; ROAS ≥3:1; ad conversion rate ≥2.5%",
  37: "Translation accuracy score ≥97%; localization cycle ≤5 business days; regional engagement uplift ≥15%",
  38: "Ambassador reach ≥50,000/campaign; campaign participation rate ≥70%; ambassador-driven donations ≥5% of total",
  39: "Message resonance score ≥75%; sentiment improvement ≥10% per quarter; conversion lift ≥8% per optimisation",
  40: "First public statement within 2 hours; stakeholder satisfaction post-crisis ≥70%; playbook reviewed annually",
  41: "Intake processing time ≤5 business days; eligibility accuracy ≥97%; applicant satisfaction ≥4/5",
  42: "Milestone completion rate ≥90%; program variance flagged within 48 hours; issue resolution ≤10 business days",
  43: "Data completeness rate ≥95%; outcome measurement coverage ≥85% of beneficiaries; insight-to-action ≤30 days",
  44: "Shift fill rate ≥95%; no-show rate ≤5%; volunteer satisfaction score ≥4.2/5",
  45: "Procurement cycle ≤10 business days; cost savings ≥8% vs budget; supplier compliance rate ≥95%",
  46: "Survey response rate ≥50%; Net Satisfaction Score ≥80%; ≥80% of improvements implemented within 6 months",
  47: "Incident reporting within 24 hours; case closure rate ≥95% within SLA; annual compliance audit pass rate 100%",
  48: "Mission preparation time ≤10 business days; cost variance ≤±10%; 0 preventable safety incidents",
  49: "Forecast accuracy ≥90%; overspend incidents ≤2 per year; budget utilization 85%–100%",
  50: "Learning cycle ≥quarterly; ≥75% recommendations implemented; program improvement rate ≥15% per cycle",
  51: "Month-end close ≤5 business days; variance commentary accuracy ≥98%; board pack delivered on time 100%",
  52: "Invoice processing time ≤2 business days; exception rate ≤3%; payment on-time rate ≥98%",
  53: "Filing by statutory deadline 100%; ≤3 audit adjustments; 100% required disclosure notes complete",
  54: "Fund reconciliation accuracy ≥99.5%; 0 restricted fund breaches; fund close within 15 business days",
  55: "Gift Aid reclaim rate ≥98% of eligible gifts; submission accuracy 100%; reclaim processing ≤30 days",
  56: "Control effectiveness rate ≥85%; finding resolution ≤60 days; repeat finding rate ≤5%",
  57: "Payroll accuracy rate ≥99.9%; on-time payment rate 100%; 0 PAYE compliance breaches",
  58: "Forecast accuracy ≥92%; cash buffer ≥8 weeks operating costs; investment return within ±50bps of benchmark",
  59: "Compliance score ≥95%; 0 overdue regulatory obligations; 0 material regulatory breaches per year",
  60: "Claim processing ≤3 business days; policy compliance rate ≥95%; exception rate ≤8%",
  61: "Time to shortlist ≤7 business days; quality of hire score ≥4/5 at 6 months; ≥40% diverse shortlists",
  62: "Onboarding completion rate ≥95% by day 30; time to full productivity ≤90 days; satisfaction score ≥4.3/5",
  63: "Training completion rate ≥90% per quarter; skill gap closure rate ≥60% per cycle; L&D satisfaction ≥4/5",
  64: "Review completion rate ≥95% on time; quality score ≥80%; ≥85% staff with goals aligned to strategy",
  65: "Absence rate ≤4% of working days; wellbeing score ≥70%; burnout risk flags actioned within 5 business days",
  66: "DBS check completion rate 100% before start date; renewal compliance rate 100%; 0 role clearance gaps",
  67: "Annual staff turnover ≤15%; flight risk identification accuracy ≥75%; retention action completion ≥80%",
  68: "Headcount forecast accuracy ≥85%; vacancy fill rate ≥90% within target time; skills gap closure ≥50%/year",
  69: "Volunteer placement rate ≥85% of applications; annual retention rate ≥60%; ≥100 hours/volunteer/year",
  70: "≥90% roles within market benchmark band; pay equity gap ≤5%; benchmarking review completed annually",
  71: "System uptime ≥99.5%; MTTR ≤4 hours for critical systems; incident recurrence rate ≤10%",
  72: "Licence compliance rate 100%; 0 renewals missed; cost per licence ≤market rate by ≥10%",
  73: "Data quality score ≥97%; anomaly detection rate ≥95%; correction cycle ≤2 business days",
  74: "Vulnerability closure ≤30 days (critical ≤24 hours); phishing click rate ≤5%; security training completion ≥95%",
  75: "CRM uptime ≥99.5%; user adoption rate ≥85%; workflow error rate ≤1%; change deployment ≤5 business days",
  76: "SAR response within 30 days 100%; DPIA completion before deployment 100%; 0 notifiable breaches unreported",
  77: "Integration uptime ≥99.5%; sync error rate ≤0.5%; data latency ≤5 minutes",
  78: "Pipeline reliability ≥99%; report load time ≤3 seconds; data freshness ≤1 hour; self-service adoption ≥70%",
  79: "Roadmap delivery rate ≥80%; value realisation ≥75% of business case; stakeholder satisfaction ≥4/5",
  80: "Model accuracy ≥90%; 0 unmitigated bias incidents; governance compliance score ≥95%",
  81: "Tech spend variance ≤±5%; ROI achievement ≥80% of business case; cost per user ≤market benchmark",
  82: "First contact resolution rate ≥75%; ticket resolution ≤4 hours (critical) ≤1 day (standard); user satisfaction ≥4.2/5",
  83: "Cloud cost savings ≥15% YoY; resource utilisation ≥70%; anomaly detection rate ≥95%",
  84: "Retention policy compliance 100%; storage cost reduction ≥10% per year; overdue deletion rate 0%",
  85: "Due diligence completion before contract 100%; vendor risk score reviewed annually; contract review ≤10 business days",
  86: "DR test completion rate 100% per year; RTO met ≥95% in tests; BCP updated at least annually",
  87: "Data dictionary coverage ≥90% of key entities; metadata accuracy ≥95%; steward adoption ≥75%",
  88: "AI policy adoption rate ≥90%; 0 material unauthorised AI incidents; training completion ≥95%",
  89: "Test coverage ≥80%; defect escape rate ≤2%; release cycle ≤2 weeks for standard releases",
  90: "Duplicate rate reduction ≥80%; golden record accuracy ≥99%; master data adoption ≥85% of key systems",
  91: "Dashboard adoption rate ≥80% of leadership; insight accuracy ≥90%; decision cycle time reduction ≥20%",
  92: "WCAG 2.1 AA compliance ≥95% of pages; accessibility issue closure ≤30 days; user accessibility score ≥4/5",
  93: "≥10 external data sources monitored; insight utilisation rate ≥50%; data refreshed ≤weekly",
  94: "Search success rate ≥80%; knowledge base usage ≥3 queries/staff/month; time-to-answer reduction ≥30%",
  95: "API documentation coverage 100%; deprecation notice ≥90 days lead time; API error rate ≤0.1%",
  96: "Ethics assessment completed before deployment 100%; flagged issues resolved before go-live ≥95%",
  97: "Provisioning time ≤1 business day; access review completion ≥99% per cycle; orphaned accounts 0%",
  98: "Detection time ≤1 hour (critical); containment ≤4 hours; breach notification compliance rate 100%",
  99: "Architecture review completed annually; tech debt reduced ≥20% per year; architecture alignment score ≥80%",
  100: "Conversion rate improvement ≥10% per test cycle; test velocity ≥2 tests/month; uplift vs control ≥8%",
};

async function addBenchmarks() {
  console.log("Adding industry benchmarks...");

  for (const [numStr, benchmark] of Object.entries(benchmarks)) {
    const num = parseInt(numStr, 10);
    await db
      .update(processesTable)
      .set({ industryBenchmark: benchmark })
      .where(eq(processesTable.number, num));
  }

  console.log(`Updated ${Object.keys(benchmarks).length} industry benchmarks.`);
  process.exit(0);
}

addBenchmarks().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});

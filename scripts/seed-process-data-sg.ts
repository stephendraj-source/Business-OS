/**
 * Singapore-context update: sets industry_benchmark, priority, and bpmn
 * for all 100 nonprofit processes, referencing COC, PDPA, CPF, ACRA,
 * IRAS, NCSS, IPC, MCCY, MOM, CSA and other Singapore regulations.
 *
 * Run with:
 *   DATABASE_URL="postgresql://postgres@127.0.0.1/businessos" \
 *   apps/api/node_modules/.bin/tsx scripts/seed-process-data-sg.ts
 */

import pg from "pg";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgresql://postgres@127.0.0.1/businessos" });

function bpmn(id: number, name: string, tasks: [string, string, string, string]): string {
  const s = (v: string) => v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const pid = `SG_${id}`;
  const [t1,t2,t3,t4] = tasks.map(s);
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" targetNamespace="http://bpmn.io/schema/bpmn" id="Def_${pid}">
  <bpmn:process id="Proc_${pid}" name="${s(name)}" isExecutable="false">
    <bpmn:startEvent id="SE_1" name="Start"><bpmn:outgoing>F1</bpmn:outgoing></bpmn:startEvent>
    <bpmn:task id="T1" name="${t1}"><bpmn:incoming>F1</bpmn:incoming><bpmn:outgoing>F2</bpmn:outgoing></bpmn:task>
    <bpmn:task id="T2" name="${t2}"><bpmn:incoming>F2</bpmn:incoming><bpmn:outgoing>F3</bpmn:outgoing></bpmn:task>
    <bpmn:task id="T3" name="${t3}"><bpmn:incoming>F3</bpmn:incoming><bpmn:outgoing>F4</bpmn:outgoing></bpmn:task>
    <bpmn:task id="T4" name="${t4}"><bpmn:incoming>F4</bpmn:incoming><bpmn:outgoing>F5</bpmn:outgoing></bpmn:task>
    <bpmn:endEvent id="EE_1" name="End"><bpmn:incoming>F5</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="F1" sourceRef="SE_1" targetRef="T1"/>
    <bpmn:sequenceFlow id="F2" sourceRef="T1" targetRef="T2"/>
    <bpmn:sequenceFlow id="F3" sourceRef="T2" targetRef="T3"/>
    <bpmn:sequenceFlow id="F4" sourceRef="T3" targetRef="T4"/>
    <bpmn:sequenceFlow id="F5" sourceRef="T4" targetRef="EE_1"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_1">
    <bpmndi:BPMNPlane id="Plane_1" bpmnElement="Proc_${pid}">
      <bpmndi:BPMNShape id="SE_di" bpmnElement="SE_1"><dc:Bounds x="152" y="82" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="155" y="125" width="30" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="T1_di" bpmnElement="T1"><dc:Bounds x="240" y="60" width="140" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="T2_di" bpmnElement="T2"><dc:Bounds x="430" y="60" width="140" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="T3_di" bpmnElement="T3"><dc:Bounds x="620" y="60" width="140" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="T4_di" bpmnElement="T4"><dc:Bounds x="810" y="60" width="140" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EE_di" bpmnElement="EE_1"><dc:Bounds x="1002" y="82" width="36" height="36"/><bpmndi:BPMNLabel><dc:Bounds x="1006" y="125" width="28" height="14"/></bpmndi:BPMNLabel></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="F1_di" bpmnElement="F1"><di:waypoint x="188" y="100"/><di:waypoint x="240" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F2_di" bpmnElement="F2"><di:waypoint x="380" y="100"/><di:waypoint x="430" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F3_di" bpmnElement="F3"><di:waypoint x="570" y="100"/><di:waypoint x="620" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F4_di" bpmnElement="F4"><di:waypoint x="760" y="100"/><di:waypoint x="810" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="F5_di" bpmnElement="F5"><di:waypoint x="950" y="100"/><di:waypoint x="1002" y="100"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

type Row = [number, string, [string,string,string,string], string, number];

const DATA: Row[] = [
  // ── Strategy & Governance ─────────────────────────────────────────────────
  [1,"Multi-Year Strategy Planning",
    ["Gather stakeholder input & environment scan","Draft strategic plan aligned to Charity Council COG requirements","Board of Trustees review & approval","Cascade to programmes & report to Commissioner of Charities (COC)"],
    "Charity Council Code of Governance (COG) Tier 3/4 requires a board-approved strategic plan; top Singapore charities review strategy every 3–5 years; COC expects 70%+ of programmes aligned to stated mission; IPC renewal requires evidence of strategic direction",1],

  [2,"Annual Budget Allocation",
    ["Collect programme bids & MCCY/NCSS grant projections","Finance team consolidation & scenario modelling in SGD","Leadership review against COG financial prudence requirements","Board of Trustees approval & communication to MCCY if grant-funded"],
    "COG requires board-approved annual budget; Singapore charities benchmark admin ratio <20% of total expenditure; programme spend >65% recommended; budget variance <5%; operating reserves of 3–6 months operating costs recommended by Charity Council",1],

  [3,"Board Meeting Preparation",
    ["Compile papers including COC-required governance disclosures","CEO review & sign-off on agenda and board papers","Distribute to trustees at least 5 working days in advance","Capture decisions & actions; circulate minutes within 14 days per COG best practice"],
    "COG recommends minimum 4 board meetings per year for Tier 2–4 charities; board pack distributed 5 working days in advance; quorum as defined in charity's constitution; minutes filed and retained for COC inspection; trustees must be at least 21 years of age under Charities Act",2],

  [4,"Outcomes Framework Design",
    ["Map theory of change aligned to NCSS or sector standards","Define measurable indicators using data.gov.sg & sector benchmarks","Co-design with beneficiaries & validate with programme staff","Embed into COC annual return & IPC renewal reporting"],
    "COC requires charities to demonstrate community benefit; NCSS Social Service Standards require measurable programme outcomes; IPC status renewal requires evidence of impact; Charity Transparency Framework promotes public reporting of outcomes; >80% of programmes should have measurable indicators",2],

  [5,"Enterprise Risk Register",
    ["Identify & assess risks including regulatory risks under Charities Act","Score likelihood & impact; assign trustees as risk owners","Develop mitigations; report material risks to COC if required","Board Audit Committee review quarterly; update risk register"],
    "COG Tier 3/4 requires a board-level risk management policy; charities must notify COC of serious incidents (financial irregularities, legal proceedings, reputational issues) within 7 days; MCCY expects robust risk management for grant recipients; all high risks to have named owners",1],

  [6,"Stakeholder Trust Survey",
    ["Design survey covering beneficiaries, donors & community","Distribute via preferred channels; ensure PDPA consent obtained","Analyse results & compare against Charity Transparency Framework indicators","Report to board & publish summary on charity's website or Charity Portal"],
    "Singapore's Charity Transparency Framework encourages public trust reporting; Charity Council surveys show 82% of Singaporeans trust registered charities; recommend NPS >+30 for sector; beneficiary satisfaction surveys required by NCSS for funded VWOs; PDPA consent mandatory for survey data collection",3],

  [7,"Quarterly KPI Review",
    ["Collect actuals from programme heads aligned to COC annual return metrics","Validate data & prepare dashboard for leadership","Leadership review with root-cause analysis for red KPIs","Report to board; update COC annual return data fields accordingly"],
    "COC annual return requires financial & programme statistics; Charity Council GEC recommends quarterly performance review; KPI attainment target 85%+; COC expects transparency on programme reach and outcomes; MCCY/NCSS grant KPIs must be tracked and reported",2],

  [8,"Peer Impact Benchmarking",
    ["Identify peer charities & sector benchmarking data (NVPC, NCSS, Charity Portal)","Gather comparative data from Singapore Charities Annual Report & sector surveys","Analyse performance gaps & benchmark against COC published statistics","Present findings to board & set improvement targets"],
    "NVPC publishes annual Individual Giving Study and VWO benchmarks; NCSS conducts sector-wide surveys; Charity Portal publishes aggregated charity statistics; Charity Transparency Framework enables peer comparison; Singapore charity sector revenue grew 6.4% in 2022 per COC Annual Report",4],

  [9,"Theory of Change Review",
    ["Review current ToC against programme evidence & beneficiary data","Conduct consultations with beneficiaries, staff & NCSS/MCCY programme officers","Update logic model & assumptions; document changes","Present revised ToC to board for endorsement; upload to Charity Portal if IPC"],
    "COC and IPC renewal process requires demonstrated community benefit and impact; NCSS Logic Model framework used by many Singapore VWOs; SSI (Social Service Institute) provides ToC training; annual review recommended; beneficiary input essential for MSF-funded programmes",2],

  [10,"Cause Area Assessment",
    ["Scan Singapore social landscape using SingStat, MSF & MOH data","Assess alignment with MCCY, MOH or relevant ministry priorities","Score new areas against charity's constitution and COC permitted objects","Present recommendations to board; seek COC approval to amend objects if required"],
    "Charities Act requires COC approval to change charitable objects; MCCY Social Service Masterplan identifies priority areas; Singapore social needs include ageing population, mental health & rental housing support; COC annual report highlights emerging cause areas; expansion success rate tracked at 3 years",3],

  // ── Fundraising & Donor Management ────────────────────────────────────────
  [11,"Major Donor Prospecting",
    ["Research Singapore HNW prospects using Giving.sg, UBS/DBS philanthropy data","Qualify prospects against IPC donation tax benefit eligibility (250% deduction)","Assign relationship managers & personalise cultivation plans","Track progress in CRM with PDPA-compliant donor records"],
    "IPC status enables donors to claim 250% tax deduction on qualifying donations; Singapore HNW philanthropy growing — UBS Wealth Management SG estimates S$18B charitable giving by 2030; Giving.sg platform has 2M+ users; prospect-to-donor conversion target 15–25% for major gift programmes",1],

  [12,"Donor Cultivation Proposals",
    ["Research donor interests & past IPC-qualifying giving history","Draft personalised proposal including 250% tax deduction benefit for IPC donations","Director/Chairman review & sign-off","Submit proposal; issue IRAS-compliant tax deduction receipt upon gift"],
    "IPC charities must issue tax deduction receipts referencing IRAS guidelines; donor proposals should highlight 250% deduction benefit; Gift deduction receipts to be issued within 30 days of receipt; proposal acceptance rate target 25–40%; corporate donors may need IRAS Form B confirmation",1],

  [13,"Donor Campaign Segmentation",
    ["Export & clean donor data in PDPA-compliant CRM","Apply RFM segmentation; validate against DNC Registry before outreach","Design tailored messaging for each segment; include PDPA-required opt-out","Execute via Giving.sg, email & direct mail; track response by segment"],
    "PDPA requires valid consent for marketing communications; DNC Registry must be checked before unsolicited calls/messages; Giving.sg averages S$150 per online donation; email open rates for SG nonprofits 22–28%; direct mail response 3–8% for warm segments; unsubscribe rate should be <0.5%",2],

  [14,"Donor Stewardship Automation",
    ["Design stewardship journey compliant with PDPA data use purposes","Configure automation in CRM; include IPC tax receipt trigger within 30 days","Test journeys; validate PDPA opt-in status before every communication","Monitor engagement metrics; suppress unsubscribers per PDPA obligations"],
    "PDPA accuracy & retention obligations apply to all donor data; IPC tax receipts must be issued within 30 days of donation; automated stewardship improves donor retention by 10–15%; CAAS-style annual giving programmes target 4–6 touches per major donor per year; DNC Registry compliance mandatory",1],

  [15,"Donor Churn Prevention",
    ["Identify lapsed & at-risk donors via CRM analytics; validate PDPA consent is current","Segment by lapse period & IPC giving history","Execute targeted reactivation via Giving.sg, email & personalised mail","Track reactivation rate & update PDPA consent status accordingly"],
    "Singapore sector average donor retention: 40–50%; first-year retention 25–35%; lapsed donor reactivation rate 8–15%; Giving.sg Giving Week drives significant reactivation; PDPA requires refreshing consent if data use has changed; charity churn prevention target: overall retention >60%",1],

  [16,"Fundraising Revenue Forecast",
    ["Collect pipeline from fundraising teams including government grants (MCCY, NCSS, Tote Board)","Build rolling 12-month forecast by income stream in SGD","Scenario model against MCCY grant renewal cycle & Tote Board funding rounds","Present to Board Treasurer & adjust plans with COG financial prudence in mind"],
    "COG requires board oversight of financial sustainability; Singapore charities derive 40–60% of income from government grants (NCSS, MCCY, Tote Board, ComChest); private donations via Giving.sg growing 15% YoY; forecast accuracy target ±10%; monthly reforecast recommended",2],

  [17,"Fundraising Event Logistics",
    ["Obtain Charitable Fundraising Appeal (CFA) licence from COC if public fundraising","Secure venue (NEA permit if outdoor); coordinate AV, catering & security","Execute event; ensure PayNow/GIRO donation options are available","Reconcile event accounts; submit post-event report to COC if CFA was required"],
    "Charitable Fund-raising Appeals (CFA) require a licence from the Commissioner of Charities for public fundraising; NEA permits for outdoor events; Singapore charity events benchmark net ROI 2:1 to 3:1; PayNow QR code standard for donations at events; post-event financial report required if CFA licence obtained",3],

  [18,"P2P Campaign Monitoring",
    ["Launch P2P campaign on Giving.sg & recruit fundraisers","Monitor activation; send WhatsApp/email coaching communications","Track revenue against milestones; leverage Giving.sg analytics dashboard","Reconcile funds received via Giving.sg; issue IPC tax receipts to donors"],
    "Giving.sg is Singapore's primary P2P fundraising platform; average raised per active fundraiser S$600–S$1,200; Giving.sg Giving Week (November) drives 3–5x uplift; platform fee ~3.5%; 35–45% of registered fundraisers typically activate; IPC receipts issued by Giving.sg automatically if IPC status verified",3],

  [19,"Fundraising Platform Integration",
    ["Map data fields between CRM and Giving.sg/PayNow/GIRO","Configure API integration or file-based sync with Giving.sg","Test data flows; validate PDPA data-sharing consent and processing basis","Monitor sync logs daily; resolve exceptions within 24 hours; retain audit trail for COC"],
    "Giving.sg API available for data sync; PayNow integration is standard for Singapore charities; PDPA requires documented data-sharing agreements with platforms; <1% duplicate rate target; same-day sync recommended; IRAS tax deduction data must be accurate for IPC reporting",2],

  [20,"Gift Acceptance Policy",
    ["Review incoming gift against board-approved gift acceptance policy","Escalate gifts with conditions/restrictions to Gift Acceptance Committee","Issue IPC-compliant tax deduction receipt within 30 days","Record in CRM under correct fund; notify Finance for restricted fund accounting"],
    "COG requires charities to have a gift acceptance policy covering restricted donations, in-kind gifts & cryptocurrency; IPC charities must only accept qualifying donations for tax deduction purposes; gifts with conditions must be reviewed by board; COC guidelines advise caution on anonymous donations >S$10,000",3],

  // ── Grant Management ───────────────────────────────────────────────────────
  [21,"Grant Opportunity Scanning",
    ["Monitor government grant portals: SG Cares, NCSS, Tote Board, MCCY, ComChest","Score opportunities against mission, COC-permitted objects & eligibility criteria","Triage shortlist with programme & finance leads","Log in grants pipeline; track MCCY/NCSS application windows"],
    "Key Singapore government funders: NCSS (VWO grants), MCCY (Community Development Fund), Tote Board (charity grants), ComChest, Community Foundation of Singapore (CFS); GrantConnect Singapore portal centralising some opportunities; government grants form 40–60% of VWO income; application windows often annual",2],

  [22,"Grant Application Writing",
    ["Brief programme team & gather outcome data aligned to funder's KPIs","Draft application narrative & budget in SGD to NCSS/MCCY format","Internal review by CEO & Finance; compliance check against funder conditions","Submit via government portal or email; confirm receipt & log in grants system"],
    "NCSS grant application success rates 60–80% for established VWOs; MCCY CDF grants competitive; application turnaround 10–15 working days for major grants; co-funding requirements vary (NCSS typically requires 20–30% co-funding); government grants require ACRA-registered entity & COC charity registration",1],

  [23,"Grant Compliance Calendar",
    ["Extract all reporting obligations from NCSS, MCCY & Tote Board grant agreements","Build compliance calendar with named owners; flag COC annual return deadline (6 months after FYE)","Set automated 30-day alerts for all milestones in grant management system","Track completion; escalate overdue items to CEO; update Charity Portal as required"],
    "COC annual return must be filed within 6 months of financial year-end via Charity Portal; NCSS grants require quarterly or half-yearly progress reports; MCCY grants may require monthly financial reports; Tote Board has specific milestone reporting; 100% on-time reporting is COC expectation; late filing may trigger COC inquiry",1],

  [24,"Grant Progress Reporting",
    ["Collect programme data & expenditure reports from NCSS-approved accounting format","Draft narrative against funder KPIs; include beneficiary count & outcome data","Finance Director & CEO review & sign-off","Submit via NCSS VWO Portal, MCCY portal or Charity Portal as required"],
    "NCSS requires reports via the VWO Portal (vwoGrants system); MCCY reports via designated email or portal; first-submission acceptance rate >90% target; average 1–2 revision cycles; outcome data must align with NCSS Social Service Standards; beneficiary counts tracked for COC annual return",1],

  [25,"Grant Budget Monitoring",
    ["Download expenditure actuals from finance system; map to NCSS/MCCY budget heads","Compare actuals to approved grant budget; flag variances >5%","Discuss variances with programme team; apply virement policy (typically ≤10% between budget lines without funder approval)","Seek funder approval for significant reallocations; update forecast"],
    "NCSS and MCCY grants typically allow budget virement of up to 10% between budget lines without approval; over/underspend >10% requires funder notification; grant close-out financial statements due within 60–90 days of grant end; Tote Board requires audited grant accounts for grants >S$500k",2],

  [26,"Funder Relationship Management",
    ["Schedule annual relationship meetings with NCSS, MCCY & Tote Board officers","Prepare impact evidence & financial stewardship report in advance","Conduct meeting; record agreed actions & feedback in CRM","Follow up within 5 working days; update funder database with renewal intelligence"],
    "NCSS relationship managers assigned to each VWO; annual VWO-NCSS dialogue sessions; Tote Board Community Partnership Managers; Community Foundation of Singapore programme officers; government funders expect transparent reporting & proactive communication; grant renewal success rate 75–85% for compliant VWOs",2],

  [27,"Consortium Grant Reporting",
    ["Issue standardised data collection templates to consortium partners","Validate partner data against NCSS/MCCY reporting requirements","Consolidate into lead agency narrative & financial report","Lead CEO sign-off; submit to funder; distribute copy to all partners"],
    "NCSS may fund consortium arrangements with designated lead agency; lead agency is accountable to COC and NCSS for all consortium funds; partner data quality target >95%; MOH Joint Integrated Care grants often consortium-based; consolidated report due within 10 working days of data collection close",3],

  [28,"Sub-Grantee Proposal Review",
    ["Circulate call for proposals to eligible sub-grantees with COC-registered status","Conduct structured scoring using published criteria; minimum 3-person panel","Moderation & final decision by board committee","Issue award letters & sub-grant agreements compliant with COC guidance on grant disbursement"],
    "COC expects charities that disburse grants to have transparent selection processes; NCSS sub-vention framework applies to some NCSS-funded VWOs; sub-grantees should be COC-registered; award decision within 30 days of deadline; sub-grant agreements must include reporting & clawback provisions",3],

  [29,"Grants System Data Quality",
    ["Run monthly data quality audit on grants management records","Generate exceptions report & assign corrections to grants team","Update records; validate completeness for COC annual return data fields","Produce data quality dashboard; retain audit-ready records for 7 years per IRAS/COC requirements"],
    "COC annual return data must be accurate; financial records retained for minimum 5 years (recommended 7 years to align with IRAS); grants system audit trail required for COC inspection; NCSS VWO Portal data must match financial statements; 95%+ data accuracy target",2],

  [30,"Funder Intelligence Database",
    ["Schedule quarterly review of funder database","Research updates from Charity Portal, CFS, Tote Board & MCCY announcements","Update database; add new funders from Singapore Philanthropy Week & sector events","Share monthly funder intelligence digest with fundraising team"],
    "Key Singapore funders to track: NCSS, MCCY, Tote Board, ComChest, Community Foundation of Singapore, Temasek Foundation, Lee Foundation, Shaw Foundation, Ng Teng Fong Charitable Foundation; Giving.sg corporate partners; CSR funds from banks (DBS, OCBC, UOB); 80%+ records updated within 12 months",3],

  // ── Marketing, Brand & Communications ─────────────────────────────────────
  [31,"Content Calendar Planning",
    ["Gather content inputs from teams; align to Singapore national events (National Day, Racial Harmony Day, Total Defence Day)","Draft 4-week rolling content calendar with channel assignments","Cross-team review; ensure sensitivity to Singapore's multiracial context","Publish calendar; brief content creators on PDPA-compliant photo/video consent"],
    "Singapore content must be sensitive to multiracial, multilingual context; national campaigns (NDP, CHC, ComChest flag day) drive peaks; social media content calendar adherence target 85%+; IMDA guidelines on online content; content in all 4 official languages recommended for wide reach",2],

  [32,"Social Media Content Creation",
    ["Define content brief aligned to Singapore audience insights","Create copy & visuals; ensure representation of Singapore's multiracial community","Internal review; obtain photo/video consent per PDPA before publishing","Schedule via social media tool; monitor engagement within 24 hours"],
    "Singapore social media benchmark for nonprofits: Facebook engagement 1–3%; Instagram 3–5%; LinkedIn 0.5–1%; TikTok growing among youth charities; WhatsApp groups used for community engagement; posting 3–5x/week optimal; Giving.sg shares social content amplification; PDPA requires consent for identifiable beneficiary images",3],

  [33,"Donor Email Newsletters",
    ["Segment email list; verify PDPA opt-in consent status in CRM","Draft newsletter; include 250% IPC tax deduction reminder for IPC charities","Test across devices; verify unsubscribe link & PDPA footer compliance","Schedule send; monitor open/CTR within 48 hours; suppress unsubscribers immediately"],
    "Singapore nonprofit email open rates 22–28%; CTR 3–5%; PDPA requires valid consent and functional unsubscribe mechanism; emails must include charity's registered name, UEN & COC registration number; Giving.sg newsletters achieve 30%+ open rates; unsubscribe rate target <0.5%",2],

  [34,"Brand Monitoring",
    ["Set up Google Alerts, Meltwater or Mention for charity name in SG media (CNA, Straits Times, Lianhe Zaobao, Berita Harian, Tamil Murasu)","Daily review of brand mentions & sentiment across SG platforms","Respond to media queries within 4 hours; escalate to CEO for sensitive issues","Weekly sentiment report; brief board on any reputational risks"],
    "Singapore media landscape: Channel NewsAsia (CNA), Straits Times, Today Online, Lianhe Zaobao, Berita Harian; social media via Facebook, Instagram, TikTok; MCI monitors online content; crisis response within 4 hours; COC may inquire about negative media coverage; Charity Transparency Framework promotes proactive communications",2],

  [35,"Impact Report Production",
    ["Gather programme data, beneficiary case studies & FY financial summary from annual return","Draft bilingual (English/Chinese at minimum) impact report","CEO & board review; obtain photography consent per PDPA","Publish on Charity Portal, charity website & distribute to MCCY/NCSS funders"],
    "COC Annual Report must be published on Charity Portal within 6 months of FYE; Charity Transparency Framework encourages public impact reporting; NCSS recommends bilingual reporting; report-driven donor retention uplift 5–10%; impact reports support IPC renewal; reading rate among Singapore donors 60–70%",2],

  [36,"SEO & Digital Advertising",
    ["Keyword research targeting Singapore donors & volunteers","Set up Google for Nonprofits grant (US$10k/month ad credits, available to Singapore IPC charities)","Develop ad copy, landing pages & PayNow/Giving.sg conversion tracking","Monitor weekly; optimise bids, copy & audiences; report to digital team"],
    "Google for Nonprofits available to Singapore IPC charities (apply via Google for Nonprofits SG); US$10k/month ad credits; Giving.sg drives significant organic search traffic; Facebook Ads effective for Singapore charity donor acquisition (CPA S$30–S$80); organic traffic growth target 20%+ YoY; ROAS >3:1 for paid campaigns",3],

  [37,"Communications Localisation",
    ["Receive source content from programme team","Translate & culturally adapt into Mandarin, Malay or Tamil as required by target audience","Native-speaker review by bilingual staff or MCI-registered translator","Publish localised content; measure engagement by language segment"],
    "Singapore has 4 official languages (English, Mandarin, Malay, Tamil); charities serving specific communities should communicate in community language; MCCY expects bilingual communications for some grant programmes; HDB estate campaigns benefit from vernacular languages; translation cycle 5–10 working days; MCI-registered translators recommended for formal documents",4],

  [38,"Ambassador Programme Management",
    ["Recruit ambassadors from Singapore community leaders, grassroots advisers & alumni","Co-create social media content & campaign talking points","Activate ambassadors for Giving.sg campaigns, flag day & NDP charity drives","Track reach, referrals & donations attributed to ambassador activity"],
    "Singapore grassroots network (PA, CDC, RC) valuable for community charity ambassadors; Giving.sg ambassador tools built into platform; NCSS recognises VWO ambassadors; Community Leaders (Advisers, RC Chairs) influential in HDB communities; ambassador-driven donations target 5%+ of annual giving; ambassador activity tracked on Giving.sg dashboard",3],

  [39,"Audience Sentiment Analysis",
    ["Design sentiment survey; obtain PDPA consent from respondents","Administer online or in-person; ensure representation across races & languages","Analyse sentiment; flag any community sensitivities to CEO","Report findings to comms team; brief board on public perception trends"],
    "Singapore's multiracial society requires sensitivity analysis across Chinese, Malay, Indian & Other communities; Charity Council trust surveys published periodically; negative sentiment may trigger MCI or COC inquiry; rapid response protocol within 24 hours of sentiment drop; PDPA consent required for all survey respondents",3],

  [40,"Crisis Communications Planning",
    ["Identify Singapore-specific crisis scenarios (reputational, financial irregularity, safeguarding, racial/religious sensitivity)","Draft holding statements; brief CEO & board spokesperson per MCI guidelines","Conduct annual tabletop exercise with CEO, board & comms team","Activate plan within 2 hours; notify COC if reputational or financial crisis per Charities Act S42"],
    "Charities Act S42 requires charities to inform COC of serious incidents including criminal conduct, significant financial loss, reputational damage; MCI provides crisis communications guidance; COC may issue public statements on charity misconduct; response within 2 hours recommended; board chair must be notified immediately for material crises",2],

  // ── Program Delivery & Operations ─────────────────────────────────────────
  [41,"Beneficiary Intake Design",
    ["Design intake form; define eligibility criteria aligned to MCCY/MSF/NCSS programme specs","Obtain PDPA consent for beneficiary personal data collection","Pilot with test cohort; validate ComCare eligibility checks where applicable","Launch & monitor intake processing time; report beneficiary numbers to NCSS/MCCY"],
    "PDPA requires explicit consent for collection of beneficiary personal data including NRIC/FIN; MSF ComCare eligibility criteria apply to many social service programmes; NCSS Social Service Standards require documented intake process; intake processing target <5 working days; beneficiary NPS target >60; NCSS accreditation requires intake process documentation",1],

  [42,"Programme Delivery Monitoring",
    ["Set milestones aligned to NCSS/MCCY grant deliverables","Collect monthly progress data from programme staff via SSNet or internal system","Analyse variance against NCSS benchmarks; escalate issues to programme director","Submit progress data via NCSS VWO Portal; flag risks to funder if milestones at risk"],
    "NCSS Social Service Standards require documented monitoring processes; NCSS VWO Portal (vwoGrants) used for grant reporting; MCCY requires milestone reports; milestone completion target 85%+; issue resolution within 14 days; COC expects charities to demonstrate programme effectiveness in annual return",1],

  [43,"Beneficiary Outcome Analysis",
    ["Define outcome indicators aligned to NCSS Outcome Measurement Framework","Collect data at regular intervals; ensure PDPA consent covers outcome data use","Analyse against NCSS benchmarks & Singapore social indicators (SingStat, MSF)","Report outcomes in COC annual return, NCSS grant report & annual impact report"],
    "NCSS Outcome Measurement Framework (OMF) used by most Singapore VWOs; outcome data required for NCSS grant renewal; data completeness target 90%+; outcomes benchmarked against SingStat social indicators; MSF publishes Singapore social health statistics; PDPA consent covers outcome data collection and analysis; quarterly review cycle recommended",1],

  [44,"Volunteer Scheduling",
    ["Publish volunteer opportunities on Giving.sg / NVPC VolunteerHub","Match volunteers to roles; ensure Volunteer Protection Act 2024 insurance coverage","Send confirmations & WhatsApp reminders 48 hours before shift","Record hours; update NCSS volunteer statistics; collect feedback via Giving.sg"],
    "Volunteer Protection Act 2024 provides liability protection for registered volunteers; NVPC VolunteerHub and Giving.sg are primary volunteer matching platforms in Singapore; NCSS tracks VWO volunteer hours in annual returns; shift fill rate target 95%; no-show rate target <5%; volunteer satisfaction target >80%; NS-man volunteering support available",2],

  [45,"Programme Procurement Management",
    ["Define procurement need & draft specification; check GST registration of suppliers","Source quotes; for >S$10k apply Government Instruction Manual principles if grant-funded","Evaluate bids using transparent scoring matrix; record decision rationale for COC audit","Issue purchase order; manage supplier & monitor delivery against SLA"],
    "COG requires transparent procurement for charities; NCSS and MCCY-funded programmes must follow procurement guidelines; quotation required for >S$3k; open tender recommended for >S$70k; GST-registered suppliers preferable; procurement records retained for COC inspection; IRAS requires GST input tax claims to be properly documented",2],

  [46,"Beneficiary Satisfaction Surveys",
    ["Design survey; obtain PDPA consent (include purpose & retention period)","Distribute in preferred languages; use EngageSG or NCSS-approved survey tools","Analyse results against NCSS client satisfaction benchmarks","Share insights with programme team; implement improvements; report to NCSS as required"],
    "NCSS Social Service Standards require regular beneficiary feedback; NCSS client satisfaction benchmark: NPS >40; survey response rate 60–70%; PDPA consent must cover survey data use; NCSS accreditation requires evidence of feedback being actioned; 80% of improvement recommendations implemented within 90 days target",2],

  [47,"Safeguarding Case Management",
    ["Receive & log concern within 24 hours; notify Designated Safeguarding Officer (DSO)","Assess risk; notify MSF Child Protective Service or SPF if mandatory reporting threshold met","Investigate using MCCY/MSF safeguarding protocol; protect victim identity per PDPA","Close case with documented outcome; debrief & notify COC if serious incident per Charities Act S42"],
    "Children and Young Persons Act (Cap 38) mandates reporting of child abuse; Women's Charter S65 mandates reporting of family violence; MSF/SPF must be notified for mandatory reporting cases; MCCY Child Safe Sport Code for sports charities; COC must be notified of serious safeguarding incidents; DSO must be trained to NCSS standards; PDPA applies to victim data",1],

  [48,"Field Mission Logistics",
    ["Define mission scope & safety plan; register with MFA if overseas programme","Obtain MFA travel advisory clearance; brief team on country-specific risks","Coordinate with in-country partners; ensure PDPA data transfer restrictions met for overseas data","Debrief within 5 days; file post-mission report for MCCY/NCSS if grant-funded"],
    "MFA Travel Advisory must be checked; MFA Travel Registration recommended for overseas deployments; PDPA restricts transfer of personal data to countries without adequate protection; MCCY/NCSS overseas programme grants require pre-approval; travel insurance mandatory for overseas volunteers; IVSS (International Volunteer Service Scheme) guidelines may apply",2],

  [49,"Programme Budget Forecasting",
    ["Collect actuals from finance; map expenditure to NCSS/MCCY budget heads","Update rolling 12-month forecast by programme & funding source","Flag variances >5%; check against NCSS/MCCY virement limits","Reforecast; seek board approval for material budget changes; notify funder if required"],
    "NCSS and MCCY require advance notification of budget variances >10%; virement policy (typically ≤10% between budget lines without approval) must be adhered to; monthly forecast cycle recommended; budget utilisation target 90–95%; restricted fund forecasting critical to avoid breach of Charities Act restrictions",2],

  [50,"Programme Learning Cycles",
    ["Define learning questions for cycle; involve NCSS programme officers if grant-funded","Gather evidence from programme data, beneficiary feedback & staff","Analyse findings; generate recommendations; benchmark against NCSS OMF outputs","Share learning with board, NCSS & SSI; track implementation; contribute to sector knowledge"],
    "NCSS promotes learning and improvement culture in VWOs; SSI (Social Service Institute) supports learning & development for VWO staff; knowledge sharing via NCSS communities of practice; quarterly learning cycles recommended; 75%+ of recommendations implemented within 6 months; learning shared with COC in annual return narrative",3],

  // ── Finance & Compliance ───────────────────────────────────────────────────
  [51,"Management Accounts Preparation",
    ["Extract trial balance from accounting system (FRS/SFRS for Small Entities)","Prepare management accounts with fund-level analysis (restricted vs unrestricted per Charities Act)","Finance Director & CEO review; validate against COC annual return figures","Submit to board within 10 working days of month-end; retain for COC inspection"],
    "Singapore charities prepare accounts under Singapore Financial Reporting Standards (SFRS for Small Entities) or FRS; Charities (Accounts) Regulations require fund-level reporting; management accounts within 10 working days of month-end; board must review financial statements per COG; audit required if gross income >S$500k; IRAS requires accurate income reporting",1],

  [52,"Accounts Payable Processing",
    ["Receive & validate supplier invoices; match against purchase orders","Obtain authorisation per approved limits (COG recommends documented authorisation matrix)","Process payment via PayNow/GIRO/cheque; obtain CEO countersignature for >S$10k","Reconcile AP ledger monthly; retain invoices for 5 years per IRAS/COC requirements"],
    "IRAS requires business records to be kept for 5 years (recommended 7 years for charities); COG recommends dual authorisation for all payments; PayNow widely used in Singapore for B2B payments; payment on time >95% target; exception rate <2%; GIRO for recurring supplier payments; GST input tax claims require valid tax invoices from GST-registered suppliers",2],

  [53,"Statutory Financial Statements",
    ["Prepare draft accounts per SFRS for Small Entities & Charities (Accounts) Regulations","External audit (mandatory if gross income >S$500k); respond to auditor queries","Board of Trustees approval & signing of auditor's report","File via Charity Portal within 6 months of FYE; file ACRA annual return via BizFile+ if company limited by guarantee"],
    "Mandatory external audit if gross annual receipts >S$500k (Charities Act); accounts filed via Charity Portal within 6 months of FYE; ACRA annual return for CLGs via BizFile+; accounts prepared per SFRS for Small Entities; Charity Council expects clean audit opinion; late filing triggers COC follow-up; accounts available publicly on Charity Portal",1],

  [54,"Fund Accounting Reconciliation",
    ["Extract fund balances (restricted, designated, unrestricted) from accounting system","Reconcile movements against donor restrictions & grant agreements","Identify & resolve discrepancies with programme & fundraising teams","Produce fund statement for board; ensure restricted funds not used for other purposes"],
    "Charities Act prohibits use of restricted funds for purposes other than those specified by donor; COC audit may check restricted fund compliance; fund reconciliation monthly; fund accounting required by Charities (Accounts) Regulations; restricted fund breaches must be reported to COC; board must approve any proposed change of fund purpose",1],

  [55,"Gift Aid Filing",
    ["Validate IPC-qualifying donations in CRM against IRAS criteria (cash, Giving.sg, GIRO)","Prepare annual IPC tax deduction summary for IRAS; reconcile to financial statements","Submit via IRAS myTax Portal (IRAS Form for IPC); confirm processing","Issue tax deduction receipts to donors; update Giving.sg IPC donor records"],
    "Singapore IPC charities can issue 250% tax deduction receipts; qualifying donations include cash, cheque, PayNow, Giving.sg; IRAS requires accurate reporting of IPC receipts issued; IPC annual return filed with MCCY/IRAS; tax deduction receipts must include donor NRIC/FIN & amount; IRAS audit may request donation records; Giving.sg automates receipt generation for IPC charities",2],

  [56,"Internal Audit Reviews",
    ["Plan audit scope aligned to COG Tier 3/4 internal audit requirement","Conduct fieldwork; test controls over financial management, procurement & beneficiary data (PDPA)","Draft findings & recommendations; obtain management responses","Present to Board Audit Committee; track remediation; file in board papers for COC inspection"],
    "COG Tier 3 & 4 charities (income >S$500k) must have internal audit; Audit Committee recommended for Tier 3/4; COC GEC checklist includes internal audit as key governance indicator; control effectiveness target 85%+; findings resolved within 90 days; repeat findings indicate governance weakness; PDPA controls must be audited annually",2],

  [57,"Payroll & PAYE Processing",
    ["Collect starters, leavers & salary changes; validate CPF contribution rates (MOM schedules)","Process payroll calculations; compute employer CPF (17%) & employee CPF (20%) for <55 years","Submit CPF via CPF e-Submit; pay salaries via GIRO by month-end","File IR8A with IRAS by 1 March each year; distribute IR8A to employees"],
    "CPF contributions mandatory for Singapore Citizens and PRs: employer 17% + employee 20% for workers <55 (reducing for older workers); CPF e-Submit online; IRAS IR8A due 1 March; MOM Employment Act governs salary payment within 7 days of month-end; payroll accuracy target 99.9%; no CPF for foreign workers (EP/DP/WP); NS men's make-up pay obligations for charity employers",1],

  [58,"Cash Flow Forecasting",
    ["Gather income & expenditure forecasts; include MCCY/NCSS grant disbursement schedules","Build 13-week rolling SGD cash flow model; include CPF, IRAS & supplier payment timings","Present to Board Treasurer; flag if reserves fall below 3 months operating costs","Update weekly; compare actuals to forecast; alert CEO to liquidity risk triggers"],
    "Charity Council recommends operating reserves of 3–6 months of operating costs; COG requires board oversight of financial sustainability; NCSS grant disbursements often quarterly or half-yearly; CPF payment due 14th of following month; IRAS instalment payments for estimated chargeable income; cash buffer maintenance target 3–6 months",1],

  [59,"Regulatory Compliance Monitoring",
    ["Maintain register of all regulatory obligations (COC, ACRA, IRAS, MOM, PDPC, MCCY)","Monitor regulatory changes via ACRA BizFile+ alerts, MOM & PDPC circulars","Complete required filings & returns on time (Charity Portal, ACRA, IRAS, CPF Board)","Report compliance status to Board Audit Committee; flag any breaches to COC per Charities Act"],
    "Key Singapore charity compliance obligations: COC annual return (Charity Portal, 6 months after FYE); ACRA annual return for CLGs (BizFile+); IRAS Form C/C-S; CPF monthly; PDPA compliance; MOM employment obligations; MCCY IPC renewal (every 3 years); Charities Act S42 serious incident reporting; zero tolerance for late COC filing",1],

  [60,"Expense Claims Processing",
    ["Staff submit claims with original receipts via expense system; validate GST receipts for input tax","Line manager approval per board-approved limits","Finance validate policy compliance; process reimbursement via PayNow/GIRO","Reconcile expense accounts; report policy breaches to CEO; retain records 5 years for IRAS"],
    "IRAS requires original receipts for expense claims; GST input tax claimable only on valid tax invoices from GST-registered suppliers; MOM Employment Act governs reimbursement of work-related expenses; expense claims processed within 5 working days; policy compliance target 100%; exception rate <1%; IRAS may audit expense claims",3],

  // ── HR, Volunteers & Talent ────────────────────────────────────────────────
  [61,"Recruitment & Screening",
    ["Agree job description; advertise on MyCareersFuture.sg (mandatory for roles with monthly salary <S$20k)","Screen applications; comply with Fair Consideration Framework (FCF) — no discriminatory criteria","Conduct structured interviews; shortlist must reflect diversity & include Singapore Citizens/PRs","Make selection decision; obtain MOM work pass for foreign hires if required (EP/DP/WP)"],
    "MOM Fair Consideration Framework requires job ads on MyCareersFuture.sg for ≥14 days before hiring foreigners; TAFEP guidelines prohibit discrimination by age, race, gender, religion; work passes (EP/DP/WP) required for foreign employees; NS obligations must be considered; charity pay scales benchmarked against NCSS VWO salary survey; time to shortlist target 10–15 days",2],

  [62,"Staff Onboarding Management",
    ["Prepare employment contract per MOM Employment Act; register for CPF within 1 month of hire","Conduct structured induction including COC/PDPA/safeguarding training","Assign buddy; schedule 1-month, 3-month & 6-month check-ins","Complete probation review; enrol in SkillsFuture programmes relevant to role"],
    "MOM Employment Act requires written employment contract; CPF registration mandatory from first month; PDPA training required within 30 days of hire; safeguarding training mandatory for roles working with vulnerable populations; SkillsFuture credits (S$500 per Singapore Citizen) available; new joiner satisfaction target NPS >70; time to productivity target <3 months",2],

  [63,"Learning & Development Planning",
    ["Conduct annual TNA; align to SSG Skills Framework for Social Services","Apply for SSG/SkillsFuture Enterprise Credit (SEC) and NCSS L&D support grants","Schedule and deliver training; track completion in HRIS","Evaluate impact against skill gap closure; report L&D spend to board"],
    "SkillsFuture Singapore (SSG) co-funds WSQ courses; SkillsFuture Enterprise Credit (S$10k for eligible SMEs/charities); NCSS Scholarship & Training Fund available for VWO staff; Social Service Institute (SSI) runs sector-specific training; CPE-accredited courses preferred; L&D investment target 2–3% of payroll; 90%+ training completion rate",3],

  [64,"Performance Review Cycles",
    ["Launch review cycle; brief managers on MOM fair appraisal guidelines","Staff complete self-assessments; managers prepare objective feedback aligned to KPIs","Conduct structured 1:1 reviews; agree SMART goals for next cycle","Calibrate ratings; update HRIS; link to SkillsFuture development plan where applicable"],
    "MOM Tripartite Standard on Grievance Handling applies; TAFEP advises objective performance criteria; performance reviews should not reference race, religion, age or gender; biannual review cycle; 100% completion rate target; ratings calibrated across teams; board reviews CEO performance as COG requirement; link to salary review and progression",2],

  [65,"Employee Wellbeing Monitoring",
    ["Administer wellbeing pulse survey quarterly; PDPA consent for health data","Analyse MOM absence data & review EAP utilisation","Identify burnout risk; brief line managers; activate Employee Assistance Programme (EAP)","Implement targeted interventions; review against MOM Tripartite Standard on Mental Health"],
    "MOM Tripartite Standard on Mental Health & Well-being (2023); absence rate benchmark <3% for Singapore social service sector; EAP utilisation 5–10%; Singapore charity sector burnout high due to low pay vs workload; wellbeing score target >7/10; MOM Job Redesign Grant available; PDPA health data requires extra care as sensitive personal data",2],

  [66,"DBS & Safeguarding Checks",
    ["Identify roles requiring MSF/SPF criminal record check (CRC) — all staff working with children, elderly & vulnerable persons","Initiate CRC application via SPF or authorised agency (e-CRC portal)","Receive CRC disclosure; assess suitability per MCCY/NCSS safeguarding policy","Record outcome in HRIS; set renewal alert (typically every 3 years); retain record per COC guidance"],
    "MCCY and NCSS require criminal record checks (CRC via SPF) for VWO staff working with children, elderly & persons with disabilities; Children's Society, Salvation Army & other VWOs required to screen all staff; Singapore does not have a formal DBS scheme but SPF CRC serves equivalent function; 100% CRC completion before working with vulnerable groups; zero compliance lapses",1],

  [67,"Staff Retention Analysis",
    ["Extract monthly voluntary turnover data; categorise by role & programme","Conduct exit interviews; identify themes — pay, workload, progression","Brief line managers on flight-risk indicators; develop targeted retention actions","Report to board annually; benchmark against NCSS VWO Manpower Survey data"],
    "NCSS VWO Manpower Survey shows sector voluntary turnover 20–25%; Social Service professionals in high demand; first-year attrition benchmark <15%; cost of turnover estimated at 50–150% of annual salary; MOM Skills Framework for Social Services identifies career pathways; salary benchmarking essential for retention; SkillsFuture progression plans help retention",2],

  [68,"Workforce Planning",
    ["Analyse headcount vs NCSS grant deliverable FTE requirements","Model 12-month workforce scenarios including NS liability & parental leave","Identify skill gaps; build hiring plan using MyCareersFuture.sg & SSI internship pipelines","Review quarterly; adjust for NCSS/MCCY grant changes or programme scale-up"],
    "NCSS grants include FTE-based budget line; NS obligations (up to 2 weeks/year for operationally ready NSmen) must be planned for; MOM Fair Employment framework applies; SSI provides social service workforce data; vacancy fill rate target >85%; sector-wide workforce challenges require proactive pipeline building via polytechnic & university partnerships",2],

  [69,"Volunteer Recruitment & Matching",
    ["Post opportunities on Giving.sg, NVPC VolunteerHub & CDC/PA community networks","Screen volunteer applications; obtain SPF CRC for volunteers working with vulnerable groups","Induct volunteers; cover Volunteer Protection Act 2024 protections & PDPA obligations","Track hours; submit to NCSS annual return volunteer statistics; recognise volunteers at year-end event"],
    "Volunteer Protection Act 2024 provides liability protection for bona fide volunteer work; NVPC VolunteerHub & Giving.sg are primary SG volunteer platforms; NCSS tracks VWO volunteer hours; volunteers working with children/elderly may require SPF CRC; CDC grassroots volunteer networks valuable; volunteer retention target >50% at 12 months; NVPC Individual Giving Study: 29% of Singaporeans volunteered in 2022",3],

  [70,"Compensation Benchmarking",
    ["Obtain NCSS VWO Compensation & Benefits Survey (annual) or subscribe to NWC recommendations","Map all roles to survey job families; identify Singapore Citizens/PR pay equity issues","Identify pay gaps; check compliance with MOM National Wage Council (NWC) guidelines","Recommend pay adjustments to board; document decisions for COG people management requirements"],
    "NCSS publishes annual VWO Compensation & Benefits Survey; MOM National Wage Council issues annual wage guidelines (including Progressive Wage Model for certain sectors); Fair Consideration Framework requires equitable pay; Workfare Income Supplement (WIS) top-ups for lower-wage workers; gender pay gap tracking encouraged; 80%+ of roles within ±10% of NCSS benchmark",3],

  // ── Technology & Data ──────────────────────────────────────────────────────
  [71,"IT Systems Health Monitoring",
    ["Configure monitoring aligned to CSA Cyber Essentials/Cyber Trust Mark standards","Review system performance & incident logs daily; check Charity Portal connectivity","Investigate & resolve incidents; notify COC if IT failure affects beneficiary services","Monthly health report to IT governance; ensure uptime meets NCSS/MCCY SLA requirements"],
    "CSA (Cyber Security Agency of Singapore) Cyber Essentials/Cyber Trust Mark certification recommended for charities; IMDA Digital for Life initiative supports charity digital resilience; system uptime target 99.5%+; MTTR <4 hours for critical systems; Cybersecurity Act 2018 designates 11 Critical Information Infrastructure sectors; charities supporting CII sectors must comply",1],

  [72,"Software Licence Management",
    ["Audit installed software vs licence entitlements; check BSA compliance","Identify savings via Microsoft for Nonprofits SG & Adobe for Nonprofits (via Tech Access)","Update licence register; set renewal reminders; track via IT asset management system","Review value vs spend annually; negotiate renewals via IMDA Productivity Solutions Grant (PSG)"],
    "Microsoft 365 Nonprofit Basic available at ~S$4/user/month for qualifying Singapore charities; Adobe Creative Cloud charity pricing via Tech Access; Productivity Solutions Grant (PSG) co-funds approved IT solutions; IMDA SME Digital campaign applicable to charities; licence compliance target 100%; renewals reviewed 90 days in advance; audit-ready records retained",3],

  [73,"CRM Data Quality Monitoring",
    ["Run weekly automated PDPA data accuracy audits in CRM","Generate exception report: duplicates, missing NRIC/FIN consent fields, stale records","Assign corrections; validate PDPA consent status & retention periods","Publish monthly CRM quality score; present to Data Protection Officer (DPO)"],
    "PDPA accuracy obligation requires personal data to be accurate and complete; PDPC enforcement actions have been taken against organisations with poor data quality; CRM data quality score target >95%; corrections within 48 hours; PDPC recommends annual data audit; donor NRIC required for IPC tax deduction receipts; duplicate rate target <1%; DPO to review monthly",2],

  [74,"Cybersecurity Risk Management",
    ["Conduct quarterly vulnerability assessment per CSA Cyber Essentials checklist","Prioritise & remediate critical vulnerabilities within 30 days","Deliver phishing simulation & cybersecurity awareness training (SSG-funded courses available)","Report to board via IT governance; update risk register; notify CSA SingCERT if significant incident"],
    "CSA Cyber Essentials programme provides free assessment framework for Singapore organisations; Cyber Trust Mark for advanced organisations; phishing click rate target <5% post-training; 100% staff security awareness training annually; SingCERT provides free incident response guidance; Cybersecurity Act 2018; PDPA data breach notification mandatory if >500 affected individuals or causes significant harm",1],

  [75,"CRM Configuration Management",
    ["Log CRM change requests; assess PDPA privacy-by-design implications before changes","Test changes in sandbox; validate PDPA data access controls & audit trails","Deploy to production; communicate to users; update data register if new personal data fields added","Monitor adoption & error rate; review PDPA impact if configuration affects data processing"],
    "PDPA accountability framework requires documented data processing changes; privacy-by-design principle (PDPC Advisory Guidelines); CRM uptime target 99%+; user adoption rate 80%+; workflow error rate <1%; change requests resolved within 10 working days; PDPC expects data access logs to be maintained; DPO to approve changes affecting personal data processing",2],

  [76,"Data Privacy Governance",
    ["Maintain PDPA Data Protection Policy & Record of Processing Activities (ROPA)","Conduct PDPA Data Protection Impact Assessment (DPIA) for new personal data processing","Respond to Data Access Requests (DAR) within 30 calendar days per PDPA S21","Notify PDPC of mandatory breach within 3 calendar days (provisional) & 30 days (full) if >500 affected or significant harm"],
    "Singapore PDPA 2012 (amended 2020, in force 2021) administered by PDPC; mandatory data breach notification from 1 Feb 2021: notify PDPC within 3 days (provisional) and 30 days (full) if breach likely to cause significant harm or affects 500+ individuals; Data Access Requests must be responded to within 30 days; PDPC advisory guidelines on health data, NRIC collection & AI; DPO appointment recommended; PDPA fines up to S$1M",1],

  [77,"Cross-Platform Data Integration",
    ["Map data flows between charity systems & Giving.sg/government portals (MyInfo where applicable)","Configure integration; ensure PDPA data transfer restrictions met for overseas processors","Test end-to-end; validate PDPA consent covers data-sharing with third-party platforms","Monitor integration health daily; resolve sync errors within 24 hours; update ROPA"],
    "PDPA requires data sharing agreements with third-party processors (including Giving.sg, CRM vendors, cloud providers); MyInfo government data-sharing available for beneficiary verification; PDPA restricts transfer of personal data to countries without adequate protection (PDPC approved countries list); integration uptime target 99%+; sync error rate <0.1%; data latency <1 hour",2],

  [78,"Data Warehouse Management",
    ["Monitor ETL pipelines; ensure PDPA-compliant data retention schedules applied in warehouse","Investigate failed runs; validate data quality against NCSS/COC reporting requirements","Govern access per PDPA need-to-know; maintain audit log of data access","Publish data freshness SLA; report warehouse adoption to senior leadership"],
    "PDPA retention limitation obligation applies to data warehouse: personal data must not be retained longer than necessary; PDPC cloud guidelines apply to cloud data warehouse (AWS, Azure, GCP); data residency in Singapore recommended for sensitive beneficiary data; pipeline reliability target 99%+; report load time <5 seconds; data freshness within 24 hours",2],

  [79,"Digital Transformation Roadmap",
    ["Assess current digital maturity against IMDA Digital Readiness Blueprint","Prioritise initiatives; apply for IMDA Productivity Solutions Grant (PSG) or MCI Digital Access for All","Execute roadmap; track delivery vs business case","Review value realisation at 12 months; report to board & MCCY/NCSS if grant-funded"],
    "IMDA Productivity Solutions Grant (PSG) co-funds pre-approved IT solutions at 50% (up to S$30k) for eligible charities; IMDA Digital for Life movement; MCI Digital Access for All grant; NCSS Digitalisation Grant for VWOs; roadmap delivery target 80%+ on time; stakeholder NPS >60; digital transformation progress reported in COC annual return narrative",3],

  [80,"AI Model Governance",
    ["Register AI model; complete IMDA Model AI Governance Framework assessment","Test for accuracy, fairness & bias; document under PDPC guidelines on AI","Obtain senior leadership or ethics committee sign-off before deployment","Monitor model performance quarterly; review PDPC AI guidance updates; retain audit trail"],
    "IMDA Model AI Governance Framework 2nd Edition (2020) provides guidance; PDPC Advisory on Use of Personal Data in AI Recommendations (2022); AI must not discriminate on protected characteristics (race, religion, gender, age); model accuracy target >85% for decision-support systems; human oversight mandatory for decisions affecting beneficiaries; PDPC guidelines on automated decision-making",2],

  [81,"Technology Spend Reporting",
    ["Collect IT spend actuals; map to PSG & IMDA grant claims","Compare to approved budget & ROI targets; identify anomalies","Claim PSG reimbursement via Business Grants Portal (BGP)","Present technology spend dashboard to leadership; report PSG claims to MCCY if required"],
    "PSG reimbursement claims submitted via Business Grants Portal (BGP); MCCY/NCSS may require technology spend reporting for grant-funded projects; tech spend benchmark 5–8% of operating costs for digital-enabled charities; ROI tracked for all investments >S$10k; monthly reporting to IT governance; IMDA's Digital for Life tracks sector digital investment",3],

  [82,"AI-Powered IT Helpdesk",
    ["Configure AI chatbot for Singapore charity context (English/Mandarin/Malay queries)","AI resolves Tier-1 issues; escalate to IT staff for complex issues","Close ticket; capture user satisfaction; update knowledge base in supported languages","Monitor SLA compliance; report to IT governance; ensure PDPA-compliant ticket logging"],
    "IMDA digital enablement supports charity IT efficiency; AI helpdesk target: first contact resolution >80%; critical ticket resolution <4 hours; user satisfaction >85%; 40%+ Tier-1 queries auto-resolved; multilingual support (English/Mandarin) enhances adoption; PDPA applies to IT ticket data (may contain personal information); knowledge base accessible to all staff",2],

  [83,"Cloud Cost Optimisation",
    ["Pull cloud cost reports from AWS/Azure/GCP; map against PSG grant claims","Identify underutilised resources; apply for IMDA cloud migration support grants if relevant","Implement cost optimisation; consolidate to Singapore-region data centres where possible","Track savings vs baseline; report monthly; update PDPC data transfer documentation if regions change"],
    "IMDA supports cloud adoption for Singapore charities; data residency in Singapore (ap-southeast-1 region for AWS, East Asia for Azure) recommended for PDPA compliance; PSG grant covers some cloud solution costs; cloud cost savings target 20–30% vs baseline; resource utilisation target >70%; cost anomalies flagged within 24 hours; data transfer to overseas regions requires PDPA safeguards",3],

  [84,"Data Retention Management",
    ["Audit data assets against PDPA retention limitation obligation & Charities Act record-keeping requirements","Generate deletion & archival task list per documented retention schedule","Execute approved deletions; archive financial records per IRAS 5-year minimum","Update ROPA; report retention compliance to DPO; notify PDPC if deletion affects previously reported breach data"],
    "PDPA retention limitation obligation: do not retain personal data longer than necessary for its purpose; IRAS requires financial records for 5 years; COC recommends 7 years for charity records; Charities Act requires accounting records retention; PDPC enforcement actions for excessive retention; overdue deletions resolved within 30 days; annual data retention audit required; DPO oversight",2],

  [85,"Vendor Due Diligence",
    ["Identify vendor; complete PDPA vendor assessment checklist (data access, location, security)","Review Data Processing Agreement (DPA) — mandatory under PDPA for personal data processors","Obtain DPO & legal sign-off for vendors processing sensitive personal data; check if overseas data transfer restrictions apply","Onboard vendor; schedule annual PDPA compliance review & update ROPA"],
    "PDPA requires organisations to ensure third-party data processors protect personal data adequately; Data Processing Agreements mandatory; PDPC Advisory on Managing Third-Party Vendor Risk; overseas vendor data transfer requires PDPC-approved country adequacy or contractual clauses; 100% due diligence for vendors with personal data access; vendor risk reviewed annually; charities must not engage vendors who breach PDPA",2],

  [86,"Business Continuity Planning",
    ["Conduct annual Business Impact Analysis (BIA) aligned to CSA BCP guidelines","Test DR plan via tabletop exercise; validate recovery of Charity Portal & CPF access","Review & update BCP; ensure PDPA data breach response is included","Brief board & all staff on current BCP; file BCP evidence for NCSS/MCCY if required"],
    "CSA Business Continuity Management guidelines apply; CSA Cyber Trust Mark requires BCP; charities with critical services (eldercare, children's homes) required to have operational continuity plans by MCCY/MOH; COVID-19 reinforced BCP importance for Singapore VWOs; DR test annually; RTO target met in 100% of tests; BCP reviewed annually; board-approved",1],

  [87,"Enterprise Data Dictionary",
    ["Identify critical data assets including PDPA personal data categories","Document metadata, definitions, PDPA classification (personal/sensitive) & retention periods","Validate with data owners (fundraising, programme, finance teams)","Publish on intranet; promote adoption; update ROPA cross-reference"],
    "PDPA accountability requires organisations to know what personal data they hold and why; PDPC recommends data inventory as first step to PDPA compliance; data dictionary coverage target 80%+ of critical assets; metadata accuracy >90%; reviewed quarterly by DPO and data stewards; accessed by 60%+ of staff handling personal data; linked to ROPA",3],

  [88,"AI Tools Governance",
    ["Assess new AI tool against IMDA AI Governance Framework & PDPA personal data processing requirements","Complete risk assessment including bias, data privacy & cybersecurity risks","Obtain DPO & senior leadership approval; validate no unauthorised NRIC/personal data sharing","Monitor usage; audit compliance quarterly; update policy per PDPC AI guidance updates"],
    "IMDA Model AI Governance Framework 2nd Edition; PDPC Advisory on Responsible Use of AI in Personal Data Processing; Singapore AI ethics principles (PDPC & IMDA); unauthorised AI tool usage is a PDPA risk; 100% governance assessment before deployment; staff training on responsible AI use mandatory; quarterly compliance audit; PDPC may issue new AI guidance as technology evolves",2],

  [89,"Software QA Management",
    ["Define test plan per IMDA accessibility & security standards (SS508, CSA Cyber Essentials)","Execute functional, regression, security & accessibility tests","Log defects; manage resolution with development team; ensure PDPA privacy-by-design tested","Sign off release; monitor post-deployment; validate PDPA compliance of new data fields"],
    "IMDA Infocomm Accessibility Centre standards (Singapore Standard SS508 for digital accessibility); CSA Cyber Essentials testing for security; PDPA privacy-by-design must be validated in QA; test coverage target 80%+; defect escape rate <5%; 2-week release cycles; UAT required before production; WCAG 2.1 AA accessibility testing mandatory for public-facing systems",2],

  [90,"Master Data Management",
    ["Identify master data domains: donor NRIC/FIN (PDPA sensitive), beneficiary, supplier, staff","Detect & merge duplicates; validate NRIC uniqueness for IPC tax deduction accuracy","Establish golden record; propagate to CRM, Finance & Giving.sg systems","Monitor data quality monthly; report MDM health to DPO; maintain PDPA-compliant master data register"],
    "PDPA accuracy obligation requires master data to be accurate and up to date; NRIC data requires PDPC consent under the revised PDPA; IPC tax deduction receipts require accurate donor NRIC; duplicate donors cause IRAS tax receipt errors; MDM duplicate rate target <0.5%; golden record accuracy target 95%+; DPO oversight of personal data master records; annual MDM audit",2],

  [91,"Executive Insights Dashboards",
    ["Gather KPI requirements from board & CEO aligned to COC annual return metrics","Design dashboard: programme reach, financial KPIs, volunteer hours, donor retention","Build, validate & publish on Power BI or equivalent; ensure PDPA role-based access controls","Gather quarterly feedback; update to reflect new NCSS/COC reporting requirements"],
    "COC annual return data must be supported by internal reporting; Charity Transparency Framework metrics can be dashboarded; PDPA requires role-based access to dashboards containing personal data; Power BI / Tableau widely used in Singapore charities; dashboard adoption target 80%+ by leadership; weekly review by CEO; quarterly update for board pack",2],

  [92,"Digital Accessibility Compliance",
    ["Audit all digital properties against WCAG 2.1 AA & IMDA Infocomm Accessibility Centre (IAC) standards","Prioritise & assign remediation tasks; check Enabling Masterplan obligations","Implement fixes; test with assistive technology & persons with disabilities","Publish accessibility statement on website; submit to IMDA Digital Access for All if grant-funded"],
    "IMDA Infocomm Accessibility Centre promotes digital inclusion; Singapore's Enabling Masterplan 2030 commits to accessible digital services; WCAG 2.1 AA is minimum standard; Persons with Disabilities Act obligations for public service charities; IMDA Digital Access for All grant supports accessibility investments; 100% new content accessible before publication; annual accessibility audit required",2],

  [93,"External Data Monitoring",
    ["Identify priority data sources: SingStat, MSF Social Statistics, MOH, data.gov.sg, NVPC Giving Study","Set up automated feeds or scheduled extraction from data.gov.sg API","Analyse external data; generate insights on Singapore social trends relevant to programmes","Distribute insights digest to leadership monthly; inform strategic planning & COC annual report narrative"],
    "Data.gov.sg provides free open data on Singapore demographics, social indicators & government programmes; SingStat resident population & poverty statistics; MSF annual Social Statistics Yearbook; NVPC Individual Giving Study (biennial); MOH health statistics; insights must be Singapore-contextualised; distributed within 30 days of data release; integrated into strategic planning cycle",4],

  [94,"Knowledge Base Management",
    ["Audit existing content; remove outdated NCSS, MOM, IRAS & PDPA policy references","Create or update articles based on staff queries & PDPA/COC policy changes","Publish in English and Mandarin; tag for search by COC/NCSS policy area","Track search success rate & usage; update following major regulatory changes (PDPA amendments, MOM updates)"],
    "Singapore charity staff need rapid access to COC, NCSS, PDPA, MOM & IRAS guidance; SSI knowledge resources support VWO learning; knowledge base search success rate target 80%+; 70%+ of staff active monthly users; time-to-answer reduced by 40%; content reviewed after every major regulatory update; PDPA guidance updated following PDPC advisories",3],

  [95,"API Lifecycle Management",
    ["Document API specifications; publish to internal portal; assess PDPA data exposure of each endpoint","Version APIs with 90-day deprecation notice; update Giving.sg, NCSS & government API integrations","Monitor API health & SLA; log all access to personal data endpoints per PDPA accountability","Retire end-of-life APIs; update ROPA for decommissioned data flows"],
    "IMDA API Exchange (APEX) provides government API gateway for Singapore; MyInfo API integration available for identity verification; Giving.sg API for donation data; PDPA requires audit logging of personal data API access; API documentation target 100%; deprecation notice 90 days; error rate <0.1%; PDPC expects data processor APIs to have adequate security controls",2],

  [96,"Data Ethics Assessments",
    ["Identify new data projects requiring ethics review — especially AI, beneficiary profiling & data sharing","Complete Singapore PDPC Data Ethics Framework assessment checklist","Obtain DPO & board Ethics Committee sign-off; check alignment with IMDA AI Governance Framework","Monitor post-deployment; review at 6 months; update assessment if data use changes"],
    "PDPC's Data Ethics Framework provides Singapore-specific guidance; IMDA Model AI Governance Framework; ethics review mandatory before new beneficiary data processing; 100% of flagged issues resolved before go-live; ethics committee (or DPO) meets monthly; PDPC may investigate complaints about unethical data use; Singapore AI ethics principles emphasise human centricity",2],

  [97,"Identity & Access Management",
    ["Process joiner/mover/leaver access within 1 working day; include SingPass-integrated systems","Conduct quarterly access reviews across all systems including Charity Portal, CPF e-Submit, IRAS portal","Remove or adjust access within 1 day of MOM cessation of employment notice","Audit privileged accounts; enforce MFA for all users accessing personal data systems per PDPC guidance"],
    "PDPA requires appropriate access controls to personal data; MOM EA requires that ex-employees cannot retain system access; SingPass/Corppass used for government portal access (Charity Portal, BizFile+, CPF e-Submit, IRAS myTax); MFA mandatory for Corppass; provisioning within 1 working day; quarterly access reviews; zero orphaned accounts; CSA IAM guidelines",2],

  [98,"Security Incident Response",
    ["Detect & classify incident via monitoring; activate PDPA Incident Response Plan","Contain incident; notify senior leadership & DPO within 1 hour; assess PDPA breach notification threshold","Investigate & eradicate; notify PDPC within 3 days (provisional) if mandatory breach threshold met","Conduct post-incident review within 5 days; notify COC if affecting charity's financial or data integrity"],
    "PDPA mandatory breach notification: notify PDPC within 3 calendar days (provisional) and 30 calendar days (full notification) if breach likely to cause significant harm or affects 500+ individuals; CSA SingCERT provides free incident response support; Cybersecurity Act 2018; charities must notify COC of serious incidents per Charities Act S42; post-incident review within 5 working days; PDPC enforcement fines up to S$1M",1],

  [99,"Technology Architecture Review",
    ["Assess current architecture against IMDA Digital Readiness Blueprint & COC IT governance expectations","Identify technical debt; evaluate alignment with Singapore government tech standards (GovTech, SGTS)","Document architecture decisions; update data flow diagrams for PDPA ROPA","Present architecture scorecard to IT Steering Committee; plan for PSG-funded improvements"],
    "IMDA Digital Readiness Blueprint; Singapore Government Tech Stack (SGTS) guidance; GovTech engineering practices; PDPA requires documented data flows (ROPA); architecture review annual; tech debt prioritised; architecture alignment score target 80%+; board-level IT governance recommended for Tier 3/4 charities per COG; PSG available for approved system upgrades",3],

  [100,"Digital Experience Optimisation",
    ["Define optimisation hypothesis & success metrics for Singapore audience (Giving.sg, PayNow, charity website)","Design A/B test aligned to Singapore digital behaviour (mobile-first, WhatsApp sharing)","Run experiment on Giving.sg or website; collect statistically significant data","Analyse results; implement winning variant; report conversion uplift to fundraising leadership"],
    "Giving.sg digital optimisation tools available for IPC charities; Singapore internet penetration 92%+ (IMDA 2023); mobile-first design essential — 85%+ of Singapore donors give via mobile; PayNow QR conversion rate higher than credit card for local donors; Giving.sg Giving Week tests show 2–3x uplift vs baseline; PDPA consent for analytics/cookies per PDPC guidance; A/B test velocity target 2 weeks",4],
];

async function main() {
  const client = await pool.connect();
  try {
    console.log(`Updating ${DATA.length} processes with Singapore context…`);
    let n = 0;
    for (const [id, name, tasks, benchmark, priority] of DATA) {
      const xml = bpmn(id, name, tasks);
      await client.query(
        `UPDATE processes SET bpmn=$1, industry_benchmark=$2, priority=$3 WHERE id=$4`,
        [xml, benchmark, priority, id],
      );
      if (++n % 10 === 0) console.log(`  ${n}/${DATA.length}`);
    }
    console.log(`Done — ${n} processes updated.`);
  } finally {
    client.release();
    await pool.end();
  }
}
main().catch(e => { console.error(e); process.exit(1); });

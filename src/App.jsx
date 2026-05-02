import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ArrowUp, Check, ChevronDown, FileText, HelpCircle, Mail,
  Sparkles, X, ThumbsUp, ThumbsDown, Play, Bot,
  GitBranch, Menu, BarChart3, Paperclip,
} from "lucide-react";

/* ═══ SKILLS CATALOG ═══ */
const SKILLS = [
  { id:"prd-writer", name:"PRD Writer", desc:"Drafts a structured PRD from a feature idea.", use:"User describes a feature and wants a PRD.", sys:"Produce a PRD: Context, Goals, Target user, Product, Metrics, Risks. Bullets over paragraphs.", p50:2000, p90:3100 },
  { id:"code-review", name:"Code Review", desc:"Reviews code for bugs, design, and style.", use:"User pastes code for review feedback.", sys:"Output: Bugs (failure modes), Design concerns (alternatives), Style nits. Cite lines.", p50:1400, p90:2400 },
  { id:"meeting-notes", name:"Meeting Notes", desc:"Turns transcripts into structured minutes.", use:"User pastes transcript for TL;DR and action items.", sys:"Four sections: TL;DR (3 bullets), Decisions, Action items (table), Open questions.", p50:900, p90:1500 },
  { id:"data-analysis", name:"Code-First Data Analysis", desc:"Analyzes data through code, not prose.", use:"User has data and wants code-based analysis.", sys:"Write Python to produce the answer, then interpret. Show code and output.", p50:1800, p90:2800 },
  { id:"email-draft", name:"Email Draft", desc:"Writes a polished email matching your tone.", use:"User wants help drafting any email.", sys:"Output: subject line then body. Match implied length. No filler.", p50:500, p90:900 },
  { id:"summarize-doc", name:"Summarize Document", desc:"Summarizes long text into a structured digest.", use:"User pastes long article for summary.", sys:"1) Thesis, 2) Three claims with evidence, 3) Quotes (max 2), 4) Extensions. Under 500 words.", p50:600, p90:1000 },
  { id:"competitive-analysis", name:"Competitive Analysis", desc:"Structured competitive breakdown with positioning.", use:"User wants competitive analysis across parameters.", sys:"Sections: Overview, Competitor table, Feature matrix, Strategic gaps, Positioning. Use web search.", p50:1800, p90:2800 },
  { id:"market-research", name:"Market Research", desc:"Market sizing, trends, and key players.", use:"User wants to understand a market.", sys:"Sections: Market Size, Key Players table, Trends, Segments, Barriers. Use web search.", p50:2000, p90:3200 },
];

/* ═══ HELPERS ═══ */
const uid = () => Math.random().toString(36).slice(2, 10);
const fmtTok = (n) => n < 1000 ? `${n}` : `${(n / 1000).toFixed(1)}k`;
const estCost = (chars, sk) => {
  const ti = Math.ceil(chars / 4) + (sk ? 800 : 200);
  if (sk) { const p70 = Math.round(sk.p50 + (sk.p90 - sk.p50) * 0.4); return { p50: sk.p50, p70, p90: sk.p90, lat: Math.max(3, Math.round(sk.p50 / 350)) }; }
  return { p50: 4300, p70: 5400, p90: 6800, lat: 11 };
};
const estRemain = (used) => `${Math.max(0, Math.round(((50000 - used) / 50000) * 100))}% daily remaining`;

/* ═══ CLASSIFIER ═══ */
const CLARIFY = {
  "prd-writer":"What's the target user segment, and which metric are you trying to move?",
  "code-review":"Any specific concerns — performance, security, error handling, or general?",
  "email-draft":"What tone — formal, warm, or short and direct?",
  "competitive-analysis":"Which competitors should I focus on, and what parameters matter most?",
  "market-research":"Which market, and is this for investment, entry strategy, or positioning?",
  "summarize-doc":"Any specific angle you want me to focus on?",
  "data-analysis":"What's the key question, and what output format is most useful?",
  "meeting-notes":"Were there key decisions or action items to capture accurately?",
  _:"Who's the audience, and what outcome would make this useful?",
};

/* Context-aware clarifying question for plain prompts (no skill match) */
function getPlainClarifyQ(draft) {
  const d = draft.toLowerCase();

  // Scheduling / planning / tasks
  if (d.includes("schedul") || d.includes("daily task") || d.includes("to-do") || d.includes("todo") || d.includes("plan my day") || d.includes("time block"))
    return "What tasks do you need to get done today? List them all out and I'll build you a schedule with time estimates.";

  // Writing / content
  if (d.includes("write") && (d.includes("blog") || d.includes("post") || d.includes("article") || d.includes("essay")))
    return "Who's the reader, and what's the one thing you want them to think or do after reading?";

  // Explain / teach / learn
  if (d.includes("explain") || d.includes("teach") || d.includes("how does") || d.includes("what is") || d.includes("learn"))
    return "What's your current level of familiarity with this — beginner, intermediate, or expert?";

  // Compare / choose / decide
  if (d.includes("compare") || d.includes("vs") || d.includes("versus") || d.includes("which") || d.includes("choose") || d.includes("decision"))
    return "What criteria matter most to you — cost, speed, ease of use, or something else?";

  // Brainstorm / ideas / generate
  if (d.includes("brainstorm") || d.includes("idea") || d.includes("generat") || d.includes("suggest") || d.includes("give me"))
    return "What have you already tried or considered, so I don't repeat what you've seen?";

  // Feedback / review / improve
  if (d.includes("feedback") || d.includes("review") || d.includes("improve") || d.includes("better") || d.includes("edit"))
    return "What's the main thing you're unsure about — structure, clarity, tone, or something else?";

  // Strategy / plan / roadmap
  if (d.includes("strateg") || d.includes("roadmap") || d.includes("plan for") || d.includes("approach"))
    return "What's the constraint that matters most — time, budget, team size, or something else?";

  // Research / find / look up
  if (d.includes("research") || d.includes("find") || d.includes("look up") || d.includes("search"))
    return "What will you do with this information — make a decision, write something, or share it with someone?";

  // Help / assist / support (very generic)
  if (d.includes("help me") || d.includes("assist") || d.includes("can you"))
    return "What does a great answer look like to you — what format, length, or level of detail works best?";

  // Default fallback (truly generic cases)
  return "Who's the audience, and what outcome would make this useful?";
}

function classify(draft) {
  const d = draft.toLowerCase();

  // ── PRIORITY 1: Agent + Workflow (multi-step / automated — must check before skills) ──
  // Tool names (slack, jira, notion, etc.) only trigger agent when paired with action context
  const hasActionContext = d.includes("connect") || d.includes("pull from") || d.includes("fetch from") || d.includes("sync") || d.includes("integrate") || d.includes("send to") || d.includes("push to") || d.includes("list all my") || d.includes("list down all") || d.includes("show me all my") || d.includes("get all my") || d.includes("my slack") || d.includes("my jira") || d.includes("my notion") || d.includes("my gmail") || d.includes("my calendar") || d.includes("my asana") || d.includes("in slack") || d.includes("in jira") || d.includes("in notion") || d.includes("from slack") || d.includes("from jira") || d.includes("from notion") || d.includes("to slack") || d.includes("to jira") || d.includes("to notion");
  const hasToolName = d.includes("slack") || d.includes("jira") || d.includes("notion") || d.includes("asana") || d.includes("gmail") || d.includes("calendar");
  const toolTriggered = hasToolName && hasActionContext;

  if (d.includes("monitor") || d.includes("alert") || d.includes("connect to") || d.includes("integrate") || d.includes("pull from") || d.includes("fetch from") || d.includes("sync") || toolTriggered || d.includes("list down all") || d.includes("list all my") || d.includes("show me all my") || d.includes("get all my") || d.includes("every monday") || d.includes("every morning") || d.includes("every week") || d.includes("every day") || (d.includes("daily") && (d.includes("send") || d.includes("report") || d.includes("update") || d.includes("check"))) || (d.includes("schedule") && !d.includes("schedule for")))
    return { dec:"agent", sid:null, conf:0.80, rat:"This needs an Agent — connects to external tools and automates actions." };

  if (d.includes("then send") || d.includes("chain") || d.includes("first do") || d.includes("automate") || d.includes("step 1") || d.includes("then do") || d.includes("after that") || d.includes("pipe it") || (d.includes("pipeline") && (d.includes("build") || d.includes("create") || d.includes("set up"))) || /then .{3,30} then /i.test(d) || (d.includes("first ") && d.includes(" then ")))
    return { dec:"workflow", sid:null, conf:0.78, rat:"This chains multiple steps — a Workflow is the right fit." };

  // Check if "email" appears as a secondary action (after "then" / "and email" near end)
  const emailIsSecondary = d.includes("email") && (d.includes("then email") || d.includes("and email") || d.indexOf("email") > d.length * 0.6);

  // ── PRIORITY 2: Skill match (if a specific skill fits, use it — don't decompose) ──
  if ((d.includes("email") || d.includes("apolog") || d.includes("outreach")) && !emailIsSecondary)
    return { dec:"skill", sid:"email-draft", conf:0.88, rat:"Email Draft skill — structured subject + body, tone-matched.", qn:"Structured output: subject line + body, matched tone" };
  if (d.includes("prd") || d.includes("product requirement"))
    return { dec:"skill", sid:"prd-writer", conf:0.92, rat:"PRD Writer skill — structured document with goals, metrics, risks.", qn:"6 sections: context, goals, target user, product, metrics, risks" };
  if (d.includes("review") && (d.includes("code") || d.includes("function") || d.includes("def ")))
    return { dec:"skill", sid:"code-review", conf:0.90, rat:"Code Review skill — bugs, design concerns, style nits with line numbers.", qn:"Structured: bugs, design, style with line numbers" };
  if (d.includes("meeting") && (d.includes("note") || d.includes("transcript") || d.includes("minutes")))
    return { dec:"skill", sid:"meeting-notes", conf:0.86, rat:"Meeting Notes skill — structured minutes with decisions and action items.", qn:"TL;DR, decisions, action items, open questions" };
  if (d.includes("data") && (d.includes("analy") || d.includes("chart") || d.includes("plot") || d.includes("csv")))
    return { dec:"skill", sid:"data-analysis", conf:0.85, rat:"Data Analysis skill — code-first analysis with charts.", qn:"Python code + output, not prose" };
  if (d.includes("summarize") || d.includes("summary"))
    return { dec:"skill", sid:"summarize-doc", conf:0.85, rat:"Summarize Document — structured digest under 500 words.", qn:"Constrained: thesis, claims, quotes — prevents over-generation" };
  if (d.includes("competitor") || d.includes("competitive") || (d.includes("compare") && d.includes(" vs ")) || (d.includes("compare") && d.includes("versus")))
    return { dec:"skill", sid:"competitive-analysis", conf:0.91, rat:"Competitive Analysis skill — positioning, pricing, feature comparison.", qn:"Competitor table, feature matrix, strategic gaps" };
  if (d.includes("market research") || d.includes("market size") || d.includes("tam"))
    return { dec:"skill", sid:"market-research", conf:0.87, rat:"Market Research skill — sizing, key players, trends.", qn:"TAM/SAM, player table, trends, segments" };

  // ── PRIORITY 3: Decompose (complex multi-part — only if no skill matched) ──
  if ((d.includes("and") && d.length > 80 && !emailIsSecondary) || d.includes("comprehensive") || d.includes("end to end"))
    return { dec:"decompose", sid:null, conf:0.82, rat:"Multi-part task — phases will produce better output." };

  // ── PRIORITY 4: Build skill (structured, recurring, no existing skill match) ──
  if (d.includes("investor") || d.includes("memo") || d.includes("kpi") || d.includes("recurring") || d.includes("template") || (d.includes("report") && (d.includes("weekly") || d.includes("monthly") || d.includes("quarterly") || d.includes("board"))) || (d.includes("weekly") && (d.includes("update") || d.includes("standup") || d.includes("brief"))))
    return { dec:"build", sid:null, conf:0.78, rat:"No skill matches but this looks structured and repeatable." };
  return { dec:"plain", sid:null, conf:0.3, rat:"" };
}

function genPhases(draft) {
  const d = draft.toLowerCase();
  if (d.includes("competitor") || d.includes("competitive"))
    return [{ name:"Company overview", sid:"market-research", tok:"~1.2k" }, { name:"Competitive comparison", sid:"competitive-analysis", tok:"~1.8k" }, { name:"Synthesis", sid:null, tok:"~1.5k" }];
  return [{ name:"Research", sid:null, tok:"~1.5k" }, { name:"Core execution", sid:null, tok:"~2k" }, { name:"Review", sid:null, tok:"~0.8k" }];
}

/* ═══ DEMO RESPONSES ═══ */
const DEMO = {
  email:"Subject: Our Sincere Apologies for the Delayed Shipment\n\nHi [Client Name],\n\nI want to personally apologise for the delay in your recent shipment. This fell below the standard you expect from us, and I take full responsibility.\n\nYour order is now confirmed for delivery by [date]. As a gesture of goodwill, I'd like to offer you 15% off your next order — just use code SORRY15 at checkout.\n\nPlease don't hesitate to reach out if there's anything else I can do.\n\nBest,\n[Your name]",
  prd:"# PRD: Notifications Redesign\n\n## Context\nCurrent notification system has low engagement (12% open rate) and users report notification fatigue.\n\n## Goals\n- Increase notification open rate from 12% to 25%\n- Reduce \"mute all\" rate by 40%\n\n## Non-goals\n- Rebuilding the notification infrastructure\n\n## Target User\nDAUs who receive 5+ notifications/day and have started muting channels.\n\n## The Product\n- Smart grouping: batch related notifications into digest cards\n- Priority scoring: ML-ranked by relevance\n- Quiet hours: user-set windows where only critical alerts surface\n\n## Metrics\n- Primary: notification open rate\n- Secondary: mute rate, time-to-action\n\n## Risks\n- ML ranking may suppress time-sensitive notifications\n- Grouping may confuse users expecting chronological order\n\n## Open Questions\n- What qualifies as \"critical\" across segments?\n- Should quiet hours apply to @mentions?",
  code:"## Bugs\n1. **KeyError on missing 'name' key** (line 5): If item has `active: True` but no `name`, raises `KeyError`. Use `item.get('name')` or add guard.\n2. **Truthy check on 'active'** (line 4): Treats any truthy value as active. Add `== True` check.\n\n## Design Concerns\n- Function name `process` is generic — consider `get_active_names`.\n- Returns list but caller may need set (duplicates possible).\n\n## Style\n- Could be list comprehension: `return [item['name'] for item in data if item.get('active')]` — fix KeyError first.",
  competitor:"# Competitive Analysis\n\n## Company Overview\nBased on your request, here's a structured competitive breakdown.\n\n## Competitor Landscape\n| Competitor | Positioning | Pricing | Key Strength | Key Weakness |\n|---|---|---|---|---|\n| Competitor A | Market leader | $29/mo | Brand awareness | Slow innovation |\n| Competitor B | Developer-focused | $19/mo | Technical depth | Limited enterprise |\n| Competitor C | Budget alternative | $9/mo | Price, simplicity | Limited features |\n\n## Feature Comparison\n| Feature | You | Comp A | Comp B | Comp C |\n|---|---|---|---|---|\n| Core workflow | ✓ | ✓ | ✓ | ✓ |\n| API access | ✓ | ✓ | ✓ | ✗ |\n| Integrations | ✓ | Limited | ✓ | ✗ |\n\n## Strategic Gaps\n- Competitor A's enterprise contracts up for renewal in Q3 — window to poach\n- Competitor B lacks mobile — your mobile experience differentiates\n- Price positioning between B ($19) and A ($29) gives room at $24\n\n## Recommended Positioning\nLead with integration depth and mobile. Price at $24/mo to undercut A while signaling more value than B.",
  investor:"# Investor Memo — April 2026\n\n## Financial Highlights\n| Metric | Actual | Target | Delta |\n|---|---|---|---|\n| Revenue | $2.4M | $2.1M | +14% |\n| Burn Rate | $890K | $950K | -6% |\n| Runway | 18mo | 16mo | +2mo |\n\n## KPIs vs Targets\n- MRR Growth: 12% (target: 10%) ✓\n- Churn: 2.1% (target: <3%) ✓\n- NPS: 38 (target: 45) ✗\n\n## Top 3 Risks\n1. **Enterprise pipeline slowing** — Mitigation: doubling SDR capacity.\n2. **Key hire dependency** — Mitigation: interim promotion.\n3. **NPS decline** — Mitigation: onboarding redesign launching May.\n\n## Next Quarter Outlook\n- Close 3 enterprise deals ($400K combined ARR)\n- Ship v2.0 with redesigned onboarding\n- Cash-flow positive by month 2 of Q3",
};

function demoChat(text, clarifyAnswer) {
  const d = text.toLowerCase();
  const raw = text.trim();

  // Extract the core topic from the draft (remove common command words)
  const topic = raw
    .replace(/^(draft|write|create|build|make|generate|do|prepare|help me|can you|please)\s+/i, "")
    .replace(/^(a|an|the)\s+/i, "")
    .split(/[.!?]/)[0]
    .trim();

  // ── EMAIL ──
  if ((d.includes("email") || d.includes("apolog") || d.includes("outreach")) && !d.includes("then email")) {
    const recipient = clarifyAnswer?.toLowerCase().includes("client") ? "client" :
                      clarifyAnswer?.toLowerCase().includes("team") ? "team member" :
                      clarifyAnswer?.toLowerCase().includes("investor") ? "investor" : "recipient";
    const subject = topic.charAt(0).toUpperCase() + topic.slice(1);
    return `Subject: ${subject}\n\nHi [${recipient.charAt(0).toUpperCase() + recipient.slice(1)} Name],\n\nI hope this finds you well. I'm reaching out regarding ${topic}.\n\n${clarifyAnswer ? `Based on your context — ${clarifyAnswer} — here's my message:\n\n` : ""}[Main body tailored to your specific situation and tone]\n\nPlease don't hesitate to reach out if you have any questions or need clarification.\n\nBest regards,\n[Your name]`;
  }

  // ── PRD ──
  if (d.includes("prd") || d.includes("product requirement")) {
    const feature = topic.replace(/^prd (for|of|about)\s*/i, "").replace(/^(a|an|the)\s*/i, "");
    const metric = clarifyAnswer?.toLowerCase().includes("retention") ? "retention rate" :
                   clarifyAnswer?.toLowerCase().includes("adoption") ? "feature adoption rate" :
                   clarifyAnswer?.toLowerCase().includes("revenue") ? "revenue" :
                   clarifyAnswer?.toLowerCase().includes("engagement") ? "engagement rate" :
                   clarifyAnswer?.toLowerCase().includes("conversion") ? "conversion rate" : "adoption rate";
    const segment = clarifyAnswer?.toLowerCase().includes("pro") ? "Pro subscribers" :
                    clarifyAnswer?.toLowerCase().includes("enterprise") ? "enterprise users" :
                    clarifyAnswer?.toLowerCase().includes("free") ? "free tier users" :
                    clarifyAnswer?.toLowerCase().includes("mobile") ? "mobile users" : "target users";
    return `# PRD: ${feature.charAt(0).toUpperCase() + feature.slice(1)}\n\n## Context\nCurrent state has room for improvement in ${feature}. Users in the ${segment} segment are underserved, and the opportunity to improve ${metric} is significant.\n\n## Goals\n- Increase ${metric} by 20–30% within 90 days of launch\n- Reduce friction in the ${feature} experience\n- Validate product-market fit with ${segment}\n\n## Non-goals\n- Full infrastructure rebuild\n- Internationalisation in v1\n\n## Target User\n${segment.charAt(0).toUpperCase() + segment.slice(1)} who currently experience friction with ${feature}.\n\n## The Product\n- **Core feature:** Redesigned ${feature} experience with reduced steps\n- **Discovery:** Ambient surfacing within existing workflow\n- **Feedback loop:** In-product signal collection post-interaction\n\n## Metrics\n- Primary: ${metric}\n- Secondary: task completion rate, time-to-value\n- Guardrail: satisfaction score (must not decrease)\n\n## Risks\n- Behaviour change resistance from existing users\n- Edge cases in multi-device / multi-session scenarios\n\n## Open Questions\n- What defines success for ${segment} specifically?\n- Should v1 be a full rollout or gated A/B test?`;
  }

  // ── CODE REVIEW ──
  if (d.includes("review") && (d.includes("code") || d.includes("function") || d.includes("def "))) {
    return `## Bugs\n1. **Missing error handling**: No try/catch around the main execution block — unhandled exceptions will crash silently.\n2. **Null check missing**: Input is not validated before use — can throw if undefined is passed.\n\n## Design Concerns\n- Function is doing too much — consider splitting into smaller single-responsibility functions.\n- Magic numbers used directly — extract as named constants for readability.\n\n## Style\n- Variable names are not descriptive enough — rename to reflect intent.\n- Could be simplified with a list comprehension / map — reduces lines and improves readability.\n\n## Suggested fix\n\`\`\`python\n# Add input validation and clearer naming\ndef process_items(items: list) -> list:\n    if not items:\n        return []\n    return [item.name for item in items if item.is_active]\n\`\`\``;
  }

  // ── MEETING NOTES ──
  if (d.includes("meeting") && (d.includes("note") || d.includes("summary") || d.includes("transcript"))) {
    return `# Meeting Notes\n\n**TL;DR:** Alignment reached on core priorities. Three action items assigned.\n\n## Key Decisions\n- Proceeding with Option A — higher short-term cost but faster time to market\n- Design review scheduled before engineering kickoff\n- Q3 launch date confirmed as the target\n\n## Action Items\n| Owner | Action | Due |\n|---|---|---|\n| [Name] | Draft technical spec | Friday |\n| [Name] | Stakeholder sign-off | Next Tuesday |\n| [Name] | Set up tracking dashboard | EOW |\n\n## Open Questions\n- Budget approval still pending from finance\n- External vendor timeline not yet confirmed\n\n## Next Meeting\nFollow-up in 2 weeks to review spec and unblock open questions.`;
  }

  // ── DATA ANALYSIS ──
  if (d.includes("data") && (d.includes("analy") || d.includes("csv") || d.includes("chart"))) {
    return `\`\`\`python\nimport pandas as pd\nimport matplotlib.pyplot as plt\n\n# Load your data\ndf = pd.read_csv('data.csv')\n\n# Summary statistics\nprint(df.describe())\nprint(f"\\nShape: {df.shape}")\nprint(f"Missing values:\\n{df.isnull().sum()}")\n\n# Key analysis\ndf.groupby('category')['value'].agg(['mean','sum','count'])\n\n# Visualisation\nfig, axes = plt.subplots(1, 2, figsize=(12, 5))\ndf['value'].hist(ax=axes[0], bins=20)\naxes[0].set_title('Distribution')\ndf.groupby('category')['value'].sum().plot(kind='bar', ax=axes[1])\naxes[1].set_title('By Category')\nplt.tight_layout()\nplt.show()\n\`\`\`\n\n**Findings:**\n- Dataset contains ${Math.floor(Math.random()*5000+1000)} rows across key dimensions\n- Highest variance in the primary metric column\n- Recommend investigating outliers in Q4 data before drawing conclusions`;
  }

  // ── SUMMARIZE ──
  if (d.includes("summarize") || d.includes("summary") || d.includes("summarise")) {
    return `## Summary\n\n**Core thesis:** ${topic.charAt(0).toUpperCase() + topic.slice(1)} covers three primary areas with significant implications for the target audience.\n\n**Key points:**\n- The main argument centres on structural change in existing workflows\n- Evidence presented supports a 20–30% efficiency improvement\n- Counterarguments are acknowledged but not fully addressed\n\n**Most important quote:**\n> "The shift is not incremental — it represents a fundamental rethinking of the approach."\n\n**What's missing:**\n- Quantitative data to support qualitative claims\n- Long-term impact assessment\n\n**Bottom line:** Worth reading in full if you are directly impacted. Otherwise this summary covers the essentials.`;
  }

  // ── COMPETITIVE ANALYSIS ──
  if (d.includes("competitor") || d.includes("competitive")) {
    const product = topic.replace(/^competitive analysis (of|for|on|about)\s*/i, "");
    return `# Competitive Analysis: ${product.charAt(0).toUpperCase() + product.slice(1)}\n\n## Competitor Landscape\n| Competitor | Positioning | Pricing | Key Strength | Key Weakness |\n|---|---|---|---|---|\n| Leader A | Market leader, broad feature set | $29/mo | Brand trust, integrations | Slow to ship, legacy UX |\n| Challenger B | Developer-first, API-led | $19/mo | Technical depth, docs | Limited non-technical UX |\n| Disruptor C | Mobile-native, simple | $9/mo | Speed, simplicity | Feature gaps at scale |\n\n## Feature Matrix\n| Capability | You | Leader A | Challenger B | Disruptor C |\n|---|---|---|---|---|\n| Core workflow | ✓ | ✓ | ✓ | ✓ |\n| API access | ✓ | ✓ | ✓ | ✗ |\n| Mobile | ✓ | Partial | ✗ | ✓ |\n| Enterprise SSO | ✓ | ✓ | ✗ | ✗ |\n\n## Strategic Gaps\n- Leader A's enterprise contracts renewing in Q3 — acquisition window\n- Challenger B has no mobile strategy — your mobile differentiates clearly\n- Disruptor C is winning on simplicity but will hit feature ceiling at scale\n\n## Recommended Positioning\nOwn the middle market: more capable than Disruptor C, faster and cheaper than Leader A. Price at $22–24/mo.`;
  }

  // ── MARKET RESEARCH ──
  if (d.includes("market research") || d.includes("market size") || d.includes("tam")) {
    return `# Market Research: ${topic.charAt(0).toUpperCase() + topic.slice(1)}\n\n## Market Size\n| Segment | Size | CAGR | Source |\n|---|---|---|---|\n| TAM | $8.2B | 24% | Industry Report 2025 |\n| SAM | $2.1B | 31% | Adjusted for geography |\n| SOM (Year 1) | $42M | — | Bottom-up model |\n\n## Key Players\n| Company | Revenue | Share | Moat |\n|---|---|---|---|\n| Incumbent A | $1.2B | 14% | Distribution, brand |\n| Challenger B | $380M | 4.6% | Product velocity |\n| Startup C | $45M | 0.5% | Niche focus |\n\n## Customer Segments\n- **Enterprise (>500 seats):** 60% of revenue, 20% of volume\n- **Mid-market (50–500):** 30% of revenue, 40% of volume\n- **SMB (<50):** 10% of revenue, 40% of volume\n\n## Trends\n- AI integration is becoming a purchase criterion (not a nice-to-have)\n- Consolidation accelerating — 3 acquisitions in past 6 months\n- Mobile-first demand growing 40% YoY in SMB segment\n\n## Recommendation\nEnter mid-market first. Lowest competition, highest growth, shortest sales cycle.`;
  }

  // ── INVESTOR UPDATE / BOARD REPORT ──
  if (d.includes("investor") || d.includes("board") || d.includes("memo") || d.includes("weekly update")) {
    return `# ${topic.charAt(0).toUpperCase() + topic.slice(1)}\n\n## Headline Numbers\n| Metric | This Period | Last Period | Target | Status |\n|---|---|---|---|---|\n| Revenue | $2.4M | $2.1M | $2.2M | ✅ +14% |\n| Burn | $890K | $920K | $950K | ✅ Under budget |\n| Runway | 18 months | 16 months | 16 months | ✅ Extended |\n| Churn | 2.1% | 2.8% | <3% | ✅ Improving |\n| NPS | 38 | 41 | 45 | ⚠️ Declining |\n\n## What Went Well\n- Closed two enterprise deals totalling $280K ARR\n- Engineering shipped v2.1 ahead of schedule\n- Support ticket volume down 18% after docs redesign\n\n## What Needs Attention\n- NPS decline driven by onboarding friction — fix in progress\n- Pipeline coverage at 2.1x (target: 3x) — doubling outbound efforts\n\n## Top 3 Risks\n1. Key hire dependency — mitigation: interim promotion confirmed\n2. Enterprise renewal in Q3 — active conversation underway\n3. NPS trend — onboarding redesign launching next month\n\n## Next 30 Days\n- Close 2 pipeline deals ($180K combined ARR)\n- Launch redesigned onboarding to all new users\n- Complete Series B data room preparation`;
  }

  // ── SCHEDULE / PLAN ──
  if (d.includes("schedul") || d.includes("plan my day") || d.includes("daily task") || d.includes("to-do")) {
    const tasks = clarifyAnswer || "your listed tasks";
    return `# Daily Schedule\n\nBased on ${tasks}:\n\n| Time | Task | Duration | Priority |\n|---|---|---|---|\n| 9:00 AM | Deep work block — most complex task | 90 min | 🔴 High |\n| 10:30 AM | Review emails + Slack catchup | 20 min | 🟡 Medium |\n| 10:50 AM | Team standup / sync | 20 min | 🔴 High |\n| 11:10 AM | Second focus block | 60 min | 🔴 High |\n| 12:10 PM | Lunch break | 50 min | — |\n| 1:00 PM | Meetings / calls | 90 min | 🟡 Medium |\n| 2:30 PM | Admin, follow-ups, docs | 45 min | 🟢 Low |\n| 3:15 PM | Review + prep for tomorrow | 30 min | 🟡 Medium |\n| 3:45 PM | Buffer / overflow | 15 min | — |\n\n**Tips for today:**\n- Front-load high-priority tasks before 12pm when energy is highest\n- Batch all communication into the 10:30am window\n- Protect the deep work blocks — decline non-urgent meeting requests`;
  }

  // ── GENERIC FALLBACK (realistic plain-prompt output — deliberately less structured) ──
  return `${topic.charAt(0).toUpperCase() + topic.slice(1)} is an interesting area to explore. There are several things to consider here.

First, you'll want to think about what you're trying to achieve and who the key stakeholders are. It's important to get alignment early so you don't end up going down a path that doesn't serve the broader goals. I'd suggest starting by mapping out the problem space and identifying where the biggest gaps are.

From there, you could look at what others have done in similar situations. There are some good frameworks out there — things like prioritisation matrices, impact vs effort grids, or even just a simple pros and cons list can help clarify your thinking.

One thing I'd flag is that the timeline matters a lot here. If this is urgent, you might want to take a more pragmatic approach and focus on quick wins first. If you have more runway, a more thorough analysis would be valuable.

Let me know if you'd like me to go deeper on any particular aspect of this — I can help with research, structuring a plan, or drafting a document around it.

~5.4k tokens · plain prompt · no skill applied`;
}

/* ═══ MARKDOWN RENDERER ═══ */
function Md({ text }) {
  if (!text) return null;
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    // Table
    if (ln.includes("|") && i + 1 < lines.length && /^\s*\|?\s*[-:]/.test(lines[i+1])) {
      const tl = [ln]; let j = i+1;
      while (j < lines.length && lines[j].includes("|") && lines[j].trim()) { tl.push(lines[j]); j++; }
      const pc = l => l.split("|").map(c=>c.trim()).filter(c=>c);
      const hd = pc(tl[0]), rows = tl.slice(2).map(pc);
      out.push(<div key={i} style={{overflowX:"auto",margin:"12px 0"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
        <thead><tr>{hd.map((h,hi)=><th key={hi} style={{textAlign:"left",padding:"8px 12px",borderBottom:"2px solid var(--sc-border)",fontWeight:600,fontSize:12}}><Inline t={h}/></th>)}</tr></thead>
        <tbody>{rows.map((row,ri)=><tr key={ri} style={{borderBottom:"1px solid var(--sc-border)"}}>{row.map((c,ci)=><td key={ci} style={{padding:"7px 12px",color:"var(--sc-muted)",fontSize:13}}><Inline t={c}/></td>)}{Array.from({length:Math.max(0,hd.length-row.length)}).map((_,ci)=><td key={`e${ci}`} style={{padding:"7px 12px"}}/>)}</tr>)}</tbody>
      </table></div>); i = j; continue;
    }
    if (/^#{1,4}\s/.test(ln)) { const lv = ln.match(/^(#+)/)[1].length; const ct = ln.replace(/^#+\s*/,"");
      out.push(<div key={i} style={{fontSize:[0,20,17,15,14][lv],fontWeight:lv<=2?600:500,margin:out.length===0?"0 0 8px":"16px 0 6px"}}><Inline t={ct}/></div>); i++; continue; }
    if (/^\s*[-*]\s/.test(ln)) { const items=[]; let j=i; while(j<lines.length&&/^\s*[-*]\s/.test(lines[j])){items.push(lines[j].replace(/^\s*[-*]\s*/,"")); j++;} out.push(<ul key={i} style={{margin:"8px 0",paddingLeft:20}}>{items.map((it,li)=><li key={li} style={{marginBottom:4,color:"var(--sc-muted)",fontSize:14,lineHeight:1.55}}><Inline t={it}/></li>)}</ul>); i=j; continue; }
    if (/^\s*\d+[.)]\s/.test(ln)) { const items=[]; let j=i; while(j<lines.length&&/^\s*\d+[.)]\s/.test(lines[j])){items.push(lines[j].replace(/^\s*\d+[.)]\s*/,"")); j++;} out.push(<ol key={i} style={{margin:"8px 0",paddingLeft:20}}>{items.map((it,li)=><li key={li} style={{marginBottom:4,color:"var(--sc-muted)",fontSize:14,lineHeight:1.55}}><Inline t={it}/></li>)}</ol>); i=j; continue; }
    if (!ln.trim()) { i++; continue; }
    out.push(<p key={i} style={{margin:"6px 0",fontSize:15,lineHeight:1.65}}><Inline t={ln}/></p>); i++;
  }
  return <div>{out}</div>;
}
function Inline({ t }) {
  if (!t) return null;
  const parts = []; let rem = t, k = 0;
  while (rem.length > 0) {
    const b = rem.match(/^(.*?)\*\*(.+?)\*\*(.*)/s);
    if (b) { if (b[1]) parts.push(<span key={k++}>{b[1]}</span>); parts.push(<strong key={k++} style={{fontWeight:600}}>{b[2]}</strong>); rem = b[3]; continue; }
    const it = rem.match(/^(.*?)\*(.+?)\*(.*)/s);
    if (it) { if (it[1]) parts.push(<span key={k++}>{it[1]}</span>); parts.push(<em key={k++}>{it[2]}</em>); rem = it[3]; continue; }
    const cd = rem.match(/^(.*?)`(.+?)`(.*)/s);
    if (cd) { if (cd[1]) parts.push(<span key={k++}>{cd[1]}</span>); parts.push(<code key={k++} style={{fontFamily:"monospace",fontSize:"0.9em",background:"var(--sc-bubble)",padding:"1px 5px",borderRadius:4}}>{cd[2]}</code>); rem = cd[3]; continue; }
    parts.push(<span key={k++}>{rem}</span>); break;
  }
  return <>{parts}</>;
}

/* ═══ THINKING INDICATOR ═══ */
function Thinking({ label }) {
  const [sec, setSec] = useState(0);
  useEffect(() => { setSec(0); const t = setInterval(() => setSec(s => s + 1), 1000); return () => clearInterval(t); }, [label]);
  if (!label) return <div className="flex items-center gap-1 py-2"><span className="sc-dot"/><span className="sc-dot"/><span className="sc-dot"/></div>;
  return (
    <div className="py-2 flex items-center gap-2">
      <div style={{width:16,height:16,border:"2px solid var(--sc-border)",borderTopColor:"var(--sc-accent)",borderRadius:"50%",animation:"sc-spin 0.7s linear infinite"}}/>
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs" style={{color:"var(--sc-muted)"}}>{sec}s</span>
    </div>
  );
}

/* ═══ CLAUDE MARK ═══ */
function CM({ size = 24 }) {
  return <img src="data:image/png;base64,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" width={size} height={size} alt="Claude" style={{borderRadius:size*0.2,display:"block"}}/>;
}

/* ═══ STYLES ═══ */
const CSS=`:root{--sc-bg:#FAF9F5;--sc-surface:#FFF;--sc-fg:#1F1F1E;--sc-muted:#6E6D6A;--sc-border:#E8E6DE;--sc-bubble:#F0EEE6;--sc-accent:#DA7756;--sc-chip-bg:#FFF6EC;--sc-chip-border:#F4D7BD;--sc-shadow:0 4px 24px rgba(31,31,30,.06);--sc-serif:"Fraunces","Playfair Display",Georgia,serif;--sc-sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;--sc-mono:ui-monospace,SFMono-Regular,Menlo,monospace;--sc-success:#2D8659;--sc-success-bg:#EAF3DE;--sc-info:#185FA5;--sc-info-bg:#E6F1FB}
@media(prefers-color-scheme:dark){:root{--sc-bg:#262624;--sc-surface:#30302E;--sc-fg:#F5F4EF;--sc-muted:#9A9890;--sc-border:#3A3935;--sc-bubble:#3A3935;--sc-chip-bg:#3A2A1E;--sc-chip-border:#7C4A2B;--sc-shadow:0 4px 24px rgba(0,0,0,.3);--sc-success:#4CAF7D;--sc-success-bg:#1E3A2A;--sc-info:#5B9BD5;--sc-info-bg:#1E2A3A}}
.sc-dot{width:6px;height:6px;border-radius:50%;background:var(--sc-muted);display:inline-block;animation:sc-p 1.2s ease-in-out infinite}.sc-dot:nth-child(2){animation-delay:.15s}.sc-dot:nth-child(3){animation-delay:.3s}
@keyframes sc-p{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-2px)}}
.sc-fade{animation:sc-fi 180ms ease-out}@keyframes sc-fi{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
.sc-sheet{animation:sc-si 220ms ease-out}@keyframes sc-si{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}
.sc-scroll::-webkit-scrollbar{width:8px}.sc-scroll::-webkit-scrollbar-thumb{background:var(--sc-border);border-radius:4px}
table tbody tr:hover{background:var(--sc-bubble)}
@keyframes sc-spin{to{transform:rotate(360deg)}}
.sc-sb-item{transition:background .1s}.sc-sb-item:hover{background:var(--sc-bubble)!important}`;

const SUGGESTIONS = [
  { icon:FileText, label:"Draft a PRD", sub:"Structured output with goals, metrics, risks", prompt:"Draft a PRD for a notifications redesign — include goals, target user, design, and metrics." },
  { icon:Mail, label:"Write a client email", sub:"Tone-matched with subject line", prompt:"Write an email to our client apologising for the delayed shipment and offering 15% off their next order." },
  { icon:BarChart3, label:"Competitive analysis", sub:"Structured breakdown with positioning", prompt:"Help me do a competitive analysis on Runna including pricing, features, market positioning, and gaps." },
];

const CHATS = [
  {id:"c1",title:"Claude's market position and user …"},
  {id:"c2",title:"Task list with time estimates"},
  {id:"c3",title:"Claude AI productivity feature ma…"},
  {id:"c4",title:"Understanding AI evaluation"},
  {id:"c5",title:"MVP features and risk mitigation s…"},
  {id:"c6",title:"MVP feature summary"},
  {id:"c7",title:"Top SMR nuclear companies globally"},
  {id:"c8",title:"Breaking into fintech without prio…"},
  {id:"c9",title:"Claude's main competitors and co…"},
  {id:"c10",title:"Claude podcast transcript analysis"},
  {id:"c11",title:"Summarizing unlisted YouTube vid…"},
];

/* ═══ MAIN COMPONENT ═══ */
export default function SkillCompass() {
  const [msgs, setMsgs] = useState([]);
  const [draft, setDraft] = useState("");
  const [cls, setCls] = useState(null);
  const [pend, setPend] = useState(false);
  const [clarify, setClarify] = useState(null);
  const [customs, setCustoms] = useState([]);
  const [tele, setTele] = useState({dec:0,acc:0,built:0,up:0,dn:0});
  const [tokUsed, setTokUsed] = useState(0);
  const [toast, setToast] = useState(null);
  const [thinkLabel, setThinkLabel] = useState(null);
  const [fbId, setFbId] = useState(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [sideMore, setSideMore] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelName, setModelName] = useState("Sonnet 4.6");
  const [adaptive, setAdaptive] = useState(true);
  const [moreModels, setMoreModels] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [phases, setPhases] = useState(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const clarifyRef = useRef(clarify);
  clarifyRef.current = clarify;
  const rRef = useRef(0);
  const endRef = useRef(null);
  const compRef = useRef(null);
  const allSk = useMemo(() => [...SKILLS, ...customs], [customs]);

  useEffect(() => { const l = document.createElement("link"); l.rel="stylesheet"; l.href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&display=swap"; document.head.appendChild(l); return()=>{try{document.head.removeChild(l)}catch{}}; }, []);
  useEffect(() => { endRef.current?.scrollIntoView({behavior:"smooth",block:"end"}); }, [msgs]);
  useEffect(() => { if(toast){const t=setTimeout(()=>setToast(null),3500);return()=>clearTimeout(t);} }, [toast]);

  // Debounced router — only fires for NEW prompts, not mid-flow answers
  useEffect(() => {
    if (clarify || phases) { setCls(null); return; } // mid-flow: don't classify
    if (!draft.trim() || draft.trim().length < 12) { setCls(null); return; }
    const t = setTimeout(() => { const seq = ++rRef.current; const c = classify(draft); if (seq === rRef.current) setCls(c); }, 350);
    return () => clearTimeout(t);
  }, [draft, clarify, phases]);

  const matched = cls?.dec === "skill" && cls.sid ? allSk.find(s => s.id === cls.sid) : null;
  const plainC = useMemo(() => estCost(draft.length, null), [draft.length]);
  const skillC = useMemo(() => matched ? estCost(draft.length, matched) : null, [matched, draft.length]);

  // Core send
  const send = useCallback(async (text, forceSid = null) => {
    if (!text.trim() || pend) return;
    const userMsg = { id:uid(), role:"user", content:text };

    // ── BUILDING STATE takes priority over everything ──
    const currentClarify = clarifyRef.current;
    if (currentClarify && currentClarify.sid === "__building__") {
      const { orig, buildPhase, buildAnswers } = currentClarify;
      const answers = [...(buildAnswers||[]), text.trim()];
      const ph = { id:uid(), role:"assistant", content:"", pending:true };
      setMsgs(m => [...m, userMsg, ph]); setDraft(""); setPend(true);

      if (buildPhase === 0) {
        setThinkLabel("Processing your answer");
        await new Promise(r => setTimeout(r, 500));
        const msg = `Got it. Here's what I heard: *${text.trim().split('.')[0]}.*\n\n**Phase 2 — Trigger phrases**\n\nWhat would you actually type into Claude to activate this Skill? Give me 3–5 different ways you might phrase the request.\n\nFor example:\n- "Write my weekly investor update"\n- "Generate the board report"\n- "Create this week's update for investors"\n\nThe more variations you give me, the better Claude will be at recognising when to use this Skill automatically.`;
        setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:msg, pending:false} : x));
        setClarify({ orig, sid:"__building__", buildPhase:1, buildAnswers:answers });
        setPend(false); setThinkLabel(null); return;
      }

      if (buildPhase === 1) {
        setThinkLabel("Noting trigger phrases");
        await new Promise(r => setTimeout(r, 500));
        const msg = `Good — I'll use those as trigger phrases.\n\n**Phase 3 — Workflow & output format**\n\nTwo quick questions:\n\n1. **What inputs will you provide each time?** (e.g., raw metrics in a spreadsheet, notes from a meeting, a brief sentence describing the topic)\n\n2. **What should the output look like?** Describe the exact format — for example:\n   - "A 1-page doc with a metrics table at the top, then bullet points for wins and risks"\n   - "An email with subject line, 3 paragraphs, formal tone"\n   - "A structured comparison table with a recommendation at the end"`;
        setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:msg, pending:false} : x));
        setClarify({ orig, sid:"__building__", buildPhase:2, buildAnswers:answers });
        setPend(false); setThinkLabel(null); return;
      }

      if (buildPhase === 2) {
        setThinkLabel("Generating your Skill");
        await new Promise(r => setTimeout(r, 800));

        const taskDesc = answers[0] || orig;
        const triggers = answers[1] || "";
        const format = answers[2] || text.trim();
        const d = orig.toLowerCase();

        let name = "Custom Task";
        if (d.includes("board") && d.includes("report")) name = "Board Report";
        else if (d.includes("investor") && (d.includes("update") || d.includes("memo"))) name = "Investor Update";
        else if (d.includes("weekly") && d.includes("update")) name = "Weekly Update";
        else if (d.includes("standup") || d.includes("stand-up")) name = "Standup Summary";
        else if (d.includes("client") && d.includes("report")) name = "Client Report";
        else if (d.includes("status") && d.includes("report")) name = "Status Report";
        else if (d.includes("meeting") && d.includes("agenda")) name = "Meeting Agenda";
        else if (d.includes("proposal")) name = "Proposal Draft";
        else if (d.includes("newsletter")) name = "Newsletter Draft";
        else if (d.includes("retrospective") || d.includes("retro")) name = "Sprint Retro";
        else {
          const words = orig.split(/\s+/).filter(w => w.length > 4 && !["about","should","would","could","every","where","their","these","those","which","create","generate","write","build","make","help"].includes(w.toLowerCase()));
          if (words.length >= 2) name = words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        }

        const skillId = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const desc = taskDesc.split('.')[0].trim();

        // Parse trigger phrases into an array
        const triggerList = triggers.split(/[,\n]/).map(t => t.trim()).filter(t => t.length > 2);
        const triggerPhrasesInDesc = triggerList.length > 0
          ? ` Also triggers on phrases like ${triggerList.slice(0,3).map(t=>`"${t}"`).join(", ")}.`
          : "";

        // Parse format into inputs and output
        const formatLines = format.split('\n').filter(l => l.trim());
        const inputs = formatLines[0] || "User provides the relevant context";
        const outputFormat = formatLines.slice(1).join('\n') || format;

        // Generate full SKILL.md matching the template
        const skillMd = `---
name: ${skillId}
description: "${desc}.${triggerPhrasesInDesc} Use this skill whenever the user asks to ${orig.toLowerCase().replace(/^(generate|create|write|build|make|draft)\s+/i,"").replace(/^(a|an|the)\s+/i,"")}."
---

# ${name}

${taskDesc}

## Workflow

### Step 1: Understand the Request

Read the user's input and identify:
- What information or data they are providing
- Any specific constraints, preferences, or requirements mentioned
- The desired scope and depth of the output

### Step 2: Process and Structure

${inputs}

Apply the following approach:
- Break the task into clear sections
- Prioritise the most important information first
- Maintain consistency in tone and format throughout

### Step 3: Generate Output

${outputFormat || `Produce a structured output that covers all required sections.`}

**Formatting rules:**
- Use clear headers for each section
- Use bullet points for lists, tables for comparisons
- Keep each section concise and scannable
- Include specific numbers, dates, or metrics where relevant

### Step 4: Quality Check

Before presenting the output:
- Verify all required sections are included
- Check that the format matches what was requested
- Ensure nothing important from the user's input was missed

### Step 5: Present Results

Deliver the output directly in chat. If a document was generated, use \`present_files\` to share it with a brief summary of the key highlights.

## Error Handling

- **Missing input**: Ask the user for the specific information needed before proceeding
- **Ambiguous request**: Clarify the key question before generating output
- **Too much content**: Summarise and offer to expand specific sections on request

## Example Triggers

${triggerList.length > 0
  ? triggerList.map(t => `- "${t}"`).join('\n')
  : `- "${orig}"`}`;

        const skillPreview = `**Phase 4 — Your Skill is ready ✓**\n\nHere's your SKILL.md:\n\n\`\`\`\n${skillMd}\n\`\`\`\n\n---\n\n**To install:** Save this as \`~/.claude/skills/${skillId}/SKILL.md\`\n**To use:** Type \`/${skillId}\` or just describe the task — Claude auto-invokes it.\n\n**Evaluation:** In the full version, Claude tests the Skill against sample inputs before saving. \n\nWhat would you like to do?`;

        const newSkill = { id:skillId, name, desc, sys:skillMd, p50:1400, p90:2400 };

        setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:skillPreview, pending:false, isSkillPreview:true, skillData:newSkill, taskToRun:orig} : x));
        setClarify(null);
        setPend(false); setThinkLabel(null); return;
      }
    }

    // Phase 2: answering clarify (non-build)
    if (currentClarify) {
      const { orig, sid } = currentClarify;

      // ── NORMAL CLARIFY: answering a skill/plain question ──
      const sk = sid ? (allSk.find(s => s.id === sid) || customs.find(s => s.id === sid)) : null;
      const combined = `${orig}\n\nAdditional context: ${text}`;
      const ph = { id:uid(), role:"assistant", content:"", sid, pending:true };
      setMsgs(m => [...m, userMsg, ph]); setDraft(""); setPend(true); setClarify(null); setCls(null);
      setThinkLabel(sk ? `Writing with ${sk.name}` : "Writing response");
      await new Promise(r => setTimeout(r, 800 + Math.random() * 800));
      const reply = demoChat(orig, text);
      const tok = Math.ceil(reply.length / 4);
      setTokUsed(p => p + tok);
      setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:reply, pending:false, tok, sid} : x));
      setPend(false); setThinkLabel(null); return;
    }

    // Explicit skill from chip
    if (forceSid === "__plain__") {
      // "Just prompt" — bypass classifier, send as plain
      const ph = { id:uid(), role:"assistant", content:"", pending:true };
      setMsgs(m => [...m, userMsg, ph]); setDraft(""); setPend(true); setCls(null);
      setThinkLabel("Writing response");
      await new Promise(r => setTimeout(r, 400));
      const q = getPlainClarifyQ(text);
      const pc = estCost(text.length, null);
      const msg = `*Plain prompt · ~${fmtTok(pc.p70)} tokens · ~${pc.lat}s*\n\n${q}`;
      setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:msg, pending:false} : x));
      setClarify({ orig:text, sid:null });
      setPend(false); setThinkLabel(null); return;
    }
    if (forceSid) {
      const sk = allSk.find(s => s.id === forceSid) || customs.find(s => s.id === forceSid);
      const ph = { id:uid(), role:"assistant", content:"", pending:true };
      setMsgs(m => [...m, userMsg, ph]); setDraft(""); setPend(true); setCls(null);
      setThinkLabel(sk ? `Writing with ${sk.name}` : "Writing response");
      await new Promise(r => setTimeout(r, 400));
      const q = CLARIFY[forceSid] || (sk ? `What context should I know to run your **${sk.name}** skill well?` : CLARIFY._);
      const sc = estCost(text.length, sk); const pc = estCost(text.length, null);
      const msg = sk
        ? `I'll use the **${sk.name}** skill — ${sk.desc.toLowerCase()}\n\n*Saves ~${fmtTok(pc.p70 - sc.p70)} tokens vs plain (~${fmtTok(sc.p70)} vs ~${fmtTok(pc.p70)}) · ~${sc.lat}s*\n\n${q}`
        : q;
      setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:msg, pending:false} : x));
      setClarify({ orig:text, sid:forceSid });
      setTele(p => ({...p, dec:p.dec+1}));
      setPend(false); setThinkLabel(null); return;
    }

    // Phase 1: classify
    const ph = { id:uid(), role:"assistant", content:"", pending:true };
    setMsgs(m => [...m, userMsg, ph]); setDraft(""); setPend(true); setCls(null);
    setThinkLabel("Analyzing task");
    await new Promise(r => setTimeout(r, 400));
    const c = classify(text);
    setThinkLabel("Matching capability");
    await new Promise(r => setTimeout(r, 300));

    // Agent
    if (c.dec === "agent") {
      const isIntegration = text.toLowerCase().includes("connect") || text.toLowerCase().includes("slack") || text.toLowerCase().includes("jira") || text.toLowerCase().includes("notion") || text.toLowerCase().includes("asana") || text.toLowerCase().includes("gmail") || text.toLowerCase().includes("calendar") || text.toLowerCase().includes("pull from") || text.toLowerCase().includes("fetch from") || text.toLowerCase().includes("sync");
      const agentMsg = isIntegration
        ? `This task needs to **connect to an external tool** (like Slack, Jira, or Google Calendar) — that's not something a prompt can do directly. It needs an **Agent with MCP integration**.\n\nHere's how to set it up:\n\n1. Go to **Cowork** or **Claude Code**\n2. Connect the relevant MCP server (e.g., Slack MCP, Google Calendar MCP)\n3. Define what to fetch and how to format it\n4. Run on demand or on a schedule\n\nWant me to help you draft the agent specification for this?`
        : `This task — ongoing monitoring or automated actions — is best handled by an **Agent**, not a skill or prompt.\n\nAgents run autonomously in the background on a schedule. Here's how:\n\n1. Go to **Claude Code** or **Cowork**\n2. Define the trigger (e.g., "every morning at 9am")\n3. Define the action sequence\n4. Set output destination (Slack, email, etc.)\n\nWant me to help you draft the agent specification?`;
      setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:agentMsg, pending:false} : x));
      setPend(false); setThinkLabel(null); return;
    }
    // Workflow
    if (c.dec === "workflow") {
      setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:`This task chains multiple steps — a **Workflow** is the right capability.\n\nWorkflows connect skills, prompts, and tools in sequence. Each step's output feeds the next:\n\n1. Open **Workflows** in Claude\n2. Add steps in sequence\n3. Map outputs between steps\n4. Run once or schedule\n\nWant me to help you plan the workflow steps?`, pending:false} : x));
      setPend(false); setThinkLabel(null); return;
    }
    // Build — guided in chat, mirroring Claude's native skill-creator interview
    if (c.dec === "build") {
      const d = text.toLowerCase();
      let taskConfirm = text.trim();
      // Context-aware Phase 1 question matching Claude's skill-creator
      let q1 = "Let me help you turn this into a reusable Skill.\n\nFirst, I need to understand the task clearly.\n\n**What exactly should this Skill produce every time you run it?** Be specific — \"a report\" is too vague. \"A 1-page executive summary with headline metrics, 3 key wins, 3 risks, and next steps\" is a Skill that works.";
      if (d.includes("report") || d.includes("memo") || d.includes("update"))
        q1 = `I can turn this into a reusable Skill so Claude handles it the same way every time.\n\n**Phase 1 — The Task**\n\nIt sounds like you want to generate a ${d.includes("investor")?"investor update":d.includes("board")?"board report":d.includes("weekly")?"weekly update":"recurring report"}. Let me get specific:\n\n**What exact sections should this always include?** For example: headline metrics, wins, risks, next steps — list everything.`;
      else if (d.includes("email") || d.includes("outreach"))
        q1 = `I can turn this into a reusable Skill.\n\n**Phase 1 — The Task**\n\n**Who's the typical recipient, and what's the one action they should take after reading?** Be specific — "a client" is vague. "A B2B client who needs to approve the project timeline" is a Skill that works.`;
      else if (d.includes("analysis") || d.includes("research"))
        q1 = `I can turn this into a reusable Skill.\n\n**Phase 1 — The Task**\n\n**What decisions will this analysis inform?** For example: hiring decisions, investment thesis, competitive positioning, product strategy — the output format should match the decision being made.`;

      setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:`💡 ${q1}`, pending:false} : x));
      setClarify({ orig:text, sid:"__building__", buildPhase:0, buildAnswers:[] });
      setPend(false); setThinkLabel(null); return;
    }
    // Decompose
    if (c.dec === "decompose") {
      const phs = genPhases(text);
      const total = phs.reduce((s,p)=>s+parseFloat(p.tok.replace(/[^0-9.]/g,""))*1000, 0);
      const msg = `This is a multi-part task. I've broken it into ${phs.length} phases:\n\n${phs.map((p,i)=>`**Phase ${i+1}: ${p.name}**${p.sid?` → ${allSk.find(s=>s.id===p.sid)?.name||"skill"}`:" → plain prompt"} · ${p.tok} tokens`).join("\n")}\n\n**Total: ~${fmtTok(total)} tokens** · ${estRemain(tokUsed+total)}\n\nReady to run phase by phase?`;
      setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:msg, pending:false, isPlan:true, phasesData:phs} : x));
      setPhases({phs, idx:0, orig:text, results:[]});
      setPend(false); setThinkLabel(null); return;
    }
    // Skill match or plain — ask clarify
    const sk = (c.dec === "skill" && c.conf >= 0.7 && c.sid) ? allSk.find(s => s.id === c.sid) : null;
    if (sk) setThinkLabel(`Matched: ${sk.name}`);
    else setThinkLabel("Preparing response");
    await new Promise(r => setTimeout(r, 300));
    const q = sk ? (CLARIFY[sk.id] || CLARIFY._) : getPlainClarifyQ(text);
    let msg = "";
    if (sk) {
      const sc = estCost(text.length, sk); const pc = estCost(text.length, null);
      msg = `I'll use the **${sk.name}** skill — ${sk.desc.toLowerCase()}\n\n*Saves ~${fmtTok(pc.p70-sc.p70)} tokens vs plain (~${fmtTok(sc.p70)} vs ~${fmtTok(pc.p70)}) · ~${sc.lat}s*\n\n${q}`;
    } else { msg = q; }
    setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:msg, pending:false} : x));
    setClarify({ orig:text, sid:sk?.id||null });
    setTele(p => ({...p, dec:p.dec+1}));
    setPend(false); setThinkLabel(null);
  }, [msgs, pend, allSk, clarify, tokUsed]);

  // Phase runner
  const runPhase = useCallback(async () => {
    if (!phases || pend) return;
    const {phs, idx, orig, results} = phases;
    if (idx >= phs.length) return;
    const p = phs[idx]; const sk = p.sid ? allSk.find(s=>s.id===p.sid) : null;
    const ph = { id:uid(), role:"assistant", content:"", sid:p.sid, pending:true, phaseNum:idx+1 };
    setMsgs(m => [...m, ph]); setPend(true);
    setThinkLabel(`Running phase ${idx+1}`);
    await new Promise(r => setTimeout(r, 800 + Math.random() * 600));
    const reply = sk ? demoChat(sk.id.includes("competitive")?"competitor analysis":"market research", "") : "[Phase output generated]";
    const tok = Math.ceil(reply.length / 4);
    setTokUsed(pr => pr + tok);
    setMsgs(m => m.map(x => x.id === ph.id ? {...x, content:reply, pending:false, tok} : x));
    if (idx+1 < phs.length) setPhases({...phases, idx:idx+1, results:[...results,reply]});
    else { setPhases(null); setToast({text:`All ${phs.length} phases complete`}); }
    setPend(false); setThinkLabel(null);
  }, [phases, pend, allSk]);

  // Feedback
  const rate = (id, r) => { setMsgs(m=>m.map(x=>x.id===id?{...x,fb:r}:x)); setTele(p=>({...p,[r==="up"?"up":"dn"]:(p[r==="up"?"up":"dn"]||0)+1})); if(r==="down") setFbId(id); };
  const fbReason = (id, reason) => { setMsgs(m=>m.map(x=>x.id===id?{...x,fbR:reason}:x)); setFbId(null); setToast({text:"Thanks — helps improve routing"}); };

  // Handlers
  const reset = () => { setMsgs([]); setDraft(""); setCls(null); setClarify(null); setPend(false); setPhases(null); setWhyOpen(false); setFbId(null); setThinkLabel(null); compRef.current?.focus(); };
  const onKey = e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send(draft, clarifyRef.current ? null : "__plain__");} };
  const fill = p => { setDraft(p); compRef.current?.focus(); };

  // Strip state
  const strip = useMemo(() => {
    if (clarify || phases) return null; // mid-flow: no strip
    if (!draft.trim() || draft.trim().length < 12) return null;
    if (!cls) return {type:"est"};
    if (cls.dec==="skill" && matched) return {type:"skill"};
    if (cls.dec==="decompose") return {type:"decompose"};
    if (cls.dec==="agent") return {type:"agent"};
    if (cls.dec==="workflow") return {type:"workflow"};
    if (cls.dec==="build") return {type:"build"};
    return {type:"plain"};
  }, [draft, cls, matched, clarify, phases]);

  /* ═══ RENDER ═══ */
  return (
    <div className="flex w-full h-full" style={{background:"var(--sc-bg)",color:"var(--sc-fg)",fontFamily:"var(--sc-sans)",fontSize:15,lineHeight:1.55,minHeight:"100vh"}}>
      <style dangerouslySetInnerHTML={{__html:CSS}}/>
      {toast && <div className="sc-fade" style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:100,background:"var(--sc-success-bg)",color:"var(--sc-success)",border:"1px solid var(--sc-success)",borderRadius:12,padding:"10px 20px",fontSize:13,fontWeight:500,display:"flex",alignItems:"center",gap:8,boxShadow:"var(--sc-shadow)"}}><Check size={14}/> {toast.text}</div>}

      {/* SIDEBAR */}
      <div className="flex flex-col shrink-0 h-full" style={{width:sideOpen?260:0,overflow:"hidden",borderRight:sideOpen?"1px solid var(--sc-border)":"none",background:"var(--sc-bg)",transition:"width 200ms ease"}}>
        <div className="flex items-center justify-between px-4 py-3" style={{height:56}}>
          <span style={{fontWeight:600,fontSize:17,color:"var(--sc-fg)",letterSpacing:"-0.02em"}}>Claude</span>
          <button onClick={()=>setSideOpen(false)} className="p-1 rounded-md" style={{color:"var(--sc-muted)"}} title="Close sidebar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="3" x2="9" y2="21"/></svg>
          </button>
        </div>
        <div className="px-3 space-y-0.5">
          <button onClick={reset} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> New chat
          </button>
          <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Search
          </button>
          <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/></svg> Chats
          </button>
          <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z"/></svg> Projects
          </button>
          <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg> Code
          </button>
          <button onClick={()=>setCustomizeOpen(true)} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/></svg> Customize
          </button>
          <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="12" r="2.5"/><circle cx="13.5" cy="17.5" r="2.5"/><path d="M12 2a10 10 0 0 1 0 20 10 10 0 0 1 0-20z"/></svg> Design
          </button>
          <button onClick={()=>setSideMore(!sideMore)} className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)"}}>
            <ChevronDown size={16} style={{color:"var(--sc-muted)",strokeWidth:1.5,transform:sideMore?"rotate(180deg)":"rotate(0deg)",transition:"transform 200ms"}}/> More
          </button>
        </div>
        <div className="flex-1 overflow-y-auto sc-scroll px-3 pb-3 mt-4">
          <div className="text-xs font-medium px-3 py-1.5 mb-1" style={{color:"var(--sc-muted)"}}>Recents</div>
          {CHATS.map(c=><button key={c.id} className="w-full text-left px-3 py-2.5 text-sm truncate block" style={{color:"var(--sc-muted)",fontWeight:400}}>{c.title}</button>)}
        </div>
        <div className="px-3 py-3" style={{borderTop:"1px solid var(--sc-border)"}}>
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="rounded-full shrink-0" style={{width:36,height:36,background:"var(--sc-accent)",color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:600,letterSpacing:"0.02em"}}>UM</div>
            <div className="flex-1 min-w-0"><div className="text-sm font-medium" style={{color:"var(--sc-fg)"}}>Urja Mathur</div><div className="text-xs" style={{color:"var(--sc-muted)"}}>Max plan</div></div>
            <div className="flex items-center gap-1">
              <button className="p-1 rounded" style={{color:"var(--sc-muted)"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
              <button className="p-1 rounded" style={{color:"var(--sc-muted)"}}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="7 11 12 6 17 11"/><polyline points="7 18 12 13 17 18"/></svg></button>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center justify-between px-4" style={{height:56,flexShrink:0}}>
          <div className="flex items-center gap-2">
            {!sideOpen && <><button onClick={()=>setSideOpen(true)} className="p-1.5 rounded-lg" style={{color:"var(--sc-muted)"}}><Menu size={18}/></button><button onClick={reset} className="p-1.5 rounded-lg" style={{color:"var(--sc-muted)"}}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button></>}
          </div>
          <span className="text-xs" style={{color:"var(--sc-muted)"}}>{tele.dec} routed · {tele.up}↑ {tele.dn}↓</span>
        </header>

        <main className="flex-1 overflow-y-auto sc-scroll">
          {msgs.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
              <h1 className="mb-4 flex items-center gap-3" style={{fontFamily:"var(--sc-serif)",fontWeight:400,fontSize:32}}><CM size={36}/> Good morning. Ready when you are</h1>
              <p className="text-sm mb-8 text-center max-w-lg" style={{color:"var(--sc-muted)"}}>Claude can help you with writing, analysis, coding, research, and more.</p>
              <div className="w-full max-w-2xl"><div className="flex items-center gap-2 mb-3"><Sparkles size={14} style={{color:"var(--sc-muted)"}}/><span className="text-xs font-medium tracking-wide uppercase" style={{color:"var(--sc-muted)"}}>Try a scenario</span></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{SUGGESTIONS.map(s=>{const Icon=s.icon;return(<button key={s.label} onClick={()=>fill(s.prompt)} className="flex flex-col items-start gap-2 p-4 rounded-xl text-left" style={{background:"var(--sc-surface)",border:"1px solid var(--sc-border)",transition:"all .15s"}} onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--sc-accent)";e.currentTarget.style.transform="translateY(-1px)"}} onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--sc-border)";e.currentTarget.style.transform="translateY(0)"}}><div className="rounded-lg p-2" style={{background:"var(--sc-chip-bg)",color:"var(--sc-accent)"}}><Icon size={16}/></div><div><div className="text-sm font-medium">{s.label}</div><div className="text-xs mt-0.5" style={{color:"var(--sc-muted)"}}>{s.sub}</div></div></button>);})}</div></div>
              {customs.length > 0 && <div className="mt-6 text-xs flex items-center gap-2" style={{color:"var(--sc-success)"}}><Check size={12}/>{customs.length} custom skill{customs.length>1?"s":""}: {customs.map(s=>s.name).join(", ")}</div>}
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {msgs.map((m, i) => {
                const showAv = m.role==="assistant" && (i===0||msgs[i-1].role!=="assistant");
                if (m.role==="user") return <div key={m.id} className="flex justify-end"><div className="max-w-[78%] whitespace-pre-wrap" style={{background:"var(--sc-bubble)",borderRadius:12,padding:"12px 16px"}}>{m.content}</div></div>;
                const sk = m.sid ? allSk.find(s=>s.id===m.sid) : null;
                return (
                  <div key={m.id} className="flex gap-3">
                    <div style={{width:24,height:24}}>{showAv && <CM size={24}/>}</div>
                    <div className="flex-1 min-w-0">
                      {m.phaseNum && <div className="text-xs font-medium mb-2 px-2 py-0.5 inline-block rounded" style={{background:"var(--sc-info-bg)",color:"var(--sc-info)"}}>Phase {m.phaseNum}</div>}
                      {sk && !m.phaseNum && <div className="inline-flex items-center gap-1.5 mb-2 text-xs px-2 py-0.5 rounded" style={{background:"var(--sc-chip-bg)",color:"var(--sc-accent)",border:"1px solid var(--sc-chip-border)",fontWeight:500}}><Sparkles size={11}/> {sk.name}</div>}
                      {m.pending ? <Thinking label={thinkLabel}/> : <Md text={m.content}/>}
                      {!m.pending && m.isPlan && phases && <div className="mt-3 flex gap-2"><button onClick={runPhase} disabled={pend} className="text-xs font-medium px-3 py-1.5 rounded-md flex items-center gap-1" style={{background:"var(--sc-accent)",color:"white",opacity:pend?0.5:1}}><Play size={12}/> Run Phase {phases.idx+1}</button><button onClick={()=>setPhases(null)} className="text-xs px-3 py-1.5 rounded-md" style={{color:"var(--sc-muted)"}}>Just prompt</button></div>}
                      {!m.pending && m.isSkillPreview && m.skillData && <div className="mt-3 flex gap-2">
                        <button onClick={()=>{
                          const sk = m.skillData;
                          setCustoms(p => [...p.filter(s=>s.id!==sk.id), sk]);
                          setTele(p => ({...p, built:p.built+1}));
                          setToast({text:`Skill "${sk.name}" saved to Settings → Customize → Skills`});
                          setSelectedSkillId(sk.id);
                          setTimeout(() => setCustomizeOpen(true), 400);
                        }} disabled={pend} className="text-xs font-medium px-3 py-1.5 rounded-md flex items-center gap-1" style={{background:"var(--sc-accent)",color:"white"}}><Check size={12}/> Save as Skill</button>
                        <button onClick={async ()=>{
                          const sk = m.skillData;
                          const task = m.taskToRun;
                          const userMsg = { id:uid(), role:"user", content:task };
                          const ph = { id:uid(), role:"assistant", content:"", pending:true };
                          setMsgs(ms => [...ms, userMsg, ph]); setPend(true);
                          setThinkLabel(`Running ${sk.name}`);
                          await new Promise(r => setTimeout(r, 800 + Math.random() * 800));
                          const reply = demoChat(task, "");
                          const tok = Math.ceil(reply.length / 4);
                          setTokUsed(p => p + tok);
                          setMsgs(ms => ms.map(x => x.id === ph.id ? {...x, content:reply, pending:false, tok} : x));
                          setPend(false); setThinkLabel(null);
                        }} disabled={pend} className="text-xs px-3 py-1.5 rounded-md" style={{color:"var(--sc-muted)"}}>Just run it once</button>
                      </div>}
                      {!m.pending && m.phaseNum && phases && phases.idx < phases.phs.length && <div className="mt-3 rounded-lg px-3 py-2" style={{background:"var(--sc-bubble)",border:"1px solid var(--sc-border)"}}><div className="text-xs" style={{color:"var(--sc-muted)"}}>Phase {m.phaseNum} complete · ~{fmtTok(m.tok||0)} tokens · {estRemain(tokUsed)}</div><div className="flex gap-2 mt-2"><button onClick={runPhase} disabled={pend} className="text-xs font-medium px-3 py-1.5 rounded-md flex items-center gap-1" style={{background:"var(--sc-accent)",color:"white",opacity:pend?0.5:1}}><Play size={12}/> Phase {phases.idx+1}: {phases.phs[phases.idx].name}</button><button onClick={()=>setPhases(null)} className="text-xs px-2 py-1 rounded-md" style={{color:"var(--sc-muted)"}}>Stop here</button></div></div>}
                      {!m.pending && m.tok != null && <div className="flex items-center gap-2 mt-3 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-md" style={{color:"var(--sc-muted)",background:"var(--sc-bubble)"}}>~{fmtTok(m.tok)} tokens</span>
                        {sk && <span className="text-xs px-2 py-0.5 rounded-md" style={{color:"var(--sc-success)",background:"var(--sc-success-bg)"}}>saved ~{fmtTok(Math.max(0,estCost(0,null).p70-(m.tok||0)))} vs plain</span>}
                        {!m.fb?<span className="inline-flex items-center gap-1 ml-1">
                          <button onClick={()=>rate(m.id,"up")} className="p-1 rounded-md" style={{color:"var(--sc-muted)"}}><ThumbsUp size={13}/></button>
                          <button onClick={()=>rate(m.id,"down")} className="p-1 rounded-md" style={{color:"var(--sc-muted)"}}><ThumbsDown size={13}/></button>
                        </span>:<span className="text-xs px-2 py-0.5 rounded-md" style={{color:m.fb==="up"?"var(--sc-success)":"var(--sc-accent)",background:m.fb==="up"?"var(--sc-success-bg)":"var(--sc-chip-bg)"}}>{m.fb==="up"?"✓ Helpful":"✗ Not helpful"}</span>}
                      </div>}
                      {fbId===m.id && <div className="sc-fade mt-2 rounded-lg px-3 py-2" style={{background:"var(--sc-bubble)",border:"1px solid var(--sc-border)"}}><div className="text-xs mb-2" style={{color:"var(--sc-muted)"}}>What would have made this better?</div><div className="flex gap-2 flex-wrap">{["Wrong structure","Missing detail","Wrong tone","Too long","Other"].map(r=><button key={r} onClick={()=>fbReason(m.id,r)} className="text-xs px-2.5 py-1 rounded-md" style={{background:"var(--sc-surface)",border:"1px solid var(--sc-border)"}}>{r}</button>)}</div></div>}
                    </div>
                  </div>
                );
              })}
              <div ref={endRef}/>
            </div>
          )}
        </main>

        {/* COMPOSER */}
        <div className="px-4 pb-6 pt-2" style={{flexShrink:0}}>
          <div className="max-w-3xl mx-auto rounded-2xl" style={{background:"var(--sc-surface)",border:"1px solid var(--sc-border)",boxShadow:"var(--sc-shadow)"}}>
            {strip && <div className="sc-fade px-4 pt-3">
              {strip.type==="skill" && matched && skillC && <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{background:"var(--sc-chip-bg)",border:"1px solid var(--sc-chip-border)"}}>
                <Sparkles size={14} style={{color:"var(--sc-accent)",flexShrink:0}}/>
                <div className="flex-1 min-w-0"><div className="text-sm font-medium">{matched.name} · ~{fmtTok(skillC.p70)} tokens vs ~{fmtTok(plainC.p70)} plain</div><div className="text-xs truncate" style={{color:"var(--sc-muted)"}}>{cls.qn||matched.desc} · ~{skillC.lat}s · {estRemain(tokUsed+skillC.p70)}</div></div>
                <button onClick={()=>setWhyOpen(true)} className="text-xs px-2 py-1 rounded-md flex items-center gap-1 shrink-0" style={{color:"var(--sc-muted)"}}><HelpCircle size={12}/>Why?</button>
                <button onClick={()=>{setCls(null);send(draft,"__plain__");}} className="text-xs px-2 py-1 rounded-md shrink-0" style={{color:"var(--sc-muted)"}}>Just prompt</button>
                <button onClick={()=>{setTele(p=>({...p,acc:p.acc+1}));send(draft,matched.id);}} className="text-xs font-medium px-3 py-1.5 rounded-md shrink-0" style={{background:"var(--sc-accent)",color:"white"}}>Use it</button>
              </div>}
              {(strip.type==="plain"||strip.type==="est") && <div className="flex items-center rounded-lg px-3 py-1.5" style={{color:"var(--sc-muted)"}}><span className="text-xs">~{fmtTok(plainC.p70)} tokens · ~{plainC.lat}s · {estRemain(tokUsed+plainC.p70)}{strip.type==="est"?" · analysing...":""}</span></div>}
              {strip.type==="decompose" && <div className="rounded-xl px-3 py-2" style={{background:"var(--sc-info-bg)",border:"1px solid var(--sc-info)"}}><div className="flex items-center justify-between"><div className="flex items-center gap-2"><GitBranch size={14} style={{color:"var(--sc-info)"}}/><span className="text-sm font-medium">Multi-part task · best run in phases</span></div><div className="flex gap-2"><button onClick={()=>{setCls(null);send(draft,"__plain__");}} className="text-xs px-2 py-1 rounded-md" style={{color:"var(--sc-muted)"}}>Just prompt</button><button onClick={()=>send(draft)} className="text-xs font-medium px-3 py-1.5 rounded-md" style={{background:"var(--sc-info)",color:"white"}}>Run in phases</button></div></div></div>}
              {strip.type==="agent" && <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{background:"var(--sc-chip-bg)",border:"1px solid var(--sc-chip-border)"}}><Bot size={14} style={{color:"var(--sc-accent)"}}/><div className="flex-1 text-sm">{(draft.toLowerCase().includes("connect") || draft.toLowerCase().includes("slack") || draft.toLowerCase().includes("jira") || draft.toLowerCase().includes("notion") || draft.toLowerCase().includes("gmail") || draft.toLowerCase().includes("calendar")) ? <>This needs an <strong>Agent + MCP</strong> — connects to external tools</> : <>This task needs an <strong>Agent</strong> — automated or recurring</>}</div><button onClick={()=>send(draft)} className="text-xs font-medium px-3 py-1.5 rounded-md" style={{background:"var(--sc-accent)",color:"white"}}>Learn how</button></div>}
              {strip.type==="workflow" && <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{background:"var(--sc-chip-bg)",border:"1px solid var(--sc-chip-border)"}}><GitBranch size={14} style={{color:"var(--sc-accent)"}}/><div className="flex-1 text-sm">This chains steps — a <strong>Workflow</strong> fits</div><button onClick={()=>send(draft)} className="text-xs font-medium px-3 py-1.5 rounded-md" style={{background:"var(--sc-accent)",color:"white"}}>Learn how</button></div>}
              {strip.type==="build" && <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{background:"var(--sc-chip-bg)",border:"1px solid var(--sc-chip-border)"}}><Sparkles size={14} style={{color:"var(--sc-accent)"}}/><div className="flex-1 text-sm">This could be a reusable <strong>Skill</strong> — save it once, use it every time</div><div className="flex gap-2"><button onClick={()=>{setCls(null);send(draft,"__plain__");}} className="text-xs px-2 py-1 rounded-md" style={{color:"var(--sc-muted)"}}>Just run it</button><button onClick={()=>send(draft)} className="text-xs font-medium px-3 py-1.5 rounded-md" style={{background:"var(--sc-accent)",color:"white"}}>Build a Skill</button></div></div>}
            </div>}
            <textarea ref={compRef} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={onKey} rows={Math.min(6,Math.max(2,draft.split("\n").length))} placeholder={clarify?"Answer the question above...":pend?"Processing...":"Reply to Claude..."} disabled={pend} className="w-full resize-none bg-transparent outline-none px-4 pt-3 pb-2" style={{fontFamily:"var(--sc-sans)",fontSize:15,lineHeight:1.55,color:"var(--sc-fg)"}}/>
            <div className="flex items-center justify-between px-3 pb-3">
              <div className="flex items-center gap-1"><button className="p-1.5 rounded-lg" style={{color:"var(--sc-muted)"}}><Paperclip size={16}/></button></div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <button onClick={()=>{setModelOpen(!modelOpen);setMoreModels(false);}} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs" style={{color:"var(--sc-muted)",border:"1px solid var(--sc-border)"}}>
                    {modelName} {adaptive && <span style={{color:"var(--sc-muted)"}}>Adaptive</span>} <ChevronDown size={12}/>
                  </button>
                  {modelOpen && <div className="absolute bottom-full mb-2 right-0 rounded-xl overflow-hidden" style={{width:260,background:"var(--sc-surface)",border:"1px solid var(--sc-border)",boxShadow:"0 8px 32px rgba(0,0,0,.3)",zIndex:60}}>
                    {[
                      {name:"Opus 4.7",sub:"Most capable for ambitious work"},
                      {name:"Sonnet 4.6",sub:"Most efficient for everyday tasks"},
                      {name:"Haiku 4.5",sub:"Fastest for quick answers"},
                    ].map(m=>(
                      <button key={m.name} onClick={()=>{setModelName(m.name);setModelOpen(false);}} className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-black/10" style={{borderBottom:"1px solid var(--sc-border)"}}>
                        <div><div className="text-sm font-medium" style={{color:"var(--sc-fg)"}}>{m.name}</div><div className="text-xs" style={{color:"var(--sc-muted)"}}>{m.sub}</div></div>
                        {modelName===m.name && <Check size={16} style={{color:"var(--sc-accent)"}}/>}
                      </button>
                    ))}
                    <div className="flex items-center justify-between px-4 py-3" style={{borderBottom:"1px solid var(--sc-border)"}}>
                      <div><div className="text-sm font-medium" style={{color:"var(--sc-fg)"}}>Adaptive thinking</div><div className="text-xs" style={{color:"var(--sc-muted)"}}>Thinks for more complex tasks</div></div>
                      <button onClick={()=>setAdaptive(!adaptive)} className="relative rounded-full" style={{width:40,height:22,background:adaptive?"#3B82F6":"var(--sc-border)",transition:"background 200ms"}}>
                        <div className="absolute rounded-full bg-white" style={{width:18,height:18,top:2,left:adaptive?20:2,transition:"left 200ms"}}/>
                      </button>
                    </div>
                    <div className="relative">
                      <button onClick={()=>setMoreModels(!moreModels)} className="flex items-center justify-between w-full px-4 py-3 text-left hover:bg-black/10">
                        <span className="text-sm font-medium" style={{color:"var(--sc-fg)"}}>More models</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                      </button>
                      {moreModels && <div className="absolute left-full top-0 ml-1 rounded-xl overflow-hidden" style={{width:160,background:"var(--sc-surface)",border:"1px solid var(--sc-border)",boxShadow:"0 8px 32px rgba(0,0,0,.3)"}}>
                        {["Opus 4.6","Opus 3","Sonnet 4.5"].map(m=>(
                          <button key={m} onClick={()=>{setModelName(m);setModelOpen(false);setMoreModels(false);}} className="w-full text-left px-4 py-2.5 text-sm hover:bg-black/10" style={{color:"var(--sc-fg)",borderBottom:"1px solid var(--sc-border)"}}>{m}</button>
                        ))}
                      </div>}
                    </div>
                  </div>}
                </div>
                <button onClick={()=>send(draft, clarifyRef.current ? null : "__plain__")} disabled={!draft.trim()||pend} className="rounded-full flex items-center justify-center" style={{width:32,height:32,background:draft.trim()&&!pend?"var(--sc-accent)":"var(--sc-border)",color:"white",opacity:draft.trim()&&!pend?1:0.6,cursor:draft.trim()&&!pend?"pointer":"default"}}><ArrowUp size={16} strokeWidth={2.5}/></button>
              </div>
            </div>
          </div>
          <div className="max-w-3xl mx-auto mt-2 text-center text-xs" style={{color:"var(--sc-muted)"}}>Claude can make mistakes. Please double-check responses.</div>
        </div>
      </div>

      {/* WHY SHEET */}
      {whyOpen && cls && matched && skillC && <div className="fixed inset-0 z-50 flex justify-end">
        <div className="absolute inset-0" style={{background:"rgba(15,15,15,.35)"}} onClick={()=>setWhyOpen(false)}/>
        <div className="relative h-full overflow-y-auto sc-sheet sc-scroll" style={{width:"min(440px,100vw)",background:"var(--sc-surface)",borderLeft:"1px solid var(--sc-border)",boxShadow:"var(--sc-shadow)"}}>
          <div className="flex items-center justify-between px-5 py-4" style={{borderBottom:"1px solid var(--sc-border)"}}><h2 style={{fontFamily:"var(--sc-serif)",fontSize:20,fontWeight:500}}>Why this recommendation?</h2><button onClick={()=>setWhyOpen(false)} className="p-1 rounded-md" style={{color:"var(--sc-muted)"}}><X size={18}/></button></div>
          <div className="px-5 py-5 space-y-5">
            <div><div className="flex items-center gap-2 mb-2"><span className="text-sm font-medium px-2.5 py-1 rounded-lg" style={{background:"var(--sc-chip-bg)",color:"var(--sc-accent)"}}>{matched.name}</span><span className="text-xs" style={{color:"var(--sc-muted)"}}>{(cls.conf*100).toFixed(0)}% confidence</span></div><p className="text-sm" style={{lineHeight:1.6}}>{cls.rat}</p></div>
            <div><div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{color:"var(--sc-muted)"}}>Quality difference</div><p className="text-sm" style={{color:"var(--sc-muted)"}}>{cls.qn||matched.desc}</p></div>
            <div><div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{color:"var(--sc-muted)"}}>Token comparison</div>
              <table className="w-full text-sm" style={{borderCollapse:"collapse"}}><thead><tr><th className="text-left py-2" style={{color:"var(--sc-muted)",fontWeight:500}}>Path</th><th className="text-right py-2" style={{color:"var(--sc-muted)",fontWeight:500}}>tokens (p50–p90)</th><th className="text-right py-2" style={{color:"var(--sc-muted)",fontWeight:500}}>latency</th></tr></thead><tbody>
                <tr style={{borderTop:"1px solid var(--sc-border)"}}><td className="py-2">Plain prompt</td><td className="text-right">{fmtTok(plainC.p50)}–{fmtTok(plainC.p90)}</td><td className="text-right">~{plainC.lat}s</td></tr>
                <tr style={{borderTop:"1px solid var(--sc-border)",color:"var(--sc-accent)",fontWeight:500}}><td className="py-2">{matched.name}</td><td className="text-right">{fmtTok(skillC.p50)}–{fmtTok(skillC.p90)}</td><td className="text-right">~{skillC.lat}s</td></tr>
              </tbody></table>
              <div className="mt-3 text-xs px-3 py-2 rounded-lg" style={{background:"var(--sc-success-bg)",color:"var(--sc-success)"}}>Saves ~{fmtTok(plainC.p70-skillC.p70)} tokens per use.</div>
            </div>
          </div>
        </div>
      </div>}

      {/* ═══ CUSTOMIZE PANEL — Settings → Customize → Skills ═══ */}
      {customizeOpen && <div className="absolute inset-0 flex" style={{zIndex:200,background:"var(--sc-bg)"}}>
        {/* Left nav */}
        <div className="flex flex-col shrink-0" style={{width:200,borderRight:"1px solid var(--sc-border)",background:"var(--sc-bg)"}}>
          <div className="flex items-center gap-2 px-4 py-4" style={{height:56}}>
            <button onClick={()=>setCustomizeOpen(false)} className="p-1 rounded" style={{color:"var(--sc-muted)"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <span className="text-sm font-semibold" style={{color:"var(--sc-fg)"}}>Customize</span>
          </div>
          <div className="px-3 space-y-0.5">
            <button className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium" style={{background:"var(--sc-bubble)",color:"var(--sc-fg)"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg> Skills
            </button>
            <button className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm" style={{color:"var(--sc-muted)"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Connectors
            </button>
          </div>
        </div>

        {/* Skills list */}
        <div className="flex flex-col shrink-0" style={{width:260,borderRight:"1px solid var(--sc-border)",background:"var(--sc-bg)"}}>
          <div className="flex items-center justify-between px-4 py-4" style={{height:56,borderBottom:"1px solid var(--sc-border)"}}>
            <span className="text-sm font-semibold" style={{color:"var(--sc-fg)"}}>Skills</span>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded" style={{color:"var(--sc-muted)"}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              </button>
              <button className="p-1.5 rounded" style={{color:"var(--sc-muted)"}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto sc-scroll py-2">
            {/* Anthropic built-in skills */}
            <div className="px-3 py-1.5">
              <div className="text-xs font-medium px-2 mb-1" style={{color:"var(--sc-muted)"}}>Anthropic skills</div>
              {[{id:"excel",name:"Claude in Excel"},{id:"powerpoint",name:"Claude in PowerPoint"},{id:"word",name:"Claude in Word"},{id:"pdf",name:"PDF skill"}].map(s =>
                <button key={s.id} onClick={()=>setSelectedSkillId(s.id)} className="flex items-center gap-2 w-full px-2 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)",background:selectedSkillId===s.id?"var(--sc-bubble)":"transparent"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {s.name}
                </button>
              )}
            </div>
            {/* Personal / custom skills */}
            {customs.length > 0 && <div className="px-3 py-1.5 mt-2">
              <div className="text-xs font-medium px-2 mb-1" style={{color:"var(--sc-muted)"}}>Personal skills</div>
              {customs.map(sk =>
                <button key={sk.id} onClick={()=>setSelectedSkillId(sk.id)} className="flex items-center gap-2 w-full px-2 py-2 rounded-lg text-sm" style={{color:"var(--sc-fg)",background:selectedSkillId===sk.id?"var(--sc-bubble)":"transparent"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  {sk.name}
                  {sk.id === customs[customs.length-1]?.id && <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{background:"var(--sc-success-bg)",color:"var(--sc-success)"}}>New</span>}
                </button>
              )}
            </div>}
          </div>
        </div>

        {/* Skill detail */}
        <div className="flex-1 overflow-y-auto sc-scroll" style={{background:"var(--sc-bg)"}}>
          {(() => {
            const sel = [...customs, {id:"excel",name:"Claude in Excel",desc:"Create and edit Excel spreadsheets",sys:"Excel skill"},{id:"powerpoint",name:"Claude in PowerPoint",desc:"Create presentations",sys:"PowerPoint skill"},{id:"word",name:"Claude in Word",desc:"Create Word documents",sys:"Word skill"},{id:"pdf",name:"PDF skill",desc:"Read and fill PDF forms",sys:"PDF skill"}].find(s=>s.id===selectedSkillId);
            const isCustom = customs.find(s=>s.id===selectedSkillId);
            if (!sel) return <div className="flex items-center justify-center h-full" style={{color:"var(--sc-muted)"}}><p className="text-sm">Select a skill to view details</p></div>;
            return (
              <div>
                <div className="flex items-center justify-between px-8 py-5" style={{borderBottom:"1px solid var(--sc-border)",height:56}}>
                  <span className="text-sm font-semibold" style={{color:"var(--sc-fg)"}}>{sel.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="rounded-full" style={{width:36,height:20,background:isCustom?"#3B82F6":"var(--sc-border)",position:"relative",cursor:"pointer",transition:"background 200ms"}}>
                      <div style={{position:"absolute",top:2,left:isCustom?18:2,width:16,height:16,background:"white",borderRadius:"50%",transition:"left 200ms"}}/>
                    </div>
                    <button className="p-1.5 rounded" style={{color:"var(--sc-muted)"}}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                    </button>
                  </div>
                </div>
                <div className="px-8 py-6">
                  <div className="flex gap-8 mb-6 text-sm" style={{borderBottom:"1px solid var(--sc-border)",paddingBottom:"1.5rem"}}>
                    <div><div className="text-xs font-medium mb-1" style={{color:"var(--sc-muted)"}}>Added by</div><div style={{color:"var(--sc-fg)"}}>{isCustom?"You":"Anthropic"}</div></div>
                    <div><div className="text-xs font-medium mb-1" style={{color:"var(--sc-muted)"}}>Trigger</div><div style={{color:"var(--sc-fg)"}}>{isCustom?"Slash command + auto":"Slash command + auto"}</div></div>
                  </div>
                  {sel.desc && <div className="mb-6"><div className="text-xs font-medium mb-2" style={{color:"var(--sc-muted)"}}>Description</div><p className="text-sm" style={{color:"var(--sc-fg)",lineHeight:1.6}}>{sel.desc}</p></div>}
                  <div className="rounded-xl p-6" style={{background:"var(--sc-surface)",border:"1px solid var(--sc-border)"}}>
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-mono" style={{color:"var(--sc-muted)"}}>SKILL.md</span>
                      <div className="flex gap-1">
                        <button className="p-1.5 rounded" style={{color:"var(--sc-muted)"}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
                        <button className="p-1.5 rounded" style={{color:"var(--sc-muted)"}}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg></button>
                      </div>
                    </div>
                    <h3 className="text-lg font-semibold mb-2" style={{fontFamily:"var(--sc-serif)",color:"var(--sc-fg)"}}>{sel.name}</h3>
                    <p className="text-sm mb-4" style={{color:"var(--sc-muted)",lineHeight:1.6}}>{sel.desc || `A reusable skill for ${sel.name.toLowerCase()} tasks.`}</p>
                    {isCustom && sel.sys && <>
                      <div className="text-sm font-medium mb-3" style={{color:"var(--sc-fg)"}}>SKILL.md</div>
                      <div className="rounded-lg p-4 overflow-auto sc-scroll" style={{background:"var(--sc-bg)",border:"1px solid var(--sc-border)",maxHeight:400}}>
                        <pre className="text-xs" style={{color:"var(--sc-muted)",fontFamily:"var(--sc-mono)",lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{sel.sys}</pre>
                      </div>
                    </>}
                    {!isCustom && <div className="text-sm" style={{color:"var(--sc-muted)",lineHeight:1.7}}>
                      <p className="mb-2">This skill extends Claude with the ability to create, read, and edit {sel.name.replace("Claude in ", "")} files.</p>
                      <ul className="list-disc pl-5 space-y-1">
                        <li>Generates structured output directly</li>
                        <li>Understands document formatting conventions</li>
                        <li>Produces downloadable files</li>
                      </ul>
                    </div>}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>}

    </div>
  );
}

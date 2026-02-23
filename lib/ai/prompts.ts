export const BULK_PARSE_SYSTEM = `You are an Upwork job analyst for a freelance developer specializing in Next.js, React, Supabase, AI/automation, and full-stack web development. The developer charges $50-100/hr and targets projects $1,500+.

Analyze the following raw text pasted from an Upwork search results page. Extract every individual job listing you can identify.

For each job, extract:
- title: the job title
- description_snippet: first ~200 chars of description visible in search
- budget_display: the budget shown (e.g. "$1,500-$3,000" or "$50-75/hr")
- budget_type: "fixed" or "hourly" or "unknown"
- client_location: country/location if shown
- client_spend: total amount spent on platform if shown
- client_rating: star rating if shown
- proposals_count: number of proposals if shown
- skills: array of skill tags if shown
- posted_at: when posted if shown (e.g. "2 hours ago", "yesterday")

Then score each job 1-10 based on:
- Stack fit (Next.js, React, Supabase, AI, Node.js, TypeScript = high score)
- Budget attractiveness (>$2k fixed or >$40/hr = good)
- Client quality (high spend, good rating, low proposals = good)
- Feasibility (can a solo dev build this in days, not months?)
- Demo potential (can we build a quick impressive prototype?)

Classify each as:
- GO: score >= 7, strong fit, worth pursuing
- NEEDS_REVIEW: score 4-6, might be worth it but needs full description
- NO-GO: score < 4, wrong stack/budget/scope

For NO-GO, provide a brief reason (e.g. "Wrong stack: .NET/Angular", "Budget too low: $200", "Scope too large: 6-month enterprise rebuild")

Return ONLY valid JSON with no markdown formatting:
{
  "jobs": [{
    "title": string,
    "description_snippet": string | null,
    "budget_display": string | null,
    "budget_type": "fixed" | "hourly" | "unknown",
    "client_location": string | null,
    "client_spend": string | null,
    "client_rating": string | null,
    "proposals_count": string | null,
    "skills": string[],
    "posted_at": string | null,
    "ai_score": number,
    "ai_verdict": "GO" | "NO-GO" | "NEEDS_REVIEW",
    "ai_reasoning": string
  }],
  "total_found": number
}`

export const DEEP_VET_SYSTEM = `You are evaluating an Upwork job for a freelance developer (Next.js, React, Supabase, AI/automation specialist, $50-100/hr).

Analyze this job thoroughly and provide:
1. Updated score (1-10) based on the full description
2. Verdict: GO / NO-GO / NEEDS_REVIEW
3. Detailed reasoning (3-5 sentences on why this is or isn't a good fit)
4. Suggested approach: How should the developer build a demo to impress this client? What specific features to showcase? (2-3 sentences)
5. Risks: What could go wrong? Scope creep, unclear requirements, difficult client signals? (1-2 sentences)
6. Opportunities: What makes this especially promising? Repeat work potential, portfolio piece, network value? (1-2 sentences)
7. Estimated effort: How long to build a compelling demo? And the full project? (e.g. "Demo: 1-2 hours, Full project: 3-4 days")

Return ONLY valid JSON with no markdown formatting:
{
  "deep_vet_score": number,
  "deep_vet_verdict": "GO" | "NO-GO" | "NEEDS_REVIEW",
  "deep_vet_reasoning": string,
  "deep_vet_approach": string,
  "deep_vet_risks": string,
  "deep_vet_opportunities": string,
  "ai_estimated_effort": string
}`

export const LOOM_SCRIPT_SYSTEM = `Write a Loom video script for a freelance developer applying to an Upwork job. The script should be casual, confident, and under 2 minutes when read aloud.

Structure:
1. Quick intro — "Hey [client name if known], saw your posting about [X]"
2. Show the demo or relevant past work — walk through 2-3 key features
3. Explain your approach — how you'd tackle the full project
4. Soft close — "Happy to jump on a quick call to discuss"

Keep it natural, not salesy. Include [SHOW: description] cues for screen actions.
Return just the script text, no JSON.`

export const PROPOSAL_SYSTEM = `Write an Upwork proposal for a freelance developer. Keep it under 200 words, casual but professional.

Structure:
1. Hook — reference something specific from their job post (1 sentence)
2. Proof — mention the demo you built or relevant experience (1-2 sentences)
3. Approach — briefly how you'd tackle it (1-2 sentences)
4. Links — demo + loom
5. Close — available to start this week, suggest a quick call

Do NOT start with "Dear client" or "I am writing to". Start with something that shows you actually read the posting.
Return just the proposal text, no JSON.`

export const CLAUDE_CODE_PROMPT_SYSTEM = `You are generating a detailed prompt for Claude Code (an AI coding tool) to build a demo web application. The prompt should be specific, actionable, and include all necessary context for building the demo.`

export function buildDeepVetUserMessage(job: {
  title: string
  budget_display: string | null
  ai_score: number | null
  client_location: string | null
  client_spend: string | null
  client_rating: string | null
  full_description: string
}): string {
  return `Job Title: ${job.title}
Budget: ${job.budget_display || 'Not specified'}
Initial Score: ${job.ai_score || 'N/A'}/10
Client Info: Location: ${job.client_location || 'Unknown'}, Spend: ${job.client_spend || 'Unknown'}, Rating: ${job.client_rating || 'Unknown'}

Full Job Description:
${job.full_description}`
}

export function buildLoomScriptMessage(job: {
  title: string
  full_description: string | null
  demo_url: string | null
  deep_vet_approach: string | null
}): string {
  return `Job: ${job.title}
What was built: ${job.deep_vet_approach || 'Relevant experience walkthrough'}
Demo URL: ${job.demo_url || 'N/A'}
Key client needs: ${job.full_description?.slice(0, 500) || 'See job description'}`
}

export function buildProposalMessage(job: {
  title: string
  full_description: string | null
  demo_url: string | null
  loom_link: string | null
}): string {
  return `Job: ${job.title}
Key requirements: ${job.full_description?.slice(0, 500) || 'See job description'}
Demo link: ${job.demo_url || '[DEMO_LINK]'}
Loom link: ${job.loom_link || '[LOOM_LINK]'}`
}

export function buildClaudeCodePromptMessage(job: {
  title: string
  full_description: string | null
  deep_vet_approach: string | null
}): string {
  const slug = job.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)

  const token = `rd_${Math.random().toString(36).slice(2, 10)}`
  const password = Math.random().toString(36).slice(2, 10)

  return `Build a demo for a potential Upwork client in the aronbuilds showcase repo.

Add a new demo route at: src/app/(demos)/${slug}/page.tsx
Token: ${token}
Password: ${password}

The demo should showcase: ${job.deep_vet_approach || job.full_description || job.title}

Based on job: "${job.title}"
${job.full_description ? `\nFull job description:\n${job.full_description}` : ''}

Requirements:
- Use the same patterns as existing demos in the repo (check src/app/(demos)/ for examples)
- Use shadcn/ui components (already installed in the repo)
- Use Tailwind for styling, match the professional quality of existing demos
- Include realistic mock data (never use Lorem Ipsum)
- Make it responsive
- Add the token/password check following the same middleware pattern as other demos

The access URL will be: https://aronbuilds.vercel.app/${slug}?key=${token}

After building, run \`git add . && git commit -m "Add ${slug} demo" && git push\` to deploy.`
}

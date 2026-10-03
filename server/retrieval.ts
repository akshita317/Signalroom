export type RetrievalContext = { runbooks: string[]; deploys: string[]; owners: string[] }

const runbooks = [
  'Payments Redis degradation: compare hit rate, client connection pool, and eviction rate. Prefer regional traffic isolation before rollback when customer impact is active.',
  'Regional error spike: compare error rate by region, confirm the last deploy, and check whether database saturation is present before escalating to the data platform team.',
  'Rollback protocol: require an incident commander, record the customer-facing tradeoff, and validate the rollback in one region before broad rollout.',
]
const deploys = ['payments-service@2024.09.18 deployed 3 minutes before the eu-west-1 error spike; tax calculation fix included.', 'checkout-web@2024.09.17 deployed 4 hours before the incident with no correlated error increase.']
const owners = ['Jordan Davis owns payments-service and regional traffic controls.', 'Priya Nair owns the platform Redis client configuration.', 'Akshita Kumar is the incident investigator and approval requester.']

async function retrieveGithubDeploys() {
  const repository = process.env.GITHUB_REPO
  if (!repository) return deploys
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/commits?per_page=5`, { headers: { Accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } })
    if (!response.ok) return deploys
    const commits = await response.json() as { sha: string; commit: { message: string; author?: { date?: string } } }[]
    return commits.map((commit) => `GitHub commit ${commit.sha.slice(0, 7)}: ${commit.commit.message.split('\n')[0]}${commit.commit.author?.date ? ` (${commit.commit.author.date})` : ''}`)
  } catch { return deploys }
}

export async function retrieveContext(incident: string): Promise<RetrievalContext> {
  const normalized = incident.toLowerCase()
  const matches = <T extends string>(items: T[]) => items.filter((item) => item.toLowerCase().split(/\W+/).some((word) => word.length > 3 && normalized.includes(word))).slice(0, 3)
  const availableDeploys = await retrieveGithubDeploys()
  return { runbooks: matches(runbooks).length ? matches(runbooks) : runbooks.slice(0, 2), deploys: matches(availableDeploys).length ? matches(availableDeploys) : availableDeploys.slice(0, 2), owners: matches(owners).length ? matches(owners) : owners.slice(0, 2) }
}

export function contextAsPrompt(context: RetrievalContext) {
  return `RUNBOOKS:\n- ${context.runbooks.join('\n- ')}\nDEPLOYS:\n- ${context.deploys.join('\n- ')}\nOWNERS:\n- ${context.owners.join('\n- ')}`
}

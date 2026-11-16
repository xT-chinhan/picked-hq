// Apps the user can connect with one form. Each entry is a real MCP server started on this machine (verified on npm);
// secrets are asked for in the UI and stored only in the server's own file (mode 600).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WORK = path.join(import.meta.dirname, 'data', 'workspace')
const npx = (pkg, ...rest) => ({ command: 'npx', args: ['-y', pkg, ...rest] })
const k = (key, label) => ({ key, label })

/** REA runs from the analyst's own toolchain (~/tools/re); its paths come from rea-env.sh, so nothing machine-specific is hard-coded here. */
function reaEntry() {
  const envFile = path.join(os.homedir(), 'tools', 're', 'rea-env.sh')
  if (!fs.existsSync(envFile)) return null
  const env = {}
  for (const m of fs.readFileSync(envFile, 'utf8').matchAll(/^export\s+([A-Z_][A-Z0-9_]*)=(.*)$/gm)) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  delete env.PATH
  const bin = [process.env.REA_BIN, path.join(os.homedir(), '.nvm', 'versions', 'node', 'v24.22.2', 'bin', 'rea')].find((p) => p && fs.existsSync(p))
  return bin ? { id: 'rea', name: 'REA', group: 'Analysis', blurb: 'Reverse engineer any web page, app or extension', icon: '/apps/mcp.svg', command: bin, args: ['mcp'], env, requires: [] } : null
}

export const CATALOG = [
  { id: 'playwright', name: 'Browser (Playwright)', group: 'Web & research', blurb: 'Open pages, click, read and screenshot', icon: '/apps/playwright.png', ...npx('@playwright/mcp@latest', '--headless'), requires: [] },
  { id: 'puppeteer', name: 'Puppeteer', group: 'Web & research', blurb: 'Drive Chrome from the agents', icon: '/apps/puppeteer.svg', ...npx('@modelcontextprotocol/server-puppeteer'), requires: [] },
  { id: 'firecrawl', name: 'Firecrawl', group: 'Web & research', blurb: 'Crawl a whole site into clean text', icon: '/apps/firecrawl.svg', ...npx('firecrawl-mcp'), requires: [k('FIRECRAWL_API_KEY', 'API key')] },
  { id: 'tavily', name: 'Tavily', group: 'Web & research', blurb: 'Web search built for agents', icon: '/apps/tavily.svg', ...npx('tavily-mcp'), requires: [k('TAVILY_API_KEY', 'API key')] },
  { id: 'exa', name: 'Exa', group: 'Web & research', blurb: 'Neural web search', icon: '/apps/exa.svg', ...npx('exa-mcp-server'), requires: [k('EXA_API_KEY', 'API key')] },
  { id: 'brave', name: 'Brave Search', group: 'Web & research', blurb: 'Independent web search', icon: '/apps/brave.svg', ...npx('@modelcontextprotocol/server-brave-search'), requires: [k('BRAVE_API_KEY', 'API key')] },
  { id: 'browserbase', name: 'Browserbase', group: 'Web & research', blurb: 'Cloud browsers for agents', icon: '/apps/browserbase.png', ...npx('@browserbasehq/mcp-server-browserbase'), requires: [k('BROWSERBASE_API_KEY', 'API key'), k('BROWSERBASE_PROJECT_ID', 'Project ID')] },
  { id: 'youtube', name: 'YouTube transcripts', group: 'Web & research', blurb: 'Read what a video says', icon: '/apps/youtube.svg', ...npx('@kimtaeyoon83/mcp-server-youtube-transcript'), requires: [] },
  { id: 'maps', name: 'Google Maps', group: 'Web & research', blurb: 'Places, reviews and directions', icon: '/apps/maps.svg', ...npx('@modelcontextprotocol/server-google-maps'), requires: [k('GOOGLE_MAPS_API_KEY', 'API key')] },

  { id: 'memory', name: 'Memory', group: 'Productivity', blurb: 'A knowledge graph the agents remember in', icon: '/apps/memory.svg', ...npx('@modelcontextprotocol/server-memory'), requires: [] },
  { id: 'thinking', name: 'Sequential thinking', group: 'Productivity', blurb: 'Step-by-step reasoning for hard tasks', icon: '/apps/mcp.svg', ...npx('@modelcontextprotocol/server-sequential-thinking'), requires: [] },
  { id: 'filesystem', name: 'Files', group: 'Productivity', blurb: 'Read and write files in the NaN workspace', icon: '/apps/files.svg', ...npx('@modelcontextprotocol/server-filesystem', WORK), requires: [], prepare: 'workspace' },
  { id: 'notion', name: 'Notion', group: 'Productivity', blurb: 'Pages and databases', icon: '/apps/notion.svg', ...npx('@notionhq/notion-mcp-server'), requires: [k('NOTION_TOKEN', 'Integration token')] },
  { id: 'calendar', name: 'Google Calendar', group: 'Productivity', blurb: 'Read and create events', icon: '/apps/calendar.svg', ...npx('@cocal/google-calendar-mcp'), requires: [k('GOOGLE_OAUTH_CREDENTIALS', 'Path to OAuth credentials file')] },
  { id: 'drive', name: 'Google Drive', group: 'Productivity', blurb: 'Search and read files in Drive', icon: '/apps/drive.svg', ...npx('@modelcontextprotocol/server-gdrive'), requires: [k('GDRIVE_CREDENTIALS_PATH', 'Path to credentials file')] },
  { id: 'airtable', name: 'Airtable', group: 'Productivity', blurb: 'Bases and records', icon: '/apps/airtable.svg', ...npx('airtable-mcp-server'), requires: [k('AIRTABLE_API_KEY', 'API key')] },

  { id: 'slack', name: 'Slack', group: 'Communication', blurb: 'Post updates and read channels', icon: '/apps/slack.png', ...npx('@modelcontextprotocol/server-slack'), requires: [k('SLACK_BOT_TOKEN', 'Bot token'), k('SLACK_TEAM_ID', 'Team ID')] },

  { id: 'shopify', name: 'Shopify', group: 'Commerce', blurb: 'Shopify docs and store APIs', icon: '/apps/shopify.svg', ...npx('@shopify/dev-mcp'), requires: [] },
  { id: 'stripe', name: 'Stripe', group: 'Commerce', blurb: 'Payments and customers', icon: '/apps/stripe.svg', ...npx('@stripe/mcp', '--tools=all'), requires: [k('STRIPE_SECRET_KEY', 'Secret key')] },
  { id: 'hubspot', name: 'HubSpot', group: 'Commerce', blurb: 'CRM contacts and deals', icon: '/apps/hubspot.svg', ...npx('@hubspot/mcp-server'), requires: [k('PRIVATE_APP_ACCESS_TOKEN', 'Private app token')] },

  { id: 'github', name: 'GitHub', group: 'Developer tools', blurb: 'Issues, pull requests and code', icon: '/apps/github.svg', ...npx('@modelcontextprotocol/server-github'), requires: [k('GITHUB_PERSONAL_ACCESS_TOKEN', 'Personal access token')] },
  { id: 'gitlab', name: 'GitLab', group: 'Developer tools', blurb: 'Projects, issues and merge requests', icon: '/apps/gitlab.svg', ...npx('@modelcontextprotocol/server-gitlab'), requires: [k('GITLAB_PERSONAL_ACCESS_TOKEN', 'Personal access token'), k('GITLAB_API_URL', 'API URL')] },
  { id: 'sentry', name: 'Sentry', group: 'Developer tools', blurb: 'Errors and alerts', icon: '/apps/sentry.svg', ...npx('@sentry/mcp-server'), requires: [k('SENTRY_ACCESS_TOKEN', 'Access token')] },
  { id: 'supabase', name: 'Supabase', group: 'Developer tools', blurb: 'Database, auth and storage', icon: '/apps/supabase.svg', ...npx('@supabase/mcp-server-supabase'), requires: [k('SUPABASE_ACCESS_TOKEN', 'Access token')] },
  { id: 'figma', name: 'Figma', group: 'Developer tools', blurb: 'Files, frames and comments', icon: '/apps/figma.svg', ...npx('figma-developer-mcp', '--stdio'), requires: [k('FIGMA_API_KEY', 'API key')] },
  { id: 'context7', name: 'Context7', group: 'Developer tools', blurb: 'Up-to-date library docs', icon: '/apps/context7.png', ...npx('@upstash/context7-mcp'), requires: [] },
  { id: 'heroku', name: 'Heroku', group: 'Developer tools', blurb: 'Apps, dynos and logs', icon: '/apps/heroku.png', ...npx('@heroku/mcp-server'), requires: [k('HEROKU_API_KEY', 'API key')] },
].concat(reaEntry() ?? [])

export const entry = (id) => CATALOG.find((c) => c.id === id) ?? null
/** What the UI may show: no commands, paths or env, only what a person needs to decide. */
export const publicCatalog = () => CATALOG.map(({ id, name, group, blurb, icon, requires }) => ({ id, name, group, blurb, icon, requires }))

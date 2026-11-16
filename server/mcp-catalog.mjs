// Apps the user can connect with one form. Each entry is a real MCP server started on this machine; secrets are asked for in the UI
// and stored only in the server's own file (mode 600). Entries without a verified server are not listed.
import path from 'node:path'

const WORK = path.join(import.meta.dirname, 'data', 'workspace')
export const CATALOG = [
  { id: 'playwright', name: 'Browser (Playwright)', group: 'Developer tools', blurb: 'Open pages, click, read and screenshot', command: 'npx', args: ['-y', '@playwright/mcp@latest', '--headless'], requires: [] },
  { id: 'filesystem', name: 'Files', group: 'Files', blurb: 'Read and write files in the NaN workspace folder', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', WORK], requires: [], prepare: 'workspace' },
  { id: 'memory', name: 'Memory', group: 'Productivity', blurb: 'A knowledge graph the agents can remember in', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'], requires: [] },
  { id: 'github', name: 'GitHub', group: 'Developer tools', blurb: 'Issues, pull requests and code', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], requires: [{ key: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'Personal access token' }] },
  { id: 'notion', name: 'Notion', group: 'Productivity', blurb: 'Pages and databases', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], requires: [{ key: 'NOTION_TOKEN', label: 'Integration token' }] },
  { id: 'slack', name: 'Slack', group: 'Communication', blurb: 'Post updates and read channels', command: 'npx', args: ['-y', '@modelcontextprotocol/server-slack'], requires: [{ key: 'SLACK_BOT_TOKEN', label: 'Bot token' }, { key: 'SLACK_TEAM_ID', label: 'Team ID' }] },
]
export const entry = (id) => CATALOG.find((c) => c.id === id) ?? null
/** What the UI may show: no commands with paths, only what a person needs to decide. */
export const publicCatalog = () => CATALOG.map(({ id, name, group, blurb, requires }) => ({ id, name, group, blurb, requires }))

declare module '../server/parse.mjs' {
  export function parseAnswer(raw: { text: string; heads: string[]; cells: string[]; chips: string[] }, brand: string): { brands: string[]; mentioned: boolean; rank: number | null; domains: string[] }
  export function summarize(results: any[], brand: string, total: number): any
}

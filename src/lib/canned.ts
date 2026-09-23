// Brix Chat — canned-response template variables (shared by the editor preview
// and the chat composer insertion). Variables: {{name}} {{visitor}} {{workspace}} {{department}}

export function fillCannedVars(body: string, ctx: Record<string, string>): string {
  return body.replace(/\{\{\s*(name|visitor|workspace|department)\s*\}\}/g, (_, k: string) => ctx[k] ?? '');
}

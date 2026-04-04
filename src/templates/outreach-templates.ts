export const defaultTemplates: Record<string, string> = {
  "intro-short": `Hi {{name}}, I noticed you're working at {{company}} as {{title}}. I'd love to connect and share some ideas about {{objective}}. Would you be open to a quick chat?`,

  "mutual-value": `Hi {{name}}, I've been following {{company}}'s work in the space and was impressed. I'm working on something that could be relevant to your team. Would you be open to a brief conversation?`,

  "direct-ask": `Hi {{name}}, I help companies like {{company}} with {{objective}}. Would it make sense to schedule a 15-minute call this week to see if there's a fit?`,
};

export function getTemplate(name: string): string | undefined {
  return defaultTemplates[name];
}

export function listTemplateNames(): string[] {
  return Object.keys(defaultTemplates);
}

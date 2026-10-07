interface ChangelogSection {
  title: string;
  items: string[];
}

interface ChangelogContributor {
  name: string;
  url: string;
  description: string;
}

interface ChangelogEntry {
  version: string;
  sections: ChangelogSection[];
  contributors: ChangelogContributor[];
}

/** Extract "major.minor" from a semver string (e.g. "0.1.0" → "0.1") */
export function toMajorMinor(version: string): string {
  const parts = version.split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : version;
}

export const CHANGELOG_REPO_URL = 'https://github.com/andresgmg/claude-office';

export const DISCORD_INVITE_URL = 'https://discord.gg/Yk7jXebv9H';

export const changelogEntries: ChangelogEntry[] = [
  {
    version: '0.1',
    sections: [
      {
        title: 'Claude Office',
        items: [
          'Web-only fork of pixel-agents 1.4.1: the office runs in your browser, served by the local CLI',
          'The VS Code extension is gone, together with terminal adoption and the IDE-only protocol messages',
          'A fixed server token (--token or the CLAUDE_OFFICE_TOKEN variable) lets Claude Code `type: "http"` hooks be configured once',
          'Claude Code hook events stay the primary signal; transcript watching remains the fallback',
        ],
      },
    ],
    contributors: [
      {
        name: 'pixel-agents contributors',
        url: 'https://github.com/pixel-agents-hq/pixel-agents',
        description: 'The upstream project this fork builds on (MIT)',
      },
    ],
  },
];

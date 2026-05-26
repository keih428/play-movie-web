export type TeamCatalogEntry = {
  aliases: string[];
  code: string;
  name: string;
  slug: string;
};

export const TEAM_CATALOG: TeamCatalogEntry[] = [
  {
    name: "東京大学運動会男子バレー部",
    slug: "utvb",
    code: "UTVB",
    aliases: [
      "東京大学",
      "東大",
      "東京大学運動会男子バレー部",
      "東大男子",
      "UTVB",
    ],
  },
  {
    name: "東京大学運動会女子バレー部",
    slug: "utvb-women",
    code: "UTVB-W",
    aliases: [
      "東京大学運動会女子バレー部",
      "東大女子",
      "東京大学女子",
      "UTVB-W",
      "UTVB Women",
    ],
  },
];

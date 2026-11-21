export const CUSTOM_MATCH_SELECTION = "__custom_match_selection__";

export const matchSelectionGroups = [
  {
    label: "Full-time result",
    options: [
      { value: "Home win", label: "Home win" },
      { value: "Draw", label: "Draw" },
      { value: "Away win", label: "Away win" },
    ],
  },
  {
    label: "Double chance",
    options: [
      { value: "Home or draw (1X)", label: "Home or draw (1X)" },
      { value: "Draw or away (X2)", label: "Draw or away (X2)" },
      { value: "Home or away (12)", label: "Home or away (12)" },
    ],
  },
  {
    label: "Draw no bet",
    options: [
      { value: "Draw no bet: Home", label: "Home" },
      { value: "Draw no bet: Away", label: "Away" },
    ],
  },
  {
    label: "Total goals",
    options: [0.5, 1.5, 2.5, 3.5, 4.5].flatMap((line) => [
      { value: `Over ${line} goals`, label: `Over ${line} goals` },
      { value: `Under ${line} goals`, label: `Under ${line} goals` },
    ]),
  },
  {
    label: "Both teams to score",
    options: [
      { value: "Both teams to score: Yes", label: "Yes" },
      { value: "Both teams to score: No", label: "No" },
    ],
  },
  {
    label: "Team goals",
    options: ["Home team", "Away team"].flatMap((team) =>
      [0.5, 1.5, 2.5].flatMap((line) => [
        { value: `${team} over ${line} goals`, label: `${team} over ${line} goals` },
        { value: `${team} under ${line} goals`, label: `${team} under ${line} goals` },
      ]),
    ),
  },
  {
    label: "Half-time result",
    options: [
      { value: "Half-time: Home win", label: "Home win" },
      { value: "Half-time: Draw", label: "Draw" },
      { value: "Half-time: Away win", label: "Away win" },
    ],
  },
] as const;

const presetSelections = new Set(matchSelectionGroups.flatMap((group) => group.options.map((option) => option.value)));

export function isPresetMatchSelection(value: string): boolean {
  return presetSelections.has(value);
}

export function formatMatchSelection(value: string, homeTeam: string, awayTeam: string): string {
  return value.replaceAll("Home team", homeTeam).replaceAll("Away team", awayTeam);
}

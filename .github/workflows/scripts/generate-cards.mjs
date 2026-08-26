// scripts/generate-cards.mjs
// Fetches live stats via GitHub's GraphQL API and regenerates the two
// SVG cards used in README.md, in the same hand-built style/palette.
//
// Requires a repo secret GH_PAT (classic PAT, no scopes needed for
// public read access) — the default GITHUB_TOKEN can't query another
// user's contributionsCollection.

const USERNAME = "ReebanAustrive";
const TOKEN = process.env.GH_PAT;

if (!TOKEN) {
  console.error("Missing GH_PAT environment variable.");
  process.exit(1);
}

const query = `
  query($login: String!) {
    user(login: $login) {
      followers { totalCount }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false) {
        totalCount
        nodes { stargazerCount }
      }
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
      }
    }
  }
`;

async function fetchStats() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { login: USERNAME } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${await res.text()}`);
  }

  const { data, errors } = await res.json();
  if (errors) throw new Error(JSON.stringify(errors));
  return data.user;
}

function computeStreaks(weeks) {
  const days = weeks.flatMap((w) => w.contributionDays);

  // Current streak: walk backward from most recent day.
  // Skip a zero on the final (today's) day since it may not be over yet.
  let current = 0;
  let currentEndDate = null;
  for (let i = days.length - 1; i >= 0; i--) {
    const { contributionCount, date } = days[i];
    if (contributionCount > 0) {
      current++;
      if (!currentEndDate) currentEndDate = date;
    } else if (i === days.length - 1) {
      continue; // today, allow zero
    } else {
      break;
    }
  }

  // Longest streak: scan for the longest run of consecutive non-zero days.
  let longest = 0;
  let longestStart = null;
  let longestEnd = null;
  let runStart = null;
  let run = 0;

  for (const { contributionCount, date } of days) {
    if (contributionCount > 0) {
      if (run === 0) runStart = date;
      run++;
      if (run > longest) {
        longest = run;
        longestStart = runStart;
        longestEnd = date;
      }
    } else {
      run = 0;
    }
  }

  return {
    current,
    currentEndDate,
    longest,
    longestStart,
    longestEnd,
  };
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function statsCardSVG({ repos, contributions, stars, followers }) {
  return `<svg width="700" height="180" viewBox="0 0 700 180" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', 'Fira Code', monospace">
  <rect x="1" y="1" width="698" height="178" rx="12" fill="#1e1e2e" stroke="#313244" stroke-width="1.5"/>

  <text x="28" y="38" fill="#8AADF4" font-size="15" font-weight="700" letter-spacing="0.5">~/github-stats</text>
  <line x1="28" y1="52" x2="672" y2="52" stroke="#313244" stroke-width="1"/>

  <text x="28" y="92" fill="#cdd6f4" font-size="30" font-weight="700">${repos}</text>
  <text x="28" y="114" fill="#6c7086" font-size="12">public repos</text>

  <text x="205" y="92" fill="#cdd6f4" font-size="30" font-weight="700">${contributions}</text>
  <text x="205" y="114" fill="#6c7086" font-size="12">contributions (past year)</text>

  <text x="450" y="92" fill="#cdd6f4" font-size="30" font-weight="700">${stars}</text>
  <text x="450" y="114" fill="#6c7086" font-size="12">stars</text>

  <text x="580" y="92" fill="#cdd6f4" font-size="30" font-weight="700">${followers}</text>
  <text x="580" y="114" fill="#6c7086" font-size="12">followers</text>

  <line x1="28" y1="136" x2="672" y2="136" stroke="#313244" stroke-width="1"/>
  <text x="28" y="160" fill="#6c7086" font-size="11">java · spring boot · python · fastapi · typescript · react</text>
</svg>
`;
}

function streakCardSVG({ total, current, currentEndDate, longest, longestStart, longestEnd }) {
  // Ring: 26/240 circumference was a placeholder — scale by current streak,
  // capped visually at ~30 days for a full ring.
  const pct = Math.min(current / 30, 1);
  const circumference = 214;
  const dash = Math.max(pct * circumference, current > 0 ? 8 : 0);

  return `<svg width="700" height="180" viewBox="0 0 700 180" xmlns="http://www.w3.org/2000/svg" font-family="'JetBrains Mono', 'Fira Code', monospace">
  <rect x="1" y="1" width="698" height="178" rx="12" fill="#1e1e2e" stroke="#313244" stroke-width="1.5"/>

  <text x="28" y="38" fill="#8AADF4" font-size="15" font-weight="700" letter-spacing="0.5">~/streak</text>
  <line x1="28" y1="52" x2="672" y2="52" stroke="#313244" stroke-width="1"/>

  <g text-anchor="middle">
    <text x="150" y="100" fill="#cdd6f4" font-size="34" font-weight="700">${total}</text>
    <text x="150" y="124" fill="#6c7086" font-size="12">contributions (past year)</text>
  </g>

  <g text-anchor="middle">
    <circle cx="350" cy="95" r="34" fill="none" stroke="#313244" stroke-width="4"/>
    <circle cx="350" cy="95" r="34" fill="none" stroke="#8AADF4" stroke-width="4"
            stroke-dasharray="${dash} ${circumference}" stroke-linecap="round" transform="rotate(-90 350 95)"/>
    <text x="350" y="102" fill="#cdd6f4" font-size="22" font-weight="700">${current}</text>
    <text x="350" y="142" fill="#6c7086" font-size="12">current streak</text>
    <text x="350" y="158" fill="#45475a" font-size="10">as of ${fmtDateShort(currentEndDate)}</text>
  </g>

  <g text-anchor="middle">
    <text x="550" y="100" fill="#cdd6f4" font-size="34" font-weight="700">${longest}</text>
    <text x="550" y="124" fill="#6c7086" font-size="12">longest streak</text>
    <text x="550" y="142" fill="#45475a" font-size="10">${fmtDate(longestStart)} – ${fmtDate(longestEnd)}</text>
  </g>
</svg>
`;
}

async function main() {
  const user = await fetchStats();

  const repos = user.repositories.totalCount;
  const stars = user.repositories.nodes.reduce((sum, r) => sum + r.stargazerCount, 0);
  const followers = user.followers.totalCount;
  const calendar = user.contributionsCollection.contributionCalendar;
  const contributions = calendar.totalContributions;

  const { current, currentEndDate, longest, longestStart, longestEnd } = computeStreaks(calendar.weeks);

  const fs = await import("fs/promises");
  await fs.mkdir("assets", { recursive: true });

  await fs.writeFile(
    "assets/stats-card.svg",
    statsCardSVG({ repos, contributions, stars, followers })
  );

  await fs.writeFile(
    "assets/streak-card.svg",
    streakCardSVG({ total: contributions, current, currentEndDate, longest, longestStart, longestEnd })
  );

  console.log("Cards regenerated.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

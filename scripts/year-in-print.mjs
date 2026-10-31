#!/usr/bin/env node
// Draws the profile's contribution graph, "A year in print": one halftone dot per day, sized by GitHub's contribution
// level, printed left to right as if a press roller passed. Writes light and dark SVGs, each animated and still.
//
//   GITHUB_TOKEN=... node scripts/year-in-print.mjs [login] [--sample]
//
// login defaults to the repository owner (GITHUB_REPOSITORY_OWNER), then HiroHyun. --sample draws made-up data, for a
// look at the design without a token. Needs Node 18 or later; nothing to install.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "media");
const args = process.argv.slice(2);
const login = args.find((a) => !a.startsWith("--")) || process.env.GITHUB_REPOSITORY_OWNER || "HiroHyun";

const THEMES = {
  light: { ground: "#F4F0E8", ink: "#1C1A17", faded: "#6F695F", hair: "#D9D2C5", accent: "#C0303A" },
  dark: { ground: "#191613", ink: "#EDE7DC", faded: "#A39B8E", hair: "#3A342D", accent: "#E5605A" },
};
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };
const RADIUS = [1.1, 2.3, 3.2, 4.1, 5.0];
const W = 720, H = 172, PITCH = 12.4, LEFT = 38, TOP = 46;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const FONT = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

async function calendar() {
  if (args.includes("--sample")) {
    const weeks = [], start = new Date(Date.UTC(2025, 9, 26));
    for (let w = 0; w < 53; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + (w * 7 + d) * 864e5).toISOString().slice(0, 10);
        const busy = Math.sin(w / 5) + Math.sin((w * 7 + d) / 3) + (w > 38 ? 1.4 : 0);
        const level = busy < 0.4 ? 0 : Math.min(4, Math.ceil(busy * 1.3));
        days.push({ date, contributionCount: level * 3, contributionLevel: Object.keys(LEVEL)[level] });
      }
      weeks.push({ contributionDays: days });
    }
    return { totalContributions: 312, weeks };
  }
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("set GITHUB_TOKEN, or pass --sample");
  const query = `query($login: String!) { user(login: $login) { contributionsCollection { contributionCalendar {
    totalContributions weeks { contributionDays { date contributionCount contributionLevel } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "year-in-print" },
    body: JSON.stringify({ query, variables: { login } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub answered ${res.status}: ${JSON.stringify(json.errors || json)}`);
  return json.data.user.contributionsCollection.contributionCalendar;
}

function svg(cal, theme, animated) {
  const c = THEMES[theme];
  const weeks = cal.weeks.slice(-53);
  const parts = [];
  // Month labels sit over the first week of each month; of two labels closer than three weeks, the later one stays.
  const starts = [];
  weeks.forEach((week, x) => {
    const month = new Date(week.contributionDays[0].date + "T00:00:00Z").getUTCMonth();
    if (!starts.length || starts.at(-1).month !== month) starts.push({ x, month });
  });
  starts.forEach(({ x, month }, i) => {
    if ((starts[i + 1]?.x ?? Infinity) - x < 3 || x > weeks.length - 3) return;
    parts.push(`<text x="${(LEFT + x * PITCH - 3).toFixed(1)}" y="${TOP - 14}" class="m">${MONTHS[month]}</text>`);
  });
  const last = weeks.at(-1).contributionDays.at(-1).date;
  weeks.forEach((week, x) => {
    const delay = (0.35 + x * 0.022).toFixed(3);
    for (const day of week.contributionDays) {
      const y = new Date(day.date + "T00:00:00Z").getUTCDay();
      const level = LEVEL[day.contributionLevel] ?? 0;
      const cx = (LEFT + x * PITCH).toFixed(1), cy = (TOP + y * PITCH).toFixed(1);
      const style = animated ? ` style="animation-delay:${delay}s"` : "";
      const cls = level ? "d" : "d z";
      parts.push(`<circle class="${cls}" cx="${cx}" cy="${cy}" r="${RADIUS[level]}"${style}/>`);
      if (day.date === last) parts.push(`<circle class="today" cx="${cx}" cy="${cy}" r="7.6"${style}/>`);
    }
  });
  const total = cal.totalContributions.toLocaleString("en-US");
  const rollerEnd = LEFT + weeks.length * PITCH;
  const right = (LEFT + 52 * PITCH + 5).toFixed(1);
  const css = [
    `.m,.cap{font-family:${FONT};font-size:10px;letter-spacing:.14em;fill:${c.faded}}`,
    `.cap.a{fill:${c.accent}}`,
    `.d{fill:${c.ink}}`,
    `.z{fill:${c.faded};opacity:.45}`,
    `.today{fill:none;stroke:${c.accent};stroke-width:1.4}`,
    `.rule{stroke:${c.hair};stroke-width:1}`,
  ];
  if (animated) {
    css.push(
      `.d,.today{transform-box:fill-box;transform-origin:center;animation:ink .42s cubic-bezier(.2,.9,.3,1.25) both}`,
      `@keyframes ink{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`,
      `.roller{stroke:${c.accent};stroke-width:1.2;animation:roll ${(weeks.length * 0.022 + 0.3).toFixed(2)}s linear .3s both}`,
      `@keyframes roll{0%{transform:translateX(0);opacity:0}8%{opacity:.9}88%{opacity:.9}100%{transform:translateX(${rollerEnd - LEFT + 8}px);opacity:0}}`,
      `@media (prefers-reduced-motion:reduce){.d,.today,.roller{animation:none}.roller{opacity:0}}`,
    );
  }
  const roller = animated ? `<line class="roller" x1="${LEFT - 8}" y1="${TOP - 9}" x2="${LEFT - 8}" y2="${TOP + 6 * PITCH + 9}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="A year in print: ${total} contributions on GitHub in the last year, one halftone dot per day">
<style>${css.join("")}</style>
<rect width="${W}" height="${H}" fill="${c.ground}"/>
${parts.join("\n")}
${roller}
<line class="rule" x1="${LEFT - 5}" y1="${H - 34}" x2="${right}" y2="${H - 34}"/>
<text x="${LEFT - 5}" y="${H - 15}" class="cap a">A YEAR IN PRINT</text>
<text x="${right}" y="${H - 15}" class="cap" text-anchor="end">${total} CONTRIBUTIONS IN THE LAST YEAR</text>
</svg>
`;
}

const cal = await calendar();
mkdirSync(OUT, { recursive: true });
for (const theme of Object.keys(THEMES)) {
  writeFileSync(join(OUT, `year-${theme}.svg`), svg(cal, theme, true));
  writeFileSync(join(OUT, `year-${theme}-still.svg`), svg(cal, theme, false));
}
console.log(`drew ${login}: ${cal.totalContributions} contributions over ${cal.weeks.length} weeks`);

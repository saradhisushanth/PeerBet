import bcrypt from "bcrypt";
import { prisma } from "./lib/prisma.js";

const SALT_ROUNDS = 10;

/** Same password for all test players (min 6 chars for auth). */
const TEST_PASSWORD = "test12";

const TEST_PLAYERS = [
  { username: "player1", email: "p1@t.co" },
  { username: "player2", email: "p2@t.co" },
  { username: "player3", email: "p3@t.co" },
  { username: "player4", email: "p4@t.co" },
  { username: "player5", email: "p5@t.co" },
  { username: "player6", email: "p6@t.co" },
  { username: "player7", email: "p7@t.co" },
  { username: "player8", email: "p8@t.co" },
];

const IPL_2026_TEAMS = [
  { name: "Royal Challengers Bengaluru", shortName: "RCB" },
  { name: "Sunrisers Hyderabad", shortName: "SRH" },
  { name: "Mumbai Indians", shortName: "MI" },
  { name: "Chennai Super Kings", shortName: "CSK" },
  { name: "Kolkata Knight Riders", shortName: "KKR" },
  { name: "Delhi Capitals", shortName: "DC" },
  { name: "Rajasthan Royals", shortName: "RR" },
  { name: "Punjab Kings", shortName: "PBKS" },
  { name: "Gujarat Titans", shortName: "GT" },
  { name: "Lucknow Super Giants", shortName: "LSG" },
];

const VENUES = [
  "M. Chinnaswamy Stadium, Bengaluru",
  "Rajiv Gandhi International Stadium, Hyderabad",
  "Wankhede Stadium, Mumbai",
  "MA Chidambaram Stadium, Chennai",
  "Eden Gardens, Kolkata",
  "Arun Jaitley Stadium, Delhi",
  "Sawai Mansingh Stadium, Jaipur",
  "IS Bindra Stadium, Mohali",
  "Narendra Modi Stadium, Ahmedabad",
  "BRSABV Ekana Cricket Stadium, Lucknow",
];

// IPL 2026: March 28 - May 31. Sample fixture (opener RCB vs SRH, then variety)
const FIXTURES: [number, number, number, number, string][] = [
  [0, 1, 0, 28, "M. Chinnaswamy Stadium, Bengaluru"], // RCB vs SRH, Mar 28
  [2, 3, 1, 29, "Wankhede Stadium, Mumbai"],          // MI vs CSK
  [4, 5, 2, 30, "Eden Gardens, Kolkata"],             // KKR vs DC
  [6, 7, 3, 31, "Sawai Mansingh Stadium, Jaipur"],   // RR vs PBKS
  [8, 9, 4, 1, "Narendra Modi Stadium, Ahmedabad"],   // GT vs LSG
  [1, 2, 5, 2, "Rajiv Gandhi International Stadium, Hyderabad"], // SRH vs MI
  [3, 4, 6, 3, "MA Chidambaram Stadium, Chennai"],   // CSK vs KKR
  [5, 6, 7, 4, "Arun Jaitley Stadium, Delhi"],       // DC vs RR
  [7, 8, 8, 5, "IS Bindra Stadium, Mohali"],         // PBKS vs GT
  [9, 0, 9, 6, "BRSABV Ekana Cricket Stadium, Lucknow"], // LSG vs RCB
  [0, 3, 10, 7, "M. Chinnaswamy Stadium, Bengaluru"], // RCB vs CSK
  [1, 4, 11, 8, "Rajiv Gandhi International Stadium, Hyderabad"], // SRH vs KKR
  [2, 5, 12, 9, "Wankhede Stadium, Mumbai"],         // MI vs DC
  [6, 8, 13, 10, "Sawai Mansingh Stadium, Jaipur"],  // RR vs GT
  [7, 9, 14, 11, "IS Bindra Stadium, Mohali"],       // PBKS vs LSG
  [0, 2, 15, 12, "M. Chinnaswamy Stadium, Bengaluru"], // RCB vs MI
  [1, 3, 16, 13, "Rajiv Gandhi International Stadium, Hyderabad"], // SRH vs CSK
  [4, 6, 17, 14, "Eden Gardens, Kolkata"],            // KKR vs RR
  [5, 7, 18, 15, "Arun Jaitley Stadium, Delhi"],     // DC vs PBKS
  [8, 9, 19, 16, "Narendra Modi Stadium, Ahmedabad"], // GT vs LSG
];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

async function main() {
  console.log("Seeding IPL 2026 data...");

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, SALT_ROUNDS);
  let created = 0;
  let updated = 0;
  for (const p of TEST_PLAYERS) {
    const existing = await prisma.user.findUnique({ where: { username: p.username } });
    if (!existing) {
      await prisma.user.create({
        data: {
          username: p.username,
          email: p.email,
          passwordHash,
          balance: 1000,
          prizePoolContribution: 1000,
        },
      });
      created++;
    } else {
      await prisma.user.update({
        where: { username: p.username },
        data: { email: p.email, passwordHash },
      });
      updated++;
    }
  }
  if (created > 0) console.log(`Created ${created} test players (login: pN@t.co / ${TEST_PASSWORD}).`);
  if (updated > 0) console.log(`Updated ${updated} test players to short email and password (pN@t.co / ${TEST_PASSWORD}).`);

  const existingTeams = await prisma.team.count();
  if (existingTeams > 0) {
    console.log("Teams already exist. Skipping team seed.");
  } else {
    for (const t of IPL_2026_TEAMS) {
      await prisma.team.create({ data: t });
    }
    console.log(`Created ${IPL_2026_TEAMS.length} teams.`);
  }

  const teamList = await prisma.team.findMany();
  const teamsByShort = Object.fromEntries(teamList.map((t) => [t.shortName, t]));
  if (Object.keys(teamsByShort).length !== IPL_2026_TEAMS.length) {
    console.log("Team count mismatch. Ensure teams are seeded first.");
    process.exit(1);
  }

  const existingMatches = await prisma.match.count();
  if (existingMatches > 0) {
    console.log("Matches already exist. Skipping match seed.");
  } else {
    const shortNames = IPL_2026_TEAMS.map((t) => t.shortName);
    const startYear = 2026;
    const startMonth = 2; // March = 2 (0-indexed)
    const baseDate = new Date(startYear, startMonth, 28, 19, 30, 0); // 7:30 PM

    for (const [homeIdx, awayIdx, dayOffset, _venueIdx, venueName] of FIXTURES as [number, number, number, number, string][]) {
      const homeTeam = teamsByShort[shortNames[homeIdx]];
      const awayTeam = teamsByShort[shortNames[awayIdx]];
      if (!homeTeam || !awayTeam) throw new Error(`Team not found for fixture ${homeIdx} vs ${awayIdx}`);
      const startTime = addDays(baseDate, dayOffset);
      await prisma.match.create({
        data: {
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          venue: venueName,
          startTime,
          status: "UPCOMING",
        },
      });
    }
    console.log(`Created ${FIXTURES.length} matches.`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

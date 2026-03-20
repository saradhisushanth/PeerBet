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

// Actual IPL 2026 Phase 1 schedule (BCCI confirmed, Mar 28 – Apr 12)
// Times in IST: evening = 19:30, afternoon (double-header) = 15:30
const FIXTURES: { home: string; away: string; date: string; time: string; venue: string }[] = [
  { home: "RCB", away: "SRH", date: "2026-03-28", time: "19:30", venue: "M. Chinnaswamy Stadium, Bengaluru" },
  { home: "MI",  away: "KKR", date: "2026-03-29", time: "19:30", venue: "Wankhede Stadium, Mumbai" },
  { home: "RR",  away: "CSK", date: "2026-03-30", time: "19:30", venue: "ACA Stadium, Guwahati" },
  { home: "PBKS",away: "GT",  date: "2026-03-31", time: "19:30", venue: "PCA Stadium, Mullanpur" },
  { home: "LSG", away: "DC",  date: "2026-04-01", time: "19:30", venue: "BRSABV Ekana Cricket Stadium, Lucknow" },
  { home: "KKR", away: "SRH", date: "2026-04-02", time: "19:30", venue: "Eden Gardens, Kolkata" },
  { home: "CSK", away: "PBKS",date: "2026-04-03", time: "19:30", venue: "MA Chidambaram Stadium, Chennai" },
  { home: "DC",  away: "MI",  date: "2026-04-04", time: "15:30", venue: "Arun Jaitley Stadium, Delhi" },
  { home: "GT",  away: "RR",  date: "2026-04-04", time: "19:30", venue: "Narendra Modi Stadium, Ahmedabad" },
  { home: "SRH", away: "LSG", date: "2026-04-05", time: "15:30", venue: "Rajiv Gandhi International Stadium, Hyderabad" },
  { home: "RCB", away: "CSK", date: "2026-04-05", time: "19:30", venue: "M. Chinnaswamy Stadium, Bengaluru" },
  { home: "KKR", away: "PBKS",date: "2026-04-06", time: "19:30", venue: "Eden Gardens, Kolkata" },
  { home: "RR",  away: "MI",  date: "2026-04-07", time: "19:30", venue: "ACA Stadium, Guwahati" },
  { home: "DC",  away: "GT",  date: "2026-04-08", time: "19:30", venue: "Arun Jaitley Stadium, Delhi" },
  { home: "KKR", away: "LSG", date: "2026-04-09", time: "19:30", venue: "Eden Gardens, Kolkata" },
  { home: "RR",  away: "RCB", date: "2026-04-10", time: "19:30", venue: "ACA Stadium, Guwahati" },
  { home: "PBKS",away: "SRH", date: "2026-04-11", time: "15:30", venue: "PCA Stadium, Mullanpur" },
  { home: "CSK", away: "DC",  date: "2026-04-11", time: "19:30", venue: "MA Chidambaram Stadium, Chennai" },
  { home: "LSG", away: "GT",  date: "2026-04-12", time: "15:30", venue: "BRSABV Ekana Cricket Stadium, Lucknow" },
  { home: "MI",  away: "RCB", date: "2026-04-12", time: "19:30", venue: "Wankhede Stadium, Mumbai" },
];

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
  const teamsByShort = Object.fromEntries(teamList.map((t: (typeof teamList)[number]) => [t.shortName, t]));
  if (Object.keys(teamsByShort).length !== IPL_2026_TEAMS.length) {
    console.log("Team count mismatch. Ensure teams are seeded first.");
    process.exit(1);
  }

  const existingMatches = await prisma.match.count();
  if (existingMatches > 0) {
    console.log("Matches already exist. Skipping match seed.");
  } else {
    for (const f of FIXTURES) {
      const homeTeam = teamsByShort[f.home];
      const awayTeam = teamsByShort[f.away];
      if (!homeTeam || !awayTeam) throw new Error(`Team not found: ${f.home} or ${f.away}`);
      const [year, month, day] = f.date.split("-").map(Number);
      const [hour, minute] = f.time.split(":").map(Number);
      const startTime = new Date(Date.UTC(year, month - 1, day, hour - 5, minute - 30));
      await prisma.match.create({
        data: {
          homeTeamId: homeTeam.id,
          awayTeamId: awayTeam.id,
          venue: f.venue,
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

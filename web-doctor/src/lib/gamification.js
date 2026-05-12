/**
 * Gamification library — pure functions, no Firestore dependency.
 *
 * Each portal queries Firestore independently and feeds the raw rows into
 * `computeStats({ attendance, emotions, grades })`. The output is the same
 * shape everywhere: { xp, level, streakDays, badges, perfectWeeks, ... }.
 *
 * XP weights and badge thresholds live in CONFIG below so they can be tuned
 * without touching the math.
 */

export const CONFIG = {
  xp: {
    perPresent:        10,  // attendance.status === "present"
    perLate:            3,  // attendance.status === "late"
    perAbsent:          0,
    perExcused:         5,
    perHighEngagement: 20,  // engagement_score >= 0.7 averaged over the lecture
    perMidEngagement:   8,  // 0.4 <= score < 0.7
    perLowEngagement:   2,  // 0 < score < 0.4
    perYawnPenalty:    -1,  // each yawn-flag deducts a small amount (floored at 0 overall)
    perGradeA:         50,
    perGradeB:         30,
    perGradeC:         15,
    perGradeD:          5,
    perGradeF:          0,
    perPerfectWeek:   100,  // all attended that week and no absences/lates
  },

  // Level boundaries — index N = min XP to reach level N+1.
  levelThresholds: [0, 100, 250, 500, 900, 1400, 2000, 2700, 3500, 4400, 5400],

  badges: [
    { id: "first_steps",     label: "First Steps",      desc: "Earn your first 50 XP",         icon: "🌱", check: ({ xp }) => xp >= 50 },
    { id: "century",         label: "Century",          desc: "Reach 100 XP",                  icon: "💯", check: ({ xp }) => xp >= 100 },
    { id: "rising_star",     label: "Rising Star",      desc: "Reach 500 XP",                  icon: "⭐", check: ({ xp }) => xp >= 500 },
    { id: "scholar",         label: "Scholar",          desc: "Reach 1000 XP",                 icon: "📚", check: ({ xp }) => xp >= 1000 },
    { id: "legend",          label: "Legend",           desc: "Reach 2500 XP",                 icon: "🏆", check: ({ xp }) => xp >= 2500 },
    { id: "streak_3",        label: "On Fire",          desc: "3-day attendance streak",       icon: "🔥", check: ({ streakDays }) => streakDays >= 3 },
    { id: "streak_7",        label: "Unstoppable",      desc: "7-day attendance streak",       icon: "⚡", check: ({ streakDays }) => streakDays >= 7 },
    { id: "streak_14",       label: "Iron Will",        desc: "14-day attendance streak",      icon: "🛡️", check: ({ streakDays }) => streakDays >= 14 },
    { id: "perfect_week",    label: "Flawless Week",    desc: "A week with full attendance",   icon: "✨", check: ({ perfectWeeks }) => perfectWeeks >= 1 },
    { id: "perfect_month",   label: "Flawless Month",   desc: "4 perfect weeks",               icon: "👑", check: ({ perfectWeeks }) => perfectWeeks >= 4 },
    { id: "engaged",         label: "Fully Engaged",    desc: "10+ high-engagement lectures",  icon: "🎯", check: ({ highEngagementLectures }) => highEngagementLectures >= 10 },
    { id: "ace",             label: "Ace Student",      desc: "Three A grades",                icon: "🏅", check: ({ gradeCounts }) => (gradeCounts.A || 0) >= 3 },
  ],
};

const LETTER_TO_BUCKET = {
  "A+": "A", "A": "A", "A-": "A",
  "B+": "B", "B": "B", "B-": "B",
  "C+": "C", "C": "C", "C-": "C",
  "D+": "D", "D": "D", "D-": "D",
  "F": "F",
};

function totalToBucket(total) {
  if (total == null || Number.isNaN(total)) return null;
  if (total >= 85) return "A";
  if (total >= 70) return "B";
  if (total >= 55) return "C";
  if (total >= 40) return "D";
  return "F";
}

function computeLevel(xp) {
  const t = CONFIG.levelThresholds;
  let level = 1;
  for (let i = 0; i < t.length; i++) {
    if (xp >= t[i]) level = i + 1;
  }
  const nextThreshold = t[level] ?? null;
  const prevThreshold = t[level - 1] ?? 0;
  const progress = nextThreshold == null ? 1 : (xp - prevThreshold) / (nextThreshold - prevThreshold);
  return { level, progress, nextThreshold, prevThreshold };
}

// Returns YYYY-MM-DD in local time.
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeStreak(attendance) {
  // Build the set of dates the student was "present" or "late".
  const presentDates = new Set();
  for (const row of attendance) {
    if (row.status !== "present" && row.status !== "late") continue;
    const d = parseDate(row.date || row.created_at || row.timestamp);
    if (!d) continue;
    presentDates.add(dateKey(d));
  }
  if (presentDates.size === 0) return 0;

  // Walk back from today (or the most recent present day if today is empty).
  let cursor = new Date();
  // If today isn't a present day, start from the most recent present day.
  if (!presentDates.has(dateKey(cursor))) {
    const all = [...presentDates].sort((a, b) => (a < b ? 1 : -1));
    cursor = new Date(all[0]);
  }

  let streak = 0;
  // Walk backwards through consecutive calendar days that have a present mark.
  while (presentDates.has(dateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function computePerfectWeeks(attendance) {
  // Group by week_number; a week is "perfect" if every entry is present.
  const byWeek = {};
  for (const r of attendance) {
    const wk = r.week_number;
    if (wk == null) continue;
    if (!byWeek[wk]) byWeek[wk] = { total: 0, perfect: 0 };
    byWeek[wk].total++;
    if (r.status === "present") byWeek[wk].perfect++;
  }
  let count = 0;
  for (const wk of Object.values(byWeek)) {
    if (wk.total > 0 && wk.perfect === wk.total) count++;
  }
  return count;
}

function computeEngagementBuckets(emotions) {
  // Group emotion rows by lecture_id, average engagement_score, count yawns.
  const byLecture = {};
  for (const e of emotions) {
    const lid = e.lecture_id;
    if (!lid) continue;
    if (!byLecture[lid]) byLecture[lid] = { sum: 0, n: 0, yawns: 0 };
    byLecture[lid].sum += Number(e.engagement_score) || 0;
    byLecture[lid].n += 1;
    if (e.yawning) byLecture[lid].yawns += 1;
  }
  let high = 0, mid = 0, low = 0, totalYawns = 0;
  for (const v of Object.values(byLecture)) {
    if (v.n === 0) continue;
    const avg = v.sum / v.n;
    if (avg >= 0.7) high++;
    else if (avg >= 0.4) mid++;
    else if (avg > 0) low++;
    totalYawns += v.yawns;
  }
  return { high, mid, low, totalYawns, totalLectures: Object.keys(byLecture).length };
}

function computeGradeXp(grades) {
  const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  let xp = 0;
  for (const g of grades) {
    const bucket = g.letter ? LETTER_TO_BUCKET[g.letter] : totalToBucket(g.total);
    if (!bucket) continue;
    counts[bucket] = (counts[bucket] || 0) + 1;
    if (bucket === "A") xp += CONFIG.xp.perGradeA;
    else if (bucket === "B") xp += CONFIG.xp.perGradeB;
    else if (bucket === "C") xp += CONFIG.xp.perGradeC;
    else if (bucket === "D") xp += CONFIG.xp.perGradeD;
  }
  return { xp, counts };
}

export function computeStats({ attendance = [], emotions = [], grades = [] } = {}) {
  // Attendance XP + counts
  const attCounts = { present: 0, absent: 0, late: 0, excused: 0 };
  for (const r of attendance) {
    if (attCounts[r.status] != null) attCounts[r.status]++;
  }
  const attXp =
    attCounts.present * CONFIG.xp.perPresent +
    attCounts.late    * CONFIG.xp.perLate +
    attCounts.excused * CONFIG.xp.perExcused;

  // Engagement XP
  const eng = computeEngagementBuckets(emotions);
  const engXp =
    eng.high * CONFIG.xp.perHighEngagement +
    eng.mid  * CONFIG.xp.perMidEngagement +
    eng.low  * CONFIG.xp.perLowEngagement +
    eng.totalYawns * CONFIG.xp.perYawnPenalty;

  // Grade XP
  const { xp: gradeXp, counts: gradeCounts } = computeGradeXp(grades);

  // Perfect-week bonuses
  const perfectWeeks = computePerfectWeeks(attendance);
  const perfectWeekXp = perfectWeeks * CONFIG.xp.perPerfectWeek;

  const xp = Math.max(0, attXp + engXp + gradeXp + perfectWeekXp);
  const streakDays = computeStreak(attendance);
  const { level, progress, nextThreshold, prevThreshold } = computeLevel(xp);

  const ctx = {
    xp,
    streakDays,
    perfectWeeks,
    highEngagementLectures: eng.high,
    gradeCounts,
  };
  const earnedBadges = CONFIG.badges.filter((b) => {
    try { return !!b.check(ctx); } catch { return false; }
  });

  return {
    xp,
    level,
    progress,
    nextThreshold,
    prevThreshold,
    streakDays,
    perfectWeeks,
    attendance: attCounts,
    engagement: eng,
    gradeCounts,
    badges: earnedBadges,
    allBadges: CONFIG.badges,
    xpBreakdown: {
      attendance: attXp,
      engagement: engXp,
      grades: gradeXp,
      perfectWeeks: perfectWeekXp,
    },
  };
}

/**
 * Convenience: compute stats for several students at once. Pass an object
 * where each key is a student id mapping to its raw rows. Returns the same
 * object shape with stats values, plus a sorted leaderboard array.
 */
export function buildLeaderboard(byStudent) {
  const entries = Object.entries(byStudent).map(([studentId, raw]) => ({
    studentId,
    stats: computeStats(raw),
  }));
  entries.sort((a, b) => b.stats.xp - a.stats.xp);
  // Assign rank with ties sharing the higher rank.
  let prevXp = null;
  let prevRank = 0;
  return entries.map((e, idx) => {
    const rank = e.stats.xp === prevXp ? prevRank : idx + 1;
    prevXp = e.stats.xp;
    prevRank = rank;
    return { ...e, rank };
  });
}

/**
 * Doctor student search — list of all students with expandable detail showing
 * recent recommendations + warnings + aggregated emotion stats.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import {
  collection, doc, getDoc, getDocs, query, limit, orderBy, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Pill, Screen, Stat, colors, styles,
} from "../../components/doctor/ui";

function fmtTs(ts) {
  if (!ts) return "";
  const d = ts?.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? "" : d.toLocaleString();
}

export default function DoctorStudentSearch() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [detail, setDetail] = useState({}); // { [studentId]: {recs, warnings, stats} }
  const [detailLoading, setDetailLoading] = useState({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const snap = await getDocs(collection(db, "students"));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setStudents(rows);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return students;
    return students.filter((s) =>
      (s.name || "").toLowerCase().includes(t) ||
      (s.id || "").toLowerCase().includes(t) ||
      (s.email || "").toLowerCase().includes(t)
    );
  }, [students, search]);

  const counts = useMemo(() => ({
    total: students.length,
    active: students.filter((s) => s.active !== false).length,
    inactive: students.filter((s) => s.active === false).length,
  }), [students]);

  async function expand(id) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (detail[id]) return;

    setDetailLoading((p) => ({ ...p, [id]: true }));
    try {
      const [recSnap, warnSnap, emSnap] = await Promise.all([
        getDocs(query(
          collection(db, "recommendations"),
          where("student_id", "==", id),
          orderBy("generated_at", "desc"),
          limit(1),
        )).catch(() => ({ docs: [] })),
        getDocs(query(
          collection(db, "warnings"),
          where("student_id", "==", id),
          orderBy("timestamp", "desc"),
          limit(8),
        )).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, "emotions"), where("student_id", "==", id))),
      ]);
      const emotions = emSnap.docs.map((d) => d.data());
      const attScores = emotions.filter((e) => e.attention_score != null).map((e) => e.attention_score);
      const avgAtt = attScores.length ? attScores.reduce((a, b) => a + b, 0) / attScores.length : null;
      const engScores = emotions.filter((e) => e.engagement_score != null).map((e) => e.engagement_score);
      const avgEng = engScores.length ? engScores.reduce((a, b) => a + b, 0) / engScores.length : null;
      const attWarnCount = emotions.filter((e) => e.attention_warning).length;
      const cheatWarnCount = emotions.filter((e) => e.cheat_warning).length;

      setDetail((p) => ({
        ...p,
        [id]: {
          recommendation: recSnap.docs[0]?.data() || null,
          warnings: warnSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
          stats: {
            observations: emotions.length,
            avgAtt, avgEng, attWarnCount, cheatWarnCount,
          },
        },
      }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setDetailLoading((p) => ({ ...p, [id]: false }));
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Student search"
        subtitle="Browse all students and view their analytics"
        action={<Button title="Back" onPress={() => router.back()} variant="ghost" />}
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Stat label="Total" value={counts.total} />
        <Stat label="Active" value={counts.active} tone="success" />
        <Stat label="Inactive" value={counts.inactive} tone="slate" />
      </View>

      <Input label="Search" value={search} onChangeText={setSearch} placeholder="Name, id, or email" autoCapitalize="none" autoCorrect={false} />

      {filtered.slice(0, 60).map((s) => {
        const open = expandedId === s.id;
        const d = detail[s.id];
        const dl = detailLoading[s.id];
        return (
          <Card key={s.id}>
            <Pressable onPress={() => expand(s.id)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.emptyTitle} numberOfLines={1}>{s.name || s.id}</Text>
                <Text style={{ color: colors.faint, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{s.email || s.id}</Text>
              </View>
              <Pill text={s.active === false ? "inactive" : "active"} tone={s.active === false ? "slate" : "success"} />
            </Pressable>

            {open ? (
              <View style={{ marginTop: 12, paddingTop: 10, borderTopColor: colors.border, borderTopWidth: 1 }}>
                {dl ? (
                  <Text style={{ color: colors.muted, fontStyle: "italic" }}>Loading details…</Text>
                ) : !d ? (
                  <Text style={{ color: colors.muted }}>Tap again to load.</Text>
                ) : (
                  <>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                      <Stat label="Observations" value={d.stats.observations} />
                      <Stat label="Avg engagement" value={d.stats.avgEng != null ? `${d.stats.avgEng.toFixed(1)}%` : "—"} tone="success" />
                      <Stat label="Avg attention" value={d.stats.avgAtt != null ? `${d.stats.avgAtt.toFixed(1)}` : "—"} tone={d.stats.avgAtt == null ? "slate" : d.stats.avgAtt >= 70 ? "success" : d.stats.avgAtt >= 45 ? "warning" : "danger"} />
                      <Stat label="Warnings" value={d.stats.attWarnCount + d.stats.cheatWarnCount} tone={d.stats.attWarnCount + d.stats.cheatWarnCount > 0 ? "warning" : "slate"} />
                    </View>

                    {d.recommendation ? (
                      <View style={{ marginTop: 12, padding: 10, backgroundColor: "#fffbeb", borderRadius: 10, borderColor: "#fde68a", borderWidth: 1 }}>
                        <Text style={{ color: "#92400e", fontWeight: "700", fontSize: 11, letterSpacing: 0.4 }}>LATEST RECOMMENDATION</Text>
                        {(d.recommendation.items || []).map((it, i) => (
                          <Text key={i} style={{ color: colors.ink, fontSize: 12, marginTop: 4 }}>• {it}</Text>
                        ))}
                      </View>
                    ) : null}

                    {d.warnings.length > 0 ? (
                      <View style={{ marginTop: 12 }}>
                        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>RECENT WARNINGS</Text>
                        {d.warnings.map((w) => (
                          <View key={w.id} style={{ marginTop: 6, padding: 8, backgroundColor: "#fef2f2", borderRadius: 8, borderColor: "#fecaca", borderWidth: 1 }}>
                            <Text style={{ color: "#991b1b", fontWeight: "700", fontSize: 12 }}>{w.type || "warning"}</Text>
                            <Text style={{ color: colors.muted, fontSize: 11 }}>Score: {w.score != null ? w.score : "—"} • {fmtTs(w.timestamp)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            ) : null}
          </Card>
        );
      })}

      {filtered.length > 60 ? (
        <Text style={{ color: colors.faint, fontSize: 12, textAlign: "center" }}>
          Showing first 60 of {filtered.length}. Refine search to see more.
        </Text>
      ) : null}

      {!loading && filtered.length === 0 ? (
        <EmptyState title="No students found" body={search ? "Try a different search." : "There are no students yet."} />
      ) : null}
    </Screen>
  );
}

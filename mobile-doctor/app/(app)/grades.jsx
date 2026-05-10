/**
 * Doctor grades — full entry + computed letter.
 * Mirrors web-doctor DoctorGrades.jsx behavior:
 *   - Loads students (active), subjects (for this doctor), classes, existing grades
 *   - For each enrolled student × subject combo in the doctor's classes, allow editing
 *     week7 / week12 / classwork / final + a "W" withdraw checkbox + optional letter override
 *   - Saves to grades/{student_id}_{subject_id} with merge:true
 *   - Letter only auto-computed when all 4 inputs are filled (matches user spec).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, RefreshControl, Text, View, Pressable, StyleSheet } from "react-native";
import { router } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import {
  collection, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where,
} from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  Button, Card, EmptyState, Header, Input, Pill, Screen, colors, styles,
} from "../../components/ui";

const ALL_LETTERS = ["A+","A","A-","B+","B","B-","C+","C","C-","D+","D","D-","F","W"];
const LETTER_TONE = {
  "A+": "success", "A": "success", "A-": "success",
  "B+": "info",    "B": "info",    "B-": "info",
  "C+": "warning", "C": "warning", "C-": "warning",
  "D+": "warning", "D": "warning", "D-": "warning",
  "F":  "danger",
  "W":  "slate",
};

function computeLetter(total, finalScore) {
  if (total < 40) return "F";
  if ((Number(finalScore) || 0) < 12) return "F";
  if (total >= 95) return "A+";
  if (total >= 90) return "A";
  if (total >= 85) return "A-";
  if (total >= 80) return "B+";
  if (total >= 75) return "B";
  if (total >= 70) return "B-";
  if (total >= 65) return "C+";
  if (total >= 60) return "C";
  if (total >= 55) return "C-";
  if (total >= 50) return "D+";
  if (total >= 45) return "D";
  return "D-";
}

const BLANK = { week7: "", week12: "", classwork: "", final: "", withdraw: false, letterOverride: "" };

export default function DoctorGrades() {
  const [doctorId, setDoctorId] = useState(null);
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [classes, setClasses] = useState([]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [filterSubject, setFilterSubject] = useState("");
  const [filterClass, setFilterClass] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setDoctorId(snap.data().linked_id || null);
      } catch { /* ignore */ }
    });
    return unsub;
  }, []);

  const load = useCallback(async () => {
    if (!doctorId) return;
    setLoading(true); setErr(null);
    try {
      const [studSnap, subjSnap, clsSnap, gradeSnap] = await Promise.all([
        getDocs(query(collection(db, "students"), where("active", "==", true))),
        getDocs(query(collection(db, "subjects"), where("doctor_id", "==", doctorId))),
        getDocs(collection(db, "classes")),
        getDocs(query(collection(db, "grades"), where("doctor_id", "==", doctorId))),
      ]);
      setStudents(studSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setSubjects(subjSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setClasses(clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));

      const initEdits = {};
      gradeSnap.docs.forEach((d) => {
        const data = d.data();
        const key = `${data.student_id}_${data.subject_id}`;
        initEdits[key] = {
          week7:          data.week7     ?? "",
          week12:         data.week12    ?? "",
          classwork:      data.classwork ?? "",
          final:          data.final     ?? "",
          withdraw:       data.letter === "W",
          letterOverride: ALL_LETTERS.includes(data.letter) && data.letter !== "W" ? data.letter : "",
        };
      });
      setEdits(initEdits);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => { load(); }, [load]);

  const mySubjectIds = useMemo(() => new Set(subjects.map((s) => s.id)), [subjects]);
  const relevantClasses = useMemo(
    () => classes.filter((c) => mySubjectIds.has(c.subject_id)),
    [classes, mySubjectIds],
  );
  const filteredClasses = useMemo(
    () => filterSubject ? relevantClasses.filter((c) => c.subject_id === filterSubject) : relevantClasses,
    [relevantClasses, filterSubject],
  );
  const displayedClasses = useMemo(
    () => filterClass ? filteredClasses.filter((c) => c.id === filterClass) : filteredClasses,
    [filteredClasses, filterClass],
  );

  const rows = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const cls of displayedClasses) {
      const subj = subjects.find((s) => s.id === cls.subject_id);
      if (!subj) continue;
      for (const sid of (cls.enrolled_student_ids || [])) {
        const key = `${sid}_${subj.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const student = students.find((s) => s.id === sid);
        result.push({
          studentId: sid,
          studentName: student?.name || sid,
          subjectId: subj.id,
          subjectName: subj.name,
          className: cls.name || cls.id,
          key,
        });
      }
    }
    return result.sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [displayedClasses, subjects, students]);

  function getEdit(key) { return edits[key] || { ...BLANK }; }

  function setField(key, field, value) {
    setEdits((prev) => ({ ...prev, [key]: { ...(prev[key] || { ...BLANK }), [field]: value } }));
  }

  function bound(value, max) {
    if (value === "") return "";
    const n = Number(value);
    if (Number.isNaN(n)) return "";
    return Math.min(max, Math.max(0, n));
  }

  async function saveRow(row) {
    const e = getEdit(row.key);
    const isW = e.withdraw;
    const week7      = isW ? null : (e.week7     !== "" ? Number(e.week7)     : null);
    const week12     = isW ? null : (e.week12    !== "" ? Number(e.week12)    : null);
    const classwork  = isW ? null : (e.classwork !== "" ? Number(e.classwork) : null);
    const final_     = isW ? null : (e.final     !== "" ? Number(e.final)     : null);
    const allFilled  = week7 !== null && week12 !== null && classwork !== null && final_ !== null;
    const total      = isW ? null : (allFilled ? week7 + week12 + classwork + final_ : null);
    const letter     = isW ? "W"  : (e.letterOverride || (allFilled ? computeLetter(total, final_) : null));

    setSaving((prev) => ({ ...prev, [row.key]: true }));
    try {
      const docId = `${row.studentId}_${row.subjectId}`;
      await setDoc(doc(db, "grades", docId), {
        student_id: row.studentId,
        subject_id: row.subjectId,
        doctor_id:  doctorId,
        week7, week12, classwork,
        final: final_,
        total, letter,
        status:     isW ? "withdraw" : (allFilled ? "graded" : "partial"),
        updated_at: serverTimestamp(),
      }, { merge: true });
      Alert.alert("Saved", `${row.studentName} — ${row.subjectName}`);
    } catch (err) {
      Alert.alert("Save failed", err.message);
    } finally {
      setSaving((prev) => ({ ...prev, [row.key]: false }));
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Header
        title="Grade entry"
        subtitle="Week 7 (/30) + Week 12 (/20) + Classwork (/10) + Final (/40)"
      />

      {err ? (
        <Card style={{ borderColor: colors.danger, backgroundColor: "#fef2f2" }}>
          <Text style={{ color: colors.danger, fontWeight: "700" }}>Error</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{err}</Text>
        </Card>
      ) : null}

      <Card>
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>SUBJECT</Text>
        <View style={local.pillRow}>
          <Pressable onPress={() => { setFilterSubject(""); setFilterClass(""); }} style={[local.filter, !filterSubject && local.filterActive]}>
            <Text style={[local.filterText, !filterSubject && local.filterTextActive]}>All</Text>
          </Pressable>
          {subjects.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => { setFilterSubject(s.id); setFilterClass(""); }}
              style={[local.filter, filterSubject === s.id && local.filterActive]}
            >
              <Text style={[local.filterText, filterSubject === s.id && local.filterTextActive]} numberOfLines={1}>
                {s.name || s.id}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, marginTop: 10 }}>CLASS</Text>
        <View style={local.pillRow}>
          <Pressable onPress={() => setFilterClass("")} style={[local.filter, !filterClass && local.filterActive]}>
            <Text style={[local.filterText, !filterClass && local.filterTextActive]}>All</Text>
          </Pressable>
          {filteredClasses.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => setFilterClass(c.id)}
              style={[local.filter, filterClass === c.id && local.filterActive]}
            >
              <Text style={[local.filterText, filterClass === c.id && local.filterTextActive]} numberOfLines={1}>
                {c.name || c.id}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>

      {rows.map((row) => {
        const e = getEdit(row.key);
        const isW = e.withdraw;
        const allFilled = !isW && e.week7 !== "" && e.week12 !== "" && e.classwork !== "" && e.final !== "";
        const total = allFilled ? Number(e.week7) + Number(e.week12) + Number(e.classwork) + Number(e.final) : null;
        const autoLetter = allFilled ? computeLetter(total, e.final) : null;
        const letter = isW ? "W" : (e.letterOverride || autoLetter);
        const isSaving = !!saving[row.key];

        return (
          <Card key={row.key}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.emptyTitle}>{row.studentName}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{row.subjectName} • {row.className}</Text>
              </View>
              {letter ? <Pill text={letter} tone={LETTER_TONE[letter] || "slate"} /> : null}
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              <NumField label="W7 /30"  value={e.week7}     disabled={isW} onChange={(v) => setField(row.key, "week7", bound(v, 30))} />
              <NumField label="W12 /20" value={e.week12}    disabled={isW} onChange={(v) => setField(row.key, "week12", bound(v, 20))} />
              <NumField label="CW /10"  value={e.classwork} disabled={isW} onChange={(v) => setField(row.key, "classwork", bound(v, 10))} />
              <NumField label="Fin /40" value={e.final}     disabled={isW} onChange={(v) => setField(row.key, "final", bound(v, 40))} />
            </View>

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 10, borderTopColor: colors.border, borderTopWidth: 1 }}>
              <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 12 }}>TOTAL</Text>
              <Text style={{ color: colors.ink, fontWeight: "800" }}>{total != null ? `${total} / 100` : "—"}</Text>
            </View>

            <Pressable
              onPress={() => setField(row.key, "withdraw", !isW)}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}
            >
              <View style={[local.checkbox, isW && local.checkboxActive]}>
                {isW ? <Text style={{ color: "#fff", fontWeight: "800", fontSize: 12 }}>✓</Text> : null}
              </View>
              <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "600" }}>Mark as withdrawn (W)</Text>
            </Pressable>

            {!isW ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 }}>LETTER OVERRIDE</Text>
                <View style={local.pillRow}>
                  <Pressable onPress={() => setField(row.key, "letterOverride", "")} style={[local.filter, !e.letterOverride && local.filterActive]}>
                    <Text style={[local.filterText, !e.letterOverride && local.filterTextActive]}>Auto</Text>
                  </Pressable>
                  {ALL_LETTERS.filter((l) => l !== "W").map((l) => (
                    <Pressable
                      key={l}
                      onPress={() => setField(row.key, "letterOverride", l)}
                      style={[local.filter, e.letterOverride === l && local.filterActive]}
                    >
                      <Text style={[local.filterText, e.letterOverride === l && local.filterTextActive]}>{l}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={{ marginTop: 14 }}>
              <Button title={isSaving ? "Saving…" : "Save"} onPress={() => saveRow(row)} disabled={isSaving} busy={isSaving} />
            </View>
          </Card>
        );
      })}

      {!loading && rows.length === 0 ? (
        <EmptyState
          title="No grade rows"
          body={doctorId ? "Pick a subject or class above to see students." : "Sign in as a doctor."}
        />
      ) : null}
    </Screen>
  );
}

function NumField({ label, value, onChange, disabled }) {
  return (
    <View style={{ flexBasis: "48%" }}>
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.4, marginBottom: 4 }}>{label}</Text>
      <Input
        value={value === "" || value == null ? "" : String(value)}
        onChangeText={onChange}
        keyboardType="number-pad"
        editable={!disabled}
        placeholder="—"
      />
    </View>
  );
}

const local = StyleSheet.create({
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  filter: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderColor: "#e2e8f0",
    borderWidth: 1,
  },
  filterActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterText: {
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  filterTextActive: {
    color: "#ffffff",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderColor: colors.border,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  checkboxActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});

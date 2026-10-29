import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDayTR, formatDuration, formatTimeTR } from "@/lib/time";
import { formatEUR } from "@/lib/money";
import { formatDough } from "@/features/materials/queries";
import type { DaySummary } from "./queries";

// The built-in PDF fonts are WinAnsi only (no ğ ş ı İ); Geist covers Turkish.
Font.register({ family: "Geist", src: path.join(process.cwd(), "assets/fonts/Geist-Regular.ttf") });
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { fontFamily: "Geist", fontSize: 10, padding: 32, color: "#1c1b1a" },
  title: { fontSize: 18, marginBottom: 2 },
  muted: { color: "#6b6662" },
  section: { marginTop: 16 },
  h2: { fontSize: 13, marginBottom: 6 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#d9d4cf", paddingVertical: 3 },
  head: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#1c1b1a", paddingBottom: 3 },
  total: { flexDirection: "row", paddingTop: 4 },
  cName: { width: "30%" },
  cTime: { width: "20%" },
  cDur: { width: "14%" },
  cAmt: { width: "14%", textAlign: "right" },
  cRev: { width: "22%", paddingLeft: 8 },
  kv: { flexDirection: "row", width: 260, paddingVertical: 2 },
  k: { width: 130, color: "#6b6662" },
  v: { width: 130, textAlign: "right" },
});

/** D-49: the same content as DaySummaryView, as an A4 PDF. */
export function DaySummaryPdf({ summary }: { summary: DaySummary }) {
  const { entries, materials, cash, names, totals, closing } = summary;
  const name = (id: string | null) => (id ? (names[id] ?? "—") : "—");

  return (
    <Document title={`Gün sonu özeti ${summary.day}`} author="Pizzadam">
      <Page size="A4" style={s.page}>
        <Text style={s.title}>Gün sonu özeti</Text>
        <Text style={s.muted}>
          {summary.branchName} · {formatDayTR(summary.day, true)} · Kasacı: {summary.cashier?.fullName ?? "—"}
        </Text>
        <Text>
          {closing?.closed
            ? `Kaydedildi · ${closing.closedByName ?? "—"} · ${formatTimeTR(closing.closedAt)}`
            : "TASLAK — henüz kaydedilmedi"}
        </Text>

        <View style={s.section}>
          <Text style={s.h2}>Mesai saatleri</Text>
          <View style={s.head}>
            <Text style={s.cName}>Çalışan</Text>
            <Text style={s.cTime}>Saat</Text>
            <Text style={s.cDur}>Süre</Text>
            <Text style={s.cAmt}>Tutar</Text>
            <Text style={s.cRev}>Kasacı onayı</Text>
          </View>
          {entries.map((e) => (
            <View key={e.id} style={s.row} wrap={false}>
              <Text style={s.cName}>{e.fullName}</Text>
              <Text style={s.cTime}>
                {formatTimeTR(e.startAt)} – {e.endAt ? formatTimeTR(e.endAt) : "?"}
              </Text>
              <Text style={s.cDur}>{e.roundedMinutes != null ? formatDuration(e.roundedMinutes) : "—"}</Text>
              <Text style={s.cAmt}>{e.amount != null ? formatEUR(e.amount) : "—"}</Text>
              <Text style={s.cRev}>{e.cashierApprovedBy ? name(e.cashierApprovedBy) : "kendi saati"}</Text>
            </View>
          ))}
          {entries.length === 0 ? <Text style={s.muted}>Kayıt yok</Text> : null}
          <View style={s.total}>
            <Text style={{ width: "50%" }}>Toplam</Text>
            <Text style={s.cDur}>{formatDuration(totals.minutes)}</Text>
            <Text style={s.cAmt}>{formatEUR(totals.cost)}</Text>
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Eksik / fazla malzeme</Text>
          {materials.length === 0 ? (
            <Text style={s.muted}>Malzeme listesi gönderilmedi.</Text>
          ) : (
            <>
              <Text>
                Hamur toplamı: S {formatDough(totals.doughS)} · M {formatDough(totals.doughM)} · L{" "}
                {formatDough(totals.doughL)}
              </Text>
              {materials.map((m) => (
                <View key={m.id} style={{ marginTop: 4 }} wrap={false}>
                  <Text>
                    {m.fullName}: S {formatDough(m.doughS)} · M {formatDough(m.doughM)} · L {formatDough(m.doughL)}
                  </Text>
                  {m.note ? <Text style={s.muted}>{m.note}</Text> : null}
                  <Text style={s.muted}>
                    Kasacı: {m.cashierApprovedBy ? name(m.cashierApprovedBy) : "—"} · Yönetici: {name(m.approvedBy)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.h2}>Kasa sayımı</Text>
          {!cash ? (
            <Text style={s.muted}>Kasa sayımı girilmedi.</Text>
          ) : (
            <>
              {(
                [
                  ["Kasacı", cash.cashierName ?? "—"],
                  ["Açılış parası", formatEUR(cash.openingFloat)],
                  ["Online", formatEUR(cash.online)],
                  ["Kiosk", formatEUR(cash.kiosk)],
                  ["Contant", formatEUR(cash.contant)],
                  ["Toplam", formatEUR(cash.total)],
                  ["Onaylayan", name(cash.approvedBy)],
                ] as const
              ).map(([k, v]) => (
                <View key={k} style={s.kv}>
                  <Text style={s.k}>{k}</Text>
                  <Text style={s.v}>{v}</Text>
                </View>
              ))}
              {cash.note ? <Text style={{ marginTop: 4 }}>Not: {cash.note}</Text> : null}
            </>
          )}
        </View>
      </Page>
    </Document>
  );
}

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Lifeguard Schedule V5";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(135deg, #f8fcfd 0%, #eaf7f9 55%, #fff6dd 100%)",
          color: "#062b3a",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase", color: "#075f76" }}>Serenity Shores Pool</div>
          <div style={{ fontSize: 36, fontWeight: 900, padding: "18px 32px", borderRadius: 999, background: "#075f76", color: "white" }}>V5</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ fontSize: 96, lineHeight: 0.92, fontWeight: 950, letterSpacing: -5 }}>Lifeguard Schedule V5</div>
          <div style={{ fontSize: 42, lineHeight: 1.18, color: "#31596b", maxWidth: 980 }}>Unique shift requests. AM and PM approvals separated. Removed guards return to the available list.</div>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {[
            "No duplicate requests",
            "AM/PM request sections",
            "Manager approval flow",
          ].map((text) => (
            <div key={text} style={{ fontSize: 26, fontWeight: 900, padding: "18px 24px", borderRadius: 999, background: "white", border: "3px solid rgba(7,95,118,0.18)" }}>{text}</div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}

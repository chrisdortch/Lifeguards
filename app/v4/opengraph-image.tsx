import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Lifeguard Schedule V4";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        background: "linear-gradient(135deg, #e7f4f2 0%, #ffffff 52%, #d7eef2 100%)",
        color: "#062d3d",
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: 72,
      }}
    >
      <div style={{ fontSize: 34, letterSpacing: 8, textTransform: "uppercase", color: "#0b6e7e", fontWeight: 800 }}>Serenity Shores</div>
      <div style={{ fontSize: 104, fontWeight: 900, lineHeight: 1.02, marginTop: 24 }}>Lifeguard Schedule</div>
      <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 42 }}>
        <div style={{ fontSize: 64, fontWeight: 900, color: "white", background: "#0b6e7e", padding: "18px 38px", borderRadius: 999 }}>V4</div>
        <div style={{ fontSize: 38, fontWeight: 700 }}>Requests · Calendar · Admin Schedule</div>
      </div>
    </div>,
    size
  );
}

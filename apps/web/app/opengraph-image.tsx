import { ImageResponse } from "next/og";

export const alt =
  "BugLens — Bug reports with the whole picture. Screenshots, diagnostics and a private developer workspace.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        background: "#f5f7f1",
        color: "#203c32",
        padding: 54,
        fontFamily: "sans-serif",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              display: "flex",
              border: "3px solid #203c32",
              borderRadius: "50%",
              width: 35,
              height: 35,
              padding: 4,
            }}
          >
            <div
              style={{
                display: "flex",
                background: "#203c32",
                borderRadius: "50%",
                width: "100%",
                height: "100%",
              }}
            />
          </div>
          BugLens <span style={{ color: "#8ba68d" }}>/</span>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 16,
            letterSpacing: 3,
            marginTop: 50,
            color: "#637e66",
          }}
        >
          FEEDBACK WITH CONTEXT
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 70,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: -3,
            marginTop: 20,
            width: 620,
          }}
        >
          Bug reports with the whole picture.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 24,
            lineHeight: 1.5,
            width: 550,
            color: "#647369",
            marginTop: 26,
          }}
        >
          Less back-and-forth. More context to start fixing.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 17,
            color: "#42654b",
            marginTop: 36,
          }}
        >
          Screenshots · Diagnostics · Private workspace
        </div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: 12,
          marginTop: 84,
          width: 390,
          height: 352,
          background: "white",
          border: "1px solid #d6dfd3",
          borderRadius: 20,
          padding: 28,
          boxShadow: "0 18px 40px #203c3214",
        }}
      >
        <div
          style={{
            display: "flex",
            color: "#697d68",
            fontSize: 14,
            letterSpacing: 2,
          }}
        >
          ONE REPORT. USEFUL CONTEXT.
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 29,
            fontWeight: 700,
            marginTop: 24,
          }}
        >
          Checkout won’t complete
        </div>
        <div
          style={{
            display: "flex",
            background: "#f9ece6",
            color: "#a95039",
            borderRadius: 8,
            padding: "12px 16px",
            marginTop: 22,
            fontSize: 18,
          }}
        >
          POST /checkout · 503
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: "#5a705d",
            marginTop: 24,
          }}
        >
          Annotated screenshot attached
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 18,
            color: "#5a705d",
            marginTop: 15,
          }}
        >
          Failed request captured
        </div>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            background: "#e6eedf",
            padding: "10px 16px",
            borderRadius: 8,
            marginTop: 24,
            fontSize: 17,
          }}
        >
          Ready to triage
        </div>
      </div>
    </div>,
    { ...size },
  );
}

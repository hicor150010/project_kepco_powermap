import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
          borderRadius: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
          <path
            d="M55 5 L30 50 L42 50 L38 95 L72 42 L58 42 Z"
            fill="white"
            opacity="0.95"
          />
        </svg>
      </div>
    ),
    { ...size },
  );
}

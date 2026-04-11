import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PowerMap — 배전선로 여유용량 지도",
    short_name: "PowerMap",
    description: "한국전력 배전선로 여유용량을 지도에서 한눈에 확인하세요.",
    start_url: "/",
    display: "standalone",
    background_color: "#f9fafb",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}

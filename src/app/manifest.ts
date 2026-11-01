import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UMBRAL — Sistema del Cazador",
    short_name: "UMBRAL",
    description: "Entrenamiento adaptativo con progresión de cazador.",
    start_url: "/hoy",
    display: "standalone",
    background_color: "#07080f",
    theme_color: "#07080f",
    lang: "es",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hermes Signal",
    short_name: "Hermes Signal",
    description: "Live Hermes Agent feed with a personal learning loop",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0d13",
    theme_color: "#0a0d13",
  };
}

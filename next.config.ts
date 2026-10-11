import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Страницы читают данные заглушки и cookie «кто я», поэтому рендерятся на сервере при каждом запросе.
  // cacheComponents выключен намеренно (docs/decisions.md D7). Вернуть, когда появится база и настоящий вход.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

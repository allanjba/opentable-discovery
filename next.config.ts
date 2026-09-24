import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The dataset's image_url values all point at opentable.com. Next refuses to
    // optimise a remote host unless it is listed here.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.opentable.com",
        pathname: "/img/restimages/**",
      },
    ],
  },
};

export default nextConfig;

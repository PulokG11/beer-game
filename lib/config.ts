// Public, build-time settings. The static site (GitHub Pages) calls the Neon Function directly.

/** Neon Function base URL, e.g. https://br-xxx-api.compute.ap-southeast-1.aws.neon.tech */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

/** Sub-path the site is served from ('/beer-game' on GitHub Pages, '' locally). */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const withBase = (path: string) => `${BASE_PATH}${path}`;

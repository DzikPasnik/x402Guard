// Re-export the OpenGraph image as Twitter card image
// Note: runtime must be declared directly (Next.js can't statically parse re-exports)
export { default, alt, size, contentType } from "./opengraph-image"

export const runtime = "edge"

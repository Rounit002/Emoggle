/**
 * shadcn-compatible `cn` entry point.
 *
 * shadcn/ui components are published with `import { cn } from "@/lib/utils"`,
 * so this file exists to let those components drop in unmodified. The actual
 * implementation stays in `app/ui/cn.ts` — the joiner the rest of the app
 * already imports — so there is exactly one `cn` in the codebase rather than
 * two that can drift apart.
 *
 * Note: the upstream shadcn `cn` is `twMerge(clsx(...))`, which de-duplicates
 * conflicting Tailwind classes. Ours is a plain joiner, so when you override a
 * class on a component from here, pass the override and drop the default
 * rather than relying on last-one-wins merging.
 */
export { cn } from "@/app/ui/cn";

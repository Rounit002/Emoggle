import type { ReactNode } from "react";

/** Keep the route wrapper server-rendered. Page-level motion remains opt-in so
 * informational routes do not pay for an animation runtime before hydration. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {children}
    </div>
  );
}

import * as React from "react";
import { GooeyText } from "@/components/ui/gooey-text-morphing";

// Module-level so the array keeps the same identity across renders — a new
// array literal on every render would restart the morph loop.
const TEXTS = ["Design", "Engineering", "Is", "Awesome"];

function GooeyTextDemo() {
  return (
    <div className="h-[200px] flex items-center justify-center">
      <GooeyText
        texts={TEXTS}
        morphTime={1}
        cooldownTime={0.25}
        className="font-bold"
      />
    </div>
  );
}

export { GooeyTextDemo };

import styles from "./DoodleBackdrop.module.css";

/**
 * The animated doodle wallpaper that sits behind the landing page.
 *
 * Two diagonal lanes cross a plain canvas in opposite directions —
 * one running upper-left to lower-right, one running lower-left to
 * upper-right — each made of four staggered rows drifting at their
 * own speed.
 *
 * Every row is a two-copy marquee: the same strip of doodles is
 * rendered twice, side by side, and the pair slides left by exactly
 * one strip width on a linear loop. At the moment the keyframe
 * wraps, the clone is sitting where the original was, so the loop
 * seam is invisible and the stream never pauses, gaps or resets.
 *
 * Everything here is deterministic — the per-item size, tilt and bob
 * come from a hash of the item's position, never `Math.random()` —
 * so the server and client markup agree and nothing has to be
 * computed after hydration. That also means no state, no effects and
 * no client bundle: this renders on the server.
 */

/**
 * Face emoji, from the OpenMoji colour SVGs vendored under
 * `public/openmoji`. These keep the artwork's own yellow — a face
 * recoloured to mint or lilac stops reading as a face, and yellow is
 * what the brand's emoji have always been.
 */
const FACE_DOODLES = [
  "1F600",
  "1F601",
  "1F602",
  "1F606",
  "1F607",
  "1F609",
  "1F60B",
  "1F60E",
  "1F60F",
  "1F61B",
  "1F61C",
  "1F61D",
  "1F62E",
  "1F631",
  "1F633",
  "1F644",
  "1F913",
  "1F920",
  "1F921",
  "1F924",
  "1F929",
  "1F92A",
  "1F92F",
  "1F973",
  "1F97A",
];

/**
 * Everything that is not a face: props, symbols and hands. These are
 * the ones that take a random pastel tint, so the field reads as soft
 * yellow with colour scattered through it rather than a single hue.
 */
const ICON_DOODLES = [
  "1F310", // globe
  "1F3AC", // clapper board
  "1F3C6", // trophy
  "1F440", // eyes
  "1F47B", // ghost
  "1F480", // skull
  "1F4F2", // phone
  "1F525", // fire
  "1F91D", // handshake
  "1F91F", // love-you hand
  "2705", // check mark
];

const DOODLES = [...FACE_DOODLES, ...ICON_DOODLES];
const FACES = new Set<string>(FACE_DOODLES);

/** Doodles per strip. Spacing is `--strip / ITEMS_PER_STRIP`, so it
 *  scales with the viewport instead of bunching up on a phone. */
const ITEMS_PER_STRIP = 8;

/** How far each row sits off the lane's centre line, as a fraction
 *  of a strip. Together they span the viewport's diagonal. */
const ROW_OFFSETS = [-0.33, -0.11, 0.11, 0.33];

/** Every doodle position in the whole backdrop, across both lanes. */
const TOTAL_SLOTS = 2 * ROW_OFFSETS.length * ITEMS_PER_STRIP;

interface Lane {
  key: string;
  /** Rotation of the whole lane; the drift runs along its local +X. */
  angle: string;
  /** Seconds per full strip, one per row — the "varied speeds". */
  durations: number[];
  /** Fraction of a cycle each row starts pre-wound by. */
  phases: number[];
}

const LANES: Lane[] = [
  {
    // Upper-left to lower-right.
    key: "down",
    angle: "29deg",
    durations: [58, 76, 64, 84],
    phases: [0.12, 0.58, 0.31, 0.79],
  },
  {
    // Lower-left to upper-right.
    key: "up",
    angle: "-29deg",
    durations: [69, 55, 81, 62],
    phases: [0.44, 0.07, 0.86, 0.23],
  },
];

/** Stable 0–1 noise. Same input, same output, on both sides of the
 *  render — which is what keeps hydration quiet. */
function noise(seed: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** CSS custom properties are not part of `CSSProperties`, so the
 *  custom-property bags get cast through here on their way to a
 *  `style` prop. */
function vars(custom: Record<`--${string}`, string>): React.CSSProperties {
  return custom as React.CSSProperties;
}

interface Item {
  src: string;
  /** Faces keep their yellow; everything else takes a pastel tint. */
  isFace: boolean;
  style: React.CSSProperties;
}

/** Build one strip's worth of doodles. The result is rendered twice
 *  per row, so both copies are identical down to the animation
 *  delays — a clone that drifted out of phase with its original
 *  would show up as a flicker at the loop seam. */
function buildStrip(laneIndex: number, rowIndex: number): Item[] {
  return Array.from({ length: ITEMS_PER_STRIP }, (_, i) => {
    const slot = (laneIndex * ROW_OFFSETS.length + rowIndex) * ITEMS_PER_STRIP + i;
    const seed = slot * 977 + 13;

    // Walking the list with a stride coprime to its length visits
    // every doodle before any of them comes round again.
    const src = DOODLES[(slot * 7 + laneIndex * 3) % DOODLES.length];

    const scale = 0.74 + noise(seed) * 0.62;
    const tilt = (noise(seed + 1) * 2 - 1) * 16;
    const rock = 2 + noise(seed + 2) * 4;
    const bob = 3 + noise(seed + 3) * 7;
    const bobDuration = 5.5 + noise(seed + 4) * 5;
    const bobDelay = -noise(seed + 5) * bobDuration;
    // Per-item jitter only; the theme sets the overall strength via
    // `--doodle-opacity`, and the two multiply in the stylesheet.
    const fade = 0.76 + noise(seed + 6) * 0.24;

    // Icons get their own tint; faces keep OpenMoji's yellow. The base
    // hue is spread evenly round the wheel by slot so neighbours never
    // land on the same colour, with a little jitter so the sequence
    // does not read as a rainbow gradient. The stylesheet desaturates
    // whatever comes out, which is what makes it pastel rather than
    // primary.
    const isFace = FACES.has(src);
    const hue = (slot * (360 / TOTAL_SLOTS) + noise(seed + 7) * 26) % 360;

    return {
      src,
      isFace,
      style: vars({
        "--i": String(i),
        "--count": String(ITEMS_PER_STRIP),
        "--size": `calc(var(--unit) * ${scale.toFixed(3)})`,
        "--tilt": `${tilt.toFixed(2)}deg`,
        "--rock": `${rock.toFixed(2)}deg`,
        "--bob": `${bob.toFixed(2)}px`,
        "--bob-duration": `${bobDuration.toFixed(2)}s`,
        "--bob-delay": `${bobDelay.toFixed(2)}s`,
        "--fade": fade.toFixed(3),
        // Omitted for faces — nothing reads it, and 128 unused
        // declarations is markup nobody needs to ship.
        ...(isFace ? {} : { "--hue": `${hue.toFixed(1)}deg` }),
      }),
    };
  });
}

function Strip({ items }: { items: Item[] }) {
  return (
    <div className={styles.strip}>
      {items.map((item, i) => (
        <span key={i} className={styles.item} style={item.style}>
          {/* Plain <img>: these are fixed-size decorative SVGs, so
              next/image's resizing and srcset machinery has nothing
              to do here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={item.isFace ? styles.glyph : `${styles.glyph} ${styles.tinted}`}
            src={`/openmoji/color/svg/${item.src}.svg`}
            alt=""
            width={72}
            height={72}
            draggable={false}
            decoding="async"
          />
        </span>
      ))}
    </div>
  );
}

interface DoodleBackdropProps {
  /**
   * Render inside a full-screen overlay (the "Play now" mode picker)
   * rather than as the page's own wallpaper. The overlay already
   * paints the canvas, so this instance draws only doodles, and it
   * opts out of the rule that parks the page-level backdrop while a
   * covering view is up — since it *is* the covering view.
   */
  inOverlay?: boolean;
}

export default function DoodleBackdrop({ inOverlay = false }: DoodleBackdropProps) {
  return (
    <div
      aria-hidden
      className={inOverlay ? `${styles.backdrop} ${styles.overlay}` : styles.backdrop}
    >
      {LANES.map((lane, laneIndex) => (
        <div
          key={lane.key}
          className={styles.lane}
          style={vars({ "--angle": lane.angle })}
        >
          {ROW_OFFSETS.map((offset, rowIndex) => {
            const items = buildStrip(laneIndex, rowIndex);
            const duration = lane.durations[rowIndex];

            return (
              <div
                key={rowIndex}
                className={styles.rail}
                style={vars({
                  "--offset": `calc(var(--strip) * ${offset})`,
                })}
              >
                <div
                  className={styles.track}
                  style={vars({
                    "--duration": `${duration}s`,
                    "--phase": `${(-duration * lane.phases[rowIndex]).toFixed(2)}s`,
                  })}
                >
                  <Strip items={items} />
                  <Strip items={items} />
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

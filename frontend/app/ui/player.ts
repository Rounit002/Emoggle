/**
 * Player seat / color tokens for the "Vibrant Party Play" system.
 *
 * Player A is bright purple, Player B is coral pink. Seat assignment
 * is deterministic on the client based on the lower socket id, so
 * both peers agree who is who.
 */

export type Seat = "a" | "b";

export interface SeatStyle {
  seat: Seat;
  name: string;
  colorVar: string;     // CSS custom property name
  inkVar: string;       // ink that reads well on top of the color
  borderVar: string;    // border color
  shadowVar: string;    // sticker shadow color
  textVar: string;      // text on light surface
  containerVar: string; // tint background
}

export const SEAT_A: SeatStyle = {
  seat: "a",
  name: "Purple",
  colorVar: "--purple",
  inkVar: "#FFFFFF",
  borderVar: "var(--purple-deep)",
  shadowVar: "var(--purple-deep)",
  textVar: "var(--purple-deep)",
  containerVar: "--secondary-container",
};

export const SEAT_B: SeatStyle = {
  seat: "b",
  name: "Pink",
  colorVar: "--pink",
  inkVar: "var(--charcoal)",
  borderVar: "var(--pink-deep)",
  shadowVar: "var(--pink-deep)",
  textVar: "var(--pink-deep)",
  containerVar: "--tertiary-container",
};

export function seatStyle(seat: Seat): SeatStyle {
  return seat === "a" ? SEAT_A : SEAT_B;
}

export function seatForIds(
  myId: string | null | undefined,
  otherId: string | null | undefined,
): Seat {
  if (!myId || !otherId) return "a";
  return myId < otherId ? "a" : "b";
}

export function otherSeat(seat: Seat): Seat {
  return seat === "a" ? "b" : "a";
}

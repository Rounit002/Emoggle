// Keep the browser copy in frontend/app/lib/nameModeration.js identical.
// Rules are intentionally explicit: short words match whole names/tokens to
// avoid rejecting ordinary names such as Cassidy, Dick, and Scunthorpe.
const NAME_MODERATION_ERROR = "This name contains inappropriate language. Please choose another name.";
const embedded = /fuck|motherfucker|bitch|asshole|bastard|bullshit|cocksuck|dickhead|porn|hentai|blowjob|handjob|cumshot|onlyfans|nigger|nigga|faggot|retard|heilhitler|whitepower|whitesupremacy|killall|killyourself|gasall|rape(?:you|her|him)|rapist|chutiya|madarchod|bhenchod|behenchod/;
const token = /^(?:ass|shit|cunt|cock|pussy|slut|whore|sex|sexy|nude|nudes|naked|xxx|cum|penis|vagina|dildo|anus|nazi|hitler|fag|kike|dyke|spic|kys|rape|boobs|tits|bitch|bastard)$/;
const substitutions = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i" };
// Common Greek/Cyrillic lookalikes and leetspeak used to disguise slurs.
const lookalikes = { "і": "i", "ι": "i", "ӏ": "i", "а": "a", "α": "a", "е": "e", "ε": "e", "о": "o", "ο": "o", "с": "c", "р": "p", "ѕ": "s", "ɡ": "g", "6": "g", "9": "g" };
const racist = /n+i+g+(?:e+r+|a+h?)(?:s+)?|c+o+o+n+|k+i+k+e+|s+p+i+c+|w+e+t+b+a+c+k+|g+o+o+k+|r+a+g+h+e+a+d+|t+o+w+e+l+h+e+a+d+/;

function isInappropriateName(value) {
  if (typeof value !== "string") return false;
  const normalized = value.normalize("NFKD").toLowerCase()
    .replace(/[\p{M}\p{Cf}]/gu, "")
    .replace(/[іιӏаαеεоοсрѕɡ]/g, (character) => lookalikes[character])
    .replace(/[0134578@$!]/g, (character) => substitutions[character]);
  const words = normalized.match(/[\p{L}]+/gu) || [];
  const compact = words.join("");
  const racistCompact = normalized.replace(/[69]/g, "g").replace(/[^\p{L}]/gu, "");
  // Collapse exaggerated repeated letters as an additional evasion check.
  return racist.test(racistCompact) || [compact, compact.replace(/(.)\1+/g, "$1")].some((name) => embedded.test(name) || token.test(name))
    || words.some((word) => token.test(word));
}

module.exports = { isInappropriateName, NAME_MODERATION_ERROR };

import {
  UNKNOWN_COUNTRY_FLAG,
  flagFromAny,
  flagFromAnyOrFallback,
  isoFlag,
} from "../app/lib/country";

let failed = 0;

function expect(name: string, actual: unknown, expected: unknown) {
  const ok = Object.is(actual, expected);
  console.log(`${ok ? "OK  " : "FAIL"}  ${name.padEnd(46)}  ${String(actual)}`);
  if (!ok) {
    failed += 1;
    console.error(`      expected ${String(expected)}`);
  }
}

expect("IN becomes the India flag", isoFlag("IN"), "🇮🇳");
expect("lowercase and whitespace are normalized", isoFlag(" us "), "🇺🇸");
expect("malformed country code is rejected", isoFlag("IND"), null);
expect("non-alpha country code is rejected", isoFlag("1N"), null);
expect("canonical code wins over legacy label", flagFromAny("US", "IN"), "🇮🇳");
expect("raw legacy code is converted", flagFromAny("gb", null), "🇬🇧");
expect("existing regional-indicator prefix is preserved", flagFromAny("🇩🇪 Germany", null), "🇩🇪");
expect("missing metadata uses neutral fallback", flagFromAnyOrFallback(null, null), UNKNOWN_COUNTRY_FLAG);

console.log(`\n${failed === 0 ? "ALL OK" : `${failed} FAILED`}`);
process.exit(failed === 0 ? 0 : 1);

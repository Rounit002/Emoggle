const MIN_SUPPORT_CENTS = 100;

function supportAmountInCents(amount) {
  if (typeof amount !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const [dollars, cents = ""] = amount.split(".");
  const value = Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  return Number.isSafeInteger(value) && value >= MIN_SUPPORT_CENTS ? value : null;
}

module.exports = { MIN_SUPPORT_CENTS, supportAmountInCents };

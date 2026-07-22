const testRobust = (minStr, maxStr, minIsFilter, maxIsFilter) => {
  let start;
  if (minIsFilter && minStr) {
    const [y, m, d] = minStr.split('-');
    start = new Date(Number(y), Number(m) - 1, Number(d));
  } else {
    const minD = new Date(minStr); // simulating min timestamp
    start = new Date(minD.getFullYear(), minD.getMonth(), minD.getDate());
  }

  let end;
  if (maxIsFilter && maxStr) {
    const [y, m, d] = maxStr.split('-');
    end = new Date(Number(y), Number(m) - 1, Number(d));
  } else {
    const maxD = new Date(maxStr); // simulating max timestamp
    end = new Date(maxD.getFullYear(), maxD.getMonth(), maxD.getDate());
  }

  const numberOfDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  console.log(`min: ${minStr}, max: ${maxStr} -> days: ${numberOfDays}`);
  console.log(`  start: ${start.toISOString()}, end: ${end.toISOString()}`);
}

testRobust("2026-07-01", "2026-07-05", true, true);
testRobust("2026-07-01", "2026-07-05T15:00:00Z", true, false);
testRobust("2026-07-01T10:00:00Z", "2026-07-05T15:00:00Z", false, false);
